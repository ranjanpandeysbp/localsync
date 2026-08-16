from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Order,
    OrderStatus,
    Quote,
    QuoteStatus,
    RequestStatus,
    ServiceRequest,
)


def expire_stale_requests(db: Session) -> tuple[list[ServiceRequest], list[UUID]]:
    """Close ACTIVE requests older than 30 days when no deal was locked.

    Pending quotes are withdrawn. Returns (expired requests, provider ids to notify).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.request_expire_after_days)
    candidates = list(
        db.scalars(
            select(ServiceRequest).where(
                ServiceRequest.status == RequestStatus.ACTIVE,
                ServiceRequest.created_at <= cutoff,
            )
        ).all()
    )
    if not candidates:
        return [], []

    candidate_ids = [req.id for req in candidates]
    locked_ids = set(
        db.scalars(
            select(Quote.request_id).where(
                Quote.request_id.in_(candidate_ids),
                Quote.status == QuoteStatus.ACCEPTED,
            )
        ).all()
    )
    locked_ids.update(
        db.scalars(
            select(Order.request_id).where(
                Order.request_id.in_(candidate_ids),
                Order.status != OrderStatus.REJECTED,
            )
        ).all()
    )

    now = datetime.now(timezone.utc)
    expired: list[ServiceRequest] = []
    provider_ids: set[UUID] = set()
    for req in candidates:
        if req.id in locked_ids:
            continue
        pending = list(
            db.scalars(
                select(Quote).where(
                    Quote.request_id == req.id,
                    Quote.status == QuoteStatus.PENDING,
                )
            ).all()
        )
        for quote in pending:
            quote.status = QuoteStatus.WITHDRAWN
            provider_ids.add(quote.provider_id)
        req.status = RequestStatus.EXPIRED
        req.expires_at = now
        expired.append(req)

    return expired, list(provider_ids)


async def notify_request_expiry(user_ids: list[UUID], count: int) -> None:
    if not user_ids:
        return
    from app.services.ws_manager import ws_manager

    await ws_manager.broadcast_to_users(
        user_ids,
        {"type": "request_expired", "payload": {"count": count}},
    )


def apply_request_expiry(db: Session, background_tasks: object | None = None) -> int:
    """Expire stale unlocked requests and commit when anything changed."""
    expired, provider_ids = expire_stale_requests(db)
    if not expired:
        return 0
    db.commit()
    if background_tasks is not None:
        notify_ids = list({*provider_ids, *(req.consumer_id for req in expired)})
        add_task = getattr(background_tasks, "add_task", None)
        if notify_ids and callable(add_task):
            add_task(notify_request_expiry, notify_ids, len(expired))
    return len(expired)
