from datetime import date, datetime, time, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.api.deps import require_roles, require_staff, is_staff
from app.api.routes.auth import user_to_out
from app.db.models import (
    Attachment,
    Category,
    ChatMessage,
    Conversation,
    InquiryMessage,
    AdminConversation,
    AdminMessage,
    OfferKind,
    Order,
    OrderStatus,
    ProviderCategory,
    ProviderProfile,
    Quote,
    Rating,
    ServiceRequest,
    User,
    UserRole,
    VerificationStatus,
)
from app.db.session import get_db
from app.core.security import get_password_hash
from app.schemas import (
    AdminAnalyticsBucket,
    AdminAnalyticsFilterOptions,
    AdminAnalyticsOut,
    AdminAnalyticsStatusBucket,
    AdminAnalyticsSummary,
    AdminAnalyticsTimelinePoint,
    AdminCustomerServiceCreate,
    AdminCustomerServiceOut,
    AdminOrderOut,
    AdminProviderCreate,
    AdminProviderDetailOut,
    AdminProviderOut,
    AdminProviderUpdate,
    SmtpConfigOut,
    SmtpConfigUpdate,
    SmtpTestRequest,
    UserOut,
)
from app.services.email import get_or_create_smtp_config, send_email, send_provider_approved
from app.services.business_hours import effective_is_online, sync_online_flag_with_hours
from app.services.geo import get_lon_lat_from_profile, make_point, normalize_lat_lon, normalize_pincode
from app.services.maps import google_maps_url
from app.services.provider_catalog import provider_category_names, set_provider_categories
from app.services.slugs import allocate_public_slug, ensure_profile_public_slug, public_url_path_for
from app.services.uploads import media_url, save_upload_file

router = APIRouter(prefix="/admin", tags=["admin"])

_UNKNOWN = "Unknown"
_GROUP_BY_VALUES = {"state", "city", "area", "pincode"}
_LOCATION_OF_VALUES = {"consumer", "provider"}

_DOC_FIELD_MAP = {
    "aadhaar": "aadhaar_doc_url",
    "gst": "gst_doc_url",
    "government_id": "government_id_url",
    "business_reg": "business_reg_url",
}

_USER_UPDATE_FIELDS = {
    "full_name",
    "email",
    "alternate_phone",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "pincode",
    "location_label",
    "latitude",
    "longitude",
}

_PROFILE_UPDATE_FIELDS = {
    "business_name",
    "description",
    "offerings_detail",
    "offer_kind",
    "website_url",
    "instagram_url",
    "youtube_url",
    "opening_time",
    "closing_time",
    "max_radius_km",
    "tax_id",
    "gst_number",
    "aadhaar_number",
}


def _location_column(group_by: str):
    if group_by == "state":
        return User.state
    if group_by == "city":
        return User.city
    if group_by == "area":
        return User.location_label
    return User.pincode


def _normalize_group_value(group_by: str, raw: str | None) -> tuple[str, str]:
    """Return (merge_key, display_label)."""
    if raw is None:
        return "__unknown__", _UNKNOWN
    text = str(raw).strip()
    if not text:
        return "__unknown__", _UNKNOWN
    if group_by == "pincode":
        pin = normalize_pincode(text) or text
        return pin, pin
    return text.casefold(), text


def _apply_user_location_filters(
    stmt,
    *,
    state: str | None,
    city: str | None,
    area: str | None,
    pincode: str | None,
    user_model=User,
):
    if state:
        stmt = stmt.where(func.lower(func.trim(user_model.state)) == state.strip().lower())
    if city:
        stmt = stmt.where(func.lower(func.trim(user_model.city)) == city.strip().lower())
    if area:
        stmt = stmt.where(
            func.lower(func.trim(user_model.location_label)) == area.strip().lower()
        )
    if pincode:
        pin = normalize_pincode(pincode) or pincode.strip()
        stmt = stmt.where(user_model.pincode == pin)
    return stmt


