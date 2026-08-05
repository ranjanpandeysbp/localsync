from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.models import Category, OfferKind, User, UserRole
from app.db.session import get_db
from app.schemas import CategoryCreate, CategoryOut, CategoryTreeOut

router = APIRouter(prefix="/categories", tags=["categories"])


def _to_out(cat: Category, children: list[Category] | None = None) -> CategoryOut:
    return CategoryOut(
        id=cat.id,
        name=cat.name,
        slug=cat.slug,
        description=cat.description,
        parent_id=cat.parent_id,
        kind=cat.kind or OfferKind.BOTH,
        is_active=cat.is_active,
        children=[_to_out(c) for c in (children or [])],
    )


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    """Flat list of active top-level categories (backward compatible)."""
    rows = db.scalars(
        select(Category)
        .where(Category.is_active.is_(True), Category.parent_id.is_(None))
        .order_by(Category.name)
    ).all()
    return [_to_out(c) for c in rows]


@router.get("/tree", response_model=list[CategoryTreeOut])
def category_tree(db: Session = Depends(get_db)):
    parents = db.scalars(
        select(Category)
        .where(Category.is_active.is_(True), Category.parent_id.is_(None))
        .order_by(Category.name)
    ).all()
    tree: list[CategoryTreeOut] = []
    for p in parents:
        kids = db.scalars(
            select(Category)
            .where(Category.is_active.is_(True), Category.parent_id == p.id)
            .order_by(Category.name)
        ).all()
        tree.append(
            CategoryTreeOut(
                id=p.id,
                name=p.name,
                slug=p.slug,
                description=p.description,
                kind=p.kind or OfferKind.BOTH,
                is_active=p.is_active,
                subcategories=[_to_out(k) for k in kids],
            )
        )
    return tree


@router.get("/admin/all", response_model=list[CategoryOut])
def admin_list_all(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    parents = db.scalars(
        select(Category).where(Category.parent_id.is_(None)).order_by(Category.name)
    ).all()
    result: list[CategoryOut] = []
    for p in parents:
        kids = db.scalars(
            select(Category).where(Category.parent_id == p.id).order_by(Category.name)
        ).all()
        result.append(_to_out(p, list(kids)))
    return result


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    exists = db.scalar(select(Category).where(Category.slug == payload.slug))
    if exists:
        raise HTTPException(status_code=400, detail="Slug already exists")
    if payload.parent_id is not None:
        parent = db.get(Category, payload.parent_id)
        if not parent or parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="parent_id must be a top-level category")
    category = Category(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        parent_id=payload.parent_id,
        kind=payload.kind,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return _to_out(category)


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    slug_clash = db.scalar(
        select(Category).where(Category.slug == payload.slug, Category.id != category_id)
    )
    if slug_clash:
        raise HTTPException(status_code=400, detail="Slug already exists")
    cat.name = payload.name
    cat.slug = payload.slug
    cat.description = payload.description
    cat.kind = payload.kind
    if payload.parent_id is not None and payload.parent_id != cat.id:
        parent = db.get(Category, payload.parent_id)
        if not parent or parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="Invalid parent_id")
        cat.parent_id = payload.parent_id
    db.commit()
    db.refresh(cat)
    return _to_out(cat)


@router.post("/{category_id}/deactivate", response_model=CategoryOut)
def deactivate_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.is_active = False
    for child in db.scalars(select(Category).where(Category.parent_id == category_id)).all():
        child.is_active = False
    db.commit()
    db.refresh(cat)
    return _to_out(cat)


@router.post("/{category_id}/activate", response_model=CategoryOut)
def activate_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    # Subcategories need an active parent to appear in the public catalog
    if cat.parent_id:
        parent = db.get(Category, cat.parent_id)
        if parent and not parent.is_active:
            parent.is_active = True
    cat.is_active = True
    db.commit()
    db.refresh(cat)
    return _to_out(cat)
