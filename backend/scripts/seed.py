"""Seed default categories/subcategories and demo users for every service city."""

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.models import Category, OfferKind, ProviderProfile, User, UserRole, VerificationStatus
from app.db.session import Base, SessionLocal, engine, ensure_postgis
from app.services.category_catalog import ensure_marketplace_categories
from app.services.geo import make_point
from app.services.provider_catalog import set_provider_categories


# (name, slug, description, kind, parent_slug|None)
DEFAULT_CATEGORIES = [
    ("Plumbing", "plumbing", "Local plumbers and pipe repairs", OfferKind.SERVICE, None),
    ("Leak repair", "plumbing-leak-repair", "Fix leaks and dripping taps", OfferKind.SERVICE, "plumbing"),
    ("Pipe fitting", "plumbing-pipe-fitting", "New pipe installation", OfferKind.SERVICE, "plumbing"),
    ("Electrical", "electrical", "Electricians and wiring", OfferKind.SERVICE, None),
    ("Wiring", "electrical-wiring", "Home wiring and switches", OfferKind.SERVICE, "electrical"),
    ("Cleaning", "cleaning", "Home and office cleaning", OfferKind.SERVICE, None),
    ("Deep clean", "cleaning-deep", "Full home deep cleaning", OfferKind.SERVICE, "cleaning"),
    ("Carpentry", "carpentry", "Furniture and woodwork", OfferKind.BOTH, None),
    ("Custom furniture", "carpentry-furniture", "Made-to-order furniture", OfferKind.PRODUCT, "carpentry"),
]

# Matches frontend/src/utils/serviceCities.ts
SERVICE_CITIES = [
    {
        "name": "Bhubaneswar",
        "pincode": "751001",
        "latitude": 20.2961,
        "longitude": 85.8245,
        "code": "bbsr",
        "gst_prefix": "21",
    },
    {
        "name": "Sambalpur",
        "pincode": "768001",
        "latitude": 21.4669,
        "longitude": 83.9812,
        "code": "sbp",
        "gst_prefix": "21",
    },
    {
        "name": "Jharsuguda",
        "pincode": "768201",
        "latitude": 21.8554,
        "longitude": 84.0062,
        "code": "jsg",
        "gst_prefix": "21",
    },
]

# Neighbourhood offsets (~0.5–2 km) so listings are near the city pin, not stacked.
CITY_NEIGHBOURHOODS: dict[str, list[tuple[str, float, float]]] = {
    "Bhubaneswar": [
        ("Saheed Nagar", 0.0, 0.0),
        ("Patia", 0.057, -0.001),
        ("Jaydev Vihar", 0.004, -0.006),
        ("Rasulgarh", -0.016, 0.026),
        ("Chandrasekharpur", 0.034, -0.005),
        ("Unit 1 Market", -0.026, 0.016),
    ],
    "Sambalpur": [
        ("Gole Bazaar", 0.0, 0.0),
        ("Budharaja", 0.012, -0.006),
        ("Ainthapali", -0.007, 0.009),
        ("Remed", 0.013, -0.011),
        ("Dhanupali", -0.010, 0.008),
        ("Khetrajpur", 0.006, 0.012),
    ],
    "Jharsuguda": [
        ("Beheramal", 0.0, 0.0),
        ("Sarbahal", -0.005, 0.009),
        ("Brundamal", 0.005, -0.011),
        ("H. Katapali", 0.010, 0.006),
        ("Marwari Para", -0.008, -0.004),
        ("Chowk Bazaar", 0.003, 0.007),
    ],
}

