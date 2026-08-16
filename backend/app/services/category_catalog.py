"""Marketplace category tree used in provider onboarding and browse."""

import re

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.models import (
    Category,
    Conversation,
    OfferKind,
    ProviderCategory,
    ProviderProfile,
    ServiceRequest,
)

CategoryRow = tuple[str, str, str | None, OfferKind, str | None]


def _slugify(text: str) -> str:
    s = text.lower().replace("&", " and ").replace("/", "-")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _parent(
    name: str, slug: str, desc: str, kind: OfferKind
) -> CategoryRow:
    return (name, slug, desc, kind, None)


def _subs(parent_slug: str, kind: OfferKind, names: list[str]) -> list[CategoryRow]:
    rows: list[CategoryRow] = []
    for name in names:
        slug = f"{parent_slug}-{_slugify(name)}"[:100]
        rows.append((name, slug, None, kind, parent_slug))
    return rows


MARKETPLACE_CATEGORIES: list[CategoryRow] = [
    _parent(
        "Grocery, Produce & Staples",
        "grocery-produce-staples",
        "Fresh produce, staples, and wholesale supplies for homes, Kirana stores, and restaurants.",
        OfferKind.PRODUCT,
    ),
    *_subs(
        "grocery-produce-staples",
        OfferKind.PRODUCT,
        [
            "Bulk grains",
            "Commercial oil cans",
            "Wholesale spices",
            "Farm-direct produce crates for restaurants and Kirana stores",
            "Fresh fruits",
            "Vegetables",
            "Daily dairy",
            "Organic packaged foods",
            "Bakery items",
        ],
    ),
    _parent(
        "Building Materials, Hardware & Electricals",
        "building-materials-hardware-electricals",
        "Cement, hardware, electricals, and DIY materials for trade and home use.",
        OfferKind.PRODUCT,
    ),
    *_subs(
        "building-materials-hardware-electricals",
        OfferKind.PRODUCT,
        [
            "Cement",
            "TMT steel bars",
            "Electrical conduit pipes",
            "Bulk wiring spools",
            "Commercial lighting fixtures",
            "Tiles",
            "DIY toolkits",
            "LED bulbs",
            "House paints",
            "Plumbing fittings",
            "Door locks",
            "Extension cords",
        ],
    ),
    _parent(
        "Electronics, Appliances & Mobile Accessories",
        "electronics-appliances-mobile",
        "Consumer electronics, appliances, and wholesale IT or mobile accessories.",
        OfferKind.PRODUCT,
    ),
    *_subs(
        "electronics-appliances-mobile",
        OfferKind.PRODUCT,
        [
            "Wholesale mobile accessories",
            "Office IT equipment",
            "Bulk computer peripherals",
            "Commercial cooling systems",
            "Smartphones",
            "Home audio",
            "Kitchen appliances",
            "Chargers",
            "Cables",
            "Smart wearables",
        ],
    ),
    _parent(
        "Apparel, Textiles & Packaging Supplies",
        "apparel-textiles-packaging",
        "Clothing, fabrics, and packaging supplies for shops and manufacturers.",
        OfferKind.PRODUCT,
    ),
    *_subs(
        "apparel-textiles-packaging",
        OfferKind.PRODUCT,
        [
            "Fabric bolts",
            "Uniform manufacturing",
            "Corrugated shipping boxes",
            "Packaging tape",
            "Bio-hazard bags",
            "Casual wear",
            "Ethnic clothing",
            "Footwear",
            "Travel bags",
            "Fashion accessories",
        ],
    ),
    _parent(
        "Medical, Hygiene & Safety Essentials",
        "medical-hygiene-safety",
        "Medical consumables, hygiene products, and safety gear for clinics and homes.",
        OfferKind.PRODUCT,
    ),
    *_subs(
        "medical-hygiene-safety",
        OfferKind.PRODUCT,
        [
            "Wholesale PPE kits",
            "Surgical gloves",
            "Sanitizer drums",
            "Industrial safety gear",
            "Medical consumables for clinics",
            "First-aid kits",
            "Over-the-counter wellness products",
            "Personal hygiene items",
            "Home sanitization",
        ],
    ),
    _parent(
        "Home & Office Maintenance",
        "home-office-maintenance",
        "Repair, cleaning, and facility maintenance for homes and workplaces.",
        OfferKind.SERVICE,
    ),
    *_subs(
        "home-office-maintenance",
        OfferKind.SERVICE,
        [
            "Commercial HVAC maintenance",
            "Office deep cleaning",
            "Industrial pest control",
            "Fire safety audits",
            "AC repair",
            "Home plumbing",
            "Electrician visits",
            "Sofa/carpet cleaning",
            "Handyman tasks",
        ],
    ),
    _parent(
        "Logistics, Delivery & Fleet Services",
        "logistics-delivery-fleet",
        "Local delivery, shifting, and fleet hire for businesses and households.",
        OfferKind.SERVICE,
    ),
    *_subs(
        "logistics-delivery-fleet",
        OfferKind.SERVICE,
        [
            "Intra-city mini-truck rentals (Tata Ace/Pickup)",
            "Scheduled warehouse transfers",
            "Bulk freight dispatch",
            "Instant 2-wheeler parcel delivery",
            "Household shifting",
            "Furniture transport",
        ],
    ),
    _parent(
        "Professional & Business Services",
        "professional-business-services",
        "Accounting, legal, IT, and local professional help for businesses and individuals.",
        OfferKind.SERVICE,
    ),
    *_subs(
        "professional-business-services",
        OfferKind.SERVICE,
        [
            "GST filing & accounting",
            "Legal drafting",
            "Local signage manufacturing",
            "Digital marketing",
            "IT setup",
            "Personal tax filing",
            "Notary assistance",
            "Passport photo services",
            "Home computer repair",
        ],
    ),
    _parent(
        "Event Management, Catering & Media",
        "event-management-catering-media",
        "Catering, events, photography, and AV for corporate and personal occasions.",
        OfferKind.BOTH,
    ),
    *_subs(
        "event-management-catering-media",
        OfferKind.BOTH,
        [
            "Corporate catering",
            "Sound system rentals",
            "Trade booth setup",
            "Commercial event photography",
            "Party catering",
            "Wedding photography",
            "Home party decoration",
            "DJ booking",
        ],
    ),
    _parent(
        "Personal Care, Beauty & Wellness",
        "personal-care-beauty-wellness",
        "Salon supplies, at-home beauty, fitness, and wellness services.",
        OfferKind.BOTH,
    ),
    *_subs(
        "personal-care-beauty-wellness",
        OfferKind.PRODUCT,
        [
            "Wholesale salon supplies",
            "Equipment leasing for spas",
            "Staff training modules",
        ],
    ),
    *_subs(
        "personal-care-beauty-wellness",
        OfferKind.SERVICE,
        [
            "At-home salon services",
            "Barber visits",
            "Personal fitness trainers",
            "Physiotherapy at home",
        ],
    ),
]

