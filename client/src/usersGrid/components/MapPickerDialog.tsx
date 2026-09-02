import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createSessionToken,
  fetchPlaceLocation,
  fetchPlacePredictions,
  getPlacesError,
  loadMapsLibrary,
  reverseGeocode,
  subscribePlacesError,
  type PlaceLocation,
  type PlacePrediction,
  type PlaceSessionToken,
} from "../googlePlaces";
import { formatCoordinates, type LocationCoordinates } from "../locationGeo";
import "./MapPickerDialog.css";

// "Vybrat na mapě" — the second way into a Lokalita, next to typing an address.
//
// The user searches or simply clicks the map; the pin they end up with is the
// address that gets saved, together with its coordinates, its place id and the
// Kraj it falls in. Nothing is written until they confirm, so panning around
// the map cannot change a subject by accident.
//
// The search box here deliberately does not reuse PlaceAutocompleteInput: that
// one is a free-text field where a suggestion *commits* a value, whereas here a
// suggestion only moves the pin and the dialog's own buttons decide what is
// saved.

interface MapPickerDialogProps {
  /** The address the field currently holds, used as the starting point. */
  address: string;
  /** Its coordinates, when it already came from Google — the map opens there. */
  coordinates?: LocationCoordinates | null;
  onCancel: () => void;
  onConfirm: (place: PlaceLocation) => void;
}

