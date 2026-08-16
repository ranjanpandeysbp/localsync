from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import STAFF_ROLES, is_staff, require_roles
from app.db.models import (
    Conversation,
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
from app.schemas import (
    OrderAccept,
    OrderComplete,
    OrderOut,
    OrderStatusUpdate,
    QuoteCreate,
    QuoteOut,
    QuoteUnreadOut,
    QuoteUpdate,
)
from app.services.redis_pubsub import redis_pubsub
from app.services.request_expiry import apply_request_expiry
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
        consumer_id=req.consumer_id if req else None,
        consumer_name=consumer.full_name if consumer else None,
        category_id=req.category_id if req else None,
        provider_trust=build_provider_trust(db, quote.provider_id),
        attachments=list_attachments_for_quote(db, quote.id),
        unseen=quote.consumer_seen_at is None and quote.status == QuoteStatus.PENDING,
        request_status=req.status if req else None,
    )


def _order_out(order: Order, reveal_otp: bool, viewer_id: UUID | None = None, db: Session | None = None) -> OrderOut:
    otp = None
    # Never expose OTP on rejected (non-deal) orders.
    if (
        reveal_otp
        and order.status != OrderStatus.REJECTED
        and (viewer_id is None or viewer_id == order.consumer_id)
    ):
        otp = order.completion_otp
    payment = getattr(order, "payment_mode", None) or PaymentMode.CASH
    request_title = None
    if db is not None:
        req = db.get(ServiceRequest, order.request_id)
        request_title = req.title if req else None
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
        request_title=request_title,
    )


def _provider_allowed_on_request(req: ServiceRequest, provider_id: UUID) -> bool:
    mode = getattr(req, "target_mode", None) or RequestTargetMode.BROADCAST
    if mode != RequestTargetMode.TARGETED:
        return True
    return any(t.provider_id == provider_id for t in req.targets)


@router.post("/quotes", response_model=QuoteOut, status_code=status.HTTP_201_CREATED)
async def create_quote(
    payload: QuoteCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    apply_request_expiry(db, background_tasks)
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


@router.patch("/quotes/{quote_id}", response_model=QuoteOut)
async def update_quote(
    quote_id: UUID,
    payload: QuoteUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    apply_request_expiry(db, background_tasks)
    quote = db.get(Quote, quote_id)
    if not quote or quote.provider_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quote not found")
    if quote.status != QuoteStatus.PENDING:
        raise HTTPException(status_code=400, detail="Only pending quotes can be edited")

    req = db.get(ServiceRequest, quote.request_id)
    if not req or req.status != RequestStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Request is no longer open for quote updates")

    if payload.price_quote is None and payload.estimated_days is None and payload.message is None:
        raise HTTPException(status_code=400, detail="Nothing to update")

    if payload.price_quote is not None:
        quote.price_quote = payload.price_quote
    if payload.estimated_days is not None:
        quote.estimated_days = payload.estimated_days
    if payload.message is not None:
        quote.message = payload.message.strip() or None
    quote.consumer_seen_at = None

    db.commit()
    db.refresh(quote)

    out = _quote_out(db, quote)
    event = {"type": "quote_updated", "payload": out.model_dump(mode="json")}
    await ws_manager.send_to_user(req.consumer_id, event)
    redis_pubsub.publish("quote_updated", event["payload"], target_user_ids=[req.consumer_id])
    return out


@router.get("/requests/{request_id}/quotes", response_model=list[QuoteOut])
def list_quotes(
    request_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER, *STAFF_ROLES)),
):
    apply_request_expiry(db, background_tasks)
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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    """All quotes this provider has sent (past + pending)."""
    apply_request_expiry(db, background_tasks)
    quotes = db.scalars(
        select(Quote).where(Quote.provider_id == current_user.id).order_by(Quote.created_at.desc())
    ).all()
    return [_quote_out(db, q) for q in quotes]


@router.get("/quotes/received", response_model=list[QuoteOut])
def my_received_quotes(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER)),
):
    """All quotes received across this consumer's requests."""
    apply_request_expiry(db, background_tasks)
    quotes = db.scalars(
        select(Quote)
        .join(ServiceRequest, ServiceRequest.id == Quote.request_id)
        .where(ServiceRequest.consumer_id == current_user.id)
        .order_by(Quote.created_at.desc())
    ).all()
    return [_quote_out(db, q) for q in quotes]


@router.get("/quotes/received/unread-count", response_model=QuoteUnreadOut)
def received_quotes_unread_count(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER)),
):
    apply_request_expiry(db, background_tasks)
    total = db.scalar(
        select(func.count())
        .select_from(Quote)
        .join(ServiceRequest, ServiceRequest.id == Quote.request_id)
        .where(
            ServiceRequest.consumer_id == current_user.id,
            Quote.status == QuoteStatus.PENDING,
            Quote.consumer_seen_at.is_(None),
        )
    ) or 0
    return QuoteUnreadOut(unread_count=int(total))


