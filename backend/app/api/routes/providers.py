from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import STAFF_ROLES, require_roles, require_staff
from app.db.models import (
    Category,
    OfferKind,
    ProviderCategory,
    ProviderProfile,
    User,
    UserRole,
    VerificationStatus,
)
from app.db.session import get_db
from app.schemas import (
    NearbyCategoryCount,
    NearbyCategoryCountsOut,
    ProviderCatalogItem,
    ProviderProfileOut,
    ProviderProfileUpdate,
    ProviderPublicOut,
    ProviderVerify,
    PublicSearchCategory,
    PublicSearchOut,
)
from app.services.geo import get_lon_lat_from_profile, make_point, normalize_lat_lon
from app.services.maps import google_maps_url
from app.services.slugs import (
    allocate_public_slug,
    ensure_profile_public_slug,
    public_url_path_for,
)
from app.services.provider_catalog import (
    provider_category_names,
    provider_matches_category,
    set_provider_categories,
)
from app.services.business_hours import (
    effective_is_online,
    sync_online_flag_with_hours,
)
from app.services.uploads import media_url, save_upload_file

router = APIRouter(prefix="/providers", tags=["providers"])

DOC_FIELD_MAP = {
    "aadhaar": "aadhaar_doc_url",
    "gst": "gst_doc_url",
    "government_id": "government_id_url",
    "business_reg": "business_reg_url",
}


def _to_out(db: Session, profile: ProviderProfile) -> ProviderProfileOut:
    lon, lat = get_lon_lat_from_profile(db, profile)
    user = db.get(User, profile.user_id)
    cat_ids = [link.category_id for link in profile.category_links]
    if not cat_ids and profile.category_id:
        cat_ids = [profile.category_id]
    if not profile.public_slug:
        profile.public_slug = allocate_public_slug(
            db, profile.business_name, exclude_profile_id=profile.id
        )
        db.commit()
        db.refresh(profile)
    return ProviderProfileOut(
        id=profile.id,
        user_id=profile.user_id,
        business_name=profile.business_name,
        public_slug=profile.public_slug,
        public_url_path=public_url_path_for(profile),
        category_id=profile.category_id,
        category_ids=cat_ids,
        categories=provider_category_names(db, profile),
        description=profile.description,
        offer_kind=profile.offer_kind or OfferKind.BOTH,
        offerings_detail=profile.offerings_detail,
        website_url=profile.website_url,
        instagram_url=profile.instagram_url,
        youtube_url=profile.youtube_url,
        opening_time=profile.opening_time,
        closing_time=profile.closing_time,
        gst_number=profile.gst_number,
        aadhaar_number=profile.aadhaar_number,
        max_radius_km=profile.max_radius_km,
        is_online=effective_is_online(profile),
        verification_status=profile.verification_status,
        longitude=lon,
        latitude=lat,
        maps_url=google_maps_url(lat, lon),
        full_name=user.full_name if user else None,
        location_label=user.location_label if user else None,
        average_rating=user.average_rating if user else 0,
        rating_count=user.rating_count if user else 0,
        government_id_url=profile.government_id_url,
        business_reg_url=profile.business_reg_url,
        aadhaar_doc_url=profile.aadhaar_doc_url,
        gst_doc_url=profile.gst_doc_url,
    )


@router.get("/catalog", response_model=list[ProviderCatalogItem])
def catalog_by_category(
    category_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONSUMER, *STAFF_ROLES)),
):
    from app.core.config import settings
    from app.services.geo import normalize_pincode

    use_geo = current_user.latitude is not None and current_user.longitude is not None
    return _catalog_items(
        db,
        category_id=category_id,
        longitude=current_user.longitude if use_geo else None,
        latitude=current_user.latitude if use_geo else None,
        pincode=normalize_pincode(current_user.pincode),
        radius_km=settings.default_search_radius_km,
        require_location=False,
    )


