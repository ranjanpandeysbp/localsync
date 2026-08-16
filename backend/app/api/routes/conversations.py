from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.models import (
    Conversation,
    InquiryMessage,
    Order,
    OrderStatus,
    ProviderProfile,
    Quote,
    RequestStatus,
    RequestTargetMode,
    ServiceRequest,
    User,
    UserRole,
    VerificationStatus,
)
from app.services.provider_catalog import provider_matches_category
from app.db.session import get_db
from app.schemas import (
    ChatMessageCreate,
    ConversationCreate,
    ConversationOut,
    ConversationUnreadOut,
    InquiryMessageOut,
    ProviderConversationCreate,
)
from app.services.business_hours import effective_is_online
from app.services.inquiry_chat import reset_inquiry_conversation
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/conversations", tags=["conversations"])

RECENT_INQUIRY_DAYS = 30


def _recent_cutoff() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=RECENT_INQUIRY_DAYS)


def _closed_by_completed_order(db: Session, conv: Conversation) -> bool:
    """Hide inquiry chats once a matching consumer–provider order is completed."""
    latest = db.scalar(
        select(Order)
        .where(
            Order.consumer_id == conv.consumer_id,
            Order.provider_id == conv.provider_id,
            Order.status == OrderStatus.COMPLETED,
            Order.completed_at.is_not(None),
        )
        .order_by(Order.completed_at.desc())
        .limit(1)
    )
    if not latest or not latest.completed_at:
        return False
    activity = conv.updated_at or conv.created_at
    return activity is not None and activity <= latest.completed_at


def _unread_for_viewer(db: Session, conv: Conversation, viewer: User) -> int:
    """Count messages from the other party that the viewer has not read yet."""
    other_id = conv.provider_id if viewer.id == conv.consumer_id else conv.consumer_id
    last_read = (
        conv.consumer_last_read_at
        if viewer.id == conv.consumer_id
        else conv.provider_last_read_at
    )
    filters = [
        InquiryMessage.conversation_id == conv.id,
        InquiryMessage.sender_id == other_id,
    ]
    if last_read is not None:
        filters.append(InquiryMessage.created_at > last_read)
    return int(
        db.scalar(select(func.count()).select_from(InquiryMessage).where(and_(*filters))) or 0
    )


def _touch_last_read(conv: Conversation, viewer: User) -> None:
    now = datetime.now(timezone.utc)
    if viewer.id == conv.consumer_id:
        conv.consumer_last_read_at = now
    elif viewer.id == conv.provider_id:
        conv.provider_last_read_at = now


def _mark_read(db: Session, conv: Conversation, viewer: User) -> None:
    _touch_last_read(conv, viewer)
    db.add(conv)
    db.commit()


def _provider_nav_consumer_ids(db: Session, provider: User) -> tuple[set, set]:
    """Consumers that belong on Incoming requests vs My sent quotes for this provider."""
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == provider.id).first()
    quoted_request_ids = set(
        db.scalars(select(Quote.request_id).where(Quote.provider_id == provider.id)).all()
    )
    request_consumer_ids: set = set()
    if profile:
        active_reqs = db.scalars(
            select(ServiceRequest).where(ServiceRequest.status == RequestStatus.ACTIVE)
        ).all()
        for req in active_reqs:
            if req.id in quoted_request_ids:
                continue
            if req.category_id and not provider_matches_category(db, profile, req.category_id):
                continue
            mode = getattr(req, "target_mode", None) or RequestTargetMode.BROADCAST
            if mode == RequestTargetMode.TARGETED:
                if not any(t.provider_id == provider.id for t in req.targets):
                    continue
            request_consumer_ids.add(req.consumer_id)

    completed_quote_ids = {
        qid
        for qid in db.scalars(
            select(Order.quote_id).where(
                Order.provider_id == provider.id,
                Order.status == OrderStatus.COMPLETED,
                Order.quote_id.is_not(None),
            )
        ).all()
        if qid
    }
    quote_consumer_ids: set = set()
    quotes = db.scalars(select(Quote).where(Quote.provider_id == provider.id)).all()
    for quote in quotes:
        if quote.id in completed_quote_ids:
            continue
        req = quote.request
        if req:
            quote_consumer_ids.add(req.consumer_id)
    return request_consumer_ids, quote_consumer_ids


