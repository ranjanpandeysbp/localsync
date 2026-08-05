from uuid import UUID

from geoalchemy2 import Geography, WKTElement
from geoalchemy2.functions import ST_DWithin, ST_Distance
from sqlalchemy import and_, cast, or_, select, text
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.db.models import ProviderCategory, ProviderProfile, User, VerificationStatus


def make_point(longitude: float, latitude: float) -> WKTElement:
    lon, lat = normalize_lat_lon(longitude, latitude)
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


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


def _request_geog(longitude: float, latitude: float):
    return cast(func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326), Geography)


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

    request_point = _request_geog(longitude, latitude)
    distance_m = ST_Distance(ProviderProfile.base_location, request_point)
    radius_m = radius_km * 1000

    child_ids = list(
        db.scalars(select(Category.id).where(Category.parent_id == category_id)).all()
    )
    match_ids = [category_id, *child_ids]
    parent = db.get(Category, category_id)
    if parent and parent.parent_id:
        match_ids.append(parent.parent_id)

    filters = [
        ProviderProfile.base_location.is_not(None),
        ST_DWithin(ProviderProfile.base_location, request_point, radius_m),
        or_(
            ProviderProfile.category_id.in_(match_ids),
            ProviderProfile.id.in_(
                select(ProviderCategory.provider_id).where(ProviderCategory.category_id.in_(match_ids))
            ),
        ),
    ]
    if online_only:
        filters.append(ProviderProfile.is_online.is_(True))
    if verified_only:
        filters.append(ProviderProfile.verification_status == VerificationStatus.APPROVED)

    stmt = (
        select(ProviderProfile, distance_m.label("distance_m"))
        .join(User, User.id == ProviderProfile.user_id)
        .where(and_(*filters, User.is_active.is_(True)))
        .order_by(distance_m)
    )
    rows = db.execute(stmt).all()
    return [(row[0], float(row[1])) for row in rows]


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
    digits = "".join(ch for ch in pincode if ch.isdigit())
    return digits or None


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
    if online_only:
        filters.append(ProviderProfile.is_online.is_(True))
    if verified_only:
        filters.append(ProviderProfile.verification_status == VerificationStatus.APPROVED)

    stmt = (
        select(ProviderProfile)
        .join(User, User.id == ProviderProfile.user_id)
        .where(and_(*filters, User.is_active.is_(True)))
        .order_by(ProviderProfile.is_online.desc(), User.average_rating.desc())
    )
    profiles = db.scalars(stmt).all()
    return [(p, 0.0) for p in profiles]


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
        # Stale/wrong GPS (or empty area) — still try same-pincode providers
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
    if profile.base_location is None:
        return None, None
    row = db.execute(
        text(
            "SELECT ST_X(base_location::geometry) AS lon, ST_Y(base_location::geometry) AS lat "
            "FROM provider_profiles WHERE id = :id"
        ),
        {"id": str(profile.id)},
    ).first()
    if not row:
        return None, None
    return float(row.lon), float(row.lat)


def get_request_lon_lat(db: Session, request_id: UUID) -> tuple[float | None, float | None]:
    row = db.execute(
        text(
            "SELECT ST_X(request_location::geometry) AS lon, ST_Y(request_location::geometry) AS lat "
            "FROM service_requests WHERE id = :id"
        ),
        {"id": str(request_id)},
    ).first()
    if not row:
        return None, None
    return float(row.lon), float(row.lat)
