// Nested subject fields — the two trees a subject's profile is built from.
//
//   Společnost  →  Obor  →  Zaměření          (company_structure)
//   Kraj        →  Lokalita                   (region_structure)
//
// Storage
// -------
// Each tree lives in its own entity column as a JSON array string:
//
//   company_structure  '[{"company":"Test","fields":[{"field":"IT","specialization":"Cloud"}]}]'
//   region_structure   '[{"region":"Praha","locations":["Václavské náměstí, Praha"]}]'
//
// The flat columns the tables, filters, exports and every older client already
// read (`company_name`, `field`, `field_specialization`, `region`, `location`)
// are kept as **derived mirrors**: every write of a tree rewrites them from it,
// using the same multi-value representation as before (see multiValue.ts). So
// nothing that reads the flat columns has to know the trees exist.
//
// The mirrors are also the fallback when a tree is missing (a record written
// before this feature, or one edited by an older client): the tree is derived
// back from them, and a tree that has drifted from its mirrors is reconciled
// against them on read — the mirrors decide *which* values a subject holds, the
// tree only decides how they are nested.
//
// `field_specialization` is a flat obor -> zaměření map, so when two companies
// share an obor with different zaměření the mirror can only carry one of them.
// The tree is authoritative in that case; the mirror stays a best effort.

import {
  parseMultiValue,
  parseSpecializationMap,
  serializeMultiValue,
  serializeSpecializationMap,
  type SpecializationMap,
} from "./multiValue";
import { parseLocationGeo, pruneLocationGeo, serializeLocationGeo, type LocationGeoMap } from "./locationGeo";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** One Obor under a Společnost, with the single Zaměření chosen for it. */
export interface CompanyFieldNode {
  field: string;
  specialization: string;
}

/**
 * One Společnost branch. `company` is "" for the unnamed branch — the obors a
 * subject holds without attaching them to a specific company (a private person,
 * or a record from before companies carried their own obors).
 */
export interface CompanyNode {
  company: string;
  fields: CompanyFieldNode[];
}

/** One Kraj branch with the Lokality that sit inside it. */
export interface RegionNode {
  region: string;
  locations: string[];
}

/** The subject values the company tree is read from / written back to. */
export interface CompanySource {
  company_structure?: unknown;
  company?: unknown;
  field?: unknown;
  field_specialization?: unknown;
}

/** The subject values the region tree is read from / written back to. */
export interface RegionSource {
  region_structure?: unknown;
  region?: unknown;
  location?: unknown;
  location_geo?: unknown;
}

/** Grid-key names of every column a tree write touches. */
export const COMPANY_STRUCTURE_KEYS = ["company_structure", "company", "field", "field_specialization"] as const;
export const REGION_STRUCTURE_KEYS = ["region_structure", "region", "location", "location_geo"] as const;

const trimmed = (value: unknown): string => String(value ?? "").trim();

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const parseStructureArray = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];

  const text = raw.trim();
  if (!text.startsWith("[")) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Not valid JSON — treat as "no tree stored" and fall back to the mirrors.
    return [];
  }
};

/** Read the stored company tree. Never throws; unknown shapes are dropped. */
export const parseCompanyStructure = (raw: unknown): CompanyNode[] => {
  const nodes: CompanyNode[] = [];

  for (const entry of parseStructureArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const fields: CompanyFieldNode[] = [];
    const rawFields = Array.isArray(record.fields) ? record.fields : [];
    for (const rawField of rawFields) {
      if (typeof rawField === "string") {
        const field = rawField.trim();
        if (field) fields.push({ field, specialization: "" });
        continue;
      }
      if (!rawField || typeof rawField !== "object") continue;
      const fieldRecord = rawField as Record<string, unknown>;
      const field = trimmed(fieldRecord.field);
      if (field) fields.push({ field, specialization: trimmed(fieldRecord.specialization) });
    }

    nodes.push({ company: trimmed(record.company), fields });
  }

  return nodes;
};

/** Read the stored region tree. Never throws; unknown shapes are dropped. */
export const parseRegionStructure = (raw: unknown): RegionNode[] => {
  const nodes: RegionNode[] = [];

  for (const entry of parseStructureArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const locations: string[] = [];
    const rawLocations = Array.isArray(record.locations) ? record.locations : [];
    for (const rawLocation of rawLocations) {
      const location = trimmed(rawLocation);
      if (location && !locations.includes(location)) locations.push(location);
    }

    nodes.push({ region: trimmed(record.region), locations });
  }

  return nodes;
};