def _distinct_location_values(db: Session, column, *, state=None, city=None, area=None, pincode=None):
    stmt = select(column).where(column.is_not(None), func.trim(column) != "")
    stmt = _apply_user_location_filters(
        stmt, state=state, city=city, area=area, pincode=pincode
    )
    rows = db.scalars(stmt.distinct().order_by(column.asc())).all()
    values: list[str] = []
    seen: set[str] = set()
    for raw in rows:
        text = str(raw).strip()
        if not text:
            continue
        if column is User.pincode:
            text = normalize_pincode(text) or text
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        values.append(text)
    return values


def _admin_provider_base(
    db: Session,
    profile: ProviderProfile,
    user: User,
    category: Category | None,
) -> dict:
    lon, lat = get_lon_lat_from_profile(db, profile)
    if lat is None:
        lat = user.latitude
        lon = user.longitude
    return dict(
        user_id=user.id,
        full_name=user.full_name,
        phone_number=user.phone_number,
        username=user.phone_number,
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
        is_online=effective_is_online(profile),
        is_active=user.is_active,
        average_rating=user.average_rating,
        rating_count=user.rating_count,
        latitude=lat,
        longitude=lon,
        location_label=user.location_label,
        pincode=user.pincode,
        maps_url=google_maps_url(lat, lon),
        created_at=user.created_at,
    )


@router.get("/consumers", response_model=list[UserOut])
def list_consumers(
    db: Session = Depends(get_db),
    _: User = Depends(require_staff()),
):
    rows = db.scalars(
        select(User).where(User.role == UserRole.CONSUMER).order_by(User.created_at.desc())
    ).all()
    return [user_to_out(u, db) for u in rows]


def _cs_agent_status(user: User) -> str:
    if user.is_active and user.is_verified:
        return "APPROVED"
    if user.is_verified and not user.is_active:
        return "REVOKED"
    return "PENDING"


def _cs_agent_out(user: User) -> AdminCustomerServiceOut:
    return AdminCustomerServiceOut(
        id=user.id,
        phone_number=user.phone_number,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_verified=user.is_verified,
        created_at=user.created_at,
        status=_cs_agent_status(user),
    )


def _load_cs_agent(db: Session, user_id: UUID) -> User:
    user = db.get(User, user_id)
    if not user or user.role != UserRole.CUSTOMER_SERVICE:
        raise HTTPException(status_code=404, detail="Customer service agent not found")
    return user


