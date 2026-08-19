from datetime import timedelta
import json
import logging
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.models import OfferKind, ProviderProfile, User, UserRole, VerificationStatus
from app.db.session import get_db
from app.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    MessageOut,
    OtpSendRequest,
    OtpVerifyRequest,
    ResetPasswordOtpRequest,
    ResetPasswordRequest,
    SmsStatusOut,
    Token,
    UserLogin,
    UserLocationUpdate,
    UserOut,
    UserProfileUpdate,
)
from app.services.geo import make_point, normalize_lat_lon
from app.services.maps import google_maps_url, reverse_geocode_details
from app.services.provider_catalog import set_provider_categories
from app.services.sms import (
    SmsError,
    clear_phone_verified,
    is_phone_verified,
    mark_phone_verified,
    normalize_mobile,
    resolve_sms,
    send_otp,
    verify_otp,
)
from app.services.uploads import media_url, save_upload_file

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


def _profile_complete(user: User, db: Session | None = None) -> bool:
    has_address = bool(user.address_line1 and user.pincode and user.city)
    has_coords = user.latitude is not None and user.longitude is not None
    if user.role == UserRole.PROVIDER:
        profile = user.provider_profile
        if profile is None and db is not None:
            profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.id).first()
        if not profile:
            return False
        has_biz = bool(profile.business_name and profile.gst_number)
        has_cats = bool(profile.category_links) or bool(profile.category_id)
        return has_address and has_coords and has_biz and has_cats
    return has_address and has_coords


def user_to_out(user: User, db: Session | None = None) -> UserOut:
    verification_status = None
    if user.role == UserRole.PROVIDER:
        profile = user.provider_profile
        if profile is None and db is not None:
            profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.id).first()
        if profile:
            verification_status = profile.verification_status
    return UserOut(
        id=user.id,
        role=user.role,
        phone_number=user.phone_number,
        username=user.phone_number,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_verified=user.is_verified,
        average_rating=user.average_rating,
        rating_count=user.rating_count,
        created_at=user.created_at,
        location_label=user.location_label,
        latitude=user.latitude,
        longitude=user.longitude,
        maps_url=google_maps_url(user.latitude, user.longitude),
        address_line1=user.address_line1,
        address_line2=user.address_line2,
        city=user.city,
        state=user.state,
        pincode=user.pincode,
        alternate_phone=user.alternate_phone,
        profile_complete=_profile_complete(user, db),
        verification_status=verification_status,
    )


def _sync_provider_location(db: Session, user: User) -> None:
    if user.role != UserRole.PROVIDER:
        return
    if user.latitude is None or user.longitude is None:
        return
    lon, lat = normalize_lat_lon(user.longitude, user.latitude)
    user.longitude = lon
    user.latitude = lat
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.id).first()
    if profile:
        profile.base_location = make_point(lon, lat)


def _ensure_provider_can_login(db: Session, user: User) -> None:
    if user.role != UserRole.PROVIDER:
        return
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.id).first()
    status_val = profile.verification_status if profile else VerificationStatus.PENDING
    # Approved, revoked, and rejected providers may sign in (rejected/revoked are limited in-app).
    if status_val in (
        VerificationStatus.APPROVED,
        VerificationStatus.REVOKED,
        VerificationStatus.REJECTED,
    ):
        return
    raise HTTPException(
        status_code=403,
        detail=(
            "Thank you for registration. Your account is currently being reviewed. "
            "Please keep checking email from us in the next 24 hours. "
            "You can log in after admin approval."
        ),
    )


