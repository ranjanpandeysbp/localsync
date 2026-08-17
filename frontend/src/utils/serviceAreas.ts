export type ServiceArea = {
  city: string;
  name: string;
  pincode: string;
  latitude: number;
  longitude: number;
};

/** Localities / pincodes within each service city for landing area search. */
export const SERVICE_AREAS: ServiceArea[] = [
  // Bhubaneswar
  { city: "Bhubaneswar", name: "Saheed Nagar", pincode: "751007", latitude: 20.2961, longitude: 85.8245 },
  { city: "Bhubaneswar", name: "Patia", pincode: "751024", latitude: 20.3531, longitude: 85.8235 },
  { city: "Bhubaneswar", name: "Jaydev Vihar", pincode: "751013", latitude: 20.3001, longitude: 85.8185 },
  { city: "Bhubaneswar", name: "Rasulgarh", pincode: "751010", latitude: 20.2801, longitude: 85.8505 },
  { city: "Bhubaneswar", name: "Chandrasekharpur", pincode: "751016", latitude: 20.3301, longitude: 85.8195 },
  { city: "Bhubaneswar", name: "Unit 1 Market", pincode: "751001", latitude: 20.2701, longitude: 85.8405 },
  { city: "Bhubaneswar", name: "Old Town", pincode: "751002", latitude: 20.2435, longitude: 85.8335 },
  { city: "Bhubaneswar", name: "Khandagiri", pincode: "751030", latitude: 20.2625, longitude: 85.7855 },
  { city: "Bhubaneswar", name: "Nayapalli", pincode: "751012", latitude: 20.2915, longitude: 85.8182 },
  { city: "Bhubaneswar", name: "Laxmisagar", pincode: "751006", latitude: 20.2685, longitude: 85.8522 },
  { city: "Bhubaneswar", name: "Vani Vihar", pincode: "751004", latitude: 20.3045, longitude: 85.8372 },
  { city: "Bhubaneswar", name: "IRC Village", pincode: "751015", latitude: 20.3095, longitude: 85.8192 },
  { city: "Bhubaneswar", name: "Dumduma", pincode: "751019", latitude: 20.2515, longitude: 85.8002 },
  { city: "Bhubaneswar", name: "Bapuji Nagar", pincode: "751009", latitude: 20.2688, longitude: 85.8338 },
  // Sambalpur
  { city: "Sambalpur", name: "Gole Bazaar", pincode: "768001", latitude: 21.4669, longitude: 83.9812 },
  { city: "Sambalpur", name: "Budharaja", pincode: "768004", latitude: 21.4789, longitude: 83.9752 },
  { city: "Sambalpur", name: "Ainthapali", pincode: "768003", latitude: 21.4599, longitude: 83.9902 },
  { city: "Sambalpur", name: "Remed", pincode: "768006", latitude: 21.4799, longitude: 83.9702 },
  { city: "Sambalpur", name: "Dhanupali", pincode: "768001", latitude: 21.4569, longitude: 83.9892 },
  { city: "Sambalpur", name: "Khetrajpur", pincode: "768003", latitude: 21.4729, longitude: 83.9932 },
  { city: "Sambalpur", name: "Modipara", pincode: "768002", latitude: 21.4709, longitude: 83.9682 },
  { city: "Sambalpur", name: "Brooks Hill", pincode: "768001", latitude: 21.4629, longitude: 83.9732 },
  // Jharsuguda
  { city: "Jharsuguda", name: "Beheramal", pincode: "768201", latitude: 21.8554, longitude: 84.0062 },
  { city: "Jharsuguda", name: "Sarbahal", pincode: "768201", latitude: 21.8504, longitude: 84.0152 },
  { city: "Jharsuguda", name: "Brundamal", pincode: "768202", latitude: 21.8604, longitude: 83.9952 },
  { city: "Jharsuguda", name: "H. Katapali", pincode: "768202", latitude: 21.8654, longitude: 84.0122 },
  { city: "Jharsuguda", name: "Marwari Para", pincode: "768201", latitude: 21.8474, longitude: 84.0022 },
  { city: "Jharsuguda", name: "Chowk Bazaar", pincode: "768201", latitude: 21.8584, longitude: 84.0132 },
  { city: "Jharsuguda", name: "O.M.P. Line", pincode: "768204", latitude: 21.8624, longitude: 84.0212 },
];