@router.post("/quotes/received/mark-seen", response_model=QuoteUnreadOut)
def mark_received_quotes_seen(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER)),
):
    now = datetime.now(timezone.utc)
    quotes = db.scalars(
        select(Quote)
        .join(ServiceRequest, ServiceRequest.id == Quote.request_id)
        .where(
            ServiceRequest.consumer_id == current_user.id,
            Quote.consumer_seen_at.is_(None),
        )
    ).all()
    for quote in quotes:
        quote.consumer_seen_at = now
    db.commit()
    return QuoteUnreadOut(unread_count=0)


@router.post("/orders/accept", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def accept_quote(
    payload: OrderAccept,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER)),
):
    apply_request_expiry(db, background_tasks)
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
    rejected_provider_ids: list[UUID] = []
    for other in others:
        other.status = QuoteStatus.REJECTED
        rejected_provider_ids.append(other.provider_id)
        # Losing providers get a REJECTED order row so it appears in their Orders list.
        db.add(
            Order(
                quote_id=other.id,
                request_id=req.id,
                consumer_id=current_user.id,
                provider_id=other.provider_id,
                agreed_price=other.price_quote,
                fulfillment_type=payload.fulfillment_type,
                payment_mode=payload.payment_mode,
                status=OrderStatus.REJECTED,
            )
        )

    req.status = RequestStatus.FULFILLED
    order = Order(
        quote_id=quote.id,
        request_id=req.id,
        consumer_id=current_user.id,
        provider_id=quote.provider_id,
        agreed_price=quote.price_quote,
        fulfillment_type=payload.fulfillment_type,
        payment_mode=payload.payment_mode,
        status=OrderStatus.IN_PROGRESS,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    event = {
        "type": "order_confirmed",
        "payload": {
            "order_id": str(order.id),
            "request_id": str(req.id),
            "quote_id": str(quote.id),
            "request_title": req.title,
        },
    }
    await ws_manager.broadcast_to_users([order.consumer_id, order.provider_id], event)
    redis_pubsub.publish("order_confirmed", event["payload"], [order.consumer_id, order.provider_id])

    if rejected_provider_ids:
        rejected_event = {
            "type": "quote_rejected",
            "payload": {
                "request_id": str(req.id),
                "request_title": req.title,
                "winning_quote_id": str(quote.id),
            },
        }
        await ws_manager.broadcast_to_users(rejected_provider_ids, rejected_event)
        redis_pubsub.publish("quote_rejected", rejected_event["payload"], rejected_provider_ids)

    return _order_out(order, reveal_otp=True, viewer_id=current_user.id, db=db)


@router.get("/orders/mine", response_model=list[OrderOut])
def my_orders(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.PROVIDER)),
):
    apply_request_expiry(db, background_tasks)
    if current_user.role == UserRole.CONSUMER:
        # Consumers only see real deals — not sibling REJECTED placeholders.
        rows = db.scalars(
            select(Order)
            .where(
                Order.consumer_id == current_user.id,
                Order.status != OrderStatus.REJECTED,
            )
            .order_by(Order.created_at.desc())
        ).all()
    else:
        rows = db.scalars(
            select(Order).where(Order.provider_id == current_user.id).order_by(Order.created_at.desc())
        ).all()
    return [_order_out(o, reveal_otp=True, viewer_id=current_user.id, db=db) for o in rows]


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
    # Consumers should not open sibling REJECTED placeholder orders.
    if (
        current_user.role == UserRole.CONSUMER
        and order.status == OrderStatus.REJECTED
        and order.consumer_id == current_user.id
    ):
        raise HTTPException(status_code=404, detail="Order not found")
    return _order_out(order, reveal_otp=True, viewer_id=current_user.id, db=db)


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
    if current in (OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REJECTED):
        raise HTTPException(status_code=400, detail="Order is already closed")
    if new_status in (OrderStatus.COMPLETED, OrderStatus.REJECTED):
        raise HTTPException(
            status_code=400,
            detail="Use OTP complete endpoint to finish the order"
            if new_status == OrderStatus.COMPLETED
            else "Rejected status is set automatically when another quote is accepted",
        )

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
    return _order_out(order, reveal_otp=True, viewer_id=current_user.id, db=db)


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
    if order.status in (OrderStatus.CANCELLED, OrderStatus.REJECTED):
        raise HTTPException(status_code=400, detail="This order cannot be completed")
    if payload.otp != order.completion_otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    order.status = OrderStatus.COMPLETED
    order.completed_at = datetime.now(timezone.utc)

    # Close inquiry chat between this consumer and provider once the deal is done.
    closed_conversation_id = None
    inquiry = db.scalar(
        select(Conversation).where(
            Conversation.consumer_id == order.consumer_id,
            Conversation.provider_id == order.provider_id,
        )
    )
    if inquiry:
        closed_conversation_id = str(inquiry.id)
        db.delete(inquiry)

    db.commit()
    db.refresh(order)

    event = {
        "type": "order_completed",
        "payload": {
            "order_id": str(order.id),
            "consumer_id": str(order.consumer_id),
            "provider_id": str(order.provider_id),
            "conversation_id": closed_conversation_id,
        },
    }
    await ws_manager.broadcast_to_users([order.consumer_id, order.provider_id], event)
    return _order_out(order, reveal_otp=False, viewer_id=current_user.id, db=db)
