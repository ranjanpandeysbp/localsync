export function mapsUrl(lat?: number | null, lng?: number | null, fallback?: string | null): string | null {
  if (fallback) return fallback;
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function MapsLink({
  latitude,
  longitude,
  maps_url,
  label,
}: {
  latitude?: number | null;
  longitude?: number | null;
  maps_url?: string | null;
  label?: string | null;
}) {
  const href = mapsUrl(latitude, longitude, maps_url);
  if (!href) {
    return <span className="muted">Location not set</span>;
  }
  const text =
    label ||
    (latitude != null && longitude != null
      ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
      : "Open in Google Maps");

  return (
    <a className="maps-link" href={href} target="_blank" rel="noreferrer">
      📍 {text}
    </a>
  );
}
