// "Doplnit z ARES": what the business register says about a subject's IČO,
// written into the subject's own fields, so nobody has to retype it:
//   - Společnost and Kraj / Lokalita (the seat's address): the fields the
//     tables show, sort and filter by;
//   - Jméno / Název: a sole trader's own name, or for a company a member of
//     its statutory body (jednatel, board), picked from a list;
//   - Popis / Poznámky: one line with legal form, DIČ, VAT payer, founding
//     date and the statutory body, since those have no column of their own.
// ARES has no phone, e-mail or website.
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

export type AresFillSource = CompanySource & RegionSource & {
  /** Jméno / Název as the profile shows it (falls back to the company or code). */
  name?: unknown;
  info?: unknown;
};

export interface AresFillOption {
  value: string;
  label: string;
}

export interface AresFillChange {
  id: "company" | "region" | "name" | "info";
  label: string;
  /** What is there now ("" when empty). */
  from: string;
  to: string;
  /** Ticked from the start: only when it fills something empty. */
  preselected: boolean;
  /** How the change is described ("doplnit", "přepsat", "přidat"). */
  action: "doplnit" | "přepsat" | "přidat";
  /** Name only: everything ARES offers, `to` being the first. */
  options?: AresFillOption[];
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
  /** The note's text as it would be saved (the old note plus the ARES lines). */
  info?: string;
}

/** What the user picked where there is a choice. */
export interface AresFillChoices {
  name?: string;
}

// "ABC, s.r.o." and "ABC s.r.o." are the same company; so are two spellings
// of one address that differ only in commas and spaces.
const sameText = (left: string, right: string) => {
  const key = (value: string) =>
    value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return key(left) === key(right);
};

// The old "new row" defaults count as empty: ARES replaces them outright.
const PLACEHOLDER_COMPANY = /^nov[áa] spole[čc]nost$/i;
const PLACEHOLDER_LOCATION = /^nov[áa] lokalita$/i;
const isRealCompany = (name: string) => Boolean(name.trim()) && !PLACEHOLDER_COMPANY.test(name.trim());
const PLACEHOLDER_PERSON = /^nov[ýy] (klient|partner|tipa[řr])$/i;
// A subject's code (K012, P003, T045), shown as the name when there is none.
const SUBJECT_CODE = /^[A-Z]{1,2}\d{2,}$/;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// A sole trader is registered under their own name.
const isPerson = (company: AresCompany) => /fyzick/i.test(company.pravni_forma ?? "");

