from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.routes.auth import user_to_out
from app.db.models import (
    Attachment,
    Category,
    ChatMessage,
    Conversation,
    InquiryMessage,
    Order,
    ProviderCategory,
    ProviderProfile,
    Quote,
    Rating,
    ServiceRequest,
    User,
    UserRole,
)
from app.db.session import get_db
from app.schemas import (
    AdminOrderOut,
    AdminProviderOut,
    SmtpConfigOut,
    SmtpConfigUpdate,
    SmtpTestRequest,
    UserOut,
)
from app.services.email import get_or_create_smtp_config, send_email
from app.services.geo import get_lon_lat_from_profile
from app.services.maps import google_maps_url
from app.services.provider_catalog import provider_category_names

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/consumers", response_model=list[UserOut])
def list_consumers(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    rows = db.scalars(
        select(User).where(User.role == UserRole.CONSUMER).order_by(User.created_at.desc())
    ).all()
    return [user_to_out(u, db) for u in rows]


@router.get("/providers", response_model=list[AdminProviderOut])
def list_providers(
    status_filter: str | None = Query(
        default=None,
        description="PENDING | APPROVED | REJECTED — omit for all",
    ),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    stmt = (
        select(ProviderProfile, User, Category)
        .join(User, User.id == ProviderProfile.user_id)
        .join(Category, Category.id == ProviderProfile.category_id, isouter=True)
        .order_by(ProviderProfile.verification_status.asc(), User.created_at.desc())
    )
    rows = db.execute(stmt).all()

    # Pending (new) first, then approved, then rejected; newest within each group
    status_rank = {"PENDING": 0, "APPROVED": 1, "REJECTED": 2}

    items: list[AdminProviderOut] = []
    for profile, user, category in rows:
        if status_filter and profile.verification_status.value != status_filter.upper():
            continue
        lon, lat = get_lon_lat_from_profile(db, profile)
        if lat is None:
            lat = user.latitude
            lon = user.longitude
        items.append(
            AdminProviderOut(
                user_id=user.id,
                full_name=user.full_name,
                phone_number=user.phone_number,
                email=user.email,
                business_name=profile.business_name,
                category_id=profile.category_id,
                category_name=category.name if category else None,
                categories=provider_category_names(db, profile),
                offer_kind=profile.offer_kind,
                gst_number=profile.gst_number,
                aadhaar_number=profile.aadhaar_number,
                aadhaar_doc_url=profile.aadhaar_doc_url,
                verification_status=profile.verification_status,
                is_online=profile.is_online,
                is_active=user.is_active,
                average_rating=user.average_rating,
                rating_count=user.rating_count,
                latitude=lat,
                longitude=lon,
                location_label=user.location_label,
                maps_url=google_maps_url(lat, lon),
                created_at=user.created_at,
            )
        )
    items.sort(
        key=lambda p: (status_rank.get(p.verification_status.value, 9), -p.created_at.timestamp())
    )
    return items


@router.get("/orders", response_model=list[AdminOrderOut])
def list_all_orders(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    rows = db.scalars(select(Order).order_by(Order.created_at.desc())).all()
    items: list[AdminOrderOut] = []
    for order in rows:
        consumer = db.get(User, order.consumer_id)
        provider = db.get(User, order.provider_id)
        profile = (
            db.query(ProviderProfile).filter(ProviderProfile.user_id == order.provider_id).first()
        )
        items.append(
            AdminOrderOut(
                id=order.id,
                quote_id=order.quote_id,
                request_id=order.request_id,
                consumer_id=order.consumer_id,
                provider_id=order.provider_id,
                consumer_name=consumer.full_name if consumer else None,
                provider_name=provider.full_name if provider else None,
                provider_business_name=profile.business_name if profile else None,
                agreed_price=float(order.agreed_price),
                fulfillment_type=order.fulfillment_type,
                payment_mode=getattr(order, "payment_mode", None),
                status=order.status,
                created_at=order.created_at,
                completed_at=order.completed_at,
            )
        )
    return items


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Cannot delete admin accounts")

    # Orders (and their chat/ratings) — no ON DELETE CASCADE from users
    order_ids = db.scalars(
        select(Order.id).where(or_(Order.consumer_id == user_id, Order.provider_id == user_id))
    ).all()
    if order_ids:
        db.execute(delete(Rating).where(Rating.order_id.in_(order_ids)))
        db.execute(delete(ChatMessage).where(ChatMessage.order_id.in_(order_ids)))
        db.execute(delete(Order).where(Order.id.in_(order_ids)))

    db.execute(delete(Rating).where(or_(Rating.rater_id == user_id, Rating.ratee_id == user_id)))
    db.execute(delete(ChatMessage).where(ChatMessage.sender_id == user_id))
    db.execute(delete(InquiryMessage).where(InquiryMessage.sender_id == user_id))

    conv_ids = db.scalars(
        select(Conversation.id).where(
            or_(Conversation.consumer_id == user_id, Conversation.provider_id == user_id)
        )
    ).all()
    if conv_ids:
        db.execute(delete(InquiryMessage).where(InquiryMessage.conversation_id.in_(conv_ids)))
        db.execute(delete(Conversation).where(Conversation.id.in_(conv_ids)))

    # Quotes / requests / attachments — remove before user so remaining FKs don't block
    quote_ids = db.scalars(select(Quote.id).where(Quote.provider_id == user_id)).all()
    if quote_ids:
        # Any leftover orders tied to these quotes (e.g. edge cases)
        leftover_orders = db.scalars(select(Order.id).where(Order.quote_id.in_(quote_ids))).all()
        if leftover_orders:
            db.execute(delete(Rating).where(Rating.order_id.in_(leftover_orders)))
            db.execute(delete(ChatMessage).where(ChatMessage.order_id.in_(leftover_orders)))
            db.execute(delete(Order).where(Order.id.in_(leftover_orders)))
        db.execute(delete(Attachment).where(Attachment.quote_id.in_(quote_ids)))
        db.execute(delete(Quote).where(Quote.id.in_(quote_ids)))

    request_ids = db.scalars(select(ServiceRequest.id).where(ServiceRequest.consumer_id == user_id)).all()
    if request_ids:
        # Quotes on consumer requests may belong to other providers
        req_quote_ids = db.scalars(select(Quote.id).where(Quote.request_id.in_(request_ids))).all()
        if req_quote_ids:
            leftover_orders = db.scalars(select(Order.id).where(Order.quote_id.in_(req_quote_ids))).all()
            if leftover_orders:
                db.execute(delete(Rating).where(Rating.order_id.in_(leftover_orders)))
                db.execute(delete(ChatMessage).where(ChatMessage.order_id.in_(leftover_orders)))
                db.execute(delete(Order).where(Order.id.in_(leftover_orders)))
            db.execute(delete(Attachment).where(Attachment.quote_id.in_(req_quote_ids)))
            db.execute(delete(Quote).where(Quote.id.in_(req_quote_ids)))
        db.execute(delete(Attachment).where(Attachment.request_id.in_(request_ids)))
        db.execute(delete(Order).where(Order.request_id.in_(request_ids)))
        db.execute(delete(ServiceRequest).where(ServiceRequest.id.in_(request_ids)))

    db.execute(delete(Attachment).where(Attachment.uploaded_by == user_id))

    # Provider profile: delete explicitly — ORM user.delete() would NULL user_id (NotNullViolation)
    profile_ids = db.scalars(select(ProviderProfile.id).where(ProviderProfile.user_id == user_id)).all()
    if profile_ids:
        db.execute(delete(ProviderCategory).where(ProviderCategory.provider_id.in_(profile_ids)))
        db.execute(delete(ProviderProfile).where(ProviderProfile.id.in_(profile_ids)))

    # SQL delete avoids ORM relationship nulling on linked rows
    db.expunge(user)
    db.execute(delete(User).where(User.id == user_id))
    db.commit()
    return None


def _smtp_to_out(cfg) -> SmtpConfigOut:
    return SmtpConfigOut(
        host=cfg.host or "",
        port=cfg.port or 587,
        username=cfg.username,
        password_set=bool(cfg.password),
        from_email=cfg.from_email or "",
        from_name=cfg.from_name or "LocalSync",
        use_tls=bool(cfg.use_tls),
        use_ssl=bool(cfg.use_ssl),
        is_enabled=bool(cfg.is_enabled),
    )


@router.get("/config/smtp", response_model=SmtpConfigOut)
def get_smtp_config(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    return _smtp_to_out(get_or_create_smtp_config(db))


@router.put("/config/smtp", response_model=SmtpConfigOut)
def update_smtp_config(
    payload: SmtpConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    cfg = get_or_create_smtp_config(db)
    cfg.host = payload.host.strip()
    cfg.port = payload.port
    cfg.username = (payload.username or "").strip() or None
    if payload.password is not None and payload.password != "":
        cfg.password = payload.password
    cfg.from_email = str(payload.from_email).strip()
    cfg.from_name = payload.from_name.strip() or "LocalSync"
    cfg.use_tls = payload.use_tls
    cfg.use_ssl = payload.use_ssl
    cfg.is_enabled = payload.is_enabled
    if cfg.use_ssl and cfg.use_tls:
        # Prefer explicit SSL (465) over STARTTLS when both set
        cfg.use_tls = False
    db.commit()
    db.refresh(cfg)
    return _smtp_to_out(cfg)


@router.post("/config/smtp/test")
def test_smtp_config(
    payload: SmtpTestRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    try:
        send_email(
            db,
            to_email=str(payload.to_email),
            subject="LocalSync SMTP test",
            body_text=(
                "This is a test email from LocalSync.\n\n"
                "Your SMTP configuration is working."
            ),
            body_html=(
                "<p>This is a test email from <strong>LocalSync</strong>.</p>"
                "<p>Your SMTP configuration is working.</p>"
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SMTP send failed: {exc}") from exc
    return {"ok": True, "detail": f"Test email sent to {payload.to_email}"}