def _prepare_existing_conversation(
    db: Session,
    consumer_id,
    provider_id,
    request_id=None,
) -> Conversation | None:
    existing = db.scalar(
        select(Conversation).where(
            Conversation.consumer_id == consumer_id,
            Conversation.provider_id == provider_id,
        )
    )
    if not existing:
        return None
    if _closed_by_completed_order(db, existing):
        reset_inquiry_conversation(db, consumer_id, provider_id, keep_if_open_order=False)
        return None
    if request_id:
        req = db.get(ServiceRequest, request_id)
        if (
            req
            and req.consumer_id == consumer_id
            and existing.created_at
            and req.created_at
            and existing.created_at < req.created_at
        ):
            reset_inquiry_conversation(db, consumer_id, provider_id)
            return None
    return existing


def _conversation_out(db: Session, conv: Conversation, viewer: User | None = None) -> ConversationOut:
    consumer = db.get(User, conv.consumer_id)
    provider = db.get(User, conv.provider_id)
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == conv.provider_id).first()
    last = db.scalars(
        select(InquiryMessage)
        .where(InquiryMessage.conversation_id == conv.id)
        .order_by(InquiryMessage.created_at.desc())
        .limit(1)
    ).first()
    return ConversationOut(
        id=conv.id,
        consumer_id=conv.consumer_id,
        provider_id=conv.provider_id,
        category_id=conv.category_id,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        consumer_name=consumer.full_name if consumer else None,
        provider_name=provider.full_name if provider else None,
        provider_business_name=profile.business_name if profile else None,
        provider_is_online=effective_is_online(profile) if profile else None,
        last_message=last.body if last else None,
        unread_count=_unread_for_viewer(db, conv, viewer) if viewer else 0,
    )


@router.get("", response_model=list[ConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    cutoff = _recent_cutoff()
    rows = db.scalars(
        select(Conversation)
        .where(
            or_(
                Conversation.consumer_id == current_user.id,
                Conversation.provider_id == current_user.id,
            ),
            Conversation.updated_at >= cutoff,
        )
        .order_by(Conversation.updated_at.desc())
    ).all()
    active = [c for c in rows if not _closed_by_completed_order(db, c)]
    outs = [_conversation_out(db, c, viewer=current_user) for c in active]
    # Unread (new messages) first, then most recently updated.
    outs.sort(
        key=lambda o: (
            0 if (o.unread_count or 0) > 0 else 1,
            -(o.updated_at.timestamp() if o.updated_at else 0),
        )
    )
    return outs


@router.get("/unread-count", response_model=ConversationUnreadOut)
def conversations_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    """Total unread inquiry messages for the current user (recent conversations only)."""
    cutoff = _recent_cutoff()
    rows = db.scalars(
        select(Conversation).where(
            or_(
                Conversation.consumer_id == current_user.id,
                Conversation.provider_id == current_user.id,
            ),
            Conversation.updated_at >= cutoff,
        )
    ).all()
    active = [c for c in rows if not _closed_by_completed_order(db, c)]
    total = 0
    request_unread = 0
    quote_unread = 0
    request_consumer_ids: set = set()
    quote_consumer_ids: set = set()
    if current_user.role == UserRole.PROVIDER:
        request_consumer_ids, quote_consumer_ids = _provider_nav_consumer_ids(db, current_user)
    for conv in active:
        n = _unread_for_viewer(db, conv, current_user)
        if n <= 0:
            continue
        total += n
        if current_user.role != UserRole.PROVIDER:
            continue
        if conv.consumer_id in quote_consumer_ids:
            quote_unread += n
        elif conv.consumer_id in request_consumer_ids:
            request_unread += n
    return ConversationUnreadOut(
        unread_count=total,
        request_unread_count=request_unread,
        quote_unread_count=quote_unread,
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    conv = db.get(Conversation, conversation_id)
    if not conv or current_user.id not in (conv.consumer_id, conv.provider_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(conv)
    db.commit()
    return None


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def start_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER)),
):
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == payload.provider_id).first()
    )
    if not profile or profile.verification_status != VerificationStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Provider not available")

    existing = _prepare_existing_conversation(
        db,
        current_user.id,
        payload.provider_id,
        payload.request_id,
    )
    created_new = False
    if existing:
        conv = existing
    else:
        created_new = True
        conv = Conversation(
            consumer_id=current_user.id,
            provider_id=payload.provider_id,
            category_id=payload.category_id or profile.category_id,
        )
        db.add(conv)
        db.flush()
        _touch_last_read(conv, current_user)

    if payload.initial_message and created_new:
        msg = InquiryMessage(
            conversation_id=conv.id,
            sender_id=current_user.id,
            body=payload.initial_message,
        )
        db.add(msg)
        conv.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(conv)
        await ws_manager.send_to_user(
            payload.provider_id,
            {
                "type": "inquiry_message",
                "payload": {
                    "id": str(msg.id),
                    "conversation_id": str(conv.id),
                    "sender_id": str(msg.sender_id),
                    "body": msg.body,
                    "created_at": msg.created_at.isoformat() if msg.created_at else None,
                },
            },
        )
    else:
        db.commit()
        db.refresh(conv)

    return _conversation_out(db, conv, viewer=current_user)


