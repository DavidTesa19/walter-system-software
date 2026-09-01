import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FieldSelectInput, { type FieldPickerConfig } from "./FieldSelectInput";
import PlaceAutocompleteInput from "./PlaceAutocompleteInput";
import { SPECIALIZATION_DROPDOWN_LABELS } from "../cells/fieldDropdown";
import type { SpecializationPickerConfig } from "./EntityCommissionProfilePanel";
import { buildMapsUrl, formatCoordinates, type LocationCoordinates } from "../locationGeo";
import {
  companyStructureUpdates,
  readCompanyStructure,
  readLocationGeo,
  readRegionStructure,
  regionStructureUpdates,
  serializeCompanyStructure,
  serializeRegionStructure,
  type CompanyNode,
  type CompanySource,
  type RegionNode,
  type RegionSource,
} from "../hierarchy";
import "./HierarchyEditor.css";

// Editor for the two nested subject trees (see hierarchy.ts):
//
//   Společnost → Obor → Zaměření     kind="company"
//   Kraj       → Lokalita            kind="region"
//
// Both levels add and remove independently, and every edit saves the tree
// column together with the flat mirror columns it derives, in a single update —
// so the tables, the filters and every older reader stay in step with the tree
// without knowing it exists.

export type HierarchyKind = "company" | "region";

export interface HierarchyEditorProps {
  kind: HierarchyKind;
  /** The subject's current values, in the grid's key naming. */
  source: (CompanySource & RegionSource) | null | undefined;
  /** Saves the tree column and its derived mirrors in one go. */
  onSave: (updates: Record<string, string | null>) => void;
  /** Obor catalog (kind="company"). */
  fieldPicker?: FieldPickerConfig;
  /** Zaměření catalog, scoped per obor (kind="company"). */
  specializationPicker?: SpecializationPickerConfig;
  /** Kraj options (kind="region"). */
  regionOptions?: string[];
  parentPlaceholder?: string;
  // Profile panel (default): commit typing on blur, so each edit is one save.
  // Create modal: commit on every keystroke, because the form is submitted as a
  // whole and a not-yet-blurred value would otherwise be lost.
  commitOnChange?: boolean;
}

// Stable ids keep text inputs focused as the surrounding list re-renders.
interface ChildRow {
  id: number;
  value: string;
  specialization: string;
}

interface BranchRow {
  id: number;
  value: string;
  children: ChildRow[];
}

const LABELS = {
  company: {
    addBranch: "Přidat další společnost",
    addChild: "Přidat další obor",
    branchPlaceholder: "Název společnosti",
    childLabel: "Obor",
    childPlaceholder: "Vyberte obor činnosti",
    removeBranch: "Odebrat společnost",
    removeChild: "Odebrat obor",
  },
  region: {
    addBranch: "Přidat další kraj",
    addChild: "Přidat další lokalitu",
    branchPlaceholder: "Vyberte kraj",
    childLabel: "Lokalita",
    childPlaceholder: "Zadejte adresu",
    removeBranch: "Odebrat kraj",
    removeChild: "Odebrat lokalitu",
  },
} as const;

