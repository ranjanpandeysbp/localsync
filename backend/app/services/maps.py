import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass


def google_maps_url(latitude: float | None, longitude: float | None) -> str | None:
    if latitude is None or longitude is None:
        return None
    return f"https://www.google.com/maps?q={latitude},{longitude}"


def format_coords(latitude: float | None, longitude: float | None) -> str | None:
    if latitude is None or longitude is None:
        return None
    return f"{latitude:.5f}, {longitude:.5f}"


_GENERIC_ADMIN_RE = re.compile(
    r"\b(corporation|municipal|municipality|urban|rural|district|taluk|tehsil|county|zone|division)\b",
    re.IGNORECASE,
)


def _clean(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    return cleaned or None


def _is_generic_admin_name(name: str | None) -> bool:
    if not name:
        return True
    return bool(_GENERIC_ADMIN_RE.search(name))


def _unique_parts(values: list[str | None], *, limit: int = 3) -> list[str]:
    parts: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = _clean(value)
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        parts.append(cleaned)
        if len(parts) >= limit:
            break
    return parts


def extract_local_city(address: dict | None) -> str | None:
    """Prefer neighbourhood / suburb / village over generic admin districts."""
    address = address or {}
    local_keys = (
        "neighbourhood",
        "suburb",
        "village",
        "hamlet",
        "locality",
        "town",
        "city_district",
        "city",
        "municipality",
    )
    for key in local_keys:
        value = _clean(address.get(key))
        if not value:
            continue
        if key in {"city_district", "municipality"} and _is_generic_admin_name(value):
            continue
        if _is_generic_admin_name(value) and key != "city":
            continue
        return value[:100]
    for key in ("county", "state_district"):
        value = _clean(address.get(key))
        if value and not _is_generic_admin_name(value):
            return value[:100]
    return None


def extract_pincode(address: dict | None) -> str | None:
    postcode = _clean((address or {}).get("postcode"))
    if not postcode:
        return None
    digits = "".join(ch for ch in postcode if ch.isdigit())
    if len(digits) >= 6:
        return digits[:6]
    return digits or None


def format_place_label(address: dict | None, display_name: str | None = None) -> str | None:
    """Build a short human place name from Nominatim-style address fields."""
    address = address or {}
    locality = extract_local_city(address)
    metro = _clean(address.get("city") or address.get("town"))
    if metro and locality and metro.casefold() == locality.casefold():
        metro = None
    if metro and _is_generic_admin_name(metro):
        metro = None
    state = _clean(address.get("state"))
    parts = _unique_parts([locality, metro, state], limit=3)
    if parts:
        return ", ".join(parts)[:255]
    if display_name:
        bits = [b.strip() for b in display_name.split(",") if b.strip()]
        bits = [b for b in bits if not _is_generic_admin_name(b)]
        if bits:
            return ", ".join(bits[:3])[:255]
    return None


@dataclass
class ReverseGeocodeResult:
    location_label: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None


def extract_state(address: dict | None) -> str | None:
    address = address or {}
    for key in ("state", "region", "province"):
        value = _clean(address.get(key))
        if value and not _is_generic_admin_name(value):
            return value[:100]
        if value and key == "state":
            # Keep real state names even if they match admin patterns weakly
            return value[:100]
    return None


def format_location_with_coords(
    city: str | None,
    latitude: float,
    longitude: float,
    *,
    fallback_label: str | None = None,
) -> str | None:
    """Combine local city/locality name with coordinates for display and storage."""
    place = _clean(city) or _clean(fallback_label)
    coords = format_coords(latitude, longitude)
    if place and coords:
        return f"{place} · {coords}"[:255]
    return place or coords


def reverse_geocode_details(latitude: float, longitude: float) -> ReverseGeocodeResult:
    """Resolve lat/lon to local place label, city, and pincode via Nominatim."""
    params = urllib.parse.urlencode(
        {
            "lat": f"{float(latitude):.7f}",
            "lon": f"{float(longitude):.7f}",
            "format": "jsonv2",
            "zoom": 18,
            "addressdetails": 1,
        }
    )
    req = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/reverse?{params}",
        headers={
            "User-Agent": "KoshalKarobar/1.0 (local marketplace; contact=koshalkarobar)",

            "Accept": "application/json",
            "Accept-Language": "en",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError, TypeError):
        return ReverseGeocodeResult()
    if not isinstance(payload, dict):
        return ReverseGeocodeResult()
    address = payload.get("address") if isinstance(payload.get("address"), dict) else {}
    city = extract_local_city(address)
    state = extract_state(address)
    pincode = extract_pincode(address)
    place_hint = format_place_label(address, payload.get("display_name"))
    label = format_location_with_coords(
        city,
        latitude,
        longitude,
        fallback_label=place_hint,
    )
    return ReverseGeocodeResult(
        location_label=label,
        city=city,
        state=state,
        pincode=pincode,
    )


def reverse_geocode(latitude: float, longitude: float) -> str | None:
    """Resolve lat/lon to a short place label via OpenStreetMap Nominatim."""
    return reverse_geocode_details(latitude, longitude).location_label