def _sms_http_error(exc: SmsError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("/sms-status", response_model=SmsStatusOut)
def sms_status(db: Session = Depends(get_db)):
    runtime = resolve_sms(db)
    return SmsStatusOut(
        enabled=runtime.can_send,
        resend_seconds=runtime.resend_seconds,
        otp_expiry_minutes=runtime.otp_expiry_minutes,
    )


@router.post("/otp/send", response_model=MessageOut)
def send_mobile_otp(payload: OtpSendRequest, db: Session = Depends(get_db)):
    try:
        mobile = normalize_mobile(payload.phone_number)
    except SmsError as exc:
        raise _sms_http_error(exc) from exc

    purpose = payload.purpose
    if purpose == "register":
        existing = db.scalar(select(User).where(User.phone_number == mobile))
        if existing:
            raise HTTPException(status_code=400, detail="Phone number already registered")
        try:
            _sent_mobile, otp = send_otp(mobile, "register", db)
        except SmsError as exc:
            raise _sms_http_error(exc) from exc
        if resolve_sms(db).can_send:
            return MessageOut(detail="OTP sent to your mobile number")
        return MessageOut(
            detail="OTP sent. SMS is not configured, so this local demo code is shown once.",
            demo_otp=otp,
        )

    user = db.scalar(select(User).where(User.phone_number == mobile))
    generic = MessageOut(detail="If an account exists for that phone, an OTP was sent.")
    if not user or not user.is_active:
        return generic
    try:
        send_otp(mobile, "forgot_password", db)
    except SmsError as exc:
        if exc.status_code == 429:
            raise _sms_http_error(exc) from exc
        logger.warning("Forgot-password OTP send failed for %s: %s", mobile, exc)
    return generic


@router.post("/otp/verify", response_model=MessageOut)
def verify_mobile_otp(payload: OtpVerifyRequest):
    try:
        mobile = verify_otp(payload.phone_number, payload.purpose, payload.otp)
        mark_phone_verified(payload.purpose, mobile)
    except SmsError as exc:
        raise _sms_http_error(exc) from exc
    return MessageOut(detail="Mobile number verified")


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    role: UserRole = Form(...),
    phone_number: str = Form(..., min_length=8, max_length=20),
    full_name: str = Form(..., min_length=2, max_length=255),
    password: str = Form(..., min_length=6, max_length=128),
    email: str | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    location_label: str | None = Form(None),
    pincode: str | None = Form(None),
    city: str | None = Form(None),
    gst_number: str | None = Form(None),
    business_name: str | None = Form(None),
    description: str | None = Form(None),
    offerings_detail: str | None = Form(None),
    offer_kind: OfferKind | None = Form(None),
    category_ids_json: str | None = Form(None),
    otp: str | None = Form(None),
    db: Session = Depends(get_db),
):

    if role in (UserRole.ADMIN, UserRole.CUSTOMER_SERVICE):
        raise HTTPException(status_code=400, detail="Cannot self-register as staff")

    try:
        phone_number = normalize_mobile(phone_number)
    except SmsError as exc:
        raise _sms_http_error(exc) from exc

    existing = db.scalar(select(User).where(User.phone_number == phone_number))
    if existing:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    try:
        already = is_phone_verified("register", phone_number)
    except SmsError as exc:
        raise _sms_http_error(exc) from exc
    if not already:
        if not (otp or "").strip():
            raise HTTPException(
                status_code=400,
                detail="Verify your mobile number with the OTP sent to your phone",
            )
        try:
            verify_otp(phone_number, "register", otp or "")
        except SmsError as exc:
            raise _sms_http_error(exc) from exc

    email_norm = email.strip().lower() if email and email.strip() else None
    if not email_norm:
        raise HTTPException(status_code=400, detail="Email is required")
    email_clash = db.scalar(select(User).where(User.email == email_norm))
    if email_clash:
        raise HTTPException(status_code=400, detail="Email already in use")

    gst = gst_number.strip().upper() if gst_number and gst_number.strip() else None
    biz_name = (business_name or "").strip()
    about = description.strip() if description and description.strip() else None
    offerings = offerings_detail.strip() if offerings_detail and offerings_detail.strip() else None
    kind = offer_kind or OfferKind.BOTH

    category_ids: list[int] = []
    if category_ids_json and category_ids_json.strip():
        try:
            parsed = json.loads(category_ids_json)
            if not isinstance(parsed, list):
                raise ValueError("not a list")
            category_ids = [int(x) for x in parsed]
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=400, detail="Invalid category_ids_json") from exc

    city_norm = (city or "").strip() or None
    pin_norm = (pincode or "").strip() or None
    if not city_norm:
        raise HTTPException(status_code=400, detail="City / locality is required")
    if not pin_norm or not re.fullmatch(r"\d{6}", pin_norm):
        raise HTTPException(status_code=400, detail="A valid 6-digit pincode is required")

    if role == UserRole.PROVIDER:
        if not biz_name:
            raise HTTPException(
                status_code=400,
                detail="Business / shop name is required for provider registration",
            )
        if not gst or not GSTIN_RE.match(gst):
            raise HTTPException(
                status_code=400,
                detail="A valid 15-character GSTIN is required for provider registration",
            )
    else:
        biz_name = biz_name or full_name.strip()

    lat = latitude
    lon = longitude
    if lat is not None and lon is not None:
        lon, lat = normalize_lat_lon(lon, lat)

    label = (location_label or "").strip() or None
    if label and label.casefold() in {"detected from device", "current location"}:
        label = None
    if lat is not None and lon is not None and (not label or not city_norm or not pin_norm):
        details = reverse_geocode_details(lat, lon)
        if not label:
            label = details.location_label
        if not city_norm:
            city_norm = details.city
        if not pin_norm:
            pin_norm = details.pincode

    user = User(
        role=role,
        phone_number=phone_number,
        full_name=full_name,
        email=email_norm,
        hashed_password=get_password_hash(password),
        is_verified=role == UserRole.CONSUMER,
        latitude=lat,
        longitude=lon,
        location_label=label,
        city=city_norm,
        pincode=pin_norm,
    )
    db.add(user)
    db.flush()

    if role == UserRole.PROVIDER:
        from app.services.slugs import allocate_public_slug

        profile = ProviderProfile(
            user_id=user.id,
            business_name=biz_name,
            public_slug=allocate_public_slug(db, biz_name),
            offer_kind=kind,
            description=about,
            offerings_detail=offerings,
            verification_status=VerificationStatus.PENDING,
            gst_number=gst,
            base_location=(make_point(lon, lat) if lat is not None and lon is not None else None),
        )
        db.add(profile)

        db.flush()
        try:
            set_provider_categories(db, profile, category_ids)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.commit()
    db.refresh(user)
    clear_phone_verified("register", phone_number)

    if role == UserRole.PROVIDER:
        from app.services.email import send_provider_registration_pending

        send_provider_registration_pending(
            db,
            to_email=user.email,
            full_name=user.full_name,
        )
    elif role == UserRole.CONSUMER:
        from app.services.email import send_consumer_registration

        send_consumer_registration(
            db,
            to_email=user.email,
            full_name=user.full_name,
        )

    return user_to_out(user, db)


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    try:
        phone = normalize_mobile(payload.phone_number)
    except SmsError:
        phone = payload.phone_number.strip()
    user = db.scalar(select(User).where(User.phone_number == phone))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect phone number or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    _ensure_provider_can_login(db, user)

    token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return Token(access_token=token)


