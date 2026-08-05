def google_maps_url(latitude: float | None, longitude: float | None) -> str | None:
    if latitude is None or longitude is None:
        return None
    return f"https://www.google.com/maps?q={latitude},{longitude}"


def format_coords(latitude: float | None, longitude: float | None) -> str | None:
    if latitude is None or longitude is None:
        return None
    return f"{latitude:.5f}, {longitude:.5f}"
