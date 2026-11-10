// "Doplnit z ARES": what the business register says about a subject's IČO,
// written into the subject's own Společnost and Kraj / Lokalita — the fields
// the tables show, sort and filter by. (Sídlo, DIČ and legal form have no
// column of their own; the profile shows them live under the IČO.)
//
// Pure: `planAresFill` lists the possible changes, `applyAresFill` turns the
// ones the user kept ticked into one save. Both trees go through hierarchy.ts,
// so their flat mirror columns are always rewritten with them.

import {
  companyStructureUpdates,
  readCompanyStructure,
  readLocationGeo,
  readRegionStructure,
  regionStructureUpdates,
  type CompanyNode,
  type CompanySource,
  type RegionNode,
  type RegionSource,
} from "./hierarchy";
import type { AresCompany } from "./ico";
import { matchRegionOption } from "./regions";

export type AresFillSource = CompanySource & RegionSource;

export interface AresFillChange {
  id: "company" | "region";
  label: string;
  /** What is there now ("" when empty). */
  from: string;
  to: string;
  /** Ticked from the start: only when it fills something empty. */
  preselected: boolean;
  /** How the change is described ("doplnit", "přepsat", "přidat"). */
  action: "doplnit" | "přepsat" | "přidat";
}

interface CompanyPlan {
  change: AresFillChange;
  nodes: CompanyNode[];
}

interface RegionPlan {
  change: AresFillChange;
  nodes: RegionNode[];
}

export interface AresFillPlan {
  changes: AresFillChange[];
  company?: CompanyPlan;
  region?: RegionPlan;
}

// "ABC, s.r.o." and "ABC s.r.o." are the same company; so are two spellings
// of one address that differ only in commas and spaces.
const sameText = (left: string, right: string) => {
  const key = (value: string) =>
    value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return key(left) === key(right);
};

const planCompany = (company: AresCompany, source: AresFillSource): CompanyPlan | undefined => {
  const name = company.nazev?.trim();
  if (!name) return undefined;
  const nodes = readCompanyStructure(source);
  const named = nodes.filter((node) => node.company.trim());
  if (named.some((node) => sameText(node.company, name))) return undefined;

  if (named.length === 0) {
    // Name the unnamed branch, so the obors already chosen stay with it.
    const unnamed = nodes.findIndex((node) => !node.company.trim());
    const next = unnamed >= 0
      ? nodes.map((node, index) => (index === unnamed ? { ...node, company: name } : node))
      : [...nodes, { company: name, fields: [] }];
    return {
      nodes: next,
      change: { id: "company", label: "Společnost", from: "", to: name, preselected: true, action: "doplnit" },
    };
  }

  if (named.length === 1) {
    // One company under another name: most likely the same one written
    // differently, or renamed since. Its obors stay.
    const current = named[0];
    return {
      nodes: nodes.map((node) => (node === current ? { ...node, company: name } : node)),
      change: { id: "company", label: "Společnost", from: current.company, to: name, preselected: false, action: "přepsat" },
    };
  }

  return {
    nodes: [...nodes, { company: name, fields: [] }],
    change: {
      id: "company",
      label: "Společnost",
      from: named.map((node) => node.company).join(", "),
      to: name,
      preselected: false,
      action: "přidat",
    },
  };
};

const planRegion = (company: AresCompany, source: AresFillSource): RegionPlan | undefined => {
  const kraj = matchRegionOption(company.kraj, "CZ");
  const address = company.sidlo?.trim() ?? "";
  if (!kraj) return undefined;
  const nodes = readRegionStructure(source);
  const label = "Kraj / Lokalita";
  const to = address ? `${kraj} – ${address}` : kraj;
  const describe = (list: RegionNode[]) =>
    list.map((node) => (node.locations.length ? `${node.region} – ${node.locations.join(", ")}` : node.region)).join("; ");

  const existing = nodes.find((node) => node.region === kraj);
  if (existing) {
    if (!address || existing.locations.some((location) => sameText(location, address))) return undefined;
    return {
      nodes: nodes.map((node) => (node === existing ? { ...node, locations: [...node.locations, address] } : node)),
      change: {
        id: "region",
        label,
        from: describe(nodes),
        to,
        // An empty Kraj gets its address; next to other addresses it is added
        // only when asked for.
        preselected: existing.locations.length === 0,
        action: existing.locations.length === 0 ? "doplnit" : "přidat",
      },
    };
  }

  const next = [...nodes, { region: kraj, locations: address ? [address] : [] }];
  return {
    nodes: next,
    change: {
      id: "region",
      label,
      from: describe(nodes),
      to,
      preselected: nodes.length === 0,
      action: nodes.length === 0 ? "doplnit" : "přidat",
    },
  };
};

export const planAresFill = (company: AresCompany, source: AresFillSource | null | undefined): AresFillPlan => {
  if (!source) return { changes: [] };
  const companyPlan = planCompany(company, source);
  const regionPlan = planRegion(company, source);
  return {
    company: companyPlan,
    region: regionPlan,
    changes: [companyPlan?.change, regionPlan?.change].filter((change): change is AresFillChange => Boolean(change)),
  };
};

/** The one save for the changes left ticked; null when none are. */
export const applyAresFill = (
  plan: AresFillPlan,
  selected: ReadonlySet<AresFillChange["id"]>,
  source: AresFillSource,
): Record<string, string | null> | null => {
  let updates: Record<string, string | null> = {};
  if (plan.company && selected.has("company")) {
    updates = { ...updates, ...companyStructureUpdates(plan.company.nodes) };
  }
  if (plan.region && selected.has("region")) {
    updates = { ...updates, ...regionStructureUpdates(plan.region.nodes, readLocationGeo(source)) };
  }
  return Object.keys(updates).length ? updates : null;
};
