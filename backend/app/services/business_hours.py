"""Provider open/close hours → effective online status."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from app.db.models import ProviderProfile

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
    If either time is missing/invalid, hours do not restrict (returns True).
    Supports overnight windows (e.g. 22:00–06:00).
    """
    opens = parse_hhmm(opening_time)
    closes = parse_hhmm(closing_time)
    if opens is None or closes is None:
        return True

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
    """Provider counts as online only if flagged online and currently within hours."""
    if not profile.is_online:
        return False
    return is_within_business_hours(profile.opening_time, profile.closing_time, now=now)


def sync_online_flag_with_hours(profile: ProviderProfile, *, now: datetime | None = None) -> bool:
    """
    If outside Opens–Closes, clear is_online so the stored flag matches reality.
    Returns the effective online status after sync.
    """
    if not profile.is_online:
        return False
    if is_within_business_hours(profile.opening_time, profile.closing_time, now=now):
        return True
    profile.is_online = False
    return False
