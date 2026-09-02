// Czech regions (kraje) — the 14 higher-level territorial units.
// Stored verbatim in the entity `region` column and shown in the "Kraj" grid column.
export const REGION_OPTIONS: string[] = [
  "Celá ČR",
  "Praha",
  "Středočeský kraj",
  "Jihočeský kraj",
  "Plzeňský kraj",
  "Karlovarský kraj",
  "Ústecký kraj",
  "Liberecký kraj",
  "Královéhradecký kraj",
  "Pardubický kraj",
  "Vysočina",
  "Jihomoravský kraj",
  "Olomoucký kraj",
  "Zlínský kraj",
  "Moravskoslezský kraj",
  "Zahraničí",
];

// Matching a Google Maps address onto one of the options above.
//
// Google hands back the region of a picked address as its
// `administrative_area_level_1` component. For Czechia those names line up with
// the list almost exactly — the two that don't are Praha ("Hlavní město Praha")
// and Vysočina ("Kraj Vysočina"). Anything outside Czechia is "Zahraničí".
//
// The comparison ignores diacritics and case, so a key answering in English, or
// a name that has picked up a stray accent, still lands on the right kraj.

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Names Google uses that are not simply the option itself. The app asks Google
// for Czech (`language=cs`), so the English forms are only a safety net for a
// key or a locale that answers in English anyway.
const REGION_ALIASES: Record<string, string> = {
  "hlavni mesto praha": "Praha",
  "prague": "Praha",
  "kraj vysocina": "Vysočina",
  "vysocina region": "Vysočina",
  "highlands": "Vysočina",
  "central bohemian region": "Středočeský kraj",
  "south bohemian region": "Jihočeský kraj",
  "plzen region": "Plzeňský kraj",
  "karlovy vary region": "Karlovarský kraj",
  "usti nad labem region": "Ústecký kraj",
  "liberec region": "Liberecký kraj",
  "hradec kralove region": "Královéhradecký kraj",
  "pardubice region": "Pardubický kraj",
  "south moravian region": "Jihomoravský kraj",
  "olomouc region": "Olomoucký kraj",
  "zlin region": "Zlínský kraj",
  "moravian-silesian region": "Moravskoslezský kraj",
};

const REGIONS_BY_NAME = new Map<string, string>(
  REGION_OPTIONS.map((option) => [normalize(option), option])
);

/**
 * The Kraj option for a Google address, or "" when it cannot be told.
 *
 * `countryCode` is the two-letter code from Google's `country` component; when
 * it names anywhere but Czechia the answer is "Zahraničí" regardless of what
 * the region component says.
 */
export const matchRegionOption = (
  adminArea: string | null | undefined,
  countryCode?: string | null
): string => {
  const country = normalize(String(countryCode ?? ""));
  if (country && country !== "cz" && country !== "cze" && country !== "cesko" && country !== "czechia") {
    return "Zahraničí";
  }

  const name = normalize(String(adminArea ?? ""));
  if (!name) return "";

  return REGIONS_BY_NAME.get(name) ?? REGION_ALIASES[name] ?? "";
};