// ---------------------------------------------------------------------------
// Serializing
// ---------------------------------------------------------------------------

/**
 * Drop empty branches and duplicate entries, then serialize. Returns null for
 * a tree with nothing in it, so an emptied field clears its column like every
 * other field does.
 */
export const serializeCompanyStructure = (nodes: CompanyNode[]): string | null => {
  const clean: CompanyNode[] = [];
  const seenCompanies = new Set<string>();

  for (const node of nodes || []) {
    const company = trimmed(node?.company);
    if (seenCompanies.has(company)) continue;

    const fields: CompanyFieldNode[] = [];
    const seenFields = new Set<string>();
    for (const entry of node?.fields ?? []) {
      const field = trimmed(entry?.field);
      if (!field || seenFields.has(field)) continue;
      seenFields.add(field);
      fields.push({ field, specialization: trimmed(entry?.specialization) });
    }

    // An unnamed branch only earns its place while it still holds obors.
    if (!company && fields.length === 0) continue;

    seenCompanies.add(company);
    clean.push({ company, fields });
  }

  return clean.length === 0 ? null : JSON.stringify(clean);
};

export const serializeRegionStructure = (nodes: RegionNode[]): string | null => {
  const clean: RegionNode[] = [];
  const seenRegions = new Set<string>();

  for (const node of nodes || []) {
    const region = trimmed(node?.region);
    if (seenRegions.has(region)) continue;

    const locations: string[] = [];
    for (const entry of node?.locations ?? []) {
      const location = trimmed(entry);
      if (location && !locations.includes(location)) locations.push(location);
    }

    if (!region && locations.length === 0) continue;

    seenRegions.add(region);
    clean.push({ region, locations });
  }

  return clean.length === 0 ? null : JSON.stringify(clean);
};

// ---------------------------------------------------------------------------
// Reading a tree off a subject (tree first, mirrors as the safety net)
// ---------------------------------------------------------------------------

/**
 * The company tree for a subject.
 *
 * Reconciled against the flat mirrors so a tree can never contradict them: the
 * mirrors decide which companies and obors the subject holds (they are what an
 * inline cell edit, a section-link sync or an older client writes), the tree
 * decides how they are nested. Values the tree does not place yet land on the
 * first branch.
 */
export const readCompanyStructure = (source: CompanySource | null | undefined): CompanyNode[] => {
  const companies = parseMultiValue(source?.company);
  const fields = parseMultiValue(source?.field);
  const specMap = parseSpecializationMap(source?.field_specialization);
  const stored = parseCompanyStructure(source?.company_structure);

  const storedByCompany = new Map<string, CompanyNode>();
  for (const node of stored) {
    if (!storedByCompany.has(node.company)) storedByCompany.set(node.company, node);
  }

  const nodes: CompanyNode[] = [];
  const placed = new Set<string>();

  const takeFields = (node: CompanyNode | undefined): CompanyFieldNode[] => {
    const kept: CompanyFieldNode[] = [];
    for (const entry of node?.fields ?? []) {
      if (!fields.includes(entry.field)) continue;
      if (kept.some((existing) => existing.field === entry.field)) continue;
      kept.push({ field: entry.field, specialization: entry.specialization || specMap[entry.field] || "" });
      placed.add(entry.field);
    }
    return kept;
  };

  for (const company of companies) {
    nodes.push({ company, fields: takeFields(storedByCompany.get(company)) });
  }

  // The unnamed branch survives only while the tree still uses it.
  const unnamed = storedByCompany.get("");
  const unnamedFields = takeFields(unnamed);
  if (unnamedFields.length > 0) {
    nodes.push({ company: "", fields: unnamedFields });
  }

  const orphans = fields
    .filter((field) => !placed.has(field))
    .map((field) => ({ field, specialization: specMap[field] || "" }));

  if (orphans.length > 0) {
    if (nodes.length === 0) {
      nodes.push({ company: "", fields: orphans });
    } else {
      nodes[0].fields.push(...orphans.filter((orphan) => !nodes[0].fields.some((entry) => entry.field === orphan.field)));
    }
  }

  return nodes;
};