_ACTIVE_SLUGS = {slug for _name, slug, _desc, _kind, _parent in MARKETPLACE_CATEGORIES}
_PARENT_SLUGS = {
    slug for _name, slug, _desc, _kind, parent in MARKETPLACE_CATEGORIES if parent is None
}
_LEGACY_TREES: list[tuple[tuple[str, ...], str]] = [
    (("groceries-produce", "groceries-staples", "groceries"), "grocery-produce-staples"),
    (("electronics-mobiles", "electronics-repair", "electronics"), "electronics-appliances-mobile"),
]


def _repoint_and_delete(db: Session, row: Category, replacement_id: int | None) -> None:
    target_id = replacement_id or row.parent_id
    if target_id:
        db.execute(
            update(ProviderProfile)
            .where(ProviderProfile.category_id == row.id)
            .values(category_id=target_id)
        )
        linked_provider_ids = list(
            db.scalars(
                select(ProviderCategory.provider_id).where(ProviderCategory.category_id == row.id)
            ).all()
        )
        for provider_id in linked_provider_ids:
            already = db.scalar(
                select(ProviderCategory.id).where(
                    ProviderCategory.provider_id == provider_id,
                    ProviderCategory.category_id == target_id,
                )
            )
            if not already:
                db.add(ProviderCategory(provider_id=provider_id, category_id=target_id))
        db.flush()
        db.execute(
            update(ServiceRequest)
            .where(ServiceRequest.category_id == row.id)
            .values(category_id=target_id)
        )
        db.execute(
            update(Conversation)
            .where(Conversation.category_id == row.id)
            .values(category_id=target_id)
        )
    db.delete(row)


def ensure_marketplace_categories(db: Session) -> int:
    """Insert or refresh marketplace categories. Returns rows touched."""
    touched = 0
    for name, slug, desc, kind, parent_slug in MARKETPLACE_CATEGORIES:
        parent_id = None
        if parent_slug:
            parent = db.scalar(select(Category).where(Category.slug == parent_slug))
            parent_id = parent.id if parent else None
        row = db.scalar(select(Category).where(Category.slug == slug))
        if row:
            row.name = name
            row.description = desc
            row.kind = kind
            row.parent_id = parent_id
            row.is_active = True
        else:
            db.add(
                Category(
                    name=name,
                    slug=slug,
                    description=desc,
                    kind=kind,
                    parent_id=parent_id,
                    is_active=True,
                )
            )
        touched += 1
        db.flush()

    parent_ids = [
        cat.id
        for cat in db.scalars(select(Category).where(Category.slug.in_(_PARENT_SLUGS))).all()
    ]
    if parent_ids:
        stale = list(
            db.scalars(
                select(Category).where(
                    Category.parent_id.in_(parent_ids),
                    Category.slug.notin_(_ACTIVE_SLUGS),
                )
            ).all()
        )
        for row in stale:
            _repoint_and_delete(db, row, row.parent_id)
            touched += 1
        db.flush()

    for legacy_slugs, replacement_slug in _LEGACY_TREES:
        replacement = db.scalar(select(Category).where(Category.slug == replacement_slug))
        rows = list(db.scalars(select(Category).where(Category.slug.in_(legacy_slugs))).all())
        rows.sort(key=lambda c: 0 if c.parent_id else 1)
        for row in rows:
            _repoint_and_delete(
                db, row, replacement.id if replacement else row.parent_id
            )
            touched += 1
        if rows:
            db.flush()

    return touched
