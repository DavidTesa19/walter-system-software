// Motivy › sharing. Every user keeps their own palettes (user_palettes in
// Postgres, users[].palettes in the JSON store); a palette marked `is_shared`
// is listed to everyone else under "Sdílené od kolegů", read only. Using one
// makes a copy in the user's own list, so the owner's later edits or deletion
// never change anybody else's look.

/** Plain shape of a shared palette as the other users see it. */
export const toSharedPalette = (palette, owner) => ({
  id: palette.id,
  name: palette.name,
  mode: palette.mode === 'dark' ? 'dark' : 'light',
  colors: palette.colors,
  typography: palette.typography,
  owner_id: owner.id,
  owner_name: owner.username,
  updated_at: palette.updated_at ?? null,
});

const byOwnerModeName = (a, b) =>
  String(a.owner_name).localeCompare(String(b.owner_name), 'cs') ||
  (a.mode === b.mode ? 0 : a.mode === 'light' ? -1 : 1) ||
  String(a.name).localeCompare(String(b.name), 'cs');

/** JSON store: everyone else's shared palettes, ordered by owner, mode, name. */
export function sharedPalettesFromUsers(users, selfId) {
  const result = [];
  for (const user of users ?? []) {
    if (!user || user.id === selfId || !Array.isArray(user.palettes)) continue;
    for (const palette of user.palettes) {
      if (palette?.is_shared) result.push(toSharedPalette(palette, user));
    }
  }
  return result.sort(byOwnerModeName);
}

/** Postgres: the same list in one query. */
export async function sharedPalettesFromDb(query, selfId) {
  const { rows } = await query(
    `SELECT p.id, p.name, p.mode, p.colors, p.typography, p.updated_at, u.id AS owner_id, u.username AS owner_name
       FROM user_palettes p
       JOIN users u ON u.id = p.user_id
      WHERE p.is_shared = true AND p.user_id <> $1`,
    [selfId]
  );
  const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
  return rows
    .map((row) => toSharedPalette({ ...row, colors: parse(row.colors), typography: parse(row.typography) }, { id: row.owner_id, username: row.owner_name }))
    .sort(byOwnerModeName);
}

/** The `is_shared` part of a palette payload: a boolean, or nothing. */
export const readShareFlag = (body) =>
  body && body.is_shared !== undefined ? { is_shared: Boolean(body.is_shared) } : {};
