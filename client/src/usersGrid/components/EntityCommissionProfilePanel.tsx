import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProfileDocument, ProfileNote } from "../types/profile";
import { useAuth } from "../../auth/AuthContext";
import { getApprovalStatusMeta } from "../utils/approvalStatus";
import type { DocumentBreadcrumb } from "../hooks/useProfileDocuments";
import DocumentExplorer from "./DocumentExplorer";
import ThemeToggleButton from "../../components/ThemeToggleButton";
import FieldSelectInput, { type FieldPickerConfig } from "./FieldSelectInput";
import type { FieldOption } from "../fieldOptions";
import { SPECIALIZATION_DROPDOWN_LABELS } from "../cells/fieldDropdown";
import {
  parseMultiValue,
  serializeMultiValue,
  serializeSpecializationMap,
  type SpecializationMap,
} from "../multiValue";
import PlaceAutocompleteInput from "./PlaceAutocompleteInput";
import HierarchyEditor, { type HierarchyKind } from "./HierarchyEditor";
import type { CompanySource, RegionSource } from "../hierarchy";
import {
  buildMapsUrl,
  formatCoordinates,
  pruneLocationGeo,
  serializeLocationGeo,
  type LocationGeoMap,
} from "../locationGeo";
import type { DealSubjectOption } from "../dealLink";
import type { LinkableNamespace } from "../sectionLink";
import DealSubjectPicker, { type DealPickerAnchor } from "./DealSubjectPicker";
import "./EntityCommissionProfilePanel.css";

// Config for the specialization dropdown nested under each Obor value. Options
// are keyed per obor value and persist per namespace, exactly like custom obor
// options. The chosen values live on the obor field as `specializationValues`.
// Config for the Google Maps address picker used by the Lokalita field. The
// coordinates picked for each address are saved as a JSON map under `fieldKey`
// on the entity, and handed to the field as `placeValues`.
export interface PlacePickerConfig {
  // Entity key the serialized address -> coordinates map is saved under.
  fieldKey: string;
}

export interface SpecializationPickerConfig {
  // Entity key the serialized obor -> specialization map is saved under.
  fieldKey: string;
  getOptions: (oborValue: string) => FieldOption[];
  onCreateOption?: (oborValue: string, value: string) => Promise<FieldOption | void> | FieldOption | void;
  // Return value is ignored — the hook resolves with the deleted row.
  onDeleteOption?: (optionId: number) => Promise<unknown> | void;
}

// =============================================================================
// TYPES
// =============================================================================

export interface EditableField {
  key: string;
  label: string;
  value: string | boolean | string[] | null;
  type: 'text' | 'textarea' | 'select' | 'field-select' | 'multi-select' | 'multi-value' | 'hierarchy' | 'boolean' | 'date';
  options?: Array<string | { value: string; label: string; description?: string }>;
  isMultiline?: boolean;
  placeholder?: string;
  // For type === 'multi-value': how each individual value is edited. The stored
  // value is a single scalar (one value) or a JSON array string (several).
  multiValueEditor?: 'text' | 'select' | 'field-select' | 'place';
  // For the Obor multi-value field: the current obor -> specialization choices.
  // Rendered as a nested dropdown under each obor row when a specializationPicker
  // is supplied.
  specializationValues?: SpecializationMap;
  // For the Lokalita multi-value field: the coordinates already stored for each
  // address. Rendered as a small hint under the row when a placePicker is
  // supplied.
  placeValues?: LocationGeoMap;
  // For type === 'hierarchy': which nested tree to edit, and the subject values
  // it is read from / written back to (see hierarchy.ts). A hierarchy field
  // owns several columns at once, so it saves a whole batch of updates rather
  // than the single `key`/`value` pair the other types use.
  hierarchyKind?: HierarchyKind;
  hierarchySource?: (CompanySource & RegionSource) | null;
  // For a Kraj hierarchy: the Kraj options offered at the top level.
  hierarchyParentOptions?: string[];
}

/**
 * Persisting one field edit. Most fields save a single key; a hierarchy field
 * saves the tree column together with the flat mirror columns it derives, so it
 * hands over a whole record and the panel writes them in one update.
 */
export type FieldSaveValue = string | boolean | string[] | null;
export type FieldSaveHandler = (
  keyOrUpdates: string | Record<string, FieldSaveValue>,
  value?: FieldSaveValue
) => void;

export interface FieldGroup {
  title: string;
  fields: EditableField[];
  color?: 'purple' | 'green' | 'orange' | 'gray';
}

export interface EntityData {
  id: number;
  entity_id: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  groups: FieldGroup[];
}

export interface CommissionData {
  id: number;
  commission_id: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  groups: FieldGroup[];
}

export interface LinkedCommissionItem {
  id: number;
  commission_id: string;
  status: string;
  title: string;
  subtitle?: string | null;
}

export interface SectionLinkToggle {
  key: string;
  label: string;
  checked: boolean;
  busy?: boolean;
  onChange: (checked: boolean) => void;
}

// One participant of a commission's deal: a subject of some type, together with
// the mirror commission that joins it to the deal.
export interface DealMemberView {
  /** Stable list key — internal ids repeat across sections. */
  key: string;
  code: string | null;
  name: string | null;
  commissionId: string | null;
  /** Set only when this participant lives in a different section than the commission. */
  namespaceLabel?: string | null;
  /** The commission the panel is open on. It has no remove button of its own. */
  self: boolean;
  onDetach?: () => void;
}

// One role (Klient / Partner / Tipař) of a commission's deal, holding every
// participant of that type. `self` marks the type of the section the panel is
// open in — that role always lists this commission, and can still take further
// participants beside it. A participant may come from any section, so `onAttach`
// carries the one it was picked from.
export interface DealSlotView {
  type: 'client' | 'partner' | 'tiper';
  label: string;
  self: boolean;
  /** Accusative form of `label`, for the "Připojit ___" button. */
  addLabel: string;
  members: DealMemberView[];
  options: DealSubjectOption[];
  busy: boolean;
  onAttach: (namespace: LinkableNamespace, entityId: number) => void;
}

export interface DealLinkConfig {
  slots: DealSlotView[];
  title?: string;
  optional?: 'tiper';
}

