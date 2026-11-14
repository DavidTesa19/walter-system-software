// Motivy › who sees which palette. Every user keeps their own palettes
// (user_palettes in Postgres, users[].palettes in the JSON store).
// - Public by default: colleagues see them in a tab named after the owner.
// - `is_private`: only the owner sees it.
// - `is_shared`: also in the "Tým" tab, the team's picked palettes (a private
//   palette is never a team one). A team palette is always listed.
// Copies would otherwise fill every tab with the same palettes: everyone
// starts with copies of the starter palettes (color_palettes, or the built-in
// Walter Light / Dark), and "Použít" copies a colleague's palette. So an
// untouched starter is left out, and a look several people have is listed
// once, under whoever has had it longest (the earliest palette).
// Using a colleague's palette makes a copy in the user's own list, so the
// owner's later edits or deletion never change anybody else's look.

const COLOR_KEYS = ['primary', 'accent', 'background', 'surface', 'text', 'muted', 'border'];

const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

/** Mode and colours, spacing and case ignored: what a palette looks like. */
export const lookKey = (palette) =>
  `${palette?.mode === 'dark' ? 'dark' : 'light'}|${COLOR_KEYS.map((key) =>
    String(parse(palette?.colors)?.[key] ?? '').replace(/\s+/g, '').toLowerCase()).join('|')}`;

/** Plain shape of a palette as the other users see it. */
export const toSharedPalette = (palette, owner) => ({
  id: palette.id,
  name: palette.name,
  mode: palette.mode === 'dark' ? 'dark' : 'light',
  colors: palette.colors,
  typography: palette.typography,
  is_shared: Boolean(palette.is_shared),
  owner_id: owner.id,
  owner_name: owner.username,
  updated_at: palette.updated_at ?? null,
});

const byOwnerModeName = (a, b) =>
  String(a.owner_name).localeCompare(String(b.owner_name), 'cs') ||
  (a.mode === b.mode ? 0 : a.mode === 'light' ? -1 : 1) ||
  String(a.name).localeCompare(String(b.name), 'cs');

/**
 * entries: { palette, owner, order } for every user's palettes (the viewer's
 * own included, since an earlier copy of theirs hides a colleague's later
 * one); `order` ranks age, lower = earlier. Returns what the viewer is shown.
 */
export function listForViewer(entries, selfId, starters = []) {
  const known = new Set(starters.map(lookKey));
  const visible = entries
    .filter((entry) => entry.palette && !entry.palette.is_private)
    .map((entry) => ({ ...entry, key: lookKey(entry.palette) }))
    .sort((a, b) => a.order - b.order);
  const earliest = new Map();
  for (const entry of visible) if (!earliest.has(entry.key)) earliest.set(entry.key, entry);
  return visible
    .filter((entry) => entry.owner.id !== selfId)
    .filter((entry) => entry.palette.is_shared || (!known.has(entry.key) && earliest.get(entry.key) === entry))
    .map((entry) => toSharedPalette(entry.palette, entry.owner))
    .sort(byOwnerModeName);
}

const timeOf = (value) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
};

/** JSON store: palette ids are per user, so age is created_at when there is
 *  one, else the user's id and the palette's own id. */
export function sharedPalettesFromUsers(users, selfId, starters = []) {
  const entries = [];
  for (const user of users ?? []) {
    if (!user || !Array.isArray(user.palettes)) continue;
    for (const palette of user.palettes) {
      const order = timeOf(palette?.created_at) ?? (Number(user.id) || 0) * 1e6 + (Number(palette?.id) || 0);
      entries.push({ palette, owner: user, order });
    }
  }
  return listForViewer(entries, selfId, starters);
}

/** Postgres: user_palettes ids are one sequence, so a lower id is older.
 *  The starters are color_palettes plus `starters`. */
export async function sharedPalettesFromDb(query, selfId, starters = []) {
  const [{ rows }, seeds] = await Promise.all([
    query(
      `SELECT p.id, p.name, p.mode, p.colors, p.typography, p.is_shared, p.updated_at,
              u.id AS owner_id, u.username AS owner_name
         FROM user_palettes p
         JOIN users u ON u.id = p.user_id
        WHERE p.is_private = false`,
      []
    ),
    query('SELECT mode, colors FROM color_palettes', []),
  ]);
  const entries = rows.map((row) => ({
    palette: { ...row, colors: parse(row.colors), typography: parse(row.typography) },
    owner: { id: row.owner_id, username: row.owner_name },
    order: Number(row.id),
  }));
  return listForViewer(entries, selfId, [...starters, ...seeds.rows]);
}

/** The visibility part of a palette payload: only what was sent. Making a
 *  palette private also takes it out of the team's palettes. */
export const readVisibility = (body) => {
  const result = {};
  if (body && body.is_shared !== undefined) result.is_shared = Boolean(body.is_shared);
  if (body && body.is_private !== undefined) {
    result.is_private = Boolean(body.is_private);
    if (result.is_private) result.is_shared = false;
  }
  if (result.is_shared) result.is_private = false;
  return result;
};