const HierarchyEditor: React.FC<HierarchyEditorProps> = ({
  kind,
  source,
  onSave,
  fieldPicker,
  specializationPicker,
  regionOptions,
  parentPlaceholder,
  commitOnChange = false,
}) => {
  const labels = LABELS[kind];
  const isCompany = kind === "company";

  const idRef = useRef(0);
  const nextId = useCallback(() => idRef.current++, []);

  const toBranchRows = useCallback((): BranchRow[] => {
    if (isCompany) {
      return readCompanyStructure(source).map((node) => ({
        id: nextId(),
        value: node.company,
        children: node.fields.map((entry) => ({
          id: nextId(),
          value: entry.field,
          specialization: entry.specialization,
        })),
      }));
    }

    return readRegionStructure(source).map((node) => ({
      id: nextId(),
      value: node.region,
      children: node.locations.map((location) => ({ id: nextId(), value: location, specialization: "" })),
    }));
  }, [isCompany, nextId, source]);

  const [branches, setBranches] = useState<BranchRow[]>(toBranchRows);
  const branchesRef = useRef(branches);
  const [autoFocusId, setAutoFocusId] = useState<number | null>(null);

  const setBranchesSafe = useCallback((next: BranchRow[]) => {
    branchesRef.current = next;
    setBranches(next);
  }, []);

  const toCompanyNodes = (rows: BranchRow[]): CompanyNode[] =>
    rows.map((row) => ({
      company: row.value,
      fields: row.children.map((child) => ({ field: child.value, specialization: child.specialization })),
    }));

  const toRegionNodes = (rows: BranchRow[]): RegionNode[] =>
    rows.map((row) => ({ region: row.value, locations: row.children.map((child) => child.value) }));

  const serializeRows = useCallback(
    (rows: BranchRow[]): string =>
      (isCompany ? serializeCompanyStructure(toCompanyNodes(rows)) : serializeRegionStructure(toRegionNodes(rows))) ?? "",
    [isCompany]
  );

  // Re-sync from the persisted tree after a server round-trip. Compares the
  // canonical serialized forms so a user's uncommitted typing is never
  // clobbered — this only fires when the stored tree actually changes.
  const persisted = useMemo(
    () =>
      (isCompany
        ? serializeCompanyStructure(readCompanyStructure(source))
        : serializeRegionStructure(readRegionStructure(source))) ?? "",
    [isCompany, source]
  );

  useEffect(() => {
    if (persisted !== serializeRows(branchesRef.current)) {
      setBranchesSafe(toBranchRows());
    }
    // Only react to changes of the persisted tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persisted]);

  // A ref keeps the coordinate handlers stable while always seeing the latest map.
  const geoRef = useRef(readLocationGeo(source));
  geoRef.current = readLocationGeo(source);

  const commit = useCallback(
    (rows: BranchRow[], extraGeo?: { address: string; coordinates: LocationCoordinates }) => {
      if (isCompany) {
        onSave(companyStructureUpdates(toCompanyNodes(rows)));
        return;
      }

      const geo = { ...geoRef.current };
      if (extraGeo) geo[extraGeo.address] = extraGeo.coordinates;
      onSave(regionStructureUpdates(toRegionNodes(rows), geo));
    },
    [isCompany, onSave]
  );

  // ---- branch level ------------------------------------------------------

  const updateBranch = useCallback(
    (branchId: number, value: string): BranchRow[] => {
      const next = branchesRef.current.map((row) => (row.id === branchId ? { ...row, value } : row));
      setBranchesSafe(next);
      return next;
    },
    [setBranchesSafe]
  );

  const handleBranchText = useCallback(
    (branchId: number, value: string) => {
      const next = updateBranch(branchId, value);
      if (commitOnChange) commit(next);
    },
    [commit, commitOnChange, updateBranch]
  );

  const handleBranchChoice = useCallback(
    (branchId: number, value: string) => commit(updateBranch(branchId, value)),
    [commit, updateBranch]
  );

  const handleBranchBlur = useCallback(() => {
    if (!commitOnChange) commit(branchesRef.current);
  }, [commit, commitOnChange]);

  const handleAddBranch = useCallback(() => {
    const row: BranchRow = { id: nextId(), value: "", children: [] };
    setBranchesSafe([...branchesRef.current, row]);
    setAutoFocusId(row.id);
  }, [nextId, setBranchesSafe]);

  const handleRemoveBranch = useCallback(
    (branchId: number) => {
      const next = branchesRef.current.filter((row) => row.id !== branchId);
      setBranchesSafe(next);
      commit(next);
    },
    [commit, setBranchesSafe]
  );

  // ---- child level -------------------------------------------------------

  const patchChild = useCallback(
    (branchId: number, childId: number, patch: Partial<ChildRow>): BranchRow[] => {
      const next = branchesRef.current.map((row) =>
        row.id === branchId
          ? { ...row, children: row.children.map((child) => (child.id === childId ? { ...child, ...patch } : child)) }
          : row
      );
      setBranchesSafe(next);
      return next;
    },
    [setBranchesSafe]
  );

  const handleChildText = useCallback(
    (branchId: number, childId: number, value: string) => {
      const next = patchChild(branchId, childId, { value });
      if (commitOnChange) commit(next);
    },
    [commit, commitOnChange, patchChild]
  );

  const handleChildChoice = useCallback(
    (branchId: number, childId: number, value: string) => commit(patchChild(branchId, childId, { value })),
    [commit, patchChild]
  );

  const handleChildBlur = useCallback(() => {
    if (!commitOnChange) commit(branchesRef.current);
  }, [commit, commitOnChange]);

  // A suggestion was picked: the row takes the place's formatted address and
  // its coordinates are saved under that address in the same update, so a
  // coordinate is never keyed to an address the subject does not hold.
  const handlePlaceSelected = useCallback(
    (branchId: number, childId: number, place: { address: string; lat: number; lng: number; placeId: string }) => {
      const next = patchChild(branchId, childId, { value: place.address });
      commit(next, {
        address: place.address,
        coordinates: { lat: place.lat, lng: place.lng, place_id: place.placeId },
      });
    },
    [commit, patchChild]
  );

  const handleSpecializationChange = useCallback(
    (branchId: number, childId: number, value: string) =>
      commit(patchChild(branchId, childId, { specialization: value })),
    [commit, patchChild]
  );

  const handleAddChild = useCallback(
    (branchId: number) => {
      const child: ChildRow = { id: nextId(), value: "", specialization: "" };
      setBranchesSafe(
        branchesRef.current.map((row) => (row.id === branchId ? { ...row, children: [...row.children, child] } : row))
      );
      setAutoFocusId(child.id);
    },
    [nextId, setBranchesSafe]
  );

  const handleRemoveChild = useCallback(
    (branchId: number, childId: number) => {
      const next = branchesRef.current.map((row) =>
        row.id === branchId ? { ...row, children: row.children.filter((child) => child.id !== childId) } : row
      );
      setBranchesSafe(next);
      commit(next);
    },
    [commit, setBranchesSafe]
  );

  // ---- rendering ---------------------------------------------------------

  const renderBranchInput = (row: BranchRow) => {
    if (!isCompany) {
      return (
        <select
          className="editable-input select"
          value={row.value}
          onChange={(event) => handleBranchChoice(row.id, event.target.value)}
        >
          <option value="">— Vyberte —</option>
          {(regionOptions ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
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
        onChange={(event) => handleBranchText(row.id, event.target.value)}
        onBlur={handleBranchBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
        }}
        placeholder={parentPlaceholder || labels.branchPlaceholder}
      />
    );
  };

  const renderChildInput = (row: BranchRow, child: ChildRow) => {
    if (isCompany) {
      if (!fieldPicker) {
        return (
          <input
            type="text"
            className="editable-input"
            value={child.value}
            autoFocus={child.id === autoFocusId}
            onChange={(event) => handleChildText(row.id, child.id, event.target.value)}
            onBlur={handleChildBlur}
            placeholder={labels.childPlaceholder}
          />
        );
      }

      return (
        <FieldSelectInput
          value={child.value}
          placeholder={labels.childPlaceholder}
          fieldOptions={fieldPicker.fieldOptions}
          groupedFieldOptions={fieldPicker.groupedFieldOptions}
          onChange={(value) => handleChildChoice(row.id, child.id, value)}
          onCreateFieldOption={fieldPicker.onCreateFieldOption}
          onDeleteFieldOption={fieldPicker.onDeleteFieldOption}
        />
      );
    }

    return (
      <PlaceAutocompleteInput
        value={child.value}
        placeholder={labels.childPlaceholder}
        autoFocus={child.id === autoFocusId}
        onChange={(value) => handleChildText(row.id, child.id, value)}
        onCommit={handleChildBlur}
        onPlaceSelected={(place) => handlePlaceSelected(row.id, child.id, place)}
      />
    );
  };

  // Nested "Zaměření" dropdown for a chosen obor. Options are scoped to that
  // obor and can be created/removed inline, mirroring the obor picker. The "×"
  // clears only this row's chosen zaměření (it stays in the shared catalog for
  // other subjects) — removing the option itself is a catalog-wide action taken
  // inside the dropdown.
  const renderSpecialization = (row: BranchRow, child: ChildRow) => {
    const obor = child.value.trim();
    if (!isCompany || !specializationPicker || !obor) return null;

    const options = specializationPicker.getOptions(obor);

    return (
      <div className="hier-grandchild">
        <span className="hier-level-label">Zaměření</span>
        <FieldSelectInput
          value={child.specialization}
          placeholder="Vyberte zaměření"
          fieldOptions={options}
          groupedFieldOptions={[{ label: "Zaměření", options }]}
          labels={SPECIALIZATION_DROPDOWN_LABELS}
          onChange={(value) => handleSpecializationChange(row.id, child.id, value)}
          onCreateFieldOption={
            specializationPicker.onCreateOption
              ? (value) => specializationPicker.onCreateOption!(obor, value)
              : undefined
          }
          onDeleteFieldOption={
            specializationPicker.onDeleteOption
              ? (optionId) => Promise.resolve(specializationPicker.onDeleteOption!(optionId)).then(() => undefined)
              : undefined
          }
        />
        {child.specialization ? (
          <button
            type="button"
            className="hier-remove small"
            onClick={() => handleSpecializationChange(row.id, child.id, "")}
            title="Odebrat zaměření"
            aria-label="Odebrat zaměření"
          >
            ×
          </button>
        ) : null}
      </div>
    );
  };

  // Read-only confirmation that this address came from Google Maps, linking out
  // to it. Absent for addresses that were simply typed.
  const renderCoordinates = (child: ChildRow) => {
    const address = child.value.trim();
    const coordinates = isCompany || !address ? undefined : geoRef.current[address];
    if (!coordinates) return null;

    return (
      <div className="hier-coordinates">
        <span aria-hidden="true">📍</span>
        <a href={buildMapsUrl(address, coordinates)} target="_blank" rel="noopener noreferrer">
          {formatCoordinates(coordinates)}
        </a>
      </div>
    );
  };

  return (
    <div className={`editable-field editing hier-editor hier-${kind}`}>
      {branches.length > 0 ? (
        <div className="hier-branches">
          {branches.map((row) => (
            <div key={row.id} className="hier-branch">
              <div className="hier-row">
                <div className="hier-input">{renderBranchInput(row)}</div>
                <button
                  type="button"
                  className="hier-remove"
                  onClick={() => handleRemoveBranch(row.id)}
                  title={labels.removeBranch}
                  aria-label={labels.removeBranch}
                >
                  ×
                </button>
              </div>

              <div className="hier-children">
                {row.children.map((child) => (
                  <div key={child.id} className="hier-child">
                    <div className="hier-row">
                      <span className="hier-level-label">{labels.childLabel}</span>
                      <div className="hier-input">{renderChildInput(row, child)}</div>
                      <button
                        type="button"
                        className="hier-remove small"
                        onClick={() => handleRemoveChild(row.id, child.id)}
                        title={labels.removeChild}
                        aria-label={labels.removeChild}
                      >
                        ×
                      </button>
                    </div>
                    {renderSpecialization(row, child)}
                    {renderCoordinates(child)}
                  </div>
                ))}

                <button type="button" className="hier-add small" onClick={() => handleAddChild(row.id)}>
                  <span className="hier-add-icon" aria-hidden="true">
                    +
                  </span>
                  {labels.addChild}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" className="hier-add" onClick={handleAddBranch}>
        <span className="hier-add-icon" aria-hidden="true">
          +
        </span>
        {labels.addBranch}
      </button>
    </div>
  );
};

export default HierarchyEditor;
