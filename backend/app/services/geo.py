import math
import re
from uuid import UUID

from sqlalchemy import and_, or_, select, text
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.db.models import ProviderCategory, ProviderProfile, ServiceRequest, User, VerificationStatus
from app.services.business_hours import effective_is_online


def haversine_distance_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Calculate the Great-Circle distance between two points on the Earth in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def make_point(longitude: float, latitude: float) -> str:
    """Return WKT POINT representation."""
    lon, lat = normalize_lat_lon(longitude, latitude)
    return f"POINT({lon} {lat})"


def normalize_lat_lon(longitude: float, latitude: float) -> tuple[float, float]:
    """
    Fix common lat/lon swaps for Indian locations.
    India is roughly lat 6–38, lon 68–98. If values are clearly swapped, correct them.
    """
    lon, lat = float(longitude), float(latitude)
    looks_swapped = (68.0 <= lat <= 98.0) and (6.0 <= lon <= 38.0)
    if looks_swapped:
        return lat, lon
    return lon, lat


def _parse_wkt_point(wkt: str | None) -> tuple[float, float] | None:
    if not wkt or not isinstance(wkt, str):
        return None
    match = re.search(r"POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)", wkt, re.IGNORECASE)
    if match:
        try:
            return float(match.group(1)), float(match.group(2))
        except ValueError:
            return None
    return None


def _category_match_ids(db: Session, category_id: int) -> list[int]:
    from app.db.models import Category

    child_ids = list(
        db.scalars(select(Category.id).where(Category.parent_id == category_id)).all()
    )
    match_ids = [category_id, *child_ids]
    parent = db.get(Category, category_id)
    if parent and parent.parent_id:
        match_ids.append(parent.parent_id)
    return match_ids


def normalize_pincode(pincode: str | None) -> str | None:
    if not pincode:
        return None
    digits = "".join(ch for ch in str(pincode) if ch.isdigit())
    return digits or None


def find_providers_in_radius(
    db: Session,
    *,
    category_id: int,
    longitude: float,
    latitude: float,
    radius_km: int,
    online_only: bool = True,
    verified_only: bool = True,
) -> list[tuple[ProviderProfile, float]]:
    """Return providers within radius (km) with distance in meters."""
    from app.db.models import Category

    match_ids = _category_match_ids(db, category_id)
    radius_m = radius_km * 1000.0

    filters = [
        or_(
            ProviderProfile.category_id.in_(match_ids),
            ProviderProfile.id.in_(
                select(ProviderCategory.provider_id).where(ProviderCategory.category_id.in_(match_ids))
            ),
        ),
    ]
    if online_only or verified_only:
        filters.append(ProviderProfile.verification_status == VerificationStatus.APPROVED)

    stmt = (
        select(ProviderProfile)
        .join(User, User.id == ProviderProfile.user_id)
        .where(and_(*filters, User.is_active.is_(True)))
    )
    profiles = db.scalars(stmt).all()

    results: list[tuple[ProviderProfile, float]] = []
    for profile in profiles:
        u_lon, u_lat = None, None
        if profile.user and profile.user.longitude is not None and profile.user.latitude is not None:
            u_lon, u_lat = profile.user.longitude, profile.user.latitude
        elif profile.base_location:
            pt = _parse_wkt_point(profile.base_location)
            if pt:
                u_lon, u_lat = pt

        if u_lon is not None and u_lat is not None:
            dist_m = haversine_distance_m(longitude, latitude, u_lon, u_lat)
            if dist_m <= radius_m:
                results.append((profile, dist_m))

    results.sort(key=lambda item: item[1])
    if online_only:
        results = [(p, d) for p, d in results if effective_is_online(p)]
    return results


