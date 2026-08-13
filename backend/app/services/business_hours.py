"""Provider open/close hours → effective online status."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from app.db.models import ProviderProfile, VerificationStatus

# Marketplace operates in India; open/close times are local wall-clock HH:MM.
IST = timezone(timedelta(hours=5, minutes=30))


def parse_hhmm(value: str | None) -> time | None:
    if not value:
        return None
    raw = value.strip()
    try:
        parts = raw.split(":")
        if len(parts) != 2:
            return None
        hour, minute = int(parts[0]), int(parts[1])
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None
        return time(hour, minute)
    except ValueError:
        return None


def is_within_business_hours(
    opening_time: str | None,
    closing_time: str | None,
    *,
    now: datetime | None = None,
) -> bool:
    """
    True when current IST time is inside [opens, closes).
    If either time is missing/invalid, returns False (not open).
    Supports overnight windows (e.g. 22:00–06:00).
    """
    opens = parse_hhmm(opening_time)
    closes = parse_hhmm(closing_time)
    if opens is None or closes is None:
        return False

    current = now.astimezone(IST) if now else datetime.now(IST)
    now_t = current.time().replace(second=0, microsecond=0)

    if opens == closes:
        # Same open/close is treated as always open.
        return True

    if opens < closes:
        return opens <= now_t < closes

    # Overnight: open from opens until midnight, and from midnight until closes.
    return now_t >= opens or now_t < closes


def effective_is_online(profile: ProviderProfile, *, now: datetime | None = None) -> bool:
    """Online when approved and current IST time is within Opens–Closes."""
    if profile.verification_status != VerificationStatus.APPROVED:
        return False
    return is_within_business_hours(profile.opening_time, profile.closing_time, now=now)


def sync_online_flag_with_hours(profile: ProviderProfile, *, now: datetime | None = None) -> bool:
    """
    Keep stored is_online aligned with Opens–Closes (and approval).
    Returns the effective online status after sync.
    """
    online = effective_is_online(profile, now=now)
    profile.is_online = online
    return online
