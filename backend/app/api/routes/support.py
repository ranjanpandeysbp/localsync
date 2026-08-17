from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.api.deps import STAFF_ROLES, is_staff, require_roles, require_staff
from app.db.models import (
    AdminConversation,
    AdminMessage,
    ProviderProfile,
    User,
    UserRole,
)
from app.db.session import get_db
from app.schemas import (
    AdminSupportConversationOut,
    AdminSupportCreate,
    AdminSupportMessageOut,
    AdminSupportUnreadOut,
    ChatMessageCreate,
)
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/support-conversations", tags=["support"])


def _unread_from_admin(db: Session, conv: AdminConversation) -> int:
    """Count admin→provider messages the provider has not read yet."""
    filters = [
        AdminMessage.conversation_id == conv.id,
        AdminMessage.sender_id != conv.provider_id,
    ]
    if conv.provider_last_read_at is not None:
        filters.append(AdminMessage.created_at > conv.provider_last_read_at)
    return int(
        db.scalar(select(func.count()).select_from(AdminMessage).where(and_(*filters))) or 0
    )


def _unread_from_provider(db: Session, conv: AdminConversation) -> int:
    """Count provider→admin messages the admin has not read yet."""
    filters = [
        AdminMessage.conversation_id == conv.id,
        AdminMessage.sender_id == conv.provider_id,
    ]
    if conv.admin_last_read_at is not None:
        filters.append(AdminMessage.created_at > conv.admin_last_read_at)
    return int(
        db.scalar(select(func.count()).select_from(AdminMessage).where(and_(*filters))) or 0
    )


def _provider_message_count(db: Session, conv: AdminConversation) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(AdminMessage)
            .where(
                AdminMessage.conversation_id == conv.id,
                AdminMessage.sender_id == conv.provider_id,
            )
        )
        or 0
    )


def _support_out(
    db: Session,
    conv: AdminConversation,
    *,
    viewer: User | None = None,
) -> AdminSupportConversationOut:
    provider = db.get(User, conv.provider_id)
    admin = db.get(User, conv.created_by_admin_id) if conv.created_by_admin_id else None
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == conv.provider_id).first()
    )
    last = db.scalars(
        select(AdminMessage)
        .where(AdminMessage.conversation_id == conv.id)
        .order_by(AdminMessage.created_at.desc())
        .limit(1)
    ).first()
    if viewer and is_staff(viewer):
        unread = _unread_from_provider(db, conv)
    elif viewer and viewer.role == UserRole.PROVIDER:
        unread = _unread_from_admin(db, conv)
    else:
        unread = _unread_from_admin(db, conv)
    return AdminSupportConversationOut(
        id=conv.id,
        provider_id=conv.provider_id,
        created_by_admin_id=conv.created_by_admin_id,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        provider_name=provider.full_name if provider else None,
        provider_business_name=profile.business_name if profile else None,
        admin_name=admin.full_name if admin else "SahiLocal Admin",
        last_message=last.body if last else None,
        unread_count=unread,
        provider_message_count=_provider_message_count(db, conv),
    )


def _get_participant_conversation(
    db: Session, conversation_id: UUID, current_user: User
) -> AdminConversation:
    conv = db.get(AdminConversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if is_staff(current_user):
        return conv
    if current_user.role == UserRole.PROVIDER and conv.provider_id == current_user.id:
        return conv
    raise HTTPException(status_code=403, detail="Not a participant")


def _mark_provider_read(db: Session, conv: AdminConversation) -> None:
    conv.provider_last_read_at = datetime.now(timezone.utc)
    db.add(conv)
    db.commit()


def _mark_admin_read(db: Session, conv: AdminConversation) -> None:
    conv.admin_last_read_at = datetime.now(timezone.utc)
    db.add(conv)
    db.commit()


@router.get("/unread-count", response_model=AdminSupportUnreadOut)
def support_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*STAFF_ROLES, UserRole.PROVIDER)),
):
    if current_user.role == UserRole.PROVIDER:
        conv = db.scalar(
            select(AdminConversation).where(AdminConversation.provider_id == current_user.id)
        )
        if not conv:
            return AdminSupportUnreadOut(unread_count=0)
        return AdminSupportUnreadOut(unread_count=_unread_from_admin(db, conv))

    rows = db.scalars(select(AdminConversation)).all()
    total = sum(_unread_from_provider(db, conv) for conv in rows)
    return AdminSupportUnreadOut(unread_count=total)


