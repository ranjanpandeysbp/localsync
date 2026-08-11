from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import STAFF_ROLES, is_staff, require_roles
from app.db.models import (
    Order,
    OrderStatus,
    PaymentMode,
    ProviderProfile,
    Quote,
    QuoteStatus,
    RequestStatus,
    RequestTargetMode,
    ServiceRequest,
    User,
    UserRole,
    VerificationStatus,
)
from app.db.session import get_db
from app.schemas import OrderAccept, OrderComplete, OrderOut, OrderStatusUpdate, QuoteCreate, QuoteOut
from app.services.redis_pubsub import redis_pubsub
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["quotes-orders"])


def _quote_out(db: Session, quote: Quote) -> QuoteOut:
    provider = db.get(User, quote.provider_id)
    req = db.get(ServiceRequest, quote.request_id)
    consumer = db.get(User, req.consumer_id) if req else None
    from app.services.attachments import list_attachments_for_quote
    from app.services.provider_catalog import build_provider_trust

    return QuoteOut(
        id=quote.id,
        request_id=quote.request_id,
        provider_id=quote.provider_id,
        price_quote=float(quote.price_quote),
        currency=quote.currency,
        estimated_days=quote.estimated_days,
        message=quote.message,
        catalog_url=quote.catalog_url,
        status=quote.status,
        created_at=quote.created_at,
        provider_name=provider.full_name if provider else None,
        provider_rating=provider.average_rating if provider else None,
        request_title=req.title if req else None,
        consumer_name=consumer.full_name if consumer else None,
        provider_trust=build_provider_trust(db, quote.provider_id),
        attachments=list_attachments_for_quote(db, quote.id),
    )


def _order_out(order: Order, reveal_otp: bool, viewer_id: UUID | None = None) -> OrderOut:
    otp = None
    if reveal_otp and (viewer_id is None or viewer_id == order.consumer_id):
        otp = order.completion_otp
    payment = getattr(order, "payment_mode", None) or PaymentMode.CASH
    return OrderOut(
        id=order.id,
        quote_id=order.quote_id,
        request_id=order.request_id,
        consumer_id=order.consumer_id,
        provider_id=order.provider_id,
        agreed_price=float(order.agreed_price),
        fulfillment_type=order.fulfillment_type,
        payment_mode=payment,
        status=order.status,
        completion_otp=otp,
        completed_at=order.completed_at,
        created_at=order.created_at,
    )


def _provider_allowed_on_request(req: ServiceRequest, provider_id: UUID) -> bool:
    mode = getattr(req, "target_mode", None) or RequestTargetMode.BROADCAST
    if mode != RequestTargetMode.TARGETED:
        return True
    return any(t.provider_id == provider_id for t in req.targets)


@router.post("/quotes", response_model=QuoteOut, status_code=status.HTTP_201_CREATED)
async def create_quote(
    payload: QuoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == current_user.id).first()
    if not profile or profile.verification_status != VerificationStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Provider must be verified to quote")

    req = db.get(ServiceRequest, payload.request_id)
    if not req or req.status != RequestStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Request is not active")
    if not _provider_allowed_on_request(req, current_user.id):
        raise HTTPException(status_code=403, detail="This request was not sent to you")
    if req.category_id != profile.category_id:
        from app.services.provider_catalog import provider_matches_category

        if not provider_matches_category(db, profile, req.category_id):
            raise HTTPException(status_code=400, detail="Category mismatch")

    existing = db.scalar(
        select(Quote).where(Quote.request_id == payload.request_id, Quote.provider_id == current_user.id)
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already quoted this request")

    quote = Quote(
        request_id=payload.request_id,
        provider_id=current_user.id,
        price_quote=payload.price_quote,
        estimated_days=payload.estimated_days,
        message=payload.message,
        catalog_url=payload.catalog_url,
        status=QuoteStatus.PENDING,
    )
    db.add(quote)
    db.flush()

    from app.services.attachments import link_attachments

    link_attachments(
        db,
        attachment_ids=payload.attachment_ids,
        uploader_id=current_user.id,
        quote_id=quote.id,
    )
    db.commit()
    db.refresh(quote)

    out = _quote_out(db, quote)
    event = {"type": "new_quote", "payload": out.model_dump(mode="json")}
    await ws_manager.send_to_user(req.consumer_id, event)
    redis_pubsub.publish("new_quote", event["payload"], target_user_ids=[req.consumer_id])
    return out


@router.get("/requests/{request_id}/quotes", response_model=list[QuoteOut])
def list_quotes(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER, *STAFF_ROLES)),
):
    req = db.get(ServiceRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if current_user.role == UserRole.CONSUMER and req.consumer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    quotes = db.scalars(select(Quote).where(Quote.request_id == request_id).order_by(Quote.created_at.desc())).all()
    if current_user.role == UserRole.PROVIDER:
        quotes = [q for q in quotes if q.provider_id == current_user.id]
    return [_quote_out(db, q) for q in quotes]


@router.get("/quotes/sent", response_model=list[QuoteOut])
def my_sent_quotes(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    """All quotes this provider has sent (past + pending)."""
    quotes = db.scalars(
        select(Quote).where(Quote.provider_id == current_user.id).order_by(Quote.created_at.desc())
    ).all()
    return [_quote_out(db, q) for q in quotes]


@router.get("/quotes/received", response_model=list[QuoteOut])
def my_received_quotes(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER)),
):
    """All quotes received across this consumer's requests."""
    quotes = db.scalars(
        select(Quote)
        .join(ServiceRequest, ServiceRequest.id == Quote.request_id)
        .where(ServiceRequest.consumer_id == current_user.id)
        .order_by(Quote.created_at.desc())
    ).all()
    return [_quote_out(db, q) for q in quotes]


