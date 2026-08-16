from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import STAFF_ROLES, require_roles
from app.core.config import settings
from app.db.models import (
    Conversation,
    InquiryMessage,
    ProviderProfile,
    Quote,
    QuoteStatus,
    RequestStatus,
    RequestTarget,
    RequestTargetMode,
    ServiceRequest,
    User,
    UserRole,
    VerificationStatus,
)
from app.db.session import get_db
from app.schemas import ServiceRequestClose, ServiceRequestCreate, ServiceRequestOut
from app.services.attachments import link_attachments, list_attachments_for_request
from app.services.geo import (
    get_lon_lat_from_profile,
    get_request_lon_lat,
    make_point,
    match_providers,
    normalize_lat_lon,
    normalize_pincode,
    users_share_pincode,
)
from app.services.inquiry_chat import reset_inquiry_conversation
from app.services.provider_catalog import provider_matches_category
from app.services.request_expiry import apply_request_expiry
from app.services.redis_pubsub import redis_pubsub
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/requests", tags=["requests"])


def _target_ids(req: ServiceRequest) -> list[UUID]:
    return [t.provider_id for t in req.targets]


def _to_out(db: Session, req: ServiceRequest, matched: int | None = None) -> ServiceRequestOut:
    lon, lat = get_request_lon_lat(db, req.id)
    mode = getattr(req, "target_mode", None) or RequestTargetMode.BROADCAST
    return ServiceRequestOut(
        id=req.id,
        consumer_id=req.consumer_id,
        category_id=req.category_id,
        title=req.title,
        description=req.description,
        search_radius_km=req.search_radius_km,
        status=req.status,
        target_mode=mode,
        target_provider_ids=_target_ids(req),
        longitude=lon,
        latitude=lat,
        request_pincode=req.request_pincode,
        expires_at=req.expires_at,
        created_at=req.created_at,
        matched_provider_count=matched,
        attachments=list_attachments_for_request(db, req.id),
    )