def find_providers_by_pincode(
    db: Session,
    *,
    category_id: int,
    pincode: str,
    online_only: bool = True,
    verified_only: bool = True,
) -> list[tuple[ProviderProfile, float]]:
    """Match providers in the same pincode (distance_m = 0 as placeholder)."""
    pin = normalize_pincode(pincode)
    if not pin:
        return []

    match_ids = _category_match_ids(db, category_id)
    filters = [
        User.pincode == pin,
        or_(
            ProviderProfile.category_id.in_(match_ids),
            ProviderProfile.id.in_(
                select(ProviderCategory.provider_id).where(ProviderCategory.category_id.in_(match_ids))
            ),
        ),
    ]
    if online_only or verified_only:
        filters.append(ProviderProfile.verification_status == VerificationStatus.APPROVED)

    stmt = (
        select(ProviderProfile)
        .join(User, User.id == ProviderProfile.user_id)
        .where(and_(*filters, User.is_active.is_(True)))
        .order_by(ProviderProfile.is_online.desc(), User.average_rating.desc())
    )
    profiles = db.scalars(stmt).all()
    if online_only:
        profiles = [p for p in profiles if effective_is_online(p)]
    return [(p, 0.0) for p in profiles]


def find_all_providers_in_radius(
    db: Session,
    *,
    longitude: float,
    latitude: float,
    radius_km: int,
    online_only: bool = False,
    verified_only: bool = True,
) -> list[tuple[ProviderProfile, float]]:
    """Return all providers within radius (km), any category, with distance in meters."""
    radius_m = radius_km * 1000.0

    filters = []
    if online_only or verified_only:
        filters.append(ProviderProfile.verification_status == VerificationStatus.APPROVED)

    stmt = (
        select(ProviderProfile)
        .join(User, User.id == ProviderProfile.user_id)
        .where(and_(*filters, User.is_active.is_(True)))
    )
    profiles = db.scalars(stmt).all()

    results: list[tuple[ProviderProfile, float]] = []
    for profile in profiles:
        u_lon, u_lat = None, None
        if profile.user and profile.user.longitude is not None and profile.user.latitude is not None:
            u_lon, u_lat = profile.user.longitude, profile.user.latitude
        elif profile.base_location:
            pt = _parse_wkt_point(profile.base_location)
            if pt:
                u_lon, u_lat = pt

        if u_lon is not None and u_lat is not None:
            dist_m = haversine_distance_m(longitude, latitude, u_lon, u_lat)
            if dist_m <= radius_m:
                results.append((profile, dist_m))

    results.sort(key=lambda item: item[1])
    if online_only:
        results = [(p, d) for p, d in results if effective_is_online(p)]
    return results


def find_all_providers_by_pincode(
    db: Session,
    *,
    pincode: str,
    online_only: bool = False,
    verified_only: bool = True,
) -> list[tuple[ProviderProfile, float]]:
    """Match all providers in the same pincode (any category)."""
    pin = normalize_pincode(pincode)
    if not pin:
        return []

    filters = [User.pincode == pin]
    if online_only or verified_only:
        filters.append(ProviderProfile.verification_status == VerificationStatus.APPROVED)

    stmt = (
        select(ProviderProfile)
        .join(User, User.id == ProviderProfile.user_id)
        .where(and_(*filters, User.is_active.is_(True)))
        .order_by(ProviderProfile.is_online.desc(), User.average_rating.desc())
    )
    profiles = db.scalars(stmt).all()
    if online_only:
        profiles = [p for p in profiles if effective_is_online(p)]
    return [(p, 0.0) for p in profiles]


