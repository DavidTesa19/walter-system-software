// Google Maps place lookup for the subject "Lokalita" field.
//
// The user types freely; as they type we ask Google for matching places and
// offer them in a dropdown. Picking one replaces the text with the place's
// formatted address and hands back its coordinates and place id, which the
// caller stores alongside the address (see locationGeo.ts).
//
// The whole thing is optional: without VITE_GOOGLE_MAPS_API_KEY — or if the
// script fails to load, or the key is rejected — every helper here reports "no
// places" and the field stays the plain text input it has always been.
//
// Requires the "Places API" and "Maps JavaScript API" to be enabled on the key,
// which should be restricted by HTTP referrer to the app's own domains.

export interface PlacePrediction {
  placeId: string;
  /** The bold first line, e.g. "Václavské náměstí". */
  primary: string;
  /** The grey second line, e.g. "Praha, Česko". */
  secondary: string;
  /** Both lines joined — what lands in the field if details ever fail. */
  description: string;
}

export interface PlaceLocation {
  placeId: string;
  address: string;
  lat: number;
  lng: number;
}

/** Opaque per-edit token; Google bills a whole "session" rather than each keystroke. */
export type PlaceSessionToken = unknown;

const SCRIPT_ID = "walter-google-maps-places";
const CALLBACK_NAME = "__walterGoogleMapsReady";

// Why address lookup is not working, if it isn't. Google fails in ways that are
// invisible from the app's side — a key with the wrong APIs enabled, a referrer
// restriction that does not cover this host, billing not set up — and the only
// signal is a console message. Recording the reason here lets the field say so
// under the input instead of just sitting there looking like a plain text box.
let placesError: string | null = null;
const errorListeners = new Set<() => void>();

const setPlacesError = (message: string | null) => {
  if (placesError === message) return;
  placesError = message;
  for (const listener of errorListeners) listener();
};

/** The current failure reason, or null while everything is fine. */
export const getPlacesError = (): string | null => placesError;

/** Subscribe to failure-reason changes; returns an unsubscribe function. */
export const subscribePlacesError = (listener: () => void): (() => void) => {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const getMaps = (): AnyRecord | null => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maps = (window as any).google?.maps;
  return maps ?? null;
};

export const getGoogleMapsApiKey = (): string => {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return typeof key === "string" ? key.trim() : "";
};

/** Whether a key is configured at all — cheap enough to call during render. */
export const isPlacesConfigured = (): boolean => getGoogleMapsApiKey().length > 0;

let loadPromise: Promise<AnyRecord | null> | null = null;

/**
 * Load the Maps JS "places" library once, on first use. Resolves to the places
 * library, or null when there is no key or the script could not be loaded —
 * callers treat null as "autocomplete unavailable", never as an error.
 */
