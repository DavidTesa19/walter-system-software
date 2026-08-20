// Coordinates for the subject's Lokalita values.
//
// Lokalita is a multi-value field (see multiValue.ts), so a subject can hold
// several addresses. The coordinates live in their own entity column,
// `location_geo`, as a JSON object keyed by the address exactly as stored in
// `location` — the same shape the Obor -> Zaměření map uses:
//
//   {"Václavské náměstí, Praha, Česko": {"lat":50.081,"lng":14.427,"place_id":"ChIJ…"}}
//
// Addresses typed by hand simply have no entry, so nothing about the existing
// text field changes: the visible value is still the address string, and the
// coordinates ride along beside it.

export interface LocationCoordinates {
  lat: number;
  lng: number;
  place_id?: string;
}

export type LocationGeoMap = Record<string, LocationCoordinates>;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const toCoordinates = (raw: unknown): LocationCoordinates | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const lat = typeof record.lat === "string" ? Number(record.lat) : record.lat;
  const lng = typeof record.lng === "string" ? Number(record.lng) : record.lng;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;

  const placeId = record.place_id ?? record.placeId;
  return {
    lat,
    lng,
    ...(typeof placeId === "string" && placeId.trim() ? { place_id: placeId.trim() } : {}),
  };
};

/** Read the stored representation into a clean address -> coordinates map. */
export const parseLocationGeo = (raw: unknown): LocationGeoMap => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out: LocationGeoMap = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const address = String(key).trim();
      const coordinates = toCoordinates(value);
      if (address && coordinates) out[address] = coordinates;
    }
    return out;
  }

  if (typeof raw !== "string") return {};

  const trimmed = raw.trim();
  if (!trimmed || !trimmed.startsWith("{")) return {};

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parseLocationGeo(parsed);
    }
  } catch {
    // Not valid JSON — treat as empty.
  }
  return {};
};

/** Turn a map back into the storage representation (null when empty). */
export const serializeLocationGeo = (map: LocationGeoMap): string | null => {
  const clean: LocationGeoMap = {};
  for (const [key, value] of Object.entries(map || {})) {
    const address = String(key).trim();
    const coordinates = toCoordinates(value);
    if (address && coordinates) clean[address] = coordinates;
  }
  return Object.keys(clean).length === 0 ? null : JSON.stringify(clean);
};

/**
 * Drop entries whose address is no longer one of the subject's Lokalita values,
 * so removing or retyping an address never leaves stale coordinates behind.
 */
export const pruneLocationGeo = (map: LocationGeoMap, addresses: string[]): LocationGeoMap => {
  const allowed = new Set(addresses.map((address) => address.trim()).filter(Boolean));
  const next: LocationGeoMap = {};
  for (const [address, coordinates] of Object.entries(map || {})) {
    if (allowed.has(address)) next[address] = coordinates;
  }
  return next;
};

/** "50.0755, 14.4378" — the short read-only hint shown under a picked address. */
export const formatCoordinates = (coordinates: LocationCoordinates | undefined | null): string =>
  coordinates ? `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}` : "";

/** A Google Maps link for a stored place, for the coordinate hint. */
export const buildMapsUrl = (address: string, coordinates: LocationCoordinates): string => {
  const query = encodeURIComponent(address);
  return coordinates.place_id
    ? `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(coordinates.place_id)}`
    : `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`;
};