def find_all_providers_by_city(
    db: Session,
    *,
    city: str,
    longitude: float | None = None,
    latitude: float | None = None,
    pincode: str | None = None,
    online_only: bool = False,
    verified_only: bool = True,
) -> list[tuple[ProviderProfile, float | None]]:
    """Match verified providers whose profile city/label/pincode matches the service city."""
    name = (city or "").strip()
    pin = normalize_pincode(pincode)
    if not name and not pin:
        return []
    like = f"%{name.lower()}%" if name else None

    name_match = (
        or_(
            func.lower(func.coalesce(User.city, "")).like(like),
            func.lower(func.coalesce(User.location_label, "")).like(like),
        )
        if like
        else None
    )
    if name_match is not None and pin:
        filters = [or_(name_match, User.pincode == pin)]
    elif name_match is not None:
        filters = [name_match]
    else:
        filters = [User.pincode == pin]
    if online_only or verified_only:
        filters.append(ProviderProfile.verification_status == VerificationStatus.APPROVED)

    stmt = (
        select(ProviderProfile)
        .join(User, User.id == ProviderProfile.user_id)
        .where(and_(*filters, User.is_active.is_(True)))
        .order_by(ProviderProfile.is_online.desc(), User.average_rating.desc())
    )
    profiles = db.scalars(stmt).all()

    if longitude is not None and latitude is not None:
        results_with_dist: list[tuple[ProviderProfile, float | None]] = []
        for p in profiles:
            u_lon, u_lat = None, None
            if p.user and p.user.longitude is not None and p.user.latitude is not None:
                u_lon, u_lat = p.user.longitude, p.user.latitude
            elif p.base_location:
                pt = _parse_wkt_point(p.base_location)
                if pt:
                    u_lon, u_lat = pt

            dist = (
                haversine_distance_m(longitude, latitude, u_lon, u_lat)
                if (u_lon is not None and u_lat is not None)
                else None
            )
            results_with_dist.append((p, dist))

        results_with_dist.sort(key=lambda item: (item[1] is None, item[1]))
        results = results_with_dist
    else:
        results = [(p, None) for p in profiles]

    if online_only:
        results = [(p, d) for p, d in results if effective_is_online(p)]
    return results


def match_all_nearby_providers(
    db: Session,
    *,
    longitude: float | None,
    latitude: float | None,
    radius_km: int,
    pincode: str | None = None,
    online_only: bool = False,
    verified_only: bool = True,
) -> list[tuple[ProviderProfile, float]]:
    """Nearby providers across all categories — geo first, then pincode fallback."""
    if longitude is not None and latitude is not None:
        nearby = find_all_providers_in_radius(
            db,
            longitude=longitude,
            latitude=latitude,
            radius_km=radius_km,
            online_only=online_only,
            verified_only=verified_only,
        )
        if nearby:
            return nearby
        if pincode:
            return find_all_providers_by_pincode(
                db,
                pincode=pincode,
                online_only=online_only,
                verified_only=verified_only,
            )
        return []
    if pincode:
        return find_all_providers_by_pincode(
            db,
            pincode=pincode,
            online_only=online_only,
            verified_only=verified_only,
        )
    return []


def match_providers(
    db: Session,
    *,
    category_id: int,
    longitude: float | None,
    latitude: float | None,
    radius_km: int,
    pincode: str | None = None,
    online_only: bool = True,
    verified_only: bool = True,
) -> list[tuple[ProviderProfile, float]]:
    """Prefer geo radius; fall back to pincode when coords missing or no nearby hits."""
    if longitude is not None and latitude is not None:
        nearby = find_providers_in_radius(
            db,
            category_id=category_id,
            longitude=longitude,
            latitude=latitude,
            radius_km=radius_km,
            online_only=online_only,
            verified_only=verified_only,
        )
        if nearby:
            return nearby
        if pincode:
            return find_providers_by_pincode(
                db,
                category_id=category_id,
                pincode=pincode,
                online_only=online_only,
                verified_only=verified_only,
            )
        return []
    if pincode:
        return find_providers_by_pincode(
            db,
            category_id=category_id,
            pincode=pincode,
            online_only=online_only,
            verified_only=verified_only,
        )
    return []


def users_share_pincode(a: str | None, b: str | None) -> bool:
    pa, pb = normalize_pincode(a), normalize_pincode(b)
    return bool(pa and pb and pa == pb)


def get_lon_lat_from_profile(db: Session, profile: ProviderProfile) -> tuple[float | None, float | None]:
    if profile.user and profile.user.longitude is not None and profile.user.latitude is not None:
        return float(profile.user.longitude), float(profile.user.latitude)
    if profile.base_location is not None:
        pt = _parse_wkt_point(profile.base_location)
        if pt:
            return pt
    return None, None


def get_request_lon_lat(db: Session, request_id: UUID) -> tuple[float | None, float | None]:
    req = db.get(ServiceRequest, request_id)
    if not req or req.request_location is None:
        return None, None
    pt = _parse_wkt_point(req.request_location)
    if pt:
        return pt
    return None, None