@router.post("", response_model=ServiceRequestOut, status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: ServiceRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER)),
):
    lon = payload.longitude if payload.longitude is not None else current_user.longitude
    lat = payload.latitude if payload.latitude is not None else current_user.latitude
    if lon is not None and lat is not None:
        lon, lat = normalize_lat_lon(lon, lat)
    pin = normalize_pincode(payload.pincode) or normalize_pincode(current_user.pincode)
    use_geo = lon is not None and lat is not None
    radius = settings.default_search_radius_km if use_geo else (
        payload.search_radius_km or settings.default_search_radius_km
    )
    if radius > settings.max_search_radius_km:
        raise HTTPException(status_code=400, detail=f"Max radius is {settings.max_search_radius_km} km")

    target_ids = list(dict.fromkeys(payload.target_provider_ids or []))
    targeted = len(target_ids) > 0

    if not targeted and (lon is None or lat is None) and not pin:
        raise HTTPException(
            status_code=400,
            detail="Set location coordinates or a pincode (on your profile) to match nearby providers",
        )

    if targeted:
        providers: list[ProviderProfile] = []
        for pid in target_ids:
            profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == pid).first()
            user = db.get(User, pid)
            if (
                not profile
                or not user
                or user.role != UserRole.PROVIDER
                or not user.is_active
                or profile.verification_status != VerificationStatus.APPROVED
            ):
                raise HTTPException(status_code=400, detail=f"Invalid or unverified provider: {pid}")
            if not provider_matches_category(db, profile, payload.category_id):
                raise HTTPException(
                    status_code=400,
                    detail=f"Provider {profile.business_name} does not offer this category",
                )
            providers.append(profile)
        provider_ids = [p.user_id for p in providers]
        target_mode = RequestTargetMode.TARGETED
    else:
        provider_ids = []
        target_mode = RequestTargetMode.BROADCAST

    expires_at = None
    if payload.expires_in_minutes:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=payload.expires_in_minutes)

    req = ServiceRequest(
        consumer_id=current_user.id,
        category_id=payload.category_id,
        title=payload.title,
        description=payload.description,
        request_location=make_point(lon, lat) if lon is not None and lat is not None else None,
        request_pincode=pin,
        search_radius_km=radius,
        target_mode=target_mode,
        status=RequestStatus.ACTIVE,
        expires_at=expires_at,
    )
    db.add(req)
    db.flush()

    for pid in provider_ids:
        db.add(RequestTarget(request_id=req.id, provider_id=pid))

    link_attachments(
        db,
        attachment_ids=payload.attachment_ids,
        uploader_id=current_user.id,
        request_id=req.id,
    )
    db.commit()
    db.refresh(req)

    if targeted:
        matched_count = len(provider_ids)
    else:
        matched = match_providers(
            db,
            category_id=payload.category_id,
            longitude=lon,
            latitude=lat,
            radius_km=radius,
            pincode=pin,
            online_only=False,
            verified_only=True,
        )
        provider_ids = [p.user_id for p, _ in matched]
        matched_count = len(matched)

    reset_events: list[tuple[UUID, UUID]] = []
    for pid in provider_ids:
        old_id = reset_inquiry_conversation(db, current_user.id, pid)
        if old_id:
            reset_events.append((pid, old_id))
    if reset_events:
        db.commit()

    event_payload = {
        "request_id": str(req.id),
        "category_id": req.category_id,
        "title": req.title,
        "description": req.description,
        "search_radius_km": req.search_radius_km,
        "attachment_count": len(payload.attachment_ids),
        "match_mode": "targeted" if targeted else ("geo" if use_geo else "pincode"),
        "target_mode": target_mode.value,
        "pincode": pin,
        "distance_hint": "selected by consumer" if targeted else "within your area",
        "created_at": req.created_at.isoformat() if req.created_at else None,
    }
    await ws_manager.broadcast_to_users(
        provider_ids,
        {"type": "new_request", "payload": event_payload},
    )
    redis_pubsub.publish("new_request", event_payload, target_user_ids=provider_ids)

    for pid, old_id in reset_events:
        await ws_manager.broadcast_to_users(
            [pid, current_user.id],
            {
                "type": "conversation_reset",
                "payload": {
                    "conversation_id": str(old_id),
                    "consumer_id": str(current_user.id),
                    "provider_id": str(pid),
                    "request_id": str(req.id),
                    "reason": "new_request",
                },
            },
        )

    return _to_out(db, req, matched=matched_count)


@router.get("/mine", response_model=list[ServiceRequestOut])
def my_requests(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER)),
):
    apply_request_expiry(db, background_tasks)
    rows = db.scalars(
        select(ServiceRequest)
        .where(ServiceRequest.consumer_id == current_user.id)
        .order_by(ServiceRequest.created_at.desc())
    ).all()
    return [_to_out(db, r) for r in rows]


@router.get("/feed", response_model=list[ServiceRequestOut])
def provider_feed(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    apply_request_expiry(db, background_tasks)
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == current_user.id).first()
    if not profile:
        return []

    lon, lat = get_lon_lat_from_profile(db, profile)
    if lat is None:
        lat = current_user.latitude
        lon = current_user.longitude
    provider_pin = normalize_pincode(current_user.pincode)

    candidates = db.scalars(
        select(ServiceRequest).where(ServiceRequest.status == RequestStatus.ACTIVE)
    ).all()

    already_quoted_ids = set(
        db.scalars(
            select(Quote.request_id).where(Quote.provider_id == current_user.id)
        ).all()
    )

    results: list[ServiceRequestOut] = []
    for req in candidates:
        if req.id in already_quoted_ids:
            continue
        if not provider_matches_category(db, profile, req.category_id):
            continue

        mode = getattr(req, "target_mode", None) or RequestTargetMode.BROADCAST
        if mode == RequestTargetMode.TARGETED:
            if any(t.provider_id == current_user.id for t in req.targets):
                results.append(_to_out(db, req))
            continue

        if (lon is None or lat is None) and not provider_pin:
            continue

        consumer = db.get(User, req.consumer_id)
        req_pin = normalize_pincode(req.request_pincode) or (
            normalize_pincode(consumer.pincode) if consumer else None
        )
        rlon, rlat = get_request_lon_lat(db, req.id)

        matched = match_providers(
            db,
            category_id=req.category_id,
            longitude=rlon,
            latitude=rlat,
            radius_km=settings.default_search_radius_km,
            pincode=req_pin,
            online_only=False,
            verified_only=False,
        )
        if any(p.user_id == current_user.id for p, _ in matched):
            results.append(_to_out(db, req))
            continue

        if users_share_pincode(provider_pin, req_pin):
            results.append(_to_out(db, req))
    return results


