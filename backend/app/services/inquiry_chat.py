from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Conversation, Order, OrderStatus

OPEN_ORDER_STATUSES = (
    OrderStatus.CONFIRMED,
    OrderStatus.IN_PROGRESS,
    OrderStatus.DISPUTED,
)


def has_open_order(db: Session, consumer_id: UUID, provider_id: UUID) -> bool:
    return (
        db.scalar(
            select(Order.id)
            .where(
                Order.consumer_id == consumer_id,
                Order.provider_id == provider_id,
                Order.status.in_(OPEN_ORDER_STATUSES),
            )
            .limit(1)
        )
        is not None
    )


def reset_inquiry_conversation(
    db: Session,
    consumer_id: UUID,
    provider_id: UUID,
    *,
    keep_if_open_order: bool = True,
) -> UUID | None:
    """Delete the consumer–provider inquiry thread so the next chat starts empty.

    Returns the deleted conversation id, or None if nothing was removed.
    """
    conv = db.scalar(
        select(Conversation).where(
            Conversation.consumer_id == consumer_id,
            Conversation.provider_id == provider_id,
        )
    )
    if not conv:
        return None
    if keep_if_open_order and has_open_order(db, consumer_id, provider_id):
        return None
    conv_id = conv.id
    db.delete(conv)
    db.flush()
    return conv_id
