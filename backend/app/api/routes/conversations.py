from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.models import Conversation, InquiryMessage, ProviderProfile, User, UserRole, VerificationStatus
from app.db.session import get_db
from app.schemas import ChatMessageCreate, ConversationCreate, ConversationOut, InquiryMessageOut, ProviderConversationCreate
from app.services.business_hours import effective_is_online
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/conversations", tags=["conversations"])

RECENT_INQUIRY_DAYS = 30


def _recent_cutoff() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=RECENT_INQUIRY_DAYS)


def _conversation_out(db: Session, conv: Conversation) -> ConversationOut:
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
    return [_conversation_out(db, c) for c in rows]


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
    if not effective_is_online(profile):
        raise HTTPException(
            status_code=400,
            detail="Provider is offline. You can only start chats with online providers.",
        )

    existing = db.scalar(
        select(Conversation).where(
            Conversation.consumer_id == current_user.id,
            Conversation.provider_id == payload.provider_id,
        )
    )
    if existing:
        conv = existing
    else:
        conv = Conversation(
            consumer_id=current_user.id,
            provider_id=payload.provider_id,
            category_id=payload.category_id or profile.category_id,
        )
        db.add(conv)
        db.flush()

    if payload.initial_message:
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

    return _conversation_out(db, conv)


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

    existing = db.scalar(
        select(Conversation).where(
            Conversation.consumer_id == payload.consumer_id,
            Conversation.provider_id == current_user.id,
        )
    )
    if existing:
        conv = existing
    else:
        conv = Conversation(
            consumer_id=payload.consumer_id,
            provider_id=current_user.id,
            category_id=payload.category_id or profile.category_id,
        )
        db.add(conv)
        db.flush()

    if payload.initial_message:
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

    return _conversation_out(db, conv)


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    conv = db.get(Conversation, conversation_id)
    if not conv or current_user.id not in (conv.consumer_id, conv.provider_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _conversation_out(db, conv)


@router.get("/{conversation_id}/messages", response_model=list[InquiryMessageOut])
def list_inquiry_messages(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    conv = db.get(Conversation, conversation_id)
    if not conv or current_user.id not in (conv.consumer_id, conv.provider_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return list(
        db.scalars(
            select(InquiryMessage)
            .where(InquiryMessage.conversation_id == conversation_id)
            .order_by(InquiryMessage.created_at.asc())
        ).all()
    )


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

    # New chats from consumer require provider online; continuing existing thread is allowed offline
    if current_user.id == conv.consumer_id:
        profile = (
            db.query(ProviderProfile).filter(ProviderProfile.user_id == conv.provider_id).first()
        )
        has_history = db.scalar(
            select(InquiryMessage).where(InquiryMessage.conversation_id == conversation_id).limit(1)
        )
        if not has_history and profile and not effective_is_online(profile):
            raise HTTPException(status_code=400, detail="Provider is offline")

    msg = InquiryMessage(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        body=payload.body,
    )
    db.add(msg)
    conv.updated_at = datetime.now(timezone.utc)
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