@router.get("/{request_id}", response_model=ServiceRequestOut)
def get_request(
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
    if current_user.role == UserRole.PROVIDER:
        mode = getattr(req, "target_mode", None) or RequestTargetMode.BROADCAST
        if mode == RequestTargetMode.TARGETED and not any(
            t.provider_id == current_user.id for t in req.targets
        ):
            raise HTTPException(status_code=403, detail="Not allowed")
    return _to_out(db, req)


@router.post("/{request_id}/close", response_model=ServiceRequestOut)
async def close_request(
    request_id: UUID,
    background_tasks: BackgroundTasks,
    payload: ServiceRequestClose = ServiceRequestClose(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER)),
):
    apply_request_expiry(db, background_tasks)
    req = db.get(ServiceRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.consumer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if req.status != RequestStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Only active requests can be closed")

    pending = db.scalars(
        select(Quote).where(Quote.request_id == req.id, Quote.status == QuoteStatus.PENDING)
    ).all()
    reason = (payload.reason or "").strip()
    if pending and not reason:
        raise HTTPException(
            status_code=400,
            detail="A reason is required because this request has active quotes",
        )

    req.status = RequestStatus.CANCELLED
    provider_ids = list({q.provider_id for q in pending})
    for quote in pending:
        quote.status = QuoteStatus.WITHDRAWN

    notify_events: list[tuple[UUID, dict, dict]] = []
    if pending and reason:
        body = (
            f'Request "{req.title}" was cancelled by the consumer.\n\n'
            f"Reason: {reason}"
        )
        for provider_id in provider_ids:
            conv = db.scalar(
                select(Conversation).where(
                    Conversation.consumer_id == current_user.id,
                    Conversation.provider_id == provider_id,
                )
            )
            if not conv:
                conv = Conversation(
                    consumer_id=current_user.id,
                    provider_id=provider_id,
                    category_id=req.category_id,
                )
                db.add(conv)
                db.flush()
            msg = InquiryMessage(
                conversation_id=conv.id,
                sender_id=current_user.id,
                body=body,
            )
            db.add(msg)
            conv.updated_at = datetime.now(timezone.utc)
            db.flush()
            notify_events.append(
                (
                    provider_id,
                    {
                        "type": "request_cancelled",
                        "payload": {
                            "request_id": str(req.id),
                            "title": req.title,
                            "reason": reason,
                            "consumer_name": current_user.full_name,
                            "quote_count": len(pending),
                            "conversation_id": str(conv.id),
                            "body": body,
                        },
                    },
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
            )

    db.commit()
    db.refresh(req)

    for provider_id, cancelled_event, inquiry_event in notify_events:
        await ws_manager.send_to_user(provider_id, cancelled_event)
        await ws_manager.send_to_user(provider_id, inquiry_event)
    if provider_ids and reason:
        redis_pubsub.publish(
            "request_cancelled",
            {
                "request_id": str(req.id),
                "title": req.title,
                "reason": reason,
                "consumer_name": current_user.full_name,
                "quote_count": len(pending),
            },
            target_user_ids=provider_ids,
        )

    return _to_out(db, req)