/** The region tree for a subject — same tree-first, mirror-reconciled rules. */
export const readRegionStructure = (source: RegionSource | null | undefined): RegionNode[] => {
  const regions = parseMultiValue(source?.region);
  const locations = parseMultiValue(source?.location);
  const stored = parseRegionStructure(source?.region_structure);

  const storedByRegion = new Map<string, RegionNode>();
  for (const node of stored) {
    if (!storedByRegion.has(node.region)) storedByRegion.set(node.region, node);
  }

  const nodes: RegionNode[] = [];
  const placed = new Set<string>();

  const takeLocations = (node: RegionNode | undefined): string[] => {
    const kept: string[] = [];
    for (const location of node?.locations ?? []) {
      if (!locations.includes(location) || kept.includes(location)) continue;
      kept.push(location);
      placed.add(location);
    }
    return kept;
  };

  for (const region of regions) {
    nodes.push({ region, locations: takeLocations(storedByRegion.get(region)) });
  }

  const unnamedLocations = takeLocations(storedByRegion.get(""));
  if (unnamedLocations.length > 0) {
    nodes.push({ region: "", locations: unnamedLocations });
  }

  const orphans = locations.filter((location) => !placed.has(location));
  if (orphans.length > 0) {
    if (nodes.length === 0) {
      nodes.push({ region: "", locations: orphans });
    } else {
      nodes[0].locations.push(...orphans.filter((orphan) => !nodes[0].locations.includes(orphan)));
    }
  }

  return nodes;
};

// ---------------------------------------------------------------------------
// Writing a tree back (tree column + its derived mirrors, in one update)
// ---------------------------------------------------------------------------

/** obor -> zaměření across every branch; the first branch to name one wins. */
export const companySpecializationMap = (nodes: CompanyNode[]): SpecializationMap => {
  const map: SpecializationMap = {};
  for (const node of nodes || []) {
    for (const entry of node?.fields ?? []) {
      const field = trimmed(entry?.field);
      const specialization = trimmed(entry?.specialization);
      if (field && specialization && !map[field]) map[field] = specialization;
    }
  }
  return map;
};

/**
 * The full update a company-tree edit sends: the tree itself plus the flat
 * mirrors rebuilt from it, so both halves are always saved together.
 */
export const companyStructureUpdates = (nodes: CompanyNode[]): Record<string, string | null> => ({
  company_structure: serializeCompanyStructure(nodes),
  company: serializeMultiValue((nodes || []).map((node) => trimmed(node?.company))),
  field: serializeMultiValue((nodes || []).flatMap((node) => (node?.fields ?? []).map((entry) => trimmed(entry?.field)))),
  field_specialization: serializeSpecializationMap(companySpecializationMap(nodes)),
});

/**
 * The full update a region-tree edit sends. `location_geo` rides along so an
 * address that was removed never leaves its coordinates behind; pass the
 * subject's current map in.
 */
export const regionStructureUpdates = (nodes: RegionNode[], geo: LocationGeoMap = {}): Record<string, string | null> => {
  const addresses = (nodes || []).flatMap((node) => (node?.locations ?? []).map(trimmed)).filter(Boolean);

  return {
    region_structure: serializeRegionStructure(nodes),
    region: serializeMultiValue((nodes || []).map((node) => trimmed(node?.region))),
    location: serializeMultiValue(addresses),
    location_geo: serializeLocationGeo(pruneLocationGeo(geo, addresses)),
  };
};

/** The coordinates a subject holds, ready to hand to regionStructureUpdates. */
export const readLocationGeo = (source: RegionSource | null | undefined): LocationGeoMap =>
  parseLocationGeo(source?.location_geo);

// ---------------------------------------------------------------------------
// Grid rows — one row per Společnost
// ---------------------------------------------------------------------------

/**
 * The subject values a single Společnost row shows in the tables. Present on a
 * grid row as `row.branch`; the multiValue row resolvers prefer it over the
 * subject's own (whole-subject) values, so a split row shows only the obor and
 * zaměření that belong to *its* company — in the cells, in the column filters
 * and in the Obor/Kraj filter panels alike.
 */
export interface CompanyBranch {
  company: string | null;
  field: string | null;
  field_specialization: string | null;
}

/**
 * Split a subject into one branch per Společnost.
 *
 * Returns an empty list when there is nothing to split (fewer than two
 * companies), so the caller keeps the single, unsplit row it already had and
 * every existing table behaves exactly as before.
 */
export const buildCompanyBranches = (source: CompanySource | null | undefined): CompanyBranch[] => {
  const nodes = readCompanyStructure(source);
  const named = nodes.filter((node) => node.company);
  if (named.length < 2) return [];

  return nodes.map((node) => ({
    company: node.company || null,
    field: serializeMultiValue(node.fields.map((entry) => entry.field)),
    field_specialization: serializeSpecializationMap(
      Object.fromEntries(
        node.fields
          .filter((entry) => entry.specialization)
          .map((entry) => [entry.field, entry.specialization])
      )
    ),
  }));
};