@router.get("/public-catalog", response_model=list[ProviderCatalogItem])
def public_catalog_by_category(
    category_id: int = Query(...),
    latitude: float | None = Query(default=None),
    longitude: float | None = Query(default=None),
    pincode: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Unauthenticated nearby browse for the landing page (default 5 km)."""
    from app.core.config import settings
    from app.services.geo import normalize_lat_lon, normalize_pincode

    lon, lat = longitude, latitude
    if lon is not None and lat is not None:
        lon, lat = normalize_lat_lon(lon, lat)

    return _catalog_items(
        db,
        category_id=category_id,
        longitude=lon,
        latitude=lat,
        pincode=normalize_pincode(pincode),
        radius_km=settings.default_search_radius_km,
        require_location=True,
    )


@router.get("/nearby-category-counts", response_model=NearbyCategoryCountsOut)
def nearby_category_counts(
    latitude: float | None = Query(default=None),
    longitude: float | None = Query(default=None),
    pincode: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Count verified nearby providers per category within the default search radius (5 km)."""
    from app.core.config import settings
    from app.services.geo import match_all_nearby_providers, normalize_lat_lon, normalize_pincode

    lon, lat = longitude, latitude
    if lon is not None and lat is not None:
        lon, lat = normalize_lat_lon(lon, lat)
    pin = normalize_pincode(pincode)
    radius_km = settings.default_search_radius_km

    if lat is None and lon is None and not pin:
        return NearbyCategoryCountsOut(radius_km=radius_km, counts=[])

    nearby = match_all_nearby_providers(
        db,
        longitude=lon,
        latitude=lat,
        radius_km=radius_km,
        pincode=pin,
        online_only=False,
        verified_only=True,
    )

    categories = list(
        db.scalars(select(Category).where(Category.is_active.is_(True))).all()
    )
    children_by_parent: dict[int, set[int]] = {}
    for cat in categories:
        if cat.parent_id is not None:
            children_by_parent.setdefault(cat.parent_id, set()).add(cat.id)

    provider_linked: list[set[int]] = []
    for profile, _dist in nearby:
        linked = {link.category_id for link in profile.category_links}
        if profile.category_id:
            linked.add(profile.category_id)
        provider_linked.append(linked)

    counts: list[NearbyCategoryCount] = []
    for cat in categories:
        match_ids = {cat.id}
        if cat.parent_id is None:
            match_ids |= children_by_parent.get(cat.id, set())
        else:
            match_ids.add(cat.parent_id)
        n = sum(1 for linked in provider_linked if linked & match_ids)
        counts.append(NearbyCategoryCount(category_id=cat.id, nearby_count=n))

    return NearbyCategoryCountsOut(radius_km=radius_km, counts=counts)


def _catalog_items(
    db: Session,
    *,
    category_id: int,
    longitude: float | None,
    latitude: float | None,
    pincode: str | None,
    radius_km: int,
    require_location: bool,
) -> list[ProviderCatalogItem]:
    from app.services.geo import match_providers

    category = db.get(Category, category_id)
    if not category or not category.is_active:
        raise HTTPException(status_code=404, detail="Category not found")

    use_geo = latitude is not None and longitude is not None
    if require_location and not use_geo and not pincode:
        return []

    if use_geo or pincode:
        matched = match_providers(
            db,
            category_id=category_id,
            longitude=longitude if use_geo else None,
            latitude=latitude if use_geo else None,
            radius_km=radius_km,
            pincode=pincode,
            online_only=False,
            verified_only=True,
        )
        nearby_ids: set | None = {p.id for p, _ in matched}
    else:
        nearby_ids = None

    rows = db.execute(
        select(ProviderProfile, User)
        .join(User, User.id == ProviderProfile.user_id)
        .where(
            ProviderProfile.verification_status == VerificationStatus.APPROVED,
            User.is_active.is_(True),
        )
        .order_by(ProviderProfile.is_online.desc(), User.average_rating.desc())
    ).all()

    items: list[ProviderCatalogItem] = []
    for profile, user in rows:
        if not provider_matches_category(db, profile, category_id):
            continue
        if nearby_ids is not None and profile.id not in nearby_ids:
            continue
        lon, lat = get_lon_lat_from_profile(db, profile)
        if lat is None:
            lat = user.latitude
            lon = user.longitude
        names = provider_category_names(db, profile)
        items.append(
            ProviderCatalogItem(
                user_id=user.id,
                full_name=user.full_name,
                business_name=profile.business_name,
                public_slug=profile.public_slug,
                public_url_path=public_url_path_for(profile),
                category_id=profile.category_id,
                category_name=category.name,
                categories=names,
                description=profile.description,
                offerings_detail=profile.offerings_detail,
                offer_kind=profile.offer_kind,
                opening_time=profile.opening_time,
                closing_time=profile.closing_time,
                gst_number=profile.gst_number,
                is_online=effective_is_online(profile),
                verification_status=profile.verification_status,
                average_rating=user.average_rating,
                rating_count=user.rating_count,
                latitude=lat,
                longitude=lon,
                location_label=user.location_label,
                maps_url=google_maps_url(lat, lon),
                max_radius_km=profile.max_radius_km,
            )
        )
    return items


@router.get("/public-search", response_model=PublicSearchOut)
def public_search(
    q: str = Query(default="", max_length=100),
    latitude: float | None = Query(default=None),
    longitude: float | None = Query(default=None),
    pincode: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Search verified providers by name, mobile, category, subcategory, or slug (public).

    Empty query returns all nearby verified providers (GPS 5 km, or same pincode).
    """
    from app.core.config import settings
    from app.services.geo import (
        match_all_nearby_providers,
        normalize_lat_lon,
        normalize_pincode,
    )
    from sqlalchemy import func as sa_func

    query = (q or "").strip()
    lon, lat = longitude, latitude
    if lon is not None and lat is not None:
        lon, lat = normalize_lat_lon(lon, lat)
    pin = normalize_pincode(pincode)

    def _catalog_row(profile: ProviderProfile, user: User) -> ProviderCatalogItem:
        plon, plat = get_lon_lat_from_profile(db, profile)
        if plat is None:
            plat = user.latitude
            plon = user.longitude
        names = provider_category_names(db, profile)
        return ProviderCatalogItem(
            user_id=user.id,
            full_name=user.full_name,
            business_name=profile.business_name,
            public_slug=profile.public_slug,
            public_url_path=public_url_path_for(profile),
            category_id=profile.category_id,
            category_name=names[0] if names else None,
            categories=names,
            description=profile.description,
            offerings_detail=profile.offerings_detail,
            offer_kind=profile.offer_kind,
            opening_time=profile.opening_time,
            closing_time=profile.closing_time,
            gst_number=profile.gst_number,
            is_online=effective_is_online(profile),
            verification_status=profile.verification_status,
            average_rating=user.average_rating,
            rating_count=user.rating_count,
            latitude=plat,
            longitude=plon,
            location_label=user.location_label,
            maps_url=google_maps_url(plat, plon),
            max_radius_km=profile.max_radius_km,
        )

    # Blank search → all nearby providers by GPS / pincode
    if not query:
        if lat is None and lon is None and not pin:
            raise HTTPException(
                status_code=400,
                detail="Enter a pincode or allow location to see nearby providers",
            )
        nearby = match_all_nearby_providers(
            db,
            longitude=lon,
            latitude=lat,
            radius_km=settings.default_search_radius_km,
            pincode=pin,
            online_only=False,
            verified_only=True,
        )
        items: list[ProviderCatalogItem] = []
        for profile, _dist in nearby[:40]:
            user = db.get(User, profile.user_id)
            if not user or not user.is_active:
                continue
            items.append(_catalog_row(profile, user))
        return PublicSearchOut(query="", categories=[], providers=items)

    like = f"%{query.lower()}%"
    phone_digits = "".join(ch for ch in query if ch.isdigit())
    phone_like = f"%{phone_digits}%" if len(phone_digits) >= 3 else None

    cat_rows = db.scalars(
        select(Category)
        .where(
            Category.is_active.is_(True),
            or_(
                sa_func.lower(Category.name).like(like),
                sa_func.lower(sa_func.coalesce(Category.description, "")).like(like),
                sa_func.lower(Category.slug).like(like),
            ),
        )
        .order_by(Category.name)
        .limit(40)
    ).all()

    categories: list[PublicSearchCategory] = []
    for c in cat_rows:
        parent_name = None
        if c.parent_id:
            parent = db.get(Category, c.parent_id)
            parent_name = parent.name if parent else None
        categories.append(
            PublicSearchCategory(
                id=c.id,
                name=c.name,
                slug=c.slug,
                description=c.description,
                kind=c.kind or OfferKind.BOTH,
                parent_name=parent_name,
            )
        )

    # Matched category ids, plus parents↔children so top-level and subcategory searches both hit
    matched_cat_ids: set[int] = {c.id for c in cat_rows}
    for c in cat_rows:
        if c.parent_id:
            matched_cat_ids.add(c.parent_id)
        else:
            for child in db.scalars(
                select(Category).where(
                    Category.parent_id == c.id,
                    Category.is_active.is_(True),
                )
            ).all():
                matched_cat_ids.add(child.id)

    provider_match = or_(
        sa_func.lower(ProviderProfile.business_name).like(like),
        sa_func.lower(sa_func.coalesce(ProviderProfile.description, "")).like(like),
        sa_func.lower(sa_func.coalesce(ProviderProfile.offerings_detail, "")).like(like),
        sa_func.lower(sa_func.coalesce(ProviderProfile.public_slug, "")).like(like),
        sa_func.lower(User.full_name).like(like),
        sa_func.lower(sa_func.coalesce(User.username, "")).like(like),
        User.phone_number.like(like),
        sa_func.coalesce(User.alternate_phone, "").like(like),
    )
    if phone_like:
        provider_match = or_(
            provider_match,
            User.phone_number.like(phone_like),
            sa_func.coalesce(User.alternate_phone, "").like(phone_like),
        )

    # Providers matching text in name / mobile / slug / offerings
    provider_rows = list(
        db.execute(
            select(ProviderProfile, User)
            .join(User, User.id == ProviderProfile.user_id)
            .where(
                ProviderProfile.verification_status == VerificationStatus.APPROVED,
                User.is_active.is_(True),
                provider_match,
            )
            .order_by(ProviderProfile.is_online.desc(), User.average_rating.desc())
            .limit(40)
        ).all()
    )

    # Also include providers linked to matching categories / subcategories
    if matched_cat_ids:
        extra = db.execute(
            select(ProviderProfile, User)
            .join(User, User.id == ProviderProfile.user_id)
            .where(
                ProviderProfile.verification_status == VerificationStatus.APPROVED,
                User.is_active.is_(True),
                or_(
                    ProviderProfile.category_id.in_(matched_cat_ids),
                    ProviderProfile.id.in_(
                        select(ProviderCategory.provider_id).where(
                            ProviderCategory.category_id.in_(matched_cat_ids)
                        )
                    ),
                ),
            )
            .order_by(ProviderProfile.is_online.desc(), User.average_rating.desc())
            .limit(40)
        ).all()
        seen = {p.id for p, _ in provider_rows}
        for row in extra:
            if row[0].id not in seen:
                provider_rows.append(row)
                seen.add(row[0].id)

    # Optional nearby filter (name / mobile / slug / category hits must still be local)
    nearby_ids = None
    if (lat is not None and lon is not None) or pin:
        nearby_ids = {
            profile.id
            for profile, _dist in match_all_nearby_providers(
                db,
                longitude=lon,
                latitude=lat,
                radius_km=settings.default_search_radius_km,
                pincode=pin,
                online_only=False,
                verified_only=True,
            )
        }

    items = []
    for profile, user in provider_rows:
        if nearby_ids is not None and profile.id not in nearby_ids:
            continue
        items.append(_catalog_row(profile, user))
        if len(items) >= 24:
            break

    return PublicSearchOut(query=query, categories=categories, providers=items)


@router.get("/public/{slug_or_id}", response_model=ProviderPublicOut)
def public_provider_page(
    slug_or_id: str,
    db: Session = Depends(get_db),
):
    """Open public profile for an approved provider by friendly slug or user id."""
    profile = None
    try:
        user_uuid = UUID(slug_or_id)
        profile = (
            db.query(ProviderProfile).filter(ProviderProfile.user_id == user_uuid).first()
        )
    except ValueError:
        profile = (
            db.query(ProviderProfile)
            .filter(ProviderProfile.public_slug == slug_or_id.lower())
            .first()
        )

    if not profile or profile.verification_status != VerificationStatus.APPROVED:
        raise HTTPException(status_code=404, detail="Provider not found")
    user = db.get(User, profile.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="Provider not found")

    lon, lat = get_lon_lat_from_profile(db, profile)
    if lat is None:
        lat = user.latitude
        lon = user.longitude

    if not profile.public_slug:
        ensure_profile_public_slug(db, profile)
        db.commit()
        db.refresh(profile)

    return ProviderPublicOut(
        user_id=user.id,
        business_name=profile.business_name,
        public_slug=profile.public_slug,
        full_name=user.full_name,
        description=profile.description,
        offerings_detail=profile.offerings_detail,
        website_url=profile.website_url,
        instagram_url=profile.instagram_url,
        youtube_url=profile.youtube_url,
        offer_kind=profile.offer_kind or OfferKind.BOTH,
        categories=provider_category_names(db, profile),
        opening_time=profile.opening_time,
        closing_time=profile.closing_time,
        gst_number=profile.gst_number,
        is_online=effective_is_online(profile),
        verification_status=profile.verification_status,
        average_rating=user.average_rating,
        rating_count=user.rating_count,
        max_radius_km=profile.max_radius_km,
        latitude=lat,
        longitude=lon,
        location_label=user.location_label,
        maps_url=google_maps_url(lat, lon),
        city=user.city,
        state=user.state,
        pincode=user.pincode,
        public_url_path=public_url_path_for(profile),
    )


@router.get("/me", response_model=ProviderProfileOut)
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == current_user.id).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    was_online = profile.is_online
    sync_online_flag_with_hours(profile)
    if was_online != profile.is_online:
        db.commit()
        db.refresh(profile)
    return _to_out(db, profile)


@router.patch("/me", response_model=ProviderProfileOut)
def update_my_profile(
    payload: ProviderProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == current_user.id).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")

    data = payload.model_dump(exclude_unset=True)
    lon = data.pop("longitude", None)
    lat = data.pop("latitude", None)
    category_ids = data.pop("category_ids", None)

    if "category_id" in data and data["category_id"] is not None:
        if not db.get(Category, data["category_id"]):
            raise HTTPException(status_code=400, detail="Invalid category_id")

    for key, value in data.items():
        setattr(profile, key, value)

    if "business_name" in data and data["business_name"]:
        profile.public_slug = allocate_public_slug(
            db, profile.business_name, exclude_profile_id=profile.id
        )
    else:
        ensure_profile_public_slug(db, profile)

    if category_ids is not None:
        if not category_ids:
            raise HTTPException(status_code=400, detail="Select at least one category/subcategory")
        try:
            set_provider_categories(db, profile, category_ids)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if lon is not None and lat is not None:
        lon, lat = normalize_lat_lon(lon, lat)
        profile.base_location = make_point(lon, lat)
        current_user.longitude = lon
        current_user.latitude = lat

    sync_online_flag_with_hours(profile)
    db.commit()
    db.refresh(profile)
    return _to_out(db, profile)


@router.post("/me/documents", response_model=ProviderProfileOut)
async def upload_provider_document(
    doc_type: str = Query(..., description="aadhaar | gst | government_id | business_reg"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    field = DOC_FIELD_MAP.get(doc_type)
    if not field:
        raise HTTPException(
            status_code=400,
            detail="doc_type must be one of: aadhaar, gst, government_id, business_reg",
        )
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == current_user.id).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")

    stored_name, _, _, _ = await save_upload_file(file)
    setattr(profile, field, media_url(stored_name))
    db.commit()
    db.refresh(profile)
    return _to_out(db, profile)


@router.post("/me/online", response_model=ProviderProfileOut)
def set_online(
    online: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROVIDER)),
):
    """Online status is derived from Opens–Closes; this re-syncs the stored flag."""
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == current_user.id).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    # Keep location readiness checks when a client still posts online=true.
    if online and profile.verification_status != VerificationStatus.APPROVED:
        raise HTTPException(
            status_code=400,
            detail="Account is not verified yet. Ask an admin to approve your provider profile first.",
        )
    if online and profile.base_location is None and current_user.latitude is None:
        if not current_user.pincode:
            raise HTTPException(
                status_code=400,
                detail="Set location coordinates or a pincode in My profile before appearing online.",
            )
    if (
        online
        and profile.base_location is None
        and current_user.latitude is not None
        and current_user.longitude is not None
    ):
        profile.base_location = make_point(current_user.longitude, current_user.latitude)
    sync_online_flag_with_hours(profile)
    db.commit()
    db.refresh(profile)
    return _to_out(db, profile)


@router.post("/{provider_user_id}/verify", response_model=ProviderProfileOut)
async def verify_provider(
    provider_user_id: str,
    payload: ProviderVerify,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff()),
):
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == UUID(provider_user_id)).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")

    previous = profile.verification_status
    # Approving→rejecting an already-approved provider is a revoke.
    next_status = payload.verification_status
    if (
        previous == VerificationStatus.APPROVED
        and next_status == VerificationStatus.REJECTED
    ):
        next_status = VerificationStatus.REVOKED

    profile.verification_status = next_status
    user = db.get(User, profile.user_id)
    if user:
        user.is_verified = next_status == VerificationStatus.APPROVED
    if next_status != VerificationStatus.APPROVED:
        profile.is_online = False
    db.commit()
    db.refresh(profile)

    if user and next_status == VerificationStatus.APPROVED:
        from app.services.email import send_provider_approved, send_provider_reapproved

        if previous in (VerificationStatus.REVOKED, VerificationStatus.REJECTED):
            send_provider_reapproved(
                db,
                to_email=user.email,
                full_name=user.full_name,
            )
            await _notify_provider_status(
                db,
                admin=current_user,
                provider=user,
                body=(
                    "Your provider account has been re-approved by Gharq admin. "
                    "Marketplace features are available again — you can go online, "
                    "receive requests, send quotes, and chat with consumers."
                ),
                reason="provider_reapproved",
            )
        else:
            send_provider_approved(
                db,
                to_email=user.email,
                full_name=user.full_name,
            )
            await _notify_provider_status(
                db,
                admin=current_user,
                provider=user,
                body=(
                    "Congratulations — your provider account has been approved by Gharq admin. "
                    "You can complete My profile, go online, and start receiving nearby requests."
                ),
                reason="provider_approved",
            )

    if user and next_status == VerificationStatus.REVOKED:
        from app.services.email import send_provider_revoked

        send_provider_revoked(
            db,
            to_email=user.email,
            full_name=user.full_name,
        )
        await _notify_provider_status(
            db,
            admin=current_user,
            provider=user,
            body=(
                "Your provider account has been revoked by Gharq admin. "
                "You can still open Overview, update My profile, and reply in Admin messages. "
                "Requests, quotes, orders, and consumer inquiries are unavailable until you are re-approved."
            ),
            reason="provider_revoked",
        )

    return _to_out(db, profile)


async def _notify_provider_status(
    db: Session,
    *,
    admin: User,
    provider: User,
    body: str,
    reason: str,
) -> None:
    """Post an admin support message and push a live notification to the provider."""
    from datetime import datetime, timezone

    from app.db.models import AdminConversation, AdminMessage
    from app.services.ws_manager import ws_manager
    from sqlalchemy import select

    conv = db.scalar(
        select(AdminConversation).where(AdminConversation.provider_id == provider.id)
    )
    if not conv:
        conv = AdminConversation(
            provider_id=provider.id,
            created_by_admin_id=admin.id,
        )
        db.add(conv)
        db.flush()

    msg = AdminMessage(
        conversation_id=conv.id,
        sender_id=admin.id,
        body=body,
    )
    db.add(msg)
    conv.updated_at = datetime.now(timezone.utc)
    conv.admin_last_read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    await ws_manager.send_to_user(
        provider.id,
        {
            "type": "admin_message",
            "payload": {
                "id": str(msg.id),
                "conversation_id": str(conv.id),
                "sender_id": str(msg.sender_id),
                "body": msg.body,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "reason": reason,
            },
        },
    )