PROVIDER_TEMPLATES = [
    {
        "key": "plumbing",
        "business": "Plumbing Works",
        "person": "Plumber",
        "slugs": ["plumbing", "plumbing-leak-repair", "plumbing-pipe-fitting"],
        "kind": OfferKind.SERVICE,
        "hours": ("08:00", "20:00"),
        "offerings": "Emergency leak fixes, tap replacement, bathroom fitting, and pipe unblocking.",
        "radius": 12,
        "rating": (4.7, 28),
    },
    {
        "key": "groceries",
        "business": "Fresh Basket Kirana",
        "person": "Kirana",
        "slugs": [
            "grocery-produce-staples",
            "grocery-produce-staples-fresh-fruits",
            "grocery-produce-staples-vegetables",
            "grocery-produce-staples-daily-dairy",
            "grocery-produce-staples-bulk-grains",
        ],
        "kind": OfferKind.PRODUCT,
        "hours": ("07:00", "21:00"),
        "offerings": "Daily staples, fresh produce, oil, spices, and household essentials.",
        "radius": 8,
        "rating": (4.5, 41),
    },
    {
        "key": "electronics",
        "business": "Gadget Hub",
        "person": "Gadgets",
        "slugs": [
            "electronics-appliances-mobile",
            "electronics-appliances-mobile-smartphones",
            "electronics-appliances-mobile-chargers",
            "electronics-appliances-mobile-cables",
            "electronics-appliances-mobile-wholesale-mobile-accessories",
        ],
        "kind": OfferKind.BOTH,
        "hours": ("10:00", "21:00"),
        "offerings": "Mobiles, accessories, and same-day phone / laptop repair.",
        "radius": 10,
        "rating": (4.4, 19),
    },
    {
        "key": "electrical",
        "business": "SparkSafe Electricals",
        "person": "Electrician",
        "slugs": ["electrical", "electrical-wiring"],
        "kind": OfferKind.SERVICE,
        "hours": ("08:00", "19:00"),
        "offerings": "Home wiring, switchboards, inverter setup, and fan / light fitting.",
        "radius": 15,
        "rating": (4.6, 22),
    },
    {
        "key": "cleaning",
        "business": "Spotless Home Care",
        "person": "Cleaning",
        "slugs": ["cleaning", "cleaning-deep"],
        "kind": OfferKind.SERVICE,
        "hours": ("08:00", "18:00"),
        "offerings": "Full-home deep cleaning, kitchen / bathroom sanitising, and sofa shampoo.",
        "radius": 12,
        "rating": (4.3, 16),
    },
    {
        "key": "carpentry",
        "business": "TimberCraft",
        "person": "Carpenter",
        "slugs": ["carpentry", "carpentry-furniture"],
        "kind": OfferKind.BOTH,
        # Closed during typical daytime browsing so the Offline tab has listings.
        "hours": ("22:00", "23:00"),
        "offerings": "Custom furniture, door / window repair, and modular kitchen carpentry.",
        "radius": 10,
        "rating": (4.2, 11),
    },
]

CONSUMER_NAMES = [
    ("Ananya Mishra", "Priya Sahu", "Rohan Das"),
    ("Deepak Patel", "Sneha Pradhan", "Amit Behera"),
    ("Kavita Naik", "Manoj Kisan", "Ritu Barik"),
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


def _category_ids(db, slugs: list[str]) -> list[int]:
    ids: list[int] = []
    for slug in slugs:
        cat = db.scalar(select(Category).where(Category.slug == slug))
        if cat:
            ids.append(cat.id)
    return ids


def _apply_location(user: User, *, label: str, city: str, pincode: str, lat: float, lon: float) -> None:
    user.location_label = label
    user.city = city
    user.state = "Odisha"
    user.pincode = pincode
    user.latitude = lat
    user.longitude = lon
    if not user.address_line1:
        user.address_line1 = label


def _ensure_consumer(
    db,
    *,
    phone: str,
    email: str,
    full_name: str,
    password_hash: str,
    label: str,
    city: str,
    pincode: str,
    lat: float,
    lon: float,
) -> User:
    user = db.scalar(select(User).where(User.phone_number == phone))
    if not user:
        user = User(
            role=UserRole.CONSUMER,
            phone_number=phone,
            email=email,
            full_name=full_name,
            hashed_password=password_hash,
            is_verified=True,
        )
        db.add(user)
        db.flush()
    _apply_location(user, label=label, city=city, pincode=pincode, lat=lat, lon=lon)
    return user


def _ensure_provider(
    db,
    *,
    phone: str,
    email: str,
    full_name: str,
    password_hash: str,
    business_name: str,
    public_slug: str,
    description: str,
    offerings: str,
    kind: OfferKind,
    gst_number: str,
    hours: tuple[str, str],
    radius: int,
    rating: tuple[float, int],
    category_ids: list[int],
    label: str,
    city: str,
    pincode: str,
    lat: float,
    lon: float,
) -> User:
    user = db.scalar(select(User).where(User.phone_number == phone))
    if not user:
        user = User(
            role=UserRole.PROVIDER,
            phone_number=phone,
            email=email,
            full_name=full_name,
            hashed_password=password_hash,
            is_verified=True,
        )
        db.add(user)
        db.flush()
    _apply_location(user, label=label, city=city, pincode=pincode, lat=lat, lon=lon)
    user.average_rating = rating[0]
    user.rating_count = rating[1]

    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.id).first()
    if not profile:
        profile = ProviderProfile(user_id=user.id, business_name=business_name)
        db.add(profile)
        db.flush()

    profile.business_name = business_name
    profile.public_slug = public_slug
    profile.description = description
    profile.offer_kind = kind
    profile.offerings_detail = offerings
    profile.opening_time = hours[0]
    profile.closing_time = hours[1]
    profile.gst_number = gst_number
    profile.base_location = make_point(lon, lat)
    profile.max_radius_km = radius
    profile.is_online = hours != ("22:00", "23:00")
    profile.verification_status = VerificationStatus.APPROVED
    if category_ids:
        set_provider_categories(db, profile, category_ids)
    return user


