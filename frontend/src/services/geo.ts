import { api } from "./api";

export type ReverseGeoResult = {
  latitude: number;
  longitude: number;
  location_label: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  coords_label?: string | null;
};

const PLACEHOLDER_LOCATION_LABELS = new Set([
  "detected from device",
  "current location",
]);

/** True when a location label is worth showing in the UI. */
export function isMeaningfulLocationLabel(label?: string | null): boolean {
  const text = label?.trim();
  if (!text) return false;
  return !PLACEHOLDER_LOCATION_LABELS.has(text.toLowerCase());
}

/** Resolve coordinates to local place name, city, and pincode via the backend. */
export async function reverseGeocodeDetails(
  latitude: number,
  longitude: number,
): Promise<ReverseGeoResult | null> {
  try {
    const { data } = await api.get<ReverseGeoResult>("/geo/reverse", {
      params: { latitude, longitude },
      timeout: 10000,
    });
    return data;
  } catch {
    return null;
  }
}

/** Resolve coordinates to a short place name via the backend. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const details = await reverseGeocodeDetails(latitude, longitude);
  return details?.location_label?.trim() || details?.city?.trim() || null;
}