// "2003-08-26" → "26. 8. 2003", from the text: through Date it is read as UTC
// midnight and a browser west of Greenwich shows the day before.
const czDate = (iso?: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${Number(match[3])}. ${Number(match[2])}. ${match[1]}` : "";
};

// The person who most likely speaks for the company first: chairman,
// jednatel, owner or director before vice-chairs and members.
const roleRank = (role: string | null) => {
  const value = (role ?? "").toLowerCase();
  if (/^(předseda|jednatel|majitel|ředitel|prokurista)/.test(value)) return 0;
  if (/místopředseda/.test(value)) return 1;
  return 2;
};

const planCompany = (company: AresCompany, source: AresFillSource): CompanyPlan | undefined => {
  const name = company.nazev?.trim();
  if (!name) return undefined;
  const nodes = readCompanyStructure(source);
  const named = nodes.filter((node) => isRealCompany(node.company));
  if (named.some((node) => sameText(node.company, name))) return undefined;

  if (named.length === 0) {
    // Name the unnamed (or placeholder) branch, so the obors already chosen
    // stay with it.
    const unnamed = nodes.findIndex((node) => !isRealCompany(node.company));
    const next = unnamed >= 0
      ? nodes.map((node, index) => (index === unnamed ? { ...node, company: name } : node))
      : [...nodes, { company: name, fields: [] }];
    return {
      nodes: next,
      change: {
        id: "company",
        label: "Společnost",
        from: unnamed >= 0 ? nodes[unnamed].company.trim() : "",
        to: name,
        preselected: true,
        action: "doplnit",
      },
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
  const current = readRegionStructure(source);
  // Without the placeholder address, and without a branch that held only it.
  const nodes = current
    .map((node) => ({ ...node, locations: node.locations.filter((location) => !PLACEHOLDER_LOCATION.test(location.trim())) }))
    .filter((node) => node.region.trim() || node.locations.length > 0);
  const label = "Kraj / Lokalita";
  const to = address ? `${kraj} – ${address}` : kraj;
  const describe = (list: RegionNode[]) =>
    list
      .map((node) => [node.region.trim(), node.locations.join(", ")].filter(Boolean).join(" – "))
      .filter(Boolean)
      .join("; ");

  const existing = nodes.find((node) => node.region === kraj);
  if (existing) {
    if (!address || existing.locations.some((location) => sameText(location, address))) return undefined;
    return {
      nodes: nodes.map((node) => (node === existing ? { ...node, locations: [...node.locations, address] } : node)),
      change: {
        id: "region",
        label,
        from: describe(current),
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
      from: describe(current),
      to,
      preselected: nodes.length === 0,
      action: nodes.length === 0 ? "doplnit" : "přidat",
    },
  };
};

// The names ARES offers: a sole trader's registered name, or the statutory
// body's members (when the lookup asked for them) with the company's own
// name last, for a subject that is the company itself.
export const nameOptions = (company: AresCompany): AresFillOption[] => {
  const name = company.nazev?.trim() ?? "";
  if (isPerson(company)) return name ? [{ value: name, label: name }] : [];
  const people = (company.osoby ?? [])
    .filter((person) => person.jmeno?.trim())
    .map((person, index) => ({ person, index }))
    .sort((a, b) => roleRank(a.person.funkce) - roleRank(b.person.funkce) || a.index - b.index)
    .map(({ person }) => {
      const value = person.jmeno.trim();
      return { value, label: person.funkce ? `${value} (${person.funkce})` : value };
    });
  const unique = people.filter((option, index) => people.findIndex((other) => sameText(other.value, option.value)) === index);
  return name ? [...unique, { value: name, label: `${name} (název firmy)` }] : unique;
};

const planName = (company: AresCompany, source: AresFillSource): AresFillChange | undefined => {
  const options = nameOptions(company);
  if (options.length === 0) return undefined;
  const current = text(source.name);
  if (options.some((option) => sameText(option.value, current))) return undefined;
  // The profile shows the company or the code when a subject has no name of
  // its own, and new rows used to say "Nový klient": all of that is empty.
  const empty =
    !current ||
    PLACEHOLDER_PERSON.test(current) ||
    SUBJECT_CODE.test(current) ||
    (isRealCompany(text(source.company)) && sameText(current, text(source.company)));
  return {
    id: "name",
    label: "Jméno / Název",
    from: empty ? "" : current,
    to: options[0].value,
    options,
    preselected: empty,
    action: empty ? "doplnit" : "přepsat",
  };
};

/** The note's lines: what ARES knows that has no field of its own. */
export const aresNoteLine = (company: AresCompany): string => {
  const facts = [
    company.pravni_forma,
    company.dic ? `DIČ ${company.dic}` : "",
    company.platce_dph ? "plátce DPH" : "",
    company.vznik ? `vznik ${czDate(company.vznik)}` : "",
  ].filter(Boolean);
  const people = (company.osoby ?? [])
    .filter((person) => person.jmeno?.trim())
    .slice(0, 4)
    .map((person) => (person.funkce ? `${person.jmeno.trim()} (${person.funkce})` : person.jmeno.trim()));
  const lines: string[] = [];
  if (facts.length) lines.push(`ARES: ${facts.join(" · ")}`);
  if (people.length && !isPerson(company)) lines.push(`Statutární orgán: ${people.join(", ")}`);
  return lines.join("\n");
};

const planInfo = (company: AresCompany, source: AresFillSource): { change: AresFillChange; text: string } | undefined => {
  const line = aresNoteLine(company);
  if (!line) return undefined;
  const current = text(source.info);
  const firstLine = line.split("\n")[0];
  // Already there (or the DIČ already noted): nothing to add.
  if (current.includes(firstLine) || (company.dic && current.includes(company.dic))) return undefined;
  return {
    text: current ? `${current}\n${line}` : line,
    change: {
      id: "info",
      label: "Popis / Poznámky",
      from: "",
      to: line,
      preselected: !current,
      action: current ? "přidat" : "doplnit",
    },
  };
};

export const planAresFill = (company: AresCompany, source: AresFillSource | null | undefined): AresFillPlan => {
  if (!source) return { changes: [] };
  const nameChange = planName(company, source);
  const companyPlan = planCompany(company, source);
  const regionPlan = planRegion(company, source);
  const infoPlan = planInfo(company, source);
  return {
    company: companyPlan,
    region: regionPlan,
    info: infoPlan?.text,
    changes: [nameChange, companyPlan?.change, regionPlan?.change, infoPlan?.change].filter(
      (change): change is AresFillChange => Boolean(change),
    ),
  };
};

/** The one save for the changes left ticked; null when none are. */
export const applyAresFill = (
  plan: AresFillPlan,
  selected: ReadonlySet<AresFillChange["id"]>,
  source: AresFillSource,
  choices: AresFillChoices = {},
): Record<string, string | null> | null => {
  let updates: Record<string, string | null> = {};
  const nameChange = plan.changes.find((change) => change.id === "name");
  if (nameChange && selected.has("name")) {
    const picked = choices.name && nameChange.options?.some((option) => option.value === choices.name) ? choices.name : nameChange.to;
    updates.name = picked;
  }
  if (plan.info && selected.has("info")) {
    updates.info = plan.info;
  }
  if (plan.company && selected.has("company")) {
    updates = { ...updates, ...companyStructureUpdates(plan.company.nodes) };
  }
  if (plan.region && selected.has("region")) {
    updates = { ...updates, ...regionStructureUpdates(plan.region.nodes, readLocationGeo(source)) };
  }
  return Object.keys(updates).length ? updates : null;
};
