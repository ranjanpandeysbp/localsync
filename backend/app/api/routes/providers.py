from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
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
from app.services.provider_catalog import (
    provider_category_names,
    provider_matches_category,
    set_provider_categories,
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
    return ProviderProfileOut(
        id=profile.id,
        user_id=profile.user_id,
        business_name=profile.business_name,
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
        is_online=profile.is_online,
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
    current_user: User = Depends(require_roles(UserRole.CONSUMER, UserRole.ADMIN)),
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
                category_id=profile.category_id,
                category_name=category.name,
                categories=names,
                description=profile.description,
                offerings_detail=profile.offerings_detail,
                offer_kind=profile.offer_kind,
                opening_time=profile.opening_time,
                closing_time=profile.closing_time,
                gst_number=profile.gst_number,
                is_online=profile.is_online,
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
    q: str = Query(..., min_length=1, max_length=100),
    latitude: float | None = Query(default=None),
    longitude: float | None = Query(default=None),
    pincode: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Search products/services by category name or provider offerings (public)."""
    from app.core.config import settings
    from app.services.geo import match_providers, normalize_lat_lon, normalize_pincode
    from sqlalchemy import func as sa_func

    query = q.strip()
    if not query:
        return PublicSearchOut(query=q, categories=[], providers=[])

    like = f"%{query.lower()}%"
    lon, lat = longitude, latitude
    if lon is not None and lat is not None:
        lon, lat = normalize_lat_lon(lon, lat)
    pin = normalize_pincode(pincode)

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
        .limit(20)
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

    # Providers matching text in business / offerings / categories
    provider_rows = db.execute(
        select(ProviderProfile, User)
        .join(User, User.id == ProviderProfile.user_id)
        .where(
            ProviderProfile.verification_status == VerificationStatus.APPROVED,
            User.is_active.is_(True),
            or_(
                sa_func.lower(ProviderProfile.business_name).like(like),
                sa_func.lower(sa_func.coalesce(ProviderProfile.description, "")).like(like),
                sa_func.lower(sa_func.coalesce(ProviderProfile.offerings_detail, "")).like(like),
                sa_func.lower(User.full_name).like(like),
            ),
        )
        .order_by(ProviderProfile.is_online.desc(), User.average_rating.desc())
        .limit(40)
    ).all()

    # Also include providers linked to matching categories
    matched_cat_ids = {c.id for c in cat_rows}
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
            .limit(40)
        ).all()
        seen = {p.id for p, _ in provider_rows}
        for row in extra:
            if row[0].id not in seen:
                provider_rows.append(row)
                seen.add(row[0].id)

    # Optional nearby filter
    nearby_ids = None
    if (lat is not None and lon is not None) or pin:
        # Union of matches across found categories + unrestricted text hits via geo helper on each cat
        nearby_ids = set()
        cat_ids_for_geo = matched_cat_ids or {
            link.category_id
            for p, _ in provider_rows
            for link in p.category_links
        }
        if not cat_ids_for_geo:
            cat_ids_for_geo = {p.category_id for p, _ in provider_rows if p.category_id}
        for cid in cat_ids_for_geo:
            for profile, _dist in match_providers(
                db,
                category_id=cid,
                longitude=lon,
                latitude=lat,
                radius_km=settings.default_search_radius_km,
                pincode=pin,
                online_only=False,
                verified_only=True,
            ):
                nearby_ids.add(profile.id)

    items: list[ProviderCatalogItem] = []
    for profile, user in provider_rows:
        if nearby_ids is not None and profile.id not in nearby_ids:
            continue
        plon, plat = get_lon_lat_from_profile(db, profile)
        if plat is None:
            plat = user.latitude
            plon = user.longitude
        names = provider_category_names(db, profile)
        items.append(
            ProviderCatalogItem(
                user_id=user.id,
                full_name=user.full_name,
                business_name=profile.business_name,
                category_id=profile.category_id,
                category_name=names[0] if names else None,
                categories=names,
                description=profile.description,
                offerings_detail=profile.offerings_detail,
                offer_kind=profile.offer_kind,
                opening_time=profile.opening_time,
                closing_time=profile.closing_time,
                gst_number=profile.gst_number,
                is_online=profile.is_online,
                verification_status=profile.verification_status,
                average_rating=user.average_rating,
                rating_count=user.rating_count,
                latitude=plat,
                longitude=plon,
                location_label=user.location_label,
                maps_url=google_maps_url(plat, plon),
                max_radius_km=profile.max_radius_km,
            )
        )
        if len(items) >= 24:
            break

    return PublicSearchOut(query=query, categories=categories, providers=items)


@router.get("/public/{provider_user_id}", response_model=ProviderPublicOut)
def public_provider_page(
    provider_user_id: UUID,
    db: Session = Depends(get_db),
):
    """Open public profile for an approved provider."""
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == provider_user_id).first()
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

    return ProviderPublicOut(
        user_id=user.id,
        business_name=profile.business_name,
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
        is_online=profile.is_online,
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
        public_url_path=f"/p/{user.id}",
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
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == current_user.id).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    if online and profile.verification_status != VerificationStatus.APPROVED:
        raise HTTPException(
            status_code=400,
            detail="Account is not verified yet. Ask an admin to approve your provider profile first.",
        )
    if online and profile.base_location is None and current_user.latitude is None:
        # Allow online when pincode is set (matched by pin) even without GPS point
        if not current_user.pincode:
            raise HTTPException(
                status_code=400,
                detail="Set location coordinates or a pincode in My profile before going online.",
            )
    if (
        online
        and profile.base_location is None
        and current_user.latitude is not None
        and current_user.longitude is not None
    ):
        profile.base_location = make_point(current_user.longitude, current_user.latitude)
    profile.is_online = online
    db.commit()
    db.refresh(profile)
    return _to_out(db, profile)


@router.post("/{provider_user_id}/verify", response_model=ProviderProfileOut)
def verify_provider(
    provider_user_id: str,
    payload: ProviderVerify,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    profile = (
        db.query(ProviderProfile).filter(ProviderProfile.user_id == UUID(provider_user_id)).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    profile.verification_status = payload.verification_status
    user = db.get(User, profile.user_id)
    if user:
        user.is_verified = payload.verification_status == VerificationStatus.APPROVED
    if payload.verification_status != VerificationStatus.APPROVED:
        profile.is_online = False
    db.commit()
    db.refresh(profile)

    if user and payload.verification_status == VerificationStatus.APPROVED:
        from app.services.email import send_provider_approved

        send_provider_approved(
            db,
            to_email=user.email,
            full_name=user.full_name,
        )

    return _to_out(db, profile)
