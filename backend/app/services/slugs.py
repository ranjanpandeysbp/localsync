import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ProviderProfile

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify_business_name(name: str) -> str:
    """Turn a shop name into a URL-friendly slug base."""
    base = _SLUG_RE.sub("-", (name or "").strip().lower()).strip("-")
    return (base or "provider")[:80]


def allocate_public_slug(
    db: Session,
    business_name: str,
    *,
    exclude_profile_id=None,
) -> str:
    """
    Create a unique public slug from the business name.
    First provider gets `shop-name`; duplicates get `shop-name-2`, `shop-name-3`, …
    """
    base = slugify_business_name(business_name)
    candidate = base
    suffix = 2
    while True:
        stmt = select(ProviderProfile.id).where(ProviderProfile.public_slug == candidate)
        if exclude_profile_id is not None:
            stmt = stmt.where(ProviderProfile.id != exclude_profile_id)
        clash = db.scalar(stmt)
        if not clash:
            return candidate
        candidate = f"{base}-{suffix}"[:100]
        suffix += 1


def public_url_path_for(profile: ProviderProfile) -> str:
    slug = (profile.public_slug or "").strip()
    if slug:
        return f"/p/{slug}"
    return f"/p/{profile.user_id}"


def ensure_profile_public_slug(db: Session, profile: ProviderProfile) -> str:
    """Assign a public slug if missing; return the slug in use."""
    if profile.public_slug:
        return profile.public_slug
    profile.public_slug = allocate_public_slug(
        db, profile.business_name, exclude_profile_id=profile.id
    )
    return profile.public_slug