@router.post("/login/form", response_model=Token, include_in_schema=False)
def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """OAuth2 password form for Swagger Authorize button (username = phone)."""
    return login(UserLogin(phone_number=form_data.username, password=form_data.password), db)


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Start password reset. When Fast2SMS is configured, an OTP is sent.
    Otherwise an email link is sent if the account has an email.
    Always returns a generic success message.
    """
    try:
        phone = normalize_mobile(payload.phone_number)
    except SmsError:
        phone = payload.phone_number.strip()

    if resolve_sms(db).can_send:
        generic = MessageOut(detail="If an account exists for that phone, an OTP was sent.")
        user = db.scalar(select(User).where(User.phone_number == phone))
        if not user or not user.is_active:
            return generic
        try:
            send_otp(phone, "forgot_password", db)
        except SmsError as exc:
            if exc.status_code == 429:
                raise _sms_http_error(exc) from exc
            logger.warning("Forgot-password OTP send failed for %s: %s", phone, exc)
        return generic

    generic = MessageOut(
        detail=(
            "If an account exists for that phone with an email on file, "
            "password reset instructions were sent."
        )
    )
    user = db.scalar(select(User).where(User.phone_number == phone))
    if not user or not user.is_active or not user.email:
        return generic

    token = create_access_token(
        data={"sub": str(user.id), "purpose": "password_reset"},
        expires_delta=timedelta(minutes=settings.password_reset_expire_minutes),
    )
    base = settings.frontend_url.rstrip("/")
    reset_url = f"{base}/reset-password?token={token}"

    from app.services.email import send_password_reset

    send_password_reset(
        db,
        to_email=user.email,
        full_name=user.full_name,
        reset_url=reset_url,
        expires_minutes=settings.password_reset_expire_minutes,
        role=user.role.value,
    )
    return generic


@router.post("/reset-password-otp", response_model=MessageOut)
def reset_password_otp(payload: ResetPasswordOtpRequest, db: Session = Depends(get_db)):
    if not resolve_sms(db).can_send:
        raise HTTPException(status_code=503, detail="SMS OTP is not configured")
    try:
        mobile = verify_otp(payload.phone_number, "forgot_password", payload.otp)
    except SmsError as exc:
        raise _sms_http_error(exc) from exc

    user = db.scalar(select(User).where(User.phone_number == mobile))
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    user.hashed_password = get_password_hash(payload.password)
    db.commit()
    return MessageOut(detail="Password updated. You can sign in with your new password.")


@router.post("/reset-password", response_model=MessageOut)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    from jose import JWTError, jwt
    from uuid import UUID

    try:
        data = jwt.decode(
            payload.token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link") from None

    if data.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    sub = data.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    try:
        user_id = UUID(str(sub))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link") from None

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user.hashed_password = get_password_hash(payload.password)
    db.commit()
    return MessageOut(detail="Password updated. You can sign in with your new password.")


@router.get("/me", response_model=UserOut)
def me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return user_to_out(current_user, db)


@router.patch("/me", response_model=UserOut)
def update_my_profile(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)

    if "email" in data:
        email = data["email"]
        if email:
            clash = db.scalar(
                select(User).where(User.email == email, User.id != current_user.id)
            )
            if clash:
                raise HTTPException(status_code=400, detail="Email already in use")
        else:
            data["email"] = None

    for key, value in data.items():
        setattr(current_user, key, value)

    if current_user.latitude is not None and current_user.longitude is not None:
        lon, lat = normalize_lat_lon(current_user.longitude, current_user.latitude)
        current_user.longitude = lon
        current_user.latitude = lat

    label = (current_user.location_label or "").strip() or None
    if label and label.casefold() in {"detected from device", "current location"}:
        label = None
        current_user.location_label = None
    if (
        current_user.latitude is not None
        and current_user.longitude is not None
        and ("latitude" in data or "longitude" in data or "location_label" in data)
    ):
        details = reverse_geocode_details(current_user.latitude, current_user.longitude)
        if not label:
            current_user.location_label = details.location_label
        if not (current_user.city or "").strip() and details.city:
            current_user.city = details.city
        if not (current_user.state or "").strip() and details.state:
            current_user.state = details.state
        if not (current_user.pincode or "").strip() and details.pincode:
            current_user.pincode = details.pincode

    if "latitude" in data or "longitude" in data:
        _sync_provider_location(db, current_user)

    db.commit()
    db.refresh(current_user)
    return user_to_out(current_user, db)


@router.patch("/me/password", response_model=MessageOut)
def change_my_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.current_password == payload.password:
        raise HTTPException(status_code=400, detail="New password must be different")
    current_user.hashed_password = get_password_hash(payload.password)
    db.commit()
    return MessageOut(detail="Password updated")


@router.patch("/me/location", response_model=UserOut)
def update_my_location(
    payload: UserLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(current_user, key, value)
    _sync_provider_location(db, current_user)
    db.commit()
    db.refresh(current_user)
    return user_to_out(current_user, db)