interface EntityCommissionProfilePanelProps {
  open: boolean;
  entityType: 'partner' | 'client' | 'tiper';
  entityLabel: string;
  entity: EntityData | null;
  commission: CommissionData | null;
  linkedCommissions?: LinkedCommissionItem[];
  selectedCommissionId?: number | null;
  onSelectCommission?: (commissionId: number) => void;
  onDuplicateEntityCommission?: () => void;
  onDuplicateCommission?: () => void;
  onCreateCommission?: () => void;
  onRemoveCommission?: () => void;
  otherTypeLabel?: string;
  onCopyToOtherType?: () => void;
  entitySectionLinks?: SectionLinkToggle[];
  commissionSectionLinks?: SectionLinkToggle[];
  dealLink?: DealLinkConfig | null;
  fieldPicker?: FieldPickerConfig;
  specializationPicker?: SpecializationPickerConfig;
  placePicker?: PlacePickerConfig;

  // Callbacks
  onClose: () => void;
  onUpdateEntity?: (entityId: number, updates: Record<string, unknown>) => Promise<void> | void;
  onUpdateCommission?: (commissionId: number, updates: Record<string, unknown>) => Promise<void> | void;
  
  // Documents
  documents?: ProfileDocument[];
  visibleDocuments?: ProfileDocument[];
  documentsLoading?: boolean;
  documentsUploading?: boolean;
  onUploadDocument?: (file: File) => Promise<void> | void;
  onUploadDocuments?: (files: File[]) => Promise<void> | void;
  onUploadFolderTree?: (files: File[]) => Promise<void> | void;
  onExtractZipDocument?: (documentId: number) => Promise<boolean | void> | boolean | void;
  onCreateFolder?: (name: string) => Promise<void> | void;
  onRenameDocument?: (documentId: number, filename: string) => Promise<boolean | void> | boolean | void;
  onUpdateDocumentColor?: (documentId: number, labelColor: string | null) => Promise<boolean | void> | boolean | void;
  onDeleteDocument?: (documentId: number) => Promise<boolean | void> | boolean | void;
  onArchiveDocument?: (documentId: number) => Promise<boolean | void> | boolean | void;
  onUnarchiveDocument?: (documentId: number) => Promise<boolean | void> | boolean | void;
  onMoveDocument?: (documentId: number, parentId: number | null) => Promise<boolean | void> | boolean | void;
  currentDocumentFolderId?: number | null;
  documentBreadcrumbs?: DocumentBreadcrumb[];
  documentFolderOptions?: DocumentBreadcrumb[];
  onOpenDocumentFolder?: (folderId: number) => void;
  onGoToDocumentFolder?: (folderId: number | null) => void;
  onGoBackDocumentFolder?: () => void;
  canMoveDocumentTo?: (documentId: number, parentId: number | null) => boolean;
  getDocumentPath?: (documentId: number) => string;
  getFolderItemCount?: (folderId: number) => number;
  archivedDocuments?: ProfileDocument[];
  documentDownloadBaseUrl?: string;
  
  // Notes
  notes?: ProfileNote[];
  notesLoading?: boolean;
  notesCreating?: boolean;
  onAddNote?: (content: string) => Promise<void> | void;
  onUpdateNote?: (noteId: number, content: string) => Promise<void> | void;
  onDeleteNote?: (noteId: number) => Promise<boolean | void> | boolean | void;
}

type ProfilePanelView = 'details' | 'documents';

// =============================================================================
// EDITABLE FIELD COMPONENT
// =============================================================================

interface EditableFieldCellProps {
  field: EditableField;
  onSave: FieldSaveHandler;
  fieldPicker?: FieldPickerConfig;
  specializationPicker?: SpecializationPickerConfig;
  placePicker?: PlacePickerConfig;
}

const normalizeFieldOptions = (options: EditableField['options']) =>
  (options || []).map((option) => (
    typeof option === 'string'
      ? { value: option, label: option }
      : option
  ));

const areEditableValuesEqual = (
  left: string | boolean | string[] | null,
  right: string | boolean | string[] | null
) => {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }

    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  return left === right;
};

const renderApprovalStatusBadge = (status: string, compact = false) => {
  const meta = getApprovalStatusMeta(status);
  if (!meta) {
    return null;
  }

  const className = compact ? "ec-mini-status-badge" : "ec-status-badge";

  return (
    <span
      className={className}
      style={{ "--ec-status-color": meta.color } as React.CSSProperties}
    >
      <span className={`${className}__dot`} aria-hidden="true" />
      {meta.label}
    </span>
  );
};

const getInitialEditValue = (field: EditableField): string | boolean | string[] => {
  if (field.type === 'multi-select') {
    return Array.isArray(field.value) ? field.value : [];
  }

  if (field.type === 'boolean') {
    return field.value === true ? 'true' : 'false';
  }

  return field.value === null || field.value === undefined ? '' : String(field.value);
};

// A stable id lets text inputs keep focus as the surrounding list re-renders.
interface MultiValueRow {
  id: number;
  value: string;
}

interface MultiValueEditorProps {
  field: EditableField;
  onSave: FieldSaveHandler;
  fieldPicker?: FieldPickerConfig;
  specializationPicker?: SpecializationPickerConfig;
  placePicker?: PlacePickerConfig;
  // Profile panel (default): commit text on blur, so each edit is one save.
  // Create modal: commit on every keystroke, because the form is submitted as a
  // whole and a not-yet-blurred value would otherwise be lost.
  commitOnChange?: boolean;
}

