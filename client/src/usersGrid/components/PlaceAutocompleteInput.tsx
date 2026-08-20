import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  createSessionToken,
  fetchPlaceLocation,
  fetchPlacePredictions,
  getPlacesError,
  isPlacesConfigured,
  subscribePlacesError,
  type PlaceLocation,
  type PlacePrediction,
  type PlaceSessionToken,
} from "../googlePlaces";
import "./PlaceAutocompleteInput.css";

interface PlaceAutocompleteInputProps {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Free typing — the address is whatever the user wrote, with no coordinates. */
  onChange: (value: string) => void;
  /** Typing finished (blur / Enter) without picking a suggestion. */
  onCommit?: () => void;
  /** A suggestion was picked: address text plus its coordinates and place id. */
  onPlaceSelected: (place: PlaceLocation) => void;
}

const DEBOUNCE_MS = 250;

/**
 * Address field backed by Google Maps.
 *
 * Types like an ordinary text input, but after a short pause it offers matching
 * places underneath; picking one writes the place's formatted address and hands
 * the caller its coordinates. With no API key configured (or if Google is
 * unreachable) no dropdown ever appears and this behaves exactly like the plain
 * input it replaces — the user can always just type an address.
 */
const PlaceAutocompleteInput: React.FC<PlaceAutocompleteInputProps> = ({
  value,
  placeholder,
  autoFocus,
  disabled,
  onChange,
  onCommit,
  onPlaceSelected,
}) => {
  const enabled = useMemo(() => isPlacesConfigured(), []);
  const listId = useId();

  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [isResolving, setIsResolving] = useState(false);
  // Why Google is not answering, when it isn't — shown under the input so a
  // misconfigured key looks like a misconfigured key rather than a dead field.
  const [placesError, setPlacesError] = useState<string | null>(() => getPlacesError());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<PlaceSessionToken | null>(null);
  // Guards against a slow response for an earlier keystroke overwriting a
  // newer one, and against setting state after unmount.
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  // Set while a suggestion is being applied so the resulting value change is
  // not treated as fresh typing (which would immediately reopen the dropdown).
  const applyingRef = useRef(false);
  // Suggestions are only ever offered for something the user typed. Without
  // this, opening the profile panel on a subject that already has an address
  // would pop the dropdown open on its own, over the rest of the form.
  const hasTypedRef = useRef(false);

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => subscribePlacesError(() => setPlacesError(getPlacesError())), []);

  const closeList = useCallback(() => {
    setIsOpen(false);
    setHighlighted(-1);
  }, []);

  // Look up suggestions for the current text, debounced.
  useEffect(() => {
    if (!enabled || disabled) return;
    if (applyingRef.current) {
      applyingRef.current = false;
      return;
    }
    if (!hasTypedRef.current) return;

    const query = value.trim();
    if (query.length < 2) {
      setPredictions([]);
      closeList();
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      if (!sessionRef.current) {
        sessionRef.current = await createSessionToken();
      }
      const results = await fetchPlacePredictions(query, sessionRef.current);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      setPredictions(results);
      setIsOpen(results.length > 0);
      setHighlighted(-1);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [closeList, disabled, enabled, value]);

  // Clicking anywhere else closes the list without changing the typed text.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closeList();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [closeList, isOpen]);

  const applyPrediction = useCallback(async (prediction: PlacePrediction) => {
    applyingRef.current = true;
    hasTypedRef.current = false;
    // Cancel any in-flight suggestion request for the old text.
    requestIdRef.current++;
    closeList();
    setIsResolving(true);

    const place = await fetchPlaceLocation(prediction.placeId, sessionRef.current);
    // The session ends with the details lookup; the next edit starts a new one.
    sessionRef.current = null;

    if (!mountedRef.current) return;
    setIsResolving(false);

    if (place) {
      onPlaceSelected(place);
      return;
    }

    // Details failed (offline, quota, revoked key) — keep the address text the
    // user picked rather than losing their choice; it just has no coordinates.
    applyingRef.current = true;
    onChange(prediction.description);
    onCommit?.();
  }, [closeList, onChange, onCommit, onPlaceSelected]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || predictions.length === 0) {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % predictions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => (current <= 0 ? predictions.length - 1 : current - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const prediction = predictions[highlighted] ?? predictions[0];
      if (prediction) void applyPrediction(prediction);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeList();
    }
  };

  return (
    <div className="place-autocomplete" ref={containerRef}>
      <input
        type="text"
        className="editable-input place-autocomplete__input"
        value={value}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        role={enabled ? "combobox" : undefined}
        aria-expanded={enabled ? isOpen : undefined}
        aria-controls={enabled ? listId : undefined}
        aria-autocomplete={enabled ? "list" : undefined}
        onChange={(event) => {
          hasTypedRef.current = true;
          onChange(event.target.value);
        }}
        // A click on a suggestion blurs the input first, so let the click land
        // before committing the half-typed text.
        onBlur={() => window.setTimeout(() => { if (mountedRef.current) onCommit?.(); }, 150)}
        onKeyDown={handleKeyDown}
      />
      {isResolving ? <span className="place-autocomplete__status">Načítám…</span> : null}
      {enabled && placesError && !isOpen ? (
        <div className="place-autocomplete__error" role="status">{placesError}</div>
      ) : null}
      {isOpen && predictions.length > 0 ? (
        <ul className="place-autocomplete__list" id={listId} role="listbox">
          {predictions.map((prediction, index) => (
            <li key={prediction.placeId} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                className={`place-autocomplete__option${index === highlighted ? " is-highlighted" : ""}`}
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void applyPrediction(prediction)}
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
  );
};

export default PlaceAutocompleteInput;