def _seed_service_cities(db, consumer_hash: str, provider_hash: str) -> None:
    for city_index, city in enumerate(SERVICE_CITIES):
        neighbourhoods = CITY_NEIGHBOURHOODS[city["name"]]
        names = CONSUMER_NAMES[city_index]

        for i, full_name in enumerate(names):
            area, dlat, dlon = neighbourhoods[i]
            lat = city["latitude"] + dlat
            lon = city["longitude"] + dlon
            seq = i + 1
            phone = f"910{city_index + 1}00000{seq}"
            _ensure_consumer(
                db,
                phone=phone,
                email=f"consumer.{city['code']}.{seq}@gharq.app",
                full_name=full_name,
                password_hash=consumer_hash,
                label=f"{area}, {city['name']}",
                city=city["name"],
                pincode=city["pincode"],
                lat=lat,
                lon=lon,
            )

        for i, template in enumerate(PROVIDER_TEMPLATES):
            area, dlat, dlon = neighbourhoods[i]
            lat = city["latitude"] + dlat
            lon = city["longitude"] + dlon
            seq = i + 1
            phone = f"920{city_index + 1}00000{seq}"
            business = f"{city['name']} {template['business']}"
            slug = f"{city['code']}-{template['key']}"
            _ensure_provider(
                db,
                phone=phone,
                email=f"provider.{city['code']}.{template['key']}@gharq.app",
                full_name=f"{city['name']} {template['person']}",
                password_hash=provider_hash,
                business_name=business,
                public_slug=slug,
                description=f"Trusted {template['key']} in {city['name']}",
                offerings=template["offerings"],
                kind=template["kind"],
                gst_number=f"{city['gst_prefix']}AAAAA{city_index + 1:02d}{seq:02d}A1Z5",
                hours=template["hours"],
                radius=template["radius"],
                rating=template["rating"],
                category_ids=_category_ids(db, template["slugs"]),
                label=f"{area}, {city['name']}",
                city=city["name"],
                pincode=city["pincode"],
                lat=lat,
                lon=lon,
            )


def seed() -> None:
    with engine.begin() as conn:
        ensure_postgis(conn)
        Base.metadata.create_all(bind=conn)

    db = SessionLocal()
    try:
        for name, slug, desc, kind, parent_slug in DEFAULT_CATEGORIES:
            _ensure_category(db, name, slug, desc, kind, parent_slug)
        ensure_marketplace_categories(db)
        db.flush()

        consumer_hash = get_password_hash("consumer123")
        provider_hash = get_password_hash("provider123")

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
                hashed_password=consumer_hash,
                is_verified=True,
                location_label="Saheed Nagar, Bhubaneswar",
                latitude=20.2961,
                longitude=85.8245,
                city="Bhubaneswar",
                state="Odisha",
                pincode="751001",
                address_line1="Saheed Nagar, Bhubaneswar",
            )
            db.add(consumer)
        else:
            if consumer.latitude is None or not consumer.city:
                _apply_location(
                    consumer,
                    label="Saheed Nagar, Bhubaneswar",
                    city="Bhubaneswar",
                    pincode="751001",
                    lat=20.2961,
                    lon=85.8245,
                )

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
                hashed_password=provider_hash,
                is_verified=True,
                location_label="Saheed Nagar, Bhubaneswar",
                latitude=20.2961,
                longitude=85.8245,
                city="Bhubaneswar",
                state="Odisha",
                pincode="751001",
                address_line1="Saheed Nagar, Bhubaneswar",
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
                gst_number="21AAAAA0000A1Z5",
                base_location=make_point(85.8245, 20.2961),
                max_radius_km=10,
                is_online=True,
                verification_status=VerificationStatus.APPROVED,
            )
            db.add(profile)
            db.flush()
            if cat_ids:
                set_provider_categories(db, profile, cat_ids)
        else:
            if provider.latitude is None or not provider.city:
                _apply_location(
                    provider,
                    label="Saheed Nagar, Bhubaneswar",
                    city="Bhubaneswar",
                    pincode="751001",
                    lat=20.2961,
                    lon=85.8245,
                )
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
                    profile.gst_number = profile.gst_number or "21AAAAA0000A1Z5"
                if provider.longitude and provider.latitude:
                    profile.base_location = make_point(provider.longitude, provider.latitude)
                if cat_ids and not profile.category_links:
                    set_provider_categories(db, profile, cat_ids)

        _seed_service_cities(db, consumer_hash, provider_hash)

        db.commit()
        print("Seed complete.")
        print()
        print("Core accounts")
        print("  Admin:    9000000001 / admin123")
        print("  Support:  9000000004 / support123")
        print("  Consumer: 9000000002 / consumer123  (Bhubaneswar)")
        print("  Provider: 9000000003 / provider123  (QuickFix Plumbing, Bhubaneswar)")
        print()
        print("City consumers  (password: consumer123)")
        print("  Bhubaneswar  9101000001  9101000002  9101000003")
        print("  Sambalpur    9102000001  9102000002  9102000003")
        print("  Jharsuguda   9103000001  9103000002  9103000003")
        print()
        print("City providers  (password: provider123)  1=plumbing ... 6=carpentry (offline)")
        print("  Bhubaneswar  9201000001 - 9201000006")
        print("  Sambalpur    9202000001 - 9202000006")
        print("  Jharsuguda   9203000001 - 9203000006")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