// Editor for a subject field that can hold several values (Obor, Společnost,
// Kraj, Lokalita). Each value gets its own inline editor plus a remove button,
// and a "+" adds another. Persisted as a single scalar / JSON array via
// serializeMultiValue. Reused by the create modal's DraftField.
export const MultiValueEditor: React.FC<MultiValueEditorProps> = ({ field, onSave, fieldPicker, specializationPicker, placePicker, commitOnChange = false }) => {
  const editor = field.multiValueEditor ?? 'text';
  const normalizedOptions = useMemo(() => normalizeFieldOptions(field.options), [field.options]);
  const showSpecialization = editor === 'field-select' && Boolean(specializationPicker);
  const specValues = field.specializationValues ?? {};
  const usePlacePicker = editor === 'place';
  const geoValues = field.placeValues ?? {};

  const idRef = useRef(0);
  const makeRow = useCallback((value: string): MultiValueRow => ({ id: idRef.current++, value }), []);

  const [rows, setRows] = useState<MultiValueRow[]>(() => parseMultiValue(field.value).map(makeRow));
  const rowsRef = useRef(rows);
  const [autoFocusId, setAutoFocusId] = useState<number | null>(null);

  const setRowsSafe = useCallback((next: MultiValueRow[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);

  // Re-sync from the persisted value after a server round-trip. Compares the
  // canonical serialized forms so a user's uncommitted typing is never clobbered
  // (this only fires when the stored value actually changes).
  const persisted = serializeMultiValue(parseMultiValue(field.value)) ?? "";
  useEffect(() => {
    const local = serializeMultiValue(rowsRef.current.map((row) => row.value)) ?? "";
    if (persisted !== local) {
      setRowsSafe(parseMultiValue(field.value).map(makeRow));
    }
    // Only react to changes of the persisted value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persisted]);

  // A ref keeps the spec-map handlers stable while always seeing the latest map.
  const specValuesRef = useRef(specValues);
  specValuesRef.current = specValues;
  const geoValuesRef = useRef(geoValues);
  geoValuesRef.current = geoValues;

  const commit = useCallback((next: MultiValueRow[]) => {
    onSave(field.key, serializeMultiValue(next.map((row) => row.value)));
  }, [field.key, onSave]);

  const commitSpecMap = useCallback((nextMap: SpecializationMap) => {
    if (!specializationPicker) return;
    onSave(specializationPicker.fieldKey, serializeSpecializationMap(nextMap));
  }, [onSave, specializationPicker]);

  // Drop specialization entries for obor values that are no longer selected, so
  // removing/renaming an obor never leaves an orphaned specialization behind.
  const pruneSpecMap = useCallback((oborValues: string[]) => {
    if (!specializationPicker) return;
    const current = specValuesRef.current;
    const allowed = new Set(oborValues.map((value) => value.trim()).filter(Boolean));
    const nextMap: SpecializationMap = {};
    for (const [key, value] of Object.entries(current)) {
      if (allowed.has(key)) nextMap[key] = value;
    }
    if ((serializeSpecializationMap(nextMap) ?? "") !== (serializeSpecializationMap(current) ?? "")) {
      commitSpecMap(nextMap);
    }
  }, [commitSpecMap, specializationPicker]);

  const commitGeoMap = useCallback((nextMap: LocationGeoMap) => {
    if (!placePicker) return;
    onSave(placePicker.fieldKey, serializeLocationGeo(nextMap));
  }, [onSave, placePicker]);

  // Coordinates only make sense for an address that is still listed, so an
  // address that was removed or retyped by hand drops its coordinates with it.
  const pruneGeoMap = useCallback((addresses: string[]) => {
    if (!placePicker) return;
    const current = geoValuesRef.current;
    const nextMap = pruneLocationGeo(current, addresses);
    if ((serializeLocationGeo(nextMap) ?? "") !== (serializeLocationGeo(current) ?? "")) {
      commitGeoMap(nextMap);
    }
  }, [commitGeoMap, placePicker]);

  const handleSpecChange = useCallback((oborValue: string, value: string) => {
    // Rebuild from the obor values currently listed, so a key that no longer
    // lines up with any of them (an obor renamed in the catalog, a record from
    // an older version) is normalised away by this edit instead of lingering.
    const allowed = new Set(rowsRef.current.map((row) => row.value.trim()).filter(Boolean));
    const nextMap: SpecializationMap = {};
    for (const [key, existing] of Object.entries(specValuesRef.current)) {
      if (allowed.has(key)) nextMap[key] = existing;
    }

    if (value) {
      nextMap[oborValue] = value;
    } else {
      delete nextMap[oborValue];
    }
    commitSpecMap(nextMap);
  }, [commitSpecMap]);

  const handleChoice = useCallback((id: number, value: string) => {
    const next = rowsRef.current.map((row) => (row.id === id ? { ...row, value } : row));
    setRowsSafe(next);
    commit(next);
    pruneSpecMap(next.map((row) => row.value));
    pruneGeoMap(next.map((row) => row.value));
  }, [commit, pruneGeoMap, pruneSpecMap, setRowsSafe]);

  // A suggestion was picked: store the place's formatted address in this row
  // and its coordinates under that address, in that order, so the two writes
  // never leave a coordinate keyed to an address the subject does not hold.
  const handlePlaceSelected = useCallback((id: number, place: { address: string; lat: number; lng: number; placeId: string }) => {
    const next = rowsRef.current.map((row) => (row.id === id ? { ...row, value: place.address } : row));
    setRowsSafe(next);
    commit(next);

    if (!placePicker) return;
    const addresses = next.map((row) => row.value);
    const nextMap = pruneLocationGeo(geoValuesRef.current, addresses);
    nextMap[place.address] = { lat: place.lat, lng: place.lng, place_id: place.placeId };
    commitGeoMap(nextMap);
  }, [commit, commitGeoMap, placePicker, setRowsSafe]);

  const handleTextChange = useCallback((id: number, value: string) => {
    const next = rowsRef.current.map((row) => (row.id === id ? { ...row, value } : row));
    setRowsSafe(next);
    if (commitOnChange) commit(next);
  }, [commit, commitOnChange, setRowsSafe]);

  const handleTextBlur = useCallback(() => {
    if (!commitOnChange) commit(rowsRef.current);
    pruneGeoMap(rowsRef.current.map((row) => row.value));
  }, [commit, commitOnChange, pruneGeoMap]);

  const handleRemove = useCallback((id: number) => {
    const next = rowsRef.current.filter((row) => row.id !== id);
    setRowsSafe(next);
    commit(next);
    pruneSpecMap(next.map((row) => row.value));
    pruneGeoMap(next.map((row) => row.value));
  }, [commit, pruneGeoMap, pruneSpecMap, setRowsSafe]);

  const handleAdd = useCallback(() => {
    const row = makeRow("");
    setRowsSafe([...rowsRef.current, row]);
    setAutoFocusId(row.id);
  }, [makeRow, setRowsSafe]);

  const addLabel = editor === 'field-select'
    ? 'Přidat další obor'
    : editor === 'place'
      ? 'Přidat další adresu'
      : 'Přidat další';

  const renderRowEditor = (row: MultiValueRow) => {
    if (editor === 'field-select' && fieldPicker) {
      return (
        <FieldSelectInput
          value={row.value}
          placeholder={field.placeholder || field.label}
          fieldOptions={fieldPicker.fieldOptions}
          groupedFieldOptions={fieldPicker.groupedFieldOptions}
          onChange={(nextValue) => handleChoice(row.id, nextValue)}
          onCreateFieldOption={fieldPicker.onCreateFieldOption}
          onDeleteFieldOption={fieldPicker.onDeleteFieldOption}
        />
      );
    }

    if (usePlacePicker) {
      return (
        <PlaceAutocompleteInput
          value={row.value}
          placeholder={field.placeholder || field.label}
          autoFocus={row.id === autoFocusId}
          coordinates={geoValues[row.value.trim()]}
          onChange={(nextValue) => handleTextChange(row.id, nextValue)}
          onCommit={handleTextBlur}
          onPlaceSelected={(place) => handlePlaceSelected(row.id, place)}
        />
      );
    }

    if (editor === 'select') {
      return (
        <select
          className="editable-input select"
          value={row.value}
          onChange={(e) => handleChoice(row.id, e.target.value)}
        >
          <option value="">— Vyberte —</option>
          {normalizedOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        type="text"
        className="editable-input"
        value={row.value}
        autoFocus={row.id === autoFocusId}
        onChange={(e) => handleTextChange(row.id, e.target.value)}
        onBlur={handleTextBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={field.placeholder || field.label}
      />
    );
  };

  // Nested "Zaměření" dropdown for a chosen obor value. Options are scoped to
  // that obor and can be created/removed inline, mirroring the obor picker.
  // The "×" clears only this row's chosen specialization (it stays in the
  // shared catalog for other subjects) — deleting the option itself from the
  // dropdown is a separate, catalog-wide action.
  const renderSpecialization = (row: MultiValueRow) => {
    const oborValue = row.value.trim();
    if (!showSpecialization || !specializationPicker || !oborValue) {
      return null;
    }

    const options = specializationPicker.getOptions(oborValue);
    const selectedValue = specValues[oborValue] ?? "";

    return (
      <div className="mv-editor-specialization">
        <span className="mv-editor-specialization-label">Zaměření</span>
        <FieldSelectInput
          value={selectedValue}
          placeholder="Vyberte zaměření"
          fieldOptions={options}
          groupedFieldOptions={[{ label: "Zaměření", options }]}
          labels={SPECIALIZATION_DROPDOWN_LABELS}
          onChange={(nextValue) => handleSpecChange(oborValue, nextValue)}
          onCreateFieldOption={
            specializationPicker.onCreateOption
              ? (value) => specializationPicker.onCreateOption!(oborValue, value)
              : undefined
          }
          onDeleteFieldOption={
            specializationPicker.onDeleteOption
              ? (optionId) => Promise.resolve(specializationPicker.onDeleteOption!(optionId)).then(() => undefined)
              : undefined
          }
        />
        {selectedValue ? (
          <button
            type="button"
            className="mv-editor-specialization-clear"
            onClick={() => handleSpecChange(oborValue, "")}
            title="Odebrat zaměření"
            aria-label="Odebrat zaměření"
          >
            ×
          </button>
        ) : null}
      </div>
    );
  };

  // Read-only confirmation that this address came from Google Maps, linking
  // out to it. Absent for addresses that were simply typed.
  const renderCoordinates = (row: MultiValueRow) => {
    const address = row.value.trim();
    const coordinates = usePlacePicker && address ? geoValues[address] : undefined;
    if (!coordinates) return null;

    return (
      <div className="mv-editor-coordinates">
        <span aria-hidden="true">📍</span>
        <a href={buildMapsUrl(address, coordinates)} target="_blank" rel="noopener noreferrer">
          {formatCoordinates(coordinates)}
        </a>
      </div>
    );
  };

  return (
    <div className="editable-field editing mv-editor">
      {rows.length > 0 ? (
        <div className="mv-editor-rows">
          {rows.map((row) => (
            <div key={row.id} className="mv-editor-row-group">
              <div className="mv-editor-row">
                <div className="mv-editor-input">{renderRowEditor(row)}</div>
                <button
                  type="button"
                  className="mv-editor-remove"
                  onClick={() => handleRemove(row.id)}
                  title="Odebrat hodnotu"
                  aria-label="Odebrat hodnotu"
                >
                  ×
                </button>
              </div>
              {renderSpecialization(row)}
              {renderCoordinates(row)}
            </div>
          ))}
        </div>
      ) : null}
      <button type="button" className="mv-editor-add" onClick={handleAdd}>
        <span className="mv-editor-add-icon" aria-hidden="true">+</span>
        {addLabel}
      </button>
    </div>
  );
};

const EditableFieldCell: React.FC<EditableFieldCellProps> = ({ field, onSave, fieldPicker, specializationPicker, placePicker }) => {

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string | boolean | string[]>(() => getInitialEditValue(field));
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const normalizedOptions = useMemo(() => normalizeFieldOptions(field.options), [field.options]);

  useEffect(() => {
    if (!isEditing || !inputRef.current) return;
    inputRef.current.focus();

    // Mounting a <select> only focuses it; the browser's native dropdown still
    // needs its own click to open. showPicker() opens it immediately so the
    // first click both enters edit mode and shows the options.
    if (field.type === 'select' || field.type === 'boolean') {
      const el = inputRef.current as HTMLSelectElement;
      if (typeof el.showPicker === 'function') {
        try {
          el.showPicker();
        } catch {
          // Unsupported in this context (e.g. no user activation) -- the
          // select is still focused, just falls back to a second click.
        }
      }
    }
  }, [isEditing, field.type]);

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditValue(getInitialEditValue(field));
  };

  // Takes the value to commit explicitly: selects save the option straight from
  // the change event, because reading editValue here would see the pre-change
  // render's value and drop the edit.
  const commitValue = (rawValue: string | boolean | string[]) => {
    setIsEditing(false);
    let finalValue: string | boolean | string[] | null;

    if (field.type === 'multi-select') {
      finalValue = Array.isArray(rawValue) ? rawValue : [];
    } else if (field.type === 'boolean') {
      finalValue = rawValue === 'true';
    } else {
      const stringValue = String(rawValue).trim();
      finalValue = stringValue || null;
    }

    if (!areEditableValuesEqual(finalValue, field.value)) {
      onSave(field.key, finalValue);
    }
  };

  const handleSave = () => commitValue(editValue);

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue(getInitialEditValue(field));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const displayValue = useMemo(() => {
    if (Array.isArray(field.value)) {
      if (field.value.length === 0) {
        return <span className="field-empty">—</span>;
      }

      const labels = field.value.map((value) => (
        normalizedOptions.find((option) => option.value === value)?.label ?? value
      ));

      return labels.join(', ');
    }

    if (field.value === null || field.value === undefined || field.value === '') {
      return <span className="field-empty">—</span>;
    }
    if (field.type === 'boolean') {
      return field.value ? 'Ano' : 'Ne';
    }
    return String(field.value);
  }, [field.type, field.value, normalizedOptions]);

  // Multi-value fields (Obor, Společnost, Kraj, Lokalita) render their own
  // add/remove editor and manage persistence internally.
  if (field.type === 'hierarchy') {
    return (
      <HierarchyEditor
        kind={field.hierarchyKind ?? 'company'}
        source={field.hierarchySource}
        onSave={(updates) => onSave(updates)}
        fieldPicker={fieldPicker}
        specializationPicker={specializationPicker}
        regionOptions={field.hierarchyParentOptions}
        parentPlaceholder={field.placeholder}
      />
    );
  }

  if (field.type === 'multi-value') {
    return <MultiValueEditor field={field} onSave={onSave} fieldPicker={fieldPicker} specializationPicker={specializationPicker} placePicker={placePicker} />;
  }

  // The "Obor" picker is always shown as a clickable dropdown trigger (like the
  // ag-grid table cell), rather than the readonly-until-click pattern.
  if (field.type === 'field-select' && fieldPicker) {
    return (
      <div className="editable-field editing">
        <FieldSelectInput
          value={typeof field.value === 'string' ? field.value : ''}
          placeholder={field.placeholder || field.label}
          fieldOptions={fieldPicker.fieldOptions}
          groupedFieldOptions={fieldPicker.groupedFieldOptions}
          onChange={(nextValue) => onSave(field.key, nextValue || null)}
          onCreateFieldOption={fieldPicker.onCreateFieldOption}
          onDeleteFieldOption={fieldPicker.onDeleteFieldOption}
        />
      </div>
    );
  }

  if (isEditing) {
    if (field.type === 'textarea') {
      return (
        <div className="editable-field editing">
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className="editable-input textarea"
            value={typeof editValue === 'string' ? editValue : ''}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={field.placeholder || field.label}
            rows={3}
          />
        </div>
      );
    }

    if ((field.type === 'select' || field.type === 'field-select') && normalizedOptions.length > 0) {
      return (
        <div className="editable-field editing">
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            className="editable-input select"
            value={String(editValue)}
            onChange={(e) => {
              const nextValue = e.target.value;
              setEditValue(nextValue);
              // Auto-save on select change
              commitValue(nextValue);
            }}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
          >
            <option value="">— Vyberte —</option>
            {normalizedOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === 'multi-select' && normalizedOptions.length > 0) {
      const selectedValues = Array.isArray(editValue) ? editValue : [];

      return (
        <div className="editable-field editing editable-field-multiselect">
          <div className="editable-multiselect-list">
            {normalizedOptions.map((option) => {
              const isSelected = selectedValues.includes(option.value);

              return (
                <label key={option.value} className={`editable-multiselect-option ${isSelected ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      setEditValue(
                        isSelected
                          ? selectedValues.filter((value) => value !== option.value)
                          : [...selectedValues, option.value]
                      );
                    }}
                  />
                  <span className="editable-multiselect-copy">
                    <span className="editable-multiselect-label">{option.label}</span>
                    {option.description ? <span className="editable-multiselect-description">{option.description}</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="editable-multiselect-actions">
            <button type="button" className="editable-multiselect-action secondary" onClick={handleCancel}>Zrušit</button>
            <button type="button" className="editable-multiselect-action primary" onClick={handleSave}>Uložit</button>
          </div>
        </div>
      );
    }

    if (field.type === 'boolean') {
      return (
        <div className="editable-field editing">
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            className="editable-input select"
            value={String(editValue)}
            onChange={(e) => {
              const nextValue = e.target.value;
              setEditValue(nextValue);
              commitValue(nextValue);
            }}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
          >
            <option value="false">Ne</option>
            <option value="true">Ano</option>
          </select>
        </div>
      );
    }

    if (field.type === 'date') {
      return (
        <div className="editable-field editing">
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="date"
            className="editable-input date"
            value={String(editValue)}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
          />
        </div>
      );
    }

    return (
      <div className="editable-field editing">
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          className="editable-input"
          value={String(editValue)}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={field.placeholder || field.label}
        />
      </div>
    );
  }

  return (
    <div 
      className="editable-field readonly"
      onClick={handleStartEdit}
      title="Kliknutím upravit"
    >
      <span className="field-value">{displayValue}</span>
      <span className="edit-icon">✎</span>
    </div>
  );
};

// =============================================================================
// FIELD GROUP COMPONENT
// =============================================================================

interface FieldGroupComponentProps {
  group: FieldGroup;
  onSave: FieldSaveHandler;
  fieldPicker?: FieldPickerConfig;
  specializationPicker?: SpecializationPickerConfig;
  placePicker?: PlacePickerConfig;
}

const FieldGroupComponent: React.FC<FieldGroupComponentProps> = ({ group, onSave, fieldPicker, specializationPicker, placePicker }) => {
  const colorClass = group.color ? `group-${group.color}` : '';

  return (
    <div className={`field-group ${colorClass}`}>
      <h4 className="field-group-title">{group.title}</h4>
      <div className="field-group-content">
        {group.fields.map(field => (
          <div key={field.key} className={`field-row ${field.isMultiline ? 'multiline' : ''}`}>
            <label className="field-label">{field.label}</label>
            <EditableFieldCell field={field} onSave={onSave} fieldPicker={fieldPicker} specializationPicker={specializationPicker} placePicker={placePicker} />
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// DEAL LINK SECTION — the three sides (Klient / Partner / Tipař) of a commission
// =============================================================================

const DealLinkMemberRow: React.FC<{ member: DealMemberView; busy: boolean }> = ({ member, busy }) => {
  const text = `${member.code ?? ''}${member.name ? ` — ${member.name}` : ''}` || '—';

  return (
    <span className={`ec-deal-slot-value ${member.self ? 'self' : ''}`}>
      <span className="ec-deal-slot-name" title={member.commissionId ?? undefined}>{text}</span>
      {member.self ? <span className="ec-deal-slot-tag">tato zakázka</span> : null}
      {member.namespaceLabel ? (
        <span className="ec-deal-slot-section" title={`Sekce ${member.namespaceLabel}`}>
          {member.namespaceLabel}
        </span>
      ) : null}
      {member.onDetach ? (
        <button
          type="button"
          className="ec-deal-slot-remove"
          disabled={busy}
          onClick={member.onDetach}
          title="Zrušit propojení"
          aria-label="Zrušit propojení"
        >
          ×
        </button>
      ) : null}
    </span>
  );
};

// Every participant of one role, plus the button that adds another. A deal can
// hold several of each, so the add button stays available once the role has
// members — including on the commission's own role.
const DealLinkSlotRow: React.FC<{ slot: DealSlotView }> = ({ slot }) => {
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [pickerAnchor, setPickerAnchor] = useState<DealPickerAnchor | null>(null);

  const openPicker = () => {
    const rect = addButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPickerAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width });
  };

  return (
    <div className={`ec-deal-slot ${slot.self ? 'is-self' : ''} ${slot.members.length > 0 ? 'is-linked' : ''}`}>
      <span className="ec-deal-slot-label">{slot.label}</span>
      <div className="ec-deal-slot-members">
        {slot.members.map((member) => (
          <DealLinkMemberRow key={member.key} member={member} busy={slot.busy} />
        ))}
        <button
          ref={addButtonRef}
          type="button"
          className={`ec-deal-slot-add ${pickerAnchor ? 'is-open' : ''}`}
          disabled={slot.busy || slot.options.length === 0}
          onClick={() => (pickerAnchor ? setPickerAnchor(null) : openPicker())}
        >
          + Připojit {slot.addLabel}
        </button>
        {pickerAnchor ? (
          <DealSubjectPicker
            anchor={pickerAnchor}
            anchorEl={addButtonRef.current}
            typeLabel={slot.addLabel}
            options={slot.options}
            onSelect={(option) => {
              setPickerAnchor(null);
              slot.onAttach(option.namespace, option.id);
            }}
            onClose={() => setPickerAnchor(null)}
          />
        ) : null}
      </div>
    </div>
  );
};

const DealLinkSection: React.FC<{ config: DealLinkConfig }> = ({ config }) => (
  <div className="ec-deal-link">
    <div className="ec-deal-link-header">
      <h4 className="ec-linked-commissions-title">{config.title ?? 'Propojení zakázky'}</h4>
      <p className="ec-linked-commissions-subtitle">
        Klient a Partner tvoří spojenou zakázku, Tipař je nepovinný. Ke každé roli
        lze připojit více subjektů a každý z nich vybrat z kterékoli sekce.
      </p>
    </div>
    <div className="ec-deal-link-slots">
      {config.slots.map((slot) => (
        <DealLinkSlotRow key={slot.type} slot={slot} />
      ))}
    </div>
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const EntityCommissionProfilePanel: React.FC<EntityCommissionProfilePanelProps> = ({
  open,
  entityType,
  entityLabel,
  entity,
  commission,
  linkedCommissions = [],
  selectedCommissionId = null,
  onSelectCommission,
  onDuplicateEntityCommission,
  onDuplicateCommission,
  onCreateCommission,
  onRemoveCommission,
  otherTypeLabel,
  onCopyToOtherType,
  entitySectionLinks,
  commissionSectionLinks,
  dealLink,
  fieldPicker,
  specializationPicker,
  placePicker,
  onClose,
  onUpdateEntity,
  onUpdateCommission,
  visibleDocuments = [],
  documentsLoading = false,
  documentsUploading = false,
  onUploadDocument,
  onUploadDocuments,
  onUploadFolderTree,
  onExtractZipDocument,
  onCreateFolder,
  onRenameDocument,
  onUpdateDocumentColor,
  onDeleteDocument,
  onArchiveDocument,
  onUnarchiveDocument,
  onMoveDocument,
  currentDocumentFolderId = null,
  documentBreadcrumbs = [{ id: null, label: "Hlavní Složka" }],
  documentFolderOptions = [{ id: null, label: "Hlavní Složka" }],
  onOpenDocumentFolder,
  onGoToDocumentFolder,
  onGoBackDocumentFolder,
  canMoveDocumentTo,
  getDocumentPath,
  getFolderItemCount,
  archivedDocuments = [],
  documentDownloadBaseUrl,
  notes,
  notesLoading = false,
  notesCreating = false,
  onAddNote,
  onUpdateNote,
  onDeleteNote
}) => {
  const { user } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const [newNote, setNewNote] = useState("");
  const [editingNote, setEditingNote] = useState<ProfileNote | null>(null);
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<ProfilePanelView>('details');

  // Entity type labels
  const entityTypeLabels = {
    partner: 'Partner',
    client: 'Klient',
    tiper: 'Tipař'
  };

  const duplicateLabels = {
    partner: 'partnera',
    client: 'klienta',
    tiper: 'tipaře'
  };

  const commissionLabel = entityType === 'tiper' ? 'Tip / Zakázka' : 'Zakázka';
  const hasLinkedCommissions = linkedCommissions.length > 0;
  const showDocumentsSection = Boolean(
    onUploadDocument || onUploadDocuments || onCreateFolder || onDeleteDocument || onArchiveDocument || documentsLoading || visibleDocuments.length > 0 || archivedDocuments.length > 0
  );

  const handleEntityFieldSave = useCallback<FieldSaveHandler>((keyOrUpdates, value) => {
    if (!entity || !onUpdateEntity) return;
    onUpdateEntity(
      entity.id,
      typeof keyOrUpdates === 'string' ? { [keyOrUpdates]: value ?? null } : keyOrUpdates
    );
  }, [entity, onUpdateEntity]);

  const handleCommissionFieldSave = useCallback<FieldSaveHandler>((keyOrUpdates, value) => {
    if (!commission || !onUpdateCommission) return;
    onUpdateCommission(
      commission.id,
      typeof keyOrUpdates === 'string' ? { [keyOrUpdates]: value ?? null } : keyOrUpdates
    );
  }, [commission, onUpdateCommission]);

  const handleStartNoteEdit = useCallback((note: ProfileNote) => {
    if (note.author !== user?.username) {
      return;
    }
    setEditingNote(note);
    setNewNote(note.content);
  }, [user?.username]);

  const canEditNote = useCallback((note: ProfileNote) => note.author === user?.username, [user?.username]);

  const handleCancelNoteEdit = useCallback(() => {
    setEditingNote(null);
    setNewNote("");
  }, []);

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim()) return;

    setNoteSubmitting(true);
    try {
      if (editingNote) {
        if (!onUpdateNote) return;
        await Promise.resolve(onUpdateNote(editingNote.id, newNote.trim()));
      } else {
        if (!onAddNote) return;
        await Promise.resolve(onAddNote(newNote.trim()));
      }

      setNewNote("");
      setEditingNote(null);
    } finally {
      setNoteSubmitting(false);
    }
  }, [editingNote, newNote, onAddNote, onUpdateNote]);

  const handleDeleteNote = useCallback(
    (noteId: number) => {
      if (!onDeleteNote) return;
      const confirmed = window.confirm("Opravdu chcete smazat tuto poznámku?");
      if (!confirmed) return;
      if (editingNote?.id === noteId) {
        handleCancelNoteEdit();
      }
      onDeleteNote(noteId);
    },
    [editingNote?.id, handleCancelNoteEdit, onDeleteNote]
  );

  // Keyboard handling
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!showDocumentsSection && activeView === 'documents') {
      setActiveView('details');
    }
  }, [activeView, showDocumentsSection]);

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!open || !entity) {
    return null;
  }

  return (
    <div className="ec-profile-overlay" onMouseDown={handleOverlayMouseDown} role="presentation">
      <div className="ec-profile-panel" ref={panelRef} role="dialog" aria-modal="true">
        
        {/* Header */}
        <header className="ec-profile-header">
          <div className="ec-profile-header-info">
            <span className="ec-profile-type">{entityTypeLabels[entityType]}</span>
            <h2 className="ec-profile-title">{entityLabel}</h2>
            <div className="ec-profile-ids">
              <span className="ec-id-badge entity">{entity.entity_id}</span>
              {commission ? (
                <>
                  <span className="ec-id-separator">→</span>
                  <span className="ec-id-badge commission">{commission.commission_id}</span>
                  {renderApprovalStatusBadge(commission.status)}
                </>
              ) : hasLinkedCommissions ? (
                <span className="ec-linked-count-badge">
                  {linkedCommissions.length} {linkedCommissions.length === 1 ? commissionLabel.toLowerCase() : entityType === 'tiper' ? 'tipy / zakázky' : 'zakázky'}
                </span>
              ) : (
                <span className="ec-standalone-badge">Bez zakázky</span>
              )}
            </div>
          </div>
          <div className="ec-profile-view-switch" role="tablist" aria-label="Zobrazení profilu">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'details'}
              className={`ec-profile-view-tab ${activeView === 'details' ? 'is-active' : ''}`}
              onClick={() => setActiveView('details')}
            >
              Profil
            </button>
            {showDocumentsSection ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'documents'}
                className={`ec-profile-view-tab ${activeView === 'documents' ? 'is-active' : ''}`}
                onClick={() => setActiveView('documents')}
              >
                Dokumenty
              </button>
            ) : null}
          </div>
          <div className="ec-profile-header-actions">
            <ThemeToggleButton variant="icon" />
            {commission && onDuplicateEntityCommission ? (
              <button
                type="button"
                className="ec-header-action"
                onClick={onDuplicateEntityCommission}
                title={`Vytvořit kopii ${duplicateLabels[entityType]} i této zakázky`}
              >
                Duplikovat {duplicateLabels[entityType]}
              </button>
            ) : null}
            {commission && onDuplicateCommission ? (
              <button
                type="button"
                className="ec-header-action secondary"
                onClick={onDuplicateCommission}
                title="Vytvořit kopii této zakázky pod stejným subjektem"
              >
                Duplikovat zakázku
              </button>
            ) : null}
            {onCopyToOtherType && otherTypeLabel ? (
              <button
                type="button"
                className="ec-header-action secondary"
                onClick={onCopyToOtherType}
                title={`Zkopírovat tento subjekt${commission ? ' i se zakázkou' : ''} jako ${otherTypeLabel}`}
              >
                Zkopírovat jako {otherTypeLabel}
              </button>
            ) : null}
            <button
              type="button" 
              className="ec-profile-close" 
              onClick={onClose}
              aria-label="Zavřít"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        {/* Main Content */}
        {activeView === 'details' ? (
          <div className="ec-profile-body">
            {/* Left Column: Entity + Commission Info */}
            <div className="ec-profile-main">
              <div className="ec-profile-columns">
                
                {/* Entity Info Column */}
                <div className="ec-profile-column entity-column">
                  <div className="ec-column-header">
                    <div className="ec-column-heading">
                      <h3 className="ec-column-title">{entityTypeLabels[entityType]}</h3>
                      <span className="ec-column-meta">Datum přidání: {formatDate(entity.createdAt) || "—"}</span>
                    </div>
                    <span className="ec-column-id">{entity.entity_id}</span>
                  </div>
                  {entitySectionLinks && entitySectionLinks.length > 0 ? (
                    <div className="ec-section-link-toggle-group">
                      {entitySectionLinks.map((toggle) => (
                        <label key={toggle.key} className={`ec-section-link-toggle ${toggle.busy ? 'is-busy' : ''}`}>
                          <input
                            type="checkbox"
                            checked={toggle.checked}
                            disabled={toggle.busy}
                            onChange={(event) => toggle.onChange(event.target.checked)}
                          />
                          <span>{toggle.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  <div className="ec-column-content">
                    {entity.groups.map((group, idx) => (
                      <FieldGroupComponent
                        key={`entity-${idx}`}
                        group={group}
                        onSave={handleEntityFieldSave}
                        fieldPicker={fieldPicker}
                        specializationPicker={specializationPicker}
                        placePicker={placePicker}
                      />
                    ))}
                  </div>
                </div>

                {/* Commission Info Column */}
                <div className="ec-profile-column commission-column">
                  <div className="ec-column-header">
                    <div className="ec-column-heading">
                      <h3 className="ec-column-title">{commissionLabel}</h3>
                      <span className="ec-column-meta">Datum přidání: {formatDate(commission?.createdAt) || "—"}</span>
                    </div>
                    <span className="ec-column-id">
                      {commission ? commission.commission_id : hasLinkedCommissions ? `${linkedCommissions.length} položek` : "Zatím žádná"}
                    </span>
                  </div>
                  {commission && commissionSectionLinks && commissionSectionLinks.length > 0 ? (
                    <div className="ec-section-link-toggle-group">
                      {commissionSectionLinks.map((toggle) => (
                        <label key={toggle.key} className={`ec-section-link-toggle ${toggle.busy ? 'is-busy' : ''}`}>
                          <input
                            type="checkbox"
                            checked={toggle.checked}
                            disabled={toggle.busy}
                            onChange={(event) => toggle.onChange(event.target.checked)}
                          />
                          <span>{toggle.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  <div className="ec-column-content">
                    {hasLinkedCommissions ? (
                      <div className="ec-linked-commissions-section">
                        <div className="ec-linked-commissions-header">
                          <div>
                            <h4 className="ec-linked-commissions-title">Navázané zakázky</h4>
                            <p className="ec-linked-commissions-subtitle">Počet odpovídá hodnotě v tabulce subjektů.</p>
                          </div>
                          <div className="ec-linked-commissions-actions">
                            {onRemoveCommission && commission ? (
                              <button type="button" className="ec-header-action danger" onClick={onRemoveCommission}>
                                Odebrat zakázku
                              </button>
                            ) : null}
                            {onCreateCommission ? (
                              <button type="button" className="ec-header-action secondary" onClick={onCreateCommission}>
                                Přidat zakázku
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="ec-linked-commissions-list">
                          {linkedCommissions.map((linkedCommission) => (
                            <div
                              key={linkedCommission.id}
                              className={`ec-linked-commission-item ${selectedCommissionId === linkedCommission.id ? 'selected' : ''}`}
                            >
                              <div className="ec-linked-commission-main">
                                <div className="ec-linked-commission-topline">
                                  <span className="ec-linked-commission-id">{linkedCommission.commission_id}</span>
                                  {renderApprovalStatusBadge(linkedCommission.status, true)}
                                </div>
                                <div className="ec-linked-commission-title">{linkedCommission.title}</div>
                                {linkedCommission.subtitle ? (
                                  <div className="ec-linked-commission-subline">{linkedCommission.subtitle}</div>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                className="ec-linked-commission-open"
                                onClick={() => onSelectCommission?.(linkedCommission.id)}
                                title="Otevřít detail zakázky"
                              >
                                Otevřít
                              </button>
                            </div>
                          ))}
                        </div>

                        {commission ? (
                          <div className="ec-linked-commission-detail">
                            <div className="ec-linked-commission-detail-header">
                              <h4 className="ec-linked-commissions-title">Detail zakázky</h4>
                              <span className="ec-column-id">{commission.commission_id}</span>
                            </div>
                            {dealLink ? <DealLinkSection config={dealLink} /> : null}
                            <div className="ec-linked-commission-detail-groups">
                              {commission.groups.map((group, idx) => (
                                <FieldGroupComponent
                                  key={`commission-${idx}`}
                                  group={group}
                                  onSave={handleCommissionFieldSave}
                                />
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="ec-linked-commission-placeholder">
                            Vyberte zakázku ze seznamu pro otevření detailu.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="ec-no-commission-state">
                        <p className="ec-no-commission-text">Tento subjekt zatím nemá žádnou zakázku.</p>
                        {onCreateCommission ? (
                          <button type="button" className="ec-header-action" onClick={onCreateCommission}>
                            Přidat první zakázku
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Notes */}
            {(onAddNote || (notes && notes.length > 0)) && (
              <div className="ec-profile-sidebar">
                <div className="ec-sidebar-header">
                  <h3 className="ec-section-title">Poznámky</h3>
                </div>
                
                <div className="ec-notes-list">
                  {notesLoading ? (
                    <p className="ec-empty-text">Načítám poznámky...</p>
                  ) : notes && notes.length > 0 ? (
                    notes.map(note => (
                      <div key={note.id} className="ec-note-item">
                        <div className="ec-note-header">
                          <span className="ec-note-author">{note.author}</span>
                          <span className="ec-note-date">{formatDate(note.createdAt)}</span>
                          {note.updatedAt ? <span className="ec-note-edited">upraveno</span> : null}
                          {onUpdateNote && canEditNote(note) && (
                            <button
                              className="ec-note-edit"
                              onClick={() => handleStartNoteEdit(note)}
                              title="Upravit"
                            >
                              ✎
                            </button>
                          )}
                          {onDeleteNote && (
                            <button 
                              className="ec-note-delete"
                              onClick={() => handleDeleteNote(note.id)}
                              title="Smazat"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <div className="ec-note-content">{note.content}</div>
                      </div>
                    ))
                  ) : (
                    <p className="ec-empty-text">Žádné poznámky.</p>
                  )}
                </div>

                {onAddNote && (
                  <div className="ec-notes-input">
                    {editingNote && (
                      <div className="ec-note-editing-info">
                        <span>Upravujete zprávu od {editingNote.author}. Změní se pouze text poznámky.</span>
                        <button type="button" className="ec-note-edit-cancel" onClick={handleCancelNoteEdit}>
                          Zrušit
                        </button>
                      </div>
                    )}
                    <textarea
                      className="ec-notes-textarea"
                      placeholder={editingNote ? "Upravit text poznámky..." : "Napsat poznámku..."}
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddNote();
                        }
                      }}
                      disabled={notesCreating || noteSubmitting}
                    />
                    <button 
                      className="ec-notes-submit"
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || notesCreating || noteSubmitting}
                    >
                      {notesCreating || noteSubmitting ? "..." : editingNote ? "Uložit" : "Odeslat"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : showDocumentsSection ? (
          <div className="ec-profile-documents-view">
            <DocumentExplorer
              items={visibleDocuments}
              archivedItems={archivedDocuments}
              breadcrumbs={documentBreadcrumbs}
              currentFolderId={currentDocumentFolderId}
              folderOptions={documentFolderOptions}
              isLoading={documentsLoading}
              isUploading={documentsUploading}
              downloadBaseUrl={documentDownloadBaseUrl}
              onUploadDocument={onUploadDocument}
              onUploadDocuments={onUploadDocuments}
              onUploadFolderTree={onUploadFolderTree}
              onExtractZipDocument={onExtractZipDocument}
              onCreateFolder={onCreateFolder}
              onRenameDocument={onRenameDocument}
              onUpdateDocumentColor={onUpdateDocumentColor}
              onDeleteDocument={onDeleteDocument}
              onArchiveDocument={onArchiveDocument}
              onUnarchiveDocument={onUnarchiveDocument}
              onMoveDocument={onMoveDocument}
              onOpenFolder={onOpenDocumentFolder ?? (() => undefined)}
              onGoToFolder={onGoToDocumentFolder ?? (() => undefined)}
              onGoBack={onGoBackDocumentFolder ?? (() => undefined)}
              canMoveDocumentTo={canMoveDocumentTo ?? (() => false)}
              getDocumentPath={getDocumentPath ?? (() => "")}
              getFolderItemCount={getFolderItemCount ?? (() => 0)}
            />
          </div>
        ) : null}
      </div>

    </div>
  );
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("cs-CZ", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default EntityCommissionProfilePanel;