@router.get("/customer-service-agents", response_model=list[AdminCustomerServiceOut])
def list_customer_service_agents(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    rows = db.scalars(
        select(User)
        .where(User.role == UserRole.CUSTOMER_SERVICE)
        .order_by(User.created_at.desc())
    ).all()
    return [_cs_agent_out(u) for u in rows]


@router.post(
    "/customer-service-agents",
    response_model=AdminCustomerServiceOut,
    status_code=status.HTTP_201_CREATED,
)
def create_customer_service_agent(
    payload: AdminCustomerServiceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    phone = payload.phone_number.strip()
    existing = db.scalar(select(User).where(User.phone_number == phone))
    if existing:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    email = str(payload.email).strip().lower()
    email_clash = db.scalar(select(User).where(User.email == email))
    if email_clash:
        raise HTTPException(status_code=400, detail="Email already in use")

    approved = bool(payload.approve)
    user = User(
        role=UserRole.CUSTOMER_SERVICE,
        phone_number=phone,
        full_name=payload.full_name.strip(),
        email=email,
        hashed_password=get_password_hash(payload.password),
        is_active=approved,
        is_verified=approved,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    from app.services.email import send_customer_service_registration

    send_customer_service_registration(
        db,
        to_email=user.email,
        full_name=user.full_name,
        approved=approved,
    )
    return _cs_agent_out(user)


@router.post("/customer-service-agents/{user_id}/approve", response_model=AdminCustomerServiceOut)
def approve_customer_service_agent(
    user_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    user = _load_cs_agent(db, user_id)
    if _cs_agent_status(user) != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending agents can be approved")
    user.is_active = True
    user.is_verified = True
    db.commit()
    db.refresh(user)

    from app.services.email import send_customer_service_registration

    # Pending agents were told they'd get another email when sign-in is allowed.
    send_customer_service_registration(
        db,
        to_email=user.email,
        full_name=user.full_name,
        approved=True,
    )
    return _cs_agent_out(user)


@router.post("/customer-service-agents/{user_id}/reapprove", response_model=AdminCustomerServiceOut)
def reapprove_customer_service_agent(
    user_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    user = _load_cs_agent(db, user_id)
    if _cs_agent_status(user) != "REVOKED":
        raise HTTPException(status_code=400, detail="Only revoked agents can be re-approved")
    user.is_active = True
    user.is_verified = True
    db.commit()
    db.refresh(user)

    from app.services.email import send_customer_service_registration

    send_customer_service_registration(
        db,
        to_email=user.email,
        full_name=user.full_name,
        approved=True,
    )
    return _cs_agent_out(user)


@router.post("/customer-service-agents/{user_id}/revoke", response_model=AdminCustomerServiceOut)
def revoke_customer_service_agent(
    user_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    user = _load_cs_agent(db, user_id)
    if _cs_agent_status(user) != "APPROVED":
        raise HTTPException(status_code=400, detail="Only approved agents can be revoked")
    user.is_active = False
    user.is_verified = True
    db.commit()
    db.refresh(user)
    return _cs_agent_out(user)


@router.get("/providers", response_model=list[AdminProviderOut])
def list_providers(
    status_filter: str | None = Query(
        default=None,
        description="PENDING | APPROVED | REJECTED | REVOKED — omit for all",
    ),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff()),
):
    stmt = (
        select(ProviderProfile, User, Category)
        .join(User, User.id == ProviderProfile.user_id)
        .join(Category, Category.id == ProviderProfile.category_id, isouter=True)
        .order_by(ProviderProfile.verification_status.asc(), User.created_at.desc())
    )
    rows = db.execute(stmt).all()

    # Pending (new) first, then approved, then rejected; newest within each group
    status_rank = {"PENDING": 0, "APPROVED": 1, "REVOKED": 2, "REJECTED": 3}

    items: list[AdminProviderOut] = []
    for profile, user, category in rows:
        if status_filter and profile.verification_status.value != status_filter.upper():
            continue
        items.append(AdminProviderOut(**_admin_provider_base(db, profile, user, category)))
    items.sort(
        key=lambda p: (status_rank.get(p.verification_status.value, 9), -p.created_at.timestamp())
    )
    return items


@router.post("/providers", response_model=AdminProviderDetailOut, status_code=status.HTTP_201_CREATED)
def create_provider(
    payload: AdminProviderCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff()),
):
    phone = payload.phone_number.strip()
    existing = db.scalar(select(User).where(User.phone_number == phone))
    if existing:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    email = str(payload.email).strip().lower()
    email_clash = db.scalar(select(User).where(User.email == email))
    if email_clash:
        raise HTTPException(status_code=400, detail="Email already in use")

    if not payload.category_ids:
        raise HTTPException(status_code=400, detail="Select at least one category")

    lat = payload.latitude
    lon = payload.longitude
    if lat is not None and lon is not None:
        lon, lat = normalize_lat_lon(lon, lat)

    pin = normalize_pincode(payload.pincode) if payload.pincode else None
    status_val = (
        VerificationStatus.APPROVED if payload.approve else VerificationStatus.PENDING
    )

    user = User(
        role=UserRole.PROVIDER,
        phone_number=phone,
        full_name=payload.full_name.strip(),
        email=email,
        hashed_password=get_password_hash(payload.password),
        is_verified=payload.approve,
        is_active=True,
        latitude=lat,
        longitude=lon,
        location_label=(payload.location_label or "").strip() or None,
        address_line1=(payload.address_line1 or "").strip() or None,
        city=(payload.city or "").strip() or None,
        state=(payload.state or "").strip() or None,
        pincode=pin,
    )
    db.add(user)
    db.flush()

    biz_name = payload.business_name.strip()
    profile = ProviderProfile(
        user_id=user.id,
        business_name=biz_name,
        public_slug=allocate_public_slug(db, biz_name),
        offer_kind=payload.offer_kind or OfferKind.BOTH,
        description=(payload.description or "").strip() or None,
        offerings_detail=(payload.offerings_detail or "").strip() or None,
        verification_status=status_val,
        gst_number=(payload.gst_number or "").strip().upper() or None,
        opening_time=(payload.opening_time or "").strip() or None,
        closing_time=(payload.closing_time or "").strip() or None,
        max_radius_km=payload.max_radius_km or 10,
        base_location=(make_point(lon, lat) if lat is not None and lon is not None else None),
        is_online=False,
    )
    db.add(profile)
    db.flush()
    try:
        set_provider_categories(db, profile, payload.category_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    sync_online_flag_with_hours(profile)
    db.commit()
    db.refresh(profile)
    db.refresh(user)

    if payload.approve:
        send_provider_approved(db, to_email=user.email, full_name=user.full_name)
    else:
        from app.services.email import send_provider_registration_pending

        send_provider_registration_pending(
            db,
            to_email=user.email,
            full_name=user.full_name,
        )

    category = db.get(Category, profile.category_id) if profile.category_id else None
    return _admin_provider_detail_out(db, profile, user, category)


def _admin_provider_detail_out(
    db: Session,
    profile: ProviderProfile,
    user: User,
    category: Category | None,
) -> AdminProviderDetailOut:
    order_count = db.scalar(
        select(func.count()).select_from(Order).where(Order.provider_id == user.id)
    ) or 0
    base = _admin_provider_base(db, profile, user, category)
    return AdminProviderDetailOut(
        **base,
        public_slug=profile.public_slug,
        public_url_path=public_url_path_for(profile),
        description=profile.description,
        offerings_detail=profile.offerings_detail,
        website_url=profile.website_url,
        instagram_url=profile.instagram_url,
        youtube_url=profile.youtube_url,
        opening_time=profile.opening_time,
        closing_time=profile.closing_time,
        max_radius_km=profile.max_radius_km,
        alternate_phone=user.alternate_phone,
        address_line1=user.address_line1,
        address_line2=user.address_line2,
        city=user.city,
        state=user.state,
        government_id_url=profile.government_id_url,
        business_reg_url=profile.business_reg_url,
        gst_doc_url=profile.gst_doc_url,
        tax_id=profile.tax_id,
        order_count=int(order_count),
        updated_at=profile.updated_at,
    )


def _load_provider_row(db: Session, user_id: UUID):
    row = db.execute(
        select(ProviderProfile, User, Category)
        .join(User, User.id == ProviderProfile.user_id)
        .join(Category, Category.id == ProviderProfile.category_id, isouter=True)
        .where(ProviderProfile.user_id == user_id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Provider not found")
    return row


@router.get("/providers/{user_id}", response_model=AdminProviderDetailOut)
def get_provider(
    user_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff()),
):
    profile, user, category = _load_provider_row(db, user_id)
    return _admin_provider_detail_out(db, profile, user, category)


@router.patch("/providers/{user_id}", response_model=AdminProviderDetailOut)
def update_provider(
    user_id: UUID,
    payload: AdminProviderUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff()),
):
    profile, user, category = _load_provider_row(db, user_id)
    data = payload.model_dump(exclude_unset=True)

    if "aadhaar_number" in data and data["aadhaar_number"]:
        digits = "".join(ch for ch in str(data["aadhaar_number"]) if ch.isdigit())
        if len(digits) != 12:
            raise HTTPException(status_code=400, detail="Aadhaar must be 12 digits")
        data["aadhaar_number"] = digits

    if "pincode" in data and data["pincode"]:
        data["pincode"] = normalize_pincode(data["pincode"]) or str(data["pincode"]).strip()

    if "email" in data:
        email = data["email"]
        if email:
            clash = db.scalar(select(User).where(User.email == email, User.id != user.id))
            if clash:
                raise HTTPException(status_code=400, detail="Email already in use")
        else:
            data["email"] = None

    for key in _USER_UPDATE_FIELDS:
        if key in data:
            setattr(user, key, data[key])

    for key in _PROFILE_UPDATE_FIELDS:
        if key in data:
            setattr(profile, key, data[key])

    if "business_name" in data and data["business_name"]:
        profile.public_slug = allocate_public_slug(
            db, profile.business_name, exclude_profile_id=profile.id
        )
    else:
        ensure_profile_public_slug(db, profile)

    lat = user.latitude
    lon = user.longitude
    if "latitude" in data or "longitude" in data:
        if lat is not None and lon is not None:
            lon, lat = normalize_lat_lon(lon, lat)
            user.longitude = lon
            user.latitude = lat
            profile.base_location = make_point(lon, lat)

    sync_online_flag_with_hours(profile)
    db.commit()
    db.refresh(profile)
    db.refresh(user)
    category = db.get(Category, profile.category_id) if profile.category_id else None
    return _admin_provider_detail_out(db, profile, user, category)


@router.post("/providers/{user_id}/documents", response_model=AdminProviderDetailOut)
async def upload_provider_document(
    user_id: UUID,
    doc_type: str = Query(..., description="aadhaar | gst | government_id | business_reg"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff()),
):
    field = _DOC_FIELD_MAP.get(doc_type)
    if not field:
        raise HTTPException(
            status_code=400,
            detail="doc_type must be one of: aadhaar, gst, government_id, business_reg",
        )
    profile, user, category = _load_provider_row(db, user_id)
    stored_name, _, _, _ = await save_upload_file(file)
    setattr(profile, field, media_url(stored_name))
    db.commit()
    db.refresh(profile)
    return _admin_provider_detail_out(db, profile, user, category)


def _parse_bound_date(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        d = date.fromisoformat(value.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date: {value}") from exc
    if end_of_day:
        return datetime.combine(d, time(23, 59, 59, 999999), tzinfo=timezone.utc)
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def _apply_created_range(stmt, column, *, date_from: datetime | None, date_to: datetime | None):
    if date_from is not None:
        stmt = stmt.where(column >= date_from)
    if date_to is not None:
        stmt = stmt.where(column <= date_to)
    return stmt


@router.get("/orders", response_model=list[AdminOrderOut])
def list_all_orders(
    provider_id: UUID | None = Query(
        default=None,
        description="If set, only orders for this provider user id",
    ),
    date_from: str | None = Query(default=None, description="YYYY-MM-DD"),
    date_to: str | None = Query(default=None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff()),
):
    start = _parse_bound_date(date_from)
    end = _parse_bound_date(date_to, end_of_day=True)
    stmt = select(Order).order_by(Order.created_at.desc())
    if provider_id is not None:
        stmt = stmt.where(Order.provider_id == provider_id)
    stmt = _apply_created_range(stmt, Order.created_at, date_from=start, date_to=end)
    rows = db.scalars(stmt).all()
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


@router.get("/analytics", response_model=AdminAnalyticsOut)
def location_analytics(
    group_by: str = Query(
        default="city",
        description="state | city | area | pincode",
    ),
    location_of: str = Query(
        default="consumer",
        description="For order geo: consumer | provider",
    ),
    state: str | None = Query(default=None),
    city: str | None = Query(default=None),
    area: str | None = Query(default=None),
    pincode: str | None = Query(default=None),
    date_from: str | None = Query(default=None, description="YYYY-MM-DD"),
    date_to: str | None = Query(default=None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff()),
):
    gb = (group_by or "city").strip().lower()
    loc_of = (location_of or "consumer").strip().lower()
    if gb not in _GROUP_BY_VALUES:
        raise HTTPException(status_code=400, detail="Invalid group_by")
    if loc_of not in _LOCATION_OF_VALUES:
        raise HTTPException(status_code=400, detail="Invalid location_of")

    start = _parse_bound_date(date_from)
    end = _parse_bound_date(date_to, end_of_day=True)
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="date_from must be on or before date_to")

    loc_col = _location_column(gb)
    filters = dict(state=state, city=city, area=area, pincode=pincode)

    # --- consumers by location ---
    consumer_stmt = select(User.id, loc_col).where(User.role == UserRole.CONSUMER)
    consumer_stmt = _apply_user_location_filters(consumer_stmt, **filters)
    consumer_stmt = _apply_created_range(
        consumer_stmt, User.created_at, date_from=start, date_to=end
    )
    consumer_rows = db.execute(consumer_stmt).all()

    # --- providers by location (user geo) ---
    provider_stmt = (
        select(User.id, loc_col)
        .join(ProviderProfile, ProviderProfile.user_id == User.id)
        .where(User.role == UserRole.PROVIDER)
    )
    provider_stmt = _apply_user_location_filters(provider_stmt, **filters)
    provider_stmt = _apply_created_range(
        provider_stmt, User.created_at, date_from=start, date_to=end
    )
    provider_rows = db.execute(provider_stmt).all()

    # --- orders by consumer/provider location ---
    LocUser = aliased(User)
    order_loc_col = {
        "state": LocUser.state,
        "city": LocUser.city,
        "area": LocUser.location_label,
        "pincode": LocUser.pincode,
    }[gb]
    join_id = Order.consumer_id if loc_of == "consumer" else Order.provider_id
    order_stmt = (
        select(
            Order.id,
            Order.status,
            Order.agreed_price,
            Order.created_at,
            order_loc_col,
            ServiceRequest.request_pincode,
        )
        .join(LocUser, LocUser.id == join_id)
        .join(ServiceRequest, ServiceRequest.id == Order.request_id, isouter=True)
    )
    order_stmt = _apply_user_location_filters(
        order_stmt, **filters, user_model=LocUser
    )
    order_stmt = _apply_created_range(
        order_stmt, Order.created_at, date_from=start, date_to=end
    )
    order_rows = db.execute(order_stmt).all()

    buckets_map: dict[str, AdminAnalyticsBucket] = {}

    def ensure_bucket(raw: str | None, *, fallback_pincode: str | None = None) -> AdminAnalyticsBucket:
        value = raw
        if gb == "pincode" and (value is None or not str(value).strip()) and fallback_pincode:
            value = fallback_pincode
        merge_key, label = _normalize_group_value(gb, value)
        bucket = buckets_map.get(merge_key)
        if bucket is None:
            bucket = AdminAnalyticsBucket(key=merge_key, label=label)
            if gb == "state":
                bucket.state = None if merge_key == "__unknown__" else label
            elif gb == "city":
                bucket.city = None if merge_key == "__unknown__" else label
            elif gb == "area":
                bucket.area = None if merge_key == "__unknown__" else label
            else:
                bucket.pincode = None if merge_key == "__unknown__" else label
            buckets_map[merge_key] = bucket
        return bucket

    for _, raw in consumer_rows:
        ensure_bucket(raw).consumers += 1

    for _, raw in provider_rows:
        ensure_bucket(raw).providers += 1

    status_map: dict[str, AdminAnalyticsStatusBucket] = {}
    timeline_map: dict[str, AdminAnalyticsTimelinePoint] = {}
    completed = 0
    for _, status_val, price, created_at, raw, req_pin in order_rows:
        status_name = status_val.value if hasattr(status_val, "value") else str(status_val)
        price_f = float(price or 0)
        st = status_map.get(status_name)
        if st is None:
            st = AdminAnalyticsStatusBucket(status=status_name)
            status_map[status_name] = st
        st.orders += 1
        st.gmv += price_f

        bucket = ensure_bucket(raw, fallback_pincode=req_pin if gb == "pincode" else None)
        bucket.orders += 1
        bucket.gmv += price_f
        is_completed = status_name == OrderStatus.COMPLETED.value or status_name == "COMPLETED"
        if is_completed:
            bucket.orders_completed += 1
            completed += 1

        day_key = created_at.astimezone(timezone.utc).date().isoformat() if created_at else None
        if day_key:
            point = timeline_map.get(day_key)
            if point is None:
                point = AdminAnalyticsTimelinePoint(date=day_key)
                timeline_map[day_key] = point
            point.orders += 1
            if is_completed:
                point.completed += 1
                point.gmv += price_f

    summary_gmv = 0.0
    for st in status_map.values():
        if st.status == "COMPLETED":
            summary_gmv = st.gmv
            break

    for bucket in buckets_map.values():
        bucket.gmv = round(bucket.gmv, 2)

    buckets = sorted(
        buckets_map.values(),
        key=lambda b: (-(b.orders + b.consumers + b.providers), b.label.casefold()),
    )
    unknown = next((b for b in buckets if b.key == "__unknown__"), None)

    timeline = sorted(timeline_map.values(), key=lambda p: p.date)
    for point in timeline:
        point.gmv = round(point.gmv, 2)

    # Filter options: cascade from broader to narrower (ignore filters for own dimension)
    filter_options = AdminAnalyticsFilterOptions(
        states=_distinct_location_values(
            db, User.state, city=city, area=area, pincode=pincode
        ),
        cities=_distinct_location_values(
            db, User.city, state=state, area=area, pincode=pincode
        ),
        areas=_distinct_location_values(
            db, User.location_label, state=state, city=city, pincode=pincode
        ),
        pincodes=_distinct_location_values(
            db, User.pincode, state=state, city=city, area=area
        ),
    )

    return AdminAnalyticsOut(
        group_by=gb,
        location_of=loc_of,
        date_from=date_from,
        date_to=date_to,
        summary=AdminAnalyticsSummary(
            consumers=len(consumer_rows),
            providers=len(provider_rows),
            orders=len(order_rows),
            orders_completed=completed,
            gmv=round(summary_gmv, 2),
            unknown_location=unknown.orders + unknown.consumers + unknown.providers
            if unknown
            else 0,
        ),
        status_breakdown=sorted(
            [
                AdminAnalyticsStatusBucket(
                    status=s.status, orders=s.orders, gmv=round(s.gmv, 2)
                )
                for s in status_map.values()
            ],
            key=lambda s: -s.orders,
        ),
        buckets=buckets,
        timeline=timeline,
        filter_options=filter_options,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff()),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Cannot delete admin accounts")
    if user.role == UserRole.CUSTOMER_SERVICE:
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=403, detail="Only admins can delete customer service agents"
            )
        db.delete(user)
        db.commit()
        return None
    if is_staff(user):
        raise HTTPException(status_code=400, detail="Cannot delete staff accounts")

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
    db.execute(delete(AdminMessage).where(AdminMessage.sender_id == user_id))

    conv_ids = db.scalars(
        select(Conversation.id).where(
            or_(Conversation.consumer_id == user_id, Conversation.provider_id == user_id)
        )
    ).all()
    if conv_ids:
        db.execute(delete(InquiryMessage).where(InquiryMessage.conversation_id.in_(conv_ids)))
        db.execute(delete(Conversation).where(Conversation.id.in_(conv_ids)))

    support_ids = db.scalars(
        select(AdminConversation.id).where(AdminConversation.provider_id == user_id)
    ).all()
    if support_ids:
        db.execute(delete(AdminMessage).where(AdminMessage.conversation_id.in_(support_ids)))
        db.execute(delete(AdminConversation).where(AdminConversation.id.in_(support_ids)))

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
        from_name=cfg.from_name or "Gharq",
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
    cfg.from_name = payload.from_name.strip() or "Gharq"
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
            subject="Gharq SMTP test",
            body_text=(
                "This is a test email from Gharq.\n\n"
                "Your SMTP configuration is working."
            ),
            body_html=(
                "<p>This is a test email from <strong>Gharq</strong>.</p>"
                "<p>Your SMTP configuration is working.</p>"
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SMTP send failed: {exc}") from exc
    return {"ok": True, "detail": f"Test email sent to {payload.to_email}"}