@router.post("/with-consumer", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def start_conversation_as_provider(
    payload: ProviderConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    """Provider opens chat with a consumer to clarify a request before quoting."""
    consumer = db.get(User, payload.consumer_id)
    if not consumer or consumer.role != UserRole.CONSUMER or not consumer.is_active:
        raise HTTPException(status_code=400, detail="Consumer not available")

    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == current_user.id).first()
    )
    if not profile or profile.verification_status != VerificationStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Provider must be verified")

    existing = _prepare_existing_conversation(
        db,
        payload.consumer_id,
        current_user.id,
        payload.request_id,
    )
    created_new = False
    if existing:
        conv = existing
    else:
        created_new = True
        conv = Conversation(
            consumer_id=payload.consumer_id,
            provider_id=current_user.id,
            category_id=payload.category_id or profile.category_id,
        )
        db.add(conv)
        db.flush()
        _touch_last_read(conv, current_user)

    if payload.initial_message and created_new:
        msg = InquiryMessage(
            conversation_id=conv.id,
            sender_id=current_user.id,
            body=payload.initial_message,
        )
        db.add(msg)
        conv.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(conv)
        await ws_manager.send_to_user(
            payload.consumer_id,
            {
                "type": "inquiry_message",
                "payload": {
                    "id": str(msg.id),
                    "conversation_id": str(conv.id),
                    "sender_id": str(msg.sender_id),
                    "body": msg.body,
                    "created_at": msg.created_at.isoformat() if msg.created_at else None,
                },
            },
        )
    else:
        db.commit()
        db.refresh(conv)

    return _conversation_out(db, conv, viewer=current_user)


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    conv = db.get(Conversation, conversation_id)
    if not conv or current_user.id not in (conv.consumer_id, conv.provider_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _conversation_out(db, conv, viewer=current_user)


@router.get("/{conversation_id}/messages", response_model=list[InquiryMessageOut])
def list_inquiry_messages(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    conv = db.get(Conversation, conversation_id)
    if not conv or current_user.id not in (conv.consumer_id, conv.provider_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    rows = list(
        db.scalars(
            select(InquiryMessage)
            .where(InquiryMessage.conversation_id == conversation_id)
            .order_by(InquiryMessage.created_at.asc())
        ).all()
    )
    _mark_read(db, conv, current_user)
    return rows


@router.post(
    "/{conversation_id}/messages",
    response_model=InquiryMessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def send_inquiry_message(
    conversation_id: UUID,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    conv = db.get(Conversation, conversation_id)
    if not conv or current_user.id not in (conv.consumer_id, conv.provider_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    if _closed_by_completed_order(db, conv):
        raise HTTPException(status_code=400, detail="This chat was closed after the order was completed")

    msg = InquiryMessage(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        body=payload.body,
    )
    db.add(msg)
    conv.updated_at = datetime.now(timezone.utc)
    _touch_last_read(conv, current_user)
    db.commit()
    db.refresh(msg)

    recipient = conv.provider_id if current_user.id == conv.consumer_id else conv.consumer_id
    await ws_manager.send_to_user(
        recipient,
        {
            "type": "inquiry_message",
            "payload": {
                "id": str(msg.id),
                "conversation_id": str(msg.conversation_id),
                "sender_id": str(msg.sender_id),
                "body": msg.body,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            },
        },
    )
    return msg
