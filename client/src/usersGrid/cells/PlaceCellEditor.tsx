import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import type { ICellEditorParams } from "ag-grid-community";
import PlaceAutocompleteInput from "../components/PlaceAutocompleteInput";
import type { PlaceLocation } from "../googlePlaces";
import "./PlaceCellEditor.css";

interface PlaceCellEditorRef {
  getValue: () => string;
  isPopup: () => boolean;
}

export interface PlaceCellEditorParams extends ICellEditorParams {
  /**
   * Called when the user picks a place rather than typing free text. The grid
   * itself only carries the address string, so the section stashes the
   * coordinates here and saves them alongside the address in onCellValueChanged.
   */
  onPlacePicked?: (place: PlaceLocation) => void;
}

/**
 * Lokalita cell editor — the same Google Maps address picker the profile panel
 * uses, in a popup so the suggestion list is not clipped by the row.
 *
 * Typing and committing free text behaves exactly like the plain text editor it
 * replaces; picking a suggestion additionally reports the coordinates.
 */
const PlaceCellEditor = forwardRef<PlaceCellEditorRef, PlaceCellEditorParams>((params, ref) => {
  const [value, setValue] = useState<string>(() => String(params.value ?? ""));
  const valueRef = useRef(value);
  // Guards the commit so a blur that follows an explicit pick cannot write the
  // half-typed text back over the address that was just chosen.
  const committedRef = useRef(false);

  const setBoth = useCallback((next: string) => {
    valueRef.current = next;
    setValue(next);
  }, []);

  const onPlacePicked = params.onPlacePicked
    ?? (params as unknown as { cellEditorParams?: PlaceCellEditorParams }).cellEditorParams?.onPlacePicked;

  useImperativeHandle(ref, () => ({
    getValue: () => valueRef.current,
    isPopup: () => true,
  }), []);

  // Write through the row node and cancel the edit, rather than leaving the
  // value for ag-Grid to collect on close: a popup editor loses focus to
  // whatever the user clicked next, and the resulting close raced the pick.
  const commit = useCallback((next: string) => {
    if (committedRef.current) return;
    committedRef.current = true;

    const colId = params.column?.getColId?.() ?? params.column?.getId?.();
    if (params.node && colId != null && next !== String(params.value ?? "")) {
      params.node.setDataValue(colId, next);
    }
    params.api.stopEditing(true);
  }, [params.api, params.column, params.node, params.value]);

  const handlePlaceSelected = useCallback((place: PlaceLocation) => {
    setBoth(place.address);
    // Before the write, so onCellValueChanged sees the coordinates that belong
    // to the address it is about to save.
    onPlacePicked?.(place);
    commit(place.address);
  }, [commit, onPlacePicked, setBoth]);

  return (
    <div className="place-cell-editor">
      <PlaceAutocompleteInput
        value={value}
        autoFocus
        placeholder="Zadejte adresu"
        onChange={setBoth}
        onCommit={() => commit(valueRef.current)}
        onPlaceSelected={handlePlaceSelected}
      />
    </div>
  );
});

PlaceCellEditor.displayName = "PlaceCellEditor";

export default PlaceCellEditor;