@router.post("/orders/accept", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def accept_quote(
    payload: OrderAccept,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER)),
):
    quote = db.get(Quote, payload.quote_id)
    if not quote or quote.status != QuoteStatus.PENDING:
        raise HTTPException(status_code=400, detail="Quote not available")

    req = db.get(ServiceRequest, quote.request_id)
    if not req or req.consumer_id != current_user.id or req.status != RequestStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Cannot accept this quote")

    quote.status = QuoteStatus.ACCEPTED
    others = db.scalars(
        select(Quote).where(Quote.request_id == req.id, Quote.id != quote.id, Quote.status == QuoteStatus.PENDING)
    ).all()
    for other in others:
        other.status = QuoteStatus.REJECTED

    req.status = RequestStatus.FULFILLED
    order = Order(
        quote_id=quote.id,
        request_id=req.id,
        consumer_id=current_user.id,
        provider_id=quote.provider_id,
        agreed_price=quote.price_quote,
        fulfillment_type=payload.fulfillment_type,
        payment_mode=payload.payment_mode,
        status=OrderStatus.CONFIRMED,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    event = {
        "type": "order_confirmed",
        "payload": {"order_id": str(order.id), "request_id": str(req.id), "quote_id": str(quote.id)},
    }
    await ws_manager.broadcast_to_users([order.consumer_id, order.provider_id], event)
    redis_pubsub.publish("order_confirmed", event["payload"], [order.consumer_id, order.provider_id])
    return _order_out(order, reveal_otp=True, viewer_id=current_user.id)


@router.get("/orders/mine", response_model=list[OrderOut])
def my_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    if current_user.role == UserRole.CONSUMER:
        rows = db.scalars(
            select(Order).where(Order.consumer_id == current_user.id).order_by(Order.created_at.desc())
        ).all()
    else:
        rows = db.scalars(
            select(Order).where(Order.provider_id == current_user.id).order_by(Order.created_at.desc())
        ).all()
    return [_order_out(o, reveal_otp=True, viewer_id=current_user.id) for o in rows]


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER, *STAFF_ROLES)),
):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not is_staff(current_user) and current_user.id not in (order.consumer_id, order.provider_id):
        raise HTTPException(status_code=403, detail="Not allowed")
    return _order_out(order, reveal_otp=True, viewer_id=current_user.id)


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
async def update_order_status(
    order_id: UUID,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    """Move order through mid-statuses. Completion still requires OTP."""
    order = db.get(Order, order_id)
    if not order or current_user.id not in (order.consumer_id, order.provider_id):
        raise HTTPException(status_code=404, detail="Order not found")

    new_status = payload.status
    current = order.status
    if current in (OrderStatus.COMPLETED, OrderStatus.CANCELLED):
        raise HTTPException(status_code=400, detail="Order is already closed")
    if new_status == OrderStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Use OTP complete endpoint to finish the order")

    allowed: dict[OrderStatus, set[OrderStatus]] = {
        OrderStatus.CONFIRMED: {OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED, OrderStatus.DISPUTED},
        OrderStatus.IN_PROGRESS: {OrderStatus.CANCELLED, OrderStatus.DISPUTED},
        OrderStatus.DISPUTED: {OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED},
    }
    if new_status not in allowed.get(current, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change status from {current.value} to {new_status.value}",
        )

    order.status = new_status
    db.commit()
    db.refresh(order)

    event = {
        "type": "order_status",
        "payload": {"order_id": str(order.id), "status": order.status.value},
    }
    await ws_manager.broadcast_to_users([order.consumer_id, order.provider_id], event)
    return _order_out(order, reveal_otp=True, viewer_id=current_user.id)


@router.post("/orders/{order_id}/complete", response_model=OrderOut)
async def complete_order(
    order_id: UUID,
    payload: OrderComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    from datetime import datetime, timezone

    order = db.get(Order, order_id)
    if not order or order.provider_id != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == OrderStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Already completed")
    if order.status in (OrderStatus.CANCELLED,):
        raise HTTPException(status_code=400, detail="Cancelled orders cannot be completed")
    if payload.otp != order.completion_otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    order.status = OrderStatus.COMPLETED
    order.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)

    event = {"type": "order_completed", "payload": {"order_id": str(order.id)}}
    await ws_manager.broadcast_to_users([order.consumer_id, order.provider_id], event)
    return _order_out(order, reveal_otp=False, viewer_id=current_user.id)
