"""Seed default categories/subcategories and a demo admin/provider/consumer."""

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.models import Category, OfferKind, ProviderProfile, User, UserRole, VerificationStatus
from app.db.session import Base, SessionLocal, engine, ensure_postgis
from app.services.geo import make_point
from app.services.provider_catalog import set_provider_categories


# (name, slug, description, kind, parent_slug|None)
DEFAULT_CATEGORIES = [
    ("Plumbing", "plumbing", "Local plumbers and pipe repairs", OfferKind.SERVICE, None),
    ("Leak repair", "plumbing-leak-repair", "Fix leaks and dripping taps", OfferKind.SERVICE, "plumbing"),
    ("Pipe fitting", "plumbing-pipe-fitting", "New pipe installation", OfferKind.SERVICE, "plumbing"),
    ("Groceries", "groceries", "Nearby grocery and kirana stores", OfferKind.PRODUCT, None),
    ("Fresh produce", "groceries-produce", "Fruits and vegetables", OfferKind.PRODUCT, "groceries"),
    ("Kirana staples", "groceries-staples", "Rice, dal, oil and daily needs", OfferKind.PRODUCT, "groceries"),
    ("Electronics", "electronics", "Electronics sales and repair", OfferKind.BOTH, None),
    ("Mobile phones", "electronics-mobiles", "Phones and accessories", OfferKind.PRODUCT, "electronics"),
    ("Device repair", "electronics-repair", "Phone and laptop repair", OfferKind.SERVICE, "electronics"),
    ("Electrical", "electrical", "Electricians and wiring", OfferKind.SERVICE, None),
    ("Wiring", "electrical-wiring", "Home wiring and switches", OfferKind.SERVICE, "electrical"),
    ("Cleaning", "cleaning", "Home and office cleaning", OfferKind.SERVICE, None),
    ("Deep clean", "cleaning-deep", "Full home deep cleaning", OfferKind.SERVICE, "cleaning"),
    ("Carpentry", "carpentry", "Furniture and woodwork", OfferKind.BOTH, None),
    ("Custom furniture", "carpentry-furniture", "Made-to-order furniture", OfferKind.PRODUCT, "carpentry"),
]


def _ensure_category(
    db,
    name: str,
    slug: str,
    desc: str,
    kind: OfferKind,
    parent_slug: str | None,
) -> Category:
    exists = db.scalar(select(Category).where(Category.slug == slug))
    parent_id = None
    if parent_slug:
        parent = db.scalar(select(Category).where(Category.slug == parent_slug))
        parent_id = parent.id if parent else None
    if exists:
        exists.parent_id = parent_id
        exists.kind = kind
        if not exists.description:
            exists.description = desc
        return exists
    cat = Category(
        name=name,
        slug=slug,
        description=desc,
        kind=kind,
        parent_id=parent_id,
    )
    db.add(cat)
    db.flush()
    return cat


def seed() -> None:
    with engine.begin() as conn:
        ensure_postgis(conn)
        Base.metadata.create_all(bind=conn)

    db = SessionLocal()
    try:
        # Parents first, then children (list is ordered that way)
        for name, slug, desc, kind, parent_slug in DEFAULT_CATEGORIES:
            _ensure_category(db, name, slug, desc, kind, parent_slug)
        db.flush()

        admin = db.scalar(select(User).where(User.phone_number == "9000000001"))
        if not admin:
            admin = User(
                role=UserRole.ADMIN,
                phone_number="9000000001",
                email="admin@gharq.app",
                full_name="Gharq Admin",
                hashed_password=get_password_hash("admin123"),
                is_verified=True,
            )
            db.add(admin)

        cs = db.scalar(select(User).where(User.phone_number == "9000000004"))
        if not cs:
            cs = User(
                role=UserRole.CUSTOMER_SERVICE,
                phone_number="9000000004",
                email="support@gharq.app",
                full_name="Gharq Customer Service",
                hashed_password=get_password_hash("support123"),
                is_verified=True,
            )
            db.add(cs)

        consumer = db.scalar(select(User).where(User.phone_number == "9000000002"))
        if not consumer:
            consumer = User(
                role=UserRole.CONSUMER,
                phone_number="9000000002",
                email="consumer@gharq.app",
                full_name="Demo Consumer",
                hashed_password=get_password_hash("consumer123"),
                is_verified=True,
                location_label="Indiranagar, Bengaluru",
                latitude=12.9784,
                longitude=77.6408,
            )
            db.add(consumer)
        else:
            if consumer.latitude is None:
                consumer.location_label = "Indiranagar, Bengaluru"
                consumer.latitude = 12.9784
                consumer.longitude = 77.6408

        provider = db.scalar(select(User).where(User.phone_number == "9000000003"))
        plumbing = db.scalar(select(Category).where(Category.slug == "plumbing"))
        leak = db.scalar(select(Category).where(Category.slug == "plumbing-leak-repair"))
        pipe = db.scalar(select(Category).where(Category.slug == "plumbing-pipe-fitting"))
        cat_ids = [c.id for c in (plumbing, leak, pipe) if c]

        if not provider:
            provider = User(
                role=UserRole.PROVIDER,
                phone_number="9000000003",
                email="provider@gharq.app",
                full_name="Demo Provider",
                hashed_password=get_password_hash("provider123"),
                is_verified=True,
                location_label="MG Road, Bengaluru",
                latitude=12.9716,
                longitude=77.5946,
            )
            db.add(provider)
            db.flush()
            profile = ProviderProfile(
                user_id=provider.id,
                business_name="QuickFix Plumbing",
                public_slug="quickfix-plumbing",
                category_id=plumbing.id if plumbing else (cat_ids[0] if cat_ids else None),
                description="Trusted neighbourhood plumber",
                offer_kind=OfferKind.SERVICE,
                offerings_detail="Emergency leak fixes, tap replacement, bathroom fitting, and pipe unblocking.",
                opening_time="08:00",
                closing_time="20:00",
                gst_number="29AAAAA0000A1Z5",
                base_location=make_point(77.5946, 12.9716),
                max_radius_km=10,
                is_online=True,
                verification_status=VerificationStatus.APPROVED,
            )
            db.add(profile)
            db.flush()
            if cat_ids:
                set_provider_categories(db, profile, cat_ids)
        else:
            if provider.latitude is None:
                provider.location_label = "MG Road, Bengaluru"
                provider.latitude = 12.9716
                provider.longitude = 77.5946
            profile = (
                db.query(ProviderProfile).filter(ProviderProfile.user_id == provider.id).first()
            )
            if profile:
                if not profile.public_slug:
                    profile.public_slug = "quickfix-plumbing"
                if not profile.offerings_detail:
                    profile.offer_kind = OfferKind.SERVICE
                    profile.offerings_detail = (
                        "Emergency leak fixes, tap replacement, bathroom fitting, and pipe unblocking."
                    )
                    profile.opening_time = profile.opening_time or "08:00"
                    profile.closing_time = profile.closing_time or "20:00"
                    profile.gst_number = profile.gst_number or "29AAAAA0000A1Z5"
                if cat_ids and not profile.category_links:
                    set_provider_categories(db, profile, cat_ids)

        db.commit()
        print("Seed complete.")
        print("Admin:    9000000001 / admin123")
        print("Support:  9000000004 / support123")
        print("Consumer: 9000000002 / consumer123")
        print("Provider: 9000000003 / provider123 (Plumbing + subcats, Bengaluru, online)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
