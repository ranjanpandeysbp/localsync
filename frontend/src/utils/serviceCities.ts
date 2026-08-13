export type ServiceCity = {
  name: string;
  pincode: string;
  latitude: number;
  longitude: number;
};

/** Cities currently served on the landing page. */
export const SERVICE_CITIES: ServiceCity[] = [
  {
    name: "Bhubaneswar",
    pincode: "751001",
    latitude: 20.2961,
    longitude: 85.8245,
  },
  {
    name: "Sambalpur",
    pincode: "768001",
    latitude: 21.4669,
    longitude: 83.9812,
  },
  {
    name: "Jharsuguda",
    pincode: "768201",
    latitude: 21.8554,
    longitude: 84.0062,
  },
];

export const SERVICE_CITY_STORAGE_KEY = "ls_service_city";

export function matchServiceCity(raw?: string | null): ServiceCity | null {
  const text = (raw || "").trim().toLowerCase();
  if (!text) return null;
  return (
    SERVICE_CITIES.find((city) => {
      const name = city.name.toLowerCase();
      return text === name || text.includes(name) || name.includes(text);
    }) || null
  );
}

export function findServiceCityByName(name?: string | null): ServiceCity | null {
  const text = (name || "").trim().toLowerCase();
  if (!text) return null;
  return SERVICE_CITIES.find((city) => city.name.toLowerCase() === text) || null;
}

export function readSavedServiceCity(): ServiceCity | null {
  try {
    const raw = localStorage.getItem(SERVICE_CITY_STORAGE_KEY);
    if (!raw) return null;
    return findServiceCityByName(raw);
  } catch {
    return null;
  }
}

export function saveServiceCity(city: ServiceCity): void {
  try {
    localStorage.setItem(SERVICE_CITY_STORAGE_KEY, city.name);
  } catch {
    /* ignore */
  }
}