@router.get("", response_model=list[AdminSupportConversationOut])
def list_support_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*STAFF_ROLES, UserRole.PROVIDER)),
):
    if is_staff(current_user):
        rows = db.scalars(
            select(AdminConversation).order_by(AdminConversation.updated_at.desc())
        ).all()
    else:
        rows = db.scalars(
            select(AdminConversation)
            .where(AdminConversation.provider_id == current_user.id)
            .order_by(AdminConversation.updated_at.desc())
        ).all()
    return [_support_out(db, c, viewer=current_user) for c in rows]


@router.get("/with-provider/{provider_id}", response_model=AdminSupportConversationOut)
def get_support_with_provider(
    provider_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff()),
):
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == provider_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Provider not found")
    conv = db.scalar(
        select(AdminConversation).where(AdminConversation.provider_id == provider_id)
    )
    if not conv:
        raise HTTPException(status_code=404, detail="No messages yet")
    return _support_out(db, conv, viewer=current_user)


@router.post("", response_model=AdminSupportConversationOut, status_code=status.HTTP_201_CREATED)
async def start_or_open_support(
    payload: AdminSupportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff()),
):
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == payload.provider_id).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Provider not found")

    conv = db.scalar(
        select(AdminConversation).where(AdminConversation.provider_id == payload.provider_id)
    )
    if not conv:
        conv = AdminConversation(
            provider_id=payload.provider_id,
            created_by_admin_id=current_user.id,
        )
        db.add(conv)
        db.flush()

    if payload.initial_message:
        msg = AdminMessage(
            conversation_id=conv.id,
            sender_id=current_user.id,
            body=payload.initial_message.strip(),
        )
        db.add(msg)
        conv.updated_at = datetime.now(timezone.utc)
        conv.admin_last_read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(conv)
        await ws_manager.send_to_user(
            payload.provider_id,
            {
                "type": "admin_message",
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

    return _support_out(db, conv, viewer=current_user)


@router.get("/{conversation_id}", response_model=AdminSupportConversationOut)
def get_support_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*STAFF_ROLES, UserRole.PROVIDER)),
):
    conv = _get_participant_conversation(db, conversation_id, current_user)
    return _support_out(db, conv, viewer=current_user)


@router.post("/{conversation_id}/read", response_model=AdminSupportUnreadOut)
def mark_support_read(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*STAFF_ROLES, UserRole.PROVIDER)),
):
    conv = _get_participant_conversation(db, conversation_id, current_user)
    if current_user.role == UserRole.PROVIDER:
        _mark_provider_read(db, conv)
    else:
        _mark_admin_read(db, conv)
    return AdminSupportUnreadOut(unread_count=0)


@router.get("/{conversation_id}/messages", response_model=list[AdminSupportMessageOut])
def list_support_messages(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*STAFF_ROLES, UserRole.PROVIDER)),
):
    conv = _get_participant_conversation(db, conversation_id, current_user)
    rows = db.scalars(
        select(AdminMessage)
        .where(AdminMessage.conversation_id == conversation_id)
        .order_by(AdminMessage.created_at.asc())
    ).all()
    if current_user.role == UserRole.PROVIDER:
        _mark_provider_read(db, conv)
    elif is_staff(current_user):
        _mark_admin_read(db, conv)
    return rows


@router.post(
    "/{conversation_id}/messages",
    response_model=AdminSupportMessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def send_support_message(
    conversation_id: UUID,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*STAFF_ROLES, UserRole.PROVIDER)),
):
    conv = _get_participant_conversation(db, conversation_id, current_user)
    msg = AdminMessage(
        conversation_id=conv.id,
        sender_id=current_user.id,
        body=payload.body.strip(),
    )
    db.add(msg)
    conv.updated_at = datetime.now(timezone.utc)
    if current_user.role == UserRole.PROVIDER:
        conv.provider_last_read_at = datetime.now(timezone.utc)
    else:
        conv.admin_last_read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    if is_staff(current_user):
        await ws_manager.send_to_user(
            conv.provider_id,
            {
                "type": "admin_message",
                "payload": {
                    "id": str(msg.id),
                    "conversation_id": str(conv.id),
                    "sender_id": str(msg.sender_id),
                    "body": msg.body,
                    "created_at": msg.created_at.isoformat() if msg.created_at else None,
                },
            },
        )
    elif current_user.role == UserRole.PROVIDER:
        staff_ids = db.scalars(
            select(User.id).where(User.role.in_(STAFF_ROLES), User.is_active.is_(True))
        ).all()
        payload_msg = {
            "type": "admin_message",
            "payload": {
                "id": str(msg.id),
                "conversation_id": str(conv.id),
                "sender_id": str(msg.sender_id),
                "body": msg.body,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            },
        }
        for staff_id in staff_ids:
            await ws_manager.send_to_user(staff_id, payload_msg)

    return msg
