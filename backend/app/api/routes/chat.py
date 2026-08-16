from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.models import ChatMessage, Order, OrderStatus, Rating, User, UserRole
from app.db.session import get_db
from app.schemas import ChatMessageCreate, ChatMessageOut, RatingCreate, RatingOut
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["chat-ratings"])


@router.get("/orders/{order_id}/messages", response_model=list[ChatMessageOut])
def list_messages(
    order_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    order = db.get(Order, order_id)
    if not order or current_user.id not in (order.consumer_id, order.provider_id):
        raise HTTPException(status_code=404, detail="Order not found")
    rows = db.scalars(
        select(ChatMessage).where(ChatMessage.order_id == order_id).order_by(ChatMessage.created_at.asc())
    ).all()
    return rows


@router.post("/orders/{order_id}/messages", response_model=ChatMessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    order_id: UUID,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    order = db.get(Order, order_id)
    if not order or current_user.id not in (order.consumer_id, order.provider_id):
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status in (OrderStatus.CANCELLED, OrderStatus.COMPLETED, OrderStatus.REJECTED):
        raise HTTPException(status_code=400, detail="This order chat is closed")

    msg = ChatMessage(order_id=order_id, sender_id=current_user.id, body=payload.body)
    db.add(msg)
    db.commit()
    db.refresh(msg)

    recipient = order.provider_id if current_user.id == order.consumer_id else order.consumer_id
    await ws_manager.send_to_user(
        recipient,
        {
            "type": "chat_message",
            "payload": {
                "id": str(msg.id),
                "order_id": str(msg.order_id),
                "sender_id": str(msg.sender_id),
                "body": msg.body,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            },
        },
    )
    return msg


@router.post("/orders/{order_id}/ratings", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
def create_rating(
    order_id: UUID,
    payload: RatingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    order = db.get(Order, order_id)
    if not order or current_user.id not in (order.consumer_id, order.provider_id):
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != OrderStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Can only rate completed orders")

    existing = db.scalar(
        select(Rating).where(Rating.order_id == order_id, Rating.rater_id == current_user.id)
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already rated this order")

    ratee_id = order.provider_id if current_user.id == order.consumer_id else order.consumer_id
    rating = Rating(
        order_id=order_id,
        rater_id=current_user.id,
        ratee_id=ratee_id,
        score=payload.score,
        comment=payload.comment,
    )
    db.add(rating)

    ratee = db.get(User, ratee_id)
    if ratee:
        total = ratee.average_rating * ratee.rating_count + payload.score
        ratee.rating_count += 1
        ratee.average_rating = round(total / ratee.rating_count, 2)

    db.commit()
    db.refresh(rating)
    return rating
