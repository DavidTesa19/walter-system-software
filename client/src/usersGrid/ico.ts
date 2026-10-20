// IČO — a Czech company registration number: 8 digits, the last a mod-11
// check digit. Validated here before it is saved, and looked up in the ARES
// business register (through the server's /api/ares/ico/:ico) to show which
// company the number belongs to.

import { apiGet } from "../utils/api";

export type IcoCheck =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

export const isValidIco = (ico: string): boolean => {
  if (!/^\d{8}$/.test(ico)) return false;
  const sum = [...ico.slice(0, 7)].reduce((total, digit, index) => total + Number(digit) * (8 - index), 0);
  return (11 - (sum % 11)) % 10 === Number(ico[7]);
};

/**
 * What to store for a typed IČO: spaces dropped and short numbers padded with
 * leading zeros (old IČO had 6 or 7 digits), or the reason it cannot be one.
 * An empty value clears the field.
 */
export const checkIco = (raw: string | null | undefined): IcoCheck => {
  const compact = String(raw ?? "").replace(/\s+/g, "");
  if (!compact) return { ok: true, value: null };
  if (!/^\d+$/.test(compact)) return { ok: false, error: "IČO obsahuje jen číslice." };
  if (compact.length > 8) return { ok: false, error: "IČO má nejvýš 8 číslic." };
  const ico = compact.padStart(8, "0");
  if (!isValidIco(ico)) return { ok: false, error: "Toto IČO neexistuje – nesedí kontrolní číslice. Zkontrolujte překlep." };
  return { ok: true, value: ico };
};

/** The value to store for a typed IČO, or null when it is empty or invalid. */
export const icoOrNull = (raw: string | null | undefined): string | null => {
  const check = checkIco(raw);
  return check.ok ? check.value : null;
};

export interface AresCompany {
  ico: string;
  nazev: string;
  sidlo?: string;
  kraj?: string;
  pravni_forma?: string;
  dic?: string;
  platce_dph?: boolean;
  vznik?: string;
  zanik?: string;
  stav: "aktivní" | "v likvidaci" | "zaniklý" | "neaktivní";
  odkaz: string;
}

export const aresUrl = (ico: string) => `https://ares.gov.cz/ekonomicke-subjekty?ico=${ico}`;

// One request per IČO per page load: profiles are opened and closed often,
// and what ARES says about a number does not change by the minute.
const lookups = new Map<string, Promise<AresCompany>>();

export const lookupAresCompany = (ico: string): Promise<AresCompany> => {
  const cached = lookups.get(ico);
  if (cached) return cached;
  const request = apiGet<AresCompany>(`/api/ares/ico/${ico}`);
  lookups.set(ico, request);
  // A failure is not remembered, so a retry (or ARES coming back) can work.
  request.catch(() => lookups.delete(ico));
  return request;
};