export const SERVICE_AREA_STORAGE_KEY = "ls_service_area";
export const SERVICE_PIN_STORAGE_KEY = "ls_service_pincode";

export function areasForCity(cityName?: string | null): ServiceArea[] {
  const city = (cityName || "").trim().toLowerCase();
  if (!city) return [];
  return SERVICE_AREAS.filter((a) => a.city.toLowerCase() === city);
}

export function findServiceArea(
  cityName: string | null | undefined,
  areaNameOrPin: string | null | undefined,
): ServiceArea | null {
  const city = (cityName || "").trim().toLowerCase();
  const raw = (areaNameOrPin || "").trim().toLowerCase();
  if (!city || !raw) return null;
  const areas = areasForCity(city);
  const byName = areas.find((a) => a.name.toLowerCase() === raw);
  if (byName) return byName;
  const pin = raw.replace(/\D/g, "");
  if (pin.length === 6) {
    return areas.find((a) => a.pincode === pin) || null;
  }
  return null;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Match a listed locality by pincode, then by nearest coordinates within the city. */
export function matchServiceAreaNear(
  cityName: string | null | undefined,
  opts: {
    pincode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    maxKm?: number;
  } = {},
): ServiceArea | null {
  const areas = areasForCity(cityName);
  if (!areas.length) return null;
  const pin = (opts.pincode || "").replace(/\D/g, "");
  if (pin.length === 6) {
    const byPin = areas.find((a) => a.pincode === pin);
    if (byPin) return byPin;
  }
  if (opts.latitude == null || opts.longitude == null) return null;
  const maxKm = opts.maxKm ?? 3.5;
  let best: ServiceArea | null = null;
  let bestKm = Infinity;
  for (const area of areas) {
    const km = haversineKm(opts.latitude, opts.longitude, area.latitude, area.longitude);
    if (km < bestKm) {
      bestKm = km;
      best = area;
    }
  }
  return best && bestKm <= maxKm ? best : null;
}

export function readSavedServiceArea(cityName?: string | null): ServiceArea | null {
  try {
    const raw = localStorage.getItem(SERVICE_AREA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { city?: string; name?: string } | null;
    if (!parsed?.city || !parsed?.name) return null;
    if (cityName && parsed.city.toLowerCase() !== cityName.trim().toLowerCase()) return null;
    return findServiceArea(parsed.city, parsed.name);
  } catch {
    return null;
  }
}

export function saveServiceArea(area: ServiceArea | null): void {
  try {
    if (!area) {
      localStorage.removeItem(SERVICE_AREA_STORAGE_KEY);
      return;
    }
    localStorage.removeItem(SERVICE_PIN_STORAGE_KEY);
    localStorage.setItem(
      SERVICE_AREA_STORAGE_KEY,
      JSON.stringify({ city: area.city, name: area.name }),
    );
  } catch {
    /* ignore */
  }
}

export function readSavedCustomPincode(cityName?: string | null): string {
  try {
    const raw = localStorage.getItem(SERVICE_PIN_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { city?: string; pincode?: string } | null;
    if (!parsed?.city || !parsed?.pincode) return "";
    if (cityName && parsed.city.toLowerCase() !== cityName.trim().toLowerCase()) return "";
    const pin = parsed.pincode.replace(/\D/g, "");
    return pin.length === 6 ? pin : "";
  } catch {
    return "";
  }
}

export function saveCustomPincode(city: string | null, pincode: string | null): void {
  try {
    const pin = (pincode || "").replace(/\D/g, "");
    if (!city || pin.length !== 6) {
      localStorage.removeItem(SERVICE_PIN_STORAGE_KEY);
      return;
    }
    localStorage.removeItem(SERVICE_AREA_STORAGE_KEY);
    localStorage.setItem(
      SERVICE_PIN_STORAGE_KEY,
      JSON.stringify({ city, pincode: pin }),
    );
  } catch {
    /* ignore */
  }
}
