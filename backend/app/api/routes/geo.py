from fastapi import APIRouter, HTTPException, Query

from app.services.geo import normalize_lat_lon
from app.services.maps import format_coords, reverse_geocode_details

router = APIRouter(prefix="/geo", tags=["geo"])


@router.get("/reverse")
def reverse_lookup(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    lon, lat = normalize_lat_lon(longitude, latitude)
    details = reverse_geocode_details(lat, lon)
    if not details.location_label and not details.city and not details.pincode:
        raise HTTPException(status_code=404, detail="Could not resolve place name for coordinates")
    return {
        "latitude": lat,
        "longitude": lon,
        "location_label": details.location_label,
        "city": details.city,
        "state": details.state,
        "pincode": details.pincode,
        "coords_label": format_coords(lat, lon),
    }