export const loadPlacesLibrary = (): Promise<AnyRecord | null> => {
  if (loadPromise) return loadPromise;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey || typeof document === "undefined") {
    loadPromise = Promise.resolve(null);
    return loadPromise;
  }

  loadPromise = new Promise<AnyRecord | null>((resolve) => {
    const importPlaces = async () => {
      const maps = getMaps();
      if (!maps) {
        resolve(null);
        return;
      }
      try {
        const places = typeof maps.importLibrary === "function"
          ? await maps.importLibrary("places")
          : maps.places;
        resolve(places ?? null);
      } catch (error) {
        console.error("Google Places library failed to load:", error);
        setPlacesError("Knihovnu Google Places se nepodařilo načíst — je pro klíč povolené Places API?");
        resolve(null);
      }
    };

    if (getMaps()?.places || typeof getMaps()?.importLibrary === "function") {
      void importPlaces();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => { void importPlaces(); });
      existing.addEventListener("error", () => resolve(null));
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)[CALLBACK_NAME] = () => { void importPlaces(); };

    // Google calls this when it rejects the key itself — wrong key, referrer
    // not allowed, or billing not enabled on the project.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gm_authFailure = () => {
      setPlacesError("Google Maps odmítl API klíč — zkontrolujte klíč, povolené API a omezení domén.");
    };

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(apiKey)}` +
      "&libraries=places" +
      "&language=cs&region=CZ" +
      "&loading=async" +
      `&callback=${CALLBACK_NAME}`;
    script.onerror = () => {
      console.error("Google Maps script could not be loaded — Lokalita stays a plain text field.");
      setPlacesError("Skript Google Maps se nepodařilo načíst — zkontrolujte připojení a API klíč.");
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return loadPromise;
};

/**
 * A session groups the keystrokes of one edit with the detail lookup that ends
 * it, so Google bills them together. Returns null when places are unavailable.
 */
export const createSessionToken = async (): Promise<PlaceSessionToken | null> => {
  const places = await loadPlacesLibrary();
  if (!places) return null;
  try {
    if (places.AutocompleteSessionToken) return new places.AutocompleteSessionToken();
  } catch {
    // Fall through — a session token is an optimisation, not a requirement.
  }
  return null;
};

const toText = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  // The new API returns FormattableText objects that stringify to their text.
  return String(value);
};

/**
 * Suggestions for what the user has typed so far.
 *
 * Tries the current Places API first and falls back to the legacy one when it
 * is missing *or* when it throws: a key with only the old "Places API" enabled
 * has the new classes available but every call fails, and dropping to the
 * legacy service is what makes that key work instead of silently offering
 * nothing.
 */
export const fetchPlacePredictions = async (
  input: string,
  sessionToken: PlaceSessionToken | null
): Promise<PlacePrediction[]> => {
  const query = input.trim();
  if (query.length < 2) return [];

  const places = await loadPlacesLibrary();
  if (!places) return [];

  const fromNewApi = async (): Promise<PlacePrediction[]> => {
    const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      ...(sessionToken ? { sessionToken } : {}),
      language: "cs",
      region: "cz",
    });

    return (response?.suggestions ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((suggestion: any) => suggestion?.placePrediction)
      .filter(Boolean)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((prediction: any): PlacePrediction => {
        const primary = toText(prediction.mainText ?? prediction.text);
        const secondary = toText(prediction.secondaryText);
        return {
          placeId: prediction.placeId ?? prediction.place_id ?? "",
          primary,
          secondary,
          description: [primary, secondary].filter(Boolean).join(", "),
        };
      })
      .filter((prediction: PlacePrediction) => Boolean(prediction.placeId));
  };

  const fromLegacyApi = async (): Promise<PlacePrediction[]> => {
    const service = new places.AutocompleteService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacy = await new Promise<any[]>((resolve, reject) => {
      service.getPlacePredictions(
        { input: query, ...(sessionToken ? { sessionToken } : {}) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (results: any[] | null, status: string) => {
          // "OK" and "ZERO_RESULTS" are both answers; anything else is a fault
          // worth reporting rather than showing as "no matches".
          if (results) return resolve(results);
          if (status === "ZERO_RESULTS") return resolve([]);
          reject(new Error(`Places status ${status}`));
        }
      );
    });

    return legacy.map((prediction): PlacePrediction => ({
      placeId: prediction.place_id,
      primary: prediction.structured_formatting?.main_text ?? prediction.description ?? "",
      secondary: prediction.structured_formatting?.secondary_text ?? "",
      description: prediction.description ?? "",
    }));
  };

  const attempts: Array<() => Promise<PlacePrediction[]>> = [];
  if (places.AutocompleteSuggestion?.fetchAutocompleteSuggestions) attempts.push(fromNewApi);
  if (places.AutocompleteService) attempts.push(fromLegacyApi);

  if (attempts.length === 0) {
    setPlacesError("Google Places nenabízí žádné rozhraní pro našeptávání — je pro klíč povolené Places API?");
    return [];
  }

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const predictions = await attempt();
      setPlacesError(null);
      return predictions;
    } catch (error) {
      lastError = error;
    }
  }

  console.error("Google Places suggestions failed:", lastError);
  setPlacesError("Našeptávání adres selhalo — zkontrolujte Google Maps API klíč (Places API, omezení domén, fakturace).");
  return [];
};

/** The chosen place's formatted address and coordinates. Null on any failure. */
export const fetchPlaceLocation = async (
  placeId: string,
  sessionToken: PlaceSessionToken | null
): Promise<PlaceLocation | null> => {
  if (!placeId) return null;

  const places = await loadPlacesLibrary();
  if (!places) return null;

  try {
    if (places.Place) {
      const place = new places.Place({ id: placeId, ...(sessionToken ? { sessionToken } : {}) });
      await place.fetchFields({ fields: ["formattedAddress", "location", "displayName"] });

      const lat = typeof place.location?.lat === "function" ? place.location.lat() : place.location?.lat;
      const lng = typeof place.location?.lng === "function" ? place.location.lng() : place.location?.lng;
      const address = toText(place.formattedAddress) || toText(place.displayName);

      if (typeof lat !== "number" || typeof lng !== "number" || !address) return null;
      return { placeId, address, lat, lng };
    }

    if (places.PlacesService) {
      const service = new places.PlacesService(document.createElement("div"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const details = await new Promise<any>((resolve) => {
        service.getDetails(
          {
            placeId,
            fields: ["formatted_address", "geometry", "name"],
            ...(sessionToken ? { sessionToken } : {}),
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result: any) => resolve(result)
        );
      });

      const location = details?.geometry?.location;
      const lat = typeof location?.lat === "function" ? location.lat() : location?.lat;
      const lng = typeof location?.lng === "function" ? location.lng() : location?.lng;
      const address = details?.formatted_address ?? details?.name ?? "";

      if (typeof lat !== "number" || typeof lng !== "number" || !address) return null;
      return { placeId, address, lat, lng };
    }
  } catch (error) {
    console.error("Google Places details failed:", error);
  }

  return null;
};