// Where the map opens when the field is empty: the whole country in view.
const DEFAULT_CENTER = { lat: 49.8175, lng: 15.473 };
const DEFAULT_ZOOM = 7;
const PLACE_ZOOM = 16;
const DEBOUNCE_MS = 250;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const MapPickerDialog: React.FC<MapPickerDialogProps> = ({ address, coordinates, onCancel, onConfirm }) => {
  const [query, setQuery] = useState(address);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [pin, setPin] = useState<PlaceLocation | null>(() =>
    coordinates
      ? {
          placeId: coordinates.place_id ?? "",
          address,
          lat: coordinates.lat,
          lng: coordinates.lng,
          region: "",
        }
      : null
  );
  const [isMapReady, setIsMapReady] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(() => getPlacesError());

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AnyRecord | null>(null);
  const markerRef = useRef<AnyRecord | null>(null);
  const mapsRef = useRef<AnyRecord | null>(null);
  const sessionRef = useRef<PlaceSessionToken | null>(null);
  const mountedRef = useRef(true);
  // The map's own click handler is registered once, so it reads the current pin
  // through a ref rather than closing over a stale one.
  const pinRef = useRef(pin);
  pinRef.current = pin;
  // Guards against a slow lookup for an earlier click landing after a later one.
  const pointRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  // Dragging the marker resolves the point it was dropped on, but the marker is
  // created by the very function that resolving calls back into — the indirect
  // reference keeps the two from having to be defined in a circle.
  const resolvePointRef = useRef<(lat: number, lng: number) => void>(() => {});

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => subscribePlacesError(() => setPlacesError(getPlacesError())), []);

  // Escape closes the map, and only the map: the panel or modal underneath
  // listens for Escape too, and would otherwise close along with it. Capturing
  // on document runs before those listeners, so stopping propagation there
  // keeps the dialog's own dismissal from cascading.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCancel();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  /** Move the pin, and show what is known about that point. */
  const placePin = useCallback((place: PlaceLocation, zoom?: number) => {
    setPin(place);

    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;

    const position = { lat: place.lat, lng: place.lng };
    if (markerRef.current) {
      markerRef.current.setPosition(position);
    } else {
      // The classic Marker rather than AdvancedMarkerElement: the latter needs a
      // Map ID configured on the Google Cloud project, and this app only asks
      // the user for an API key.
      const marker = new maps.Marker({ map, position, draggable: true });
      marker.addListener("dragend", () => {
        const next = marker.getPosition();
        if (next) resolvePointRef.current(next.lat(), next.lng());
      });
      markerRef.current = marker;
    }

    map.panTo(position);
    if (zoom != null && (map.getZoom?.() ?? 0) < zoom) map.setZoom(zoom);
  }, []);

  /** A point picked on the map: ask Google what is there, then pin it. */
  const resolvePoint = useCallback(async (lat: number, lng: number) => {
    const requestId = ++pointRequestRef.current;
    const fallbackAddress = pinRef.current?.address ?? "";

    // Pin first, name it second — the marker must follow the click at once.
    placePin({ placeId: "", address: fallbackAddress, lat, lng, region: "" });
    setIsLocating(true);

    const found = await reverseGeocode(lat, lng);
    if (!mountedRef.current || requestId !== pointRequestRef.current) return;

    setIsLocating(false);
    // A failed lookup leaves the point with no address of its own; keeping the
    // one that was already there beats replacing it with nothing.
    if (found) {
      setPin(found);
      setQuery(found.address);
    }
  }, [placePin]);

  resolvePointRef.current = (lat, lng) => { void resolvePoint(lat, lng); };

  // Build the map once the library is in.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const maps = await loadMapsLibrary();
      if (cancelled || !mountedRef.current) return;

      if (!maps || !mapNodeRef.current) {
        setIsUnavailable(true);
        return;
      }

      mapsRef.current = maps;
      const start = pinRef.current;
      const map = new maps.Map(mapNodeRef.current, {
        center: start ? { lat: start.lat, lng: start.lng } : DEFAULT_CENTER,
        zoom: start ? PLACE_ZOOM : DEFAULT_ZOOM,
        // Inside a dialog the map is the thing under the cursor, so let the
        // wheel zoom it without asking for a modifier.
        gestureHandling: "greedy",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      mapRef.current = map;

      map.addListener("click", (event: AnyRecord) => {
        const position = event?.latLng;
        if (position) void resolvePoint(position.lat(), position.lng());
      });

      if (start) placePin(start);
      setIsMapReady(true);
    })();

    return () => { cancelled = true; };
    // Built once for the lifetime of the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suggestions for what has been typed into the search box, debounced.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 || text === pin?.address) {
      setPredictions([]);
      return;
    }

    const requestId = ++searchRequestRef.current;
    const timer = window.setTimeout(async () => {
      if (!sessionRef.current) sessionRef.current = await createSessionToken();
      const results = await fetchPlacePredictions(text, sessionRef.current);
      if (!mountedRef.current || requestId !== searchRequestRef.current) return;
      setPredictions(results);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
    // The pin's address is read only to suppress a search for the text the pin
    // itself just wrote into the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handlePrediction = useCallback(async (prediction: PlacePrediction) => {
    setPredictions([]);
    setIsLocating(true);
    // Cancel any suggestion request for text that is now being replaced.
    searchRequestRef.current++;
    pointRequestRef.current++;

    const place = await fetchPlaceLocation(prediction.placeId, sessionRef.current);
    // The session ends with the details lookup; the next search starts a new one.
    sessionRef.current = null;
    if (!mountedRef.current) return;

    setIsLocating(false);
    if (!place) return;

    setQuery(place.address);
    placePin(place, PLACE_ZOOM);
  }, [placePin]);

  const canConfirm = Boolean(pin && pin.address.trim());

  return createPortal(
    // Marked so the popovers and panels this opens from can tell a click in
    // here from a click outside themselves (see SubjectFieldPopover).
    <div className="map-picker-overlay" data-place-map-dialog role="presentation">
      <div className="map-picker" role="dialog" aria-modal="true" aria-label="Vybrat místo na mapě">
        <div className="map-picker__header">
          <span className="map-picker__title">Vybrat místo na mapě</span>
          <button type="button" className="map-picker__close" onClick={onCancel} title="Zavřít" aria-label="Zavřít">
            ×
          </button>
        </div>

        <div className="map-picker__search">
          <input
            type="text"
            className="editable-input map-picker__input"
            value={query}
            autoFocus
            placeholder="Hledat adresu nebo místo"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const first = predictions[0];
                if (first) void handlePrediction(first);
              }
            }}
          />
          {predictions.length > 0 ? (
            <ul className="place-autocomplete__list map-picker__list" role="listbox">
              {predictions.map((prediction) => (
                <li key={prediction.placeId} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="place-autocomplete__option"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void handlePrediction(prediction)}
                  >
                    <span className="place-autocomplete__pin" aria-hidden="true">📍</span>
                    <span className="place-autocomplete__text">
                      <span className="place-autocomplete__primary">{prediction.primary}</span>
                      {prediction.secondary ? (
                        <span className="place-autocomplete__secondary">{prediction.secondary}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="map-picker__map-wrap">
          <div className="map-picker__map" ref={mapNodeRef} />
          {!isMapReady && !isUnavailable ? <div className="map-picker__overlay-note">Načítám mapu…</div> : null}
          {isUnavailable ? (
            <div className="map-picker__overlay-note">
              {placesError ?? "Mapa není k dispozici — chybí Google Maps API klíč."}
            </div>
          ) : null}
        </div>

        <div className="map-picker__footer">
          <div className="map-picker__chosen">
            {pin ? (
              <>
                <span className="map-picker__address">{pin.address || "Bez adresy"}</span>
                <span className="map-picker__meta">
                  {formatCoordinates(pin)}
                  {pin.region ? ` · ${pin.region}` : ""}
                  {isLocating ? " · načítám…" : ""}
                </span>
              </>
            ) : (
              <span className="map-picker__hint">Klikněte do mapy nebo vyhledejte adresu.</span>
            )}
          </div>
          <div className="map-picker__actions">
            <button type="button" className="map-picker__button" onClick={onCancel}>
              Zrušit
            </button>
            <button
              type="button"
              className="map-picker__button is-primary"
              disabled={!canConfirm}
              onClick={() => { if (pin && canConfirm) onConfirm(pin); }}
            >
              Použít místo
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MapPickerDialog;
