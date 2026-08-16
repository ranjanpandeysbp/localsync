"""Helpers for provider category links and trust payload."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Category, ProviderCategory, ProviderProfile, User
from app.schemas import ProviderTrustInfo
from app.services.business_hours import effective_is_online
from app.services.geo import get_lon_lat_from_profile
from app.services.maps import google_maps_url


def category_label(cat: Category) -> str:
    if cat.parent_id:
        return cat.name
    return cat.name


def resolve_category_ids(db: Session, category_ids: list[int]) -> list[Category]:
    cats: list[Category] = []
    for cid in category_ids:
        cat = db.get(Category, cid)
        if not cat or not cat.is_active:
            raise ValueError(f"Invalid category_id: {cid}")
        cats.append(cat)
    return cats


def set_provider_categories(db: Session, profile: ProviderProfile, category_ids: list[int]) -> None:
    cats = resolve_category_ids(db, category_ids)
    profile.category_links.clear()
    db.flush()
    for cat in cats:
        profile.category_links.append(ProviderCategory(category_id=cat.id))
    # Keep legacy primary as first selected (prefer parent if both selected)
    profile.category_id = cats[0].id if cats else None


def provider_category_names(db: Session, profile: ProviderProfile) -> list[str]:
    names: list[str] = []
    for link in profile.category_links:
        cat = db.get(Category, link.category_id)
        if not cat:
            continue
        if cat.parent_id:
            parent = db.get(Category, cat.parent_id)
            names.append(f"{parent.name} › {cat.name}" if parent else cat.name)
        else:
            names.append(cat.name)
    if not names and profile.category_id:
        cat = db.get(Category, profile.category_id)
        if cat:
            names.append(cat.name)
    return names


def provider_parent_category_names(db: Session, profile: ProviderProfile) -> list[str]:
    """Top-level category names only (no subcategory tags)."""
    names: list[str] = []
    seen: set[str] = set()

    def add(name: str | None) -> None:
        label = (name or "").strip()
        if not label or label in seen:
            return
        seen.add(label)
        names.append(label)

    cats: list[Category] = []
    for link in profile.category_links:
        cat = db.get(Category, link.category_id)
        if cat:
            cats.append(cat)
    if not cats and profile.category_id:
        cat = db.get(Category, profile.category_id)
        if cat:
            cats.append(cat)
    for cat in cats:
        if cat.parent_id:
            parent = db.get(Category, cat.parent_id)
            add(parent.name if parent else cat.name)
        else:
            add(cat.name)
    return names


def provider_matches_category(db: Session, profile: ProviderProfile, category_id: int) -> bool:
    """True if provider offers this category or its parent / any of its children."""
    target = db.get(Category, category_id)
    if not target:
        return False
    linked_ids = {link.category_id for link in profile.category_links}
    if profile.category_id:
        linked_ids.add(profile.category_id)
    if category_id in linked_ids:
        return True
    # Request for parent matches providers with any child subcategory
    child_ids = {
        c.id
        for c in db.scalars(select(Category).where(Category.parent_id == category_id)).all()
    }
    if linked_ids & child_ids:
        return True
    # Request for subcategory matches providers linked to parent
    if target.parent_id and target.parent_id in linked_ids:
        return True
    return False


def build_provider_trust(db: Session, provider_user_id: UUID) -> ProviderTrustInfo | None:
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == provider_user_id).first()
    if not profile:
        return None
    user = db.get(User, provider_user_id)
    lon, lat = get_lon_lat_from_profile(db, profile)
    return ProviderTrustInfo(
        business_name=profile.business_name,
        full_name=user.full_name if user else None,
        offer_kind=profile.offer_kind,
        description=profile.description,
        offerings_detail=profile.offerings_detail,
        opening_time=profile.opening_time,
        closing_time=profile.closing_time,
        gst_number=profile.gst_number,
        average_rating=user.average_rating if user else 0,
        rating_count=user.rating_count if user else 0,
        categories=provider_category_names(db, profile),
        maps_url=google_maps_url(lat, lon),
        location_label=user.location_label if user else None,
        is_online=effective_is_online(profile),
        verification_status=profile.verification_status,
    )
