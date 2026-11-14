import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readShareFlag, sharedPalettesFromDb, sharedPalettesFromUsers } from '../palettes/sharing.js';

const colors = { primary: '#000', accent: '#111', background: '#fff', surface: '#fff', text: '#000', muted: '#666', border: '#ddd' };
const typography = { heading: 'Inter', subheading: 'Inter', body: 'Inter' };

const users = [
  { id: 1, username: 'david', palettes: [
    { id: 1, name: 'Moje tmavá', mode: 'dark', colors, typography, is_active: true, is_shared: true },
    { id: 2, name: 'Soukromá', mode: 'light', colors, typography, is_active: true },
  ] },
  { id: 2, username: 'eva', palettes: [
    { id: 1, name: 'Zelená', mode: 'dark', colors, typography, is_shared: true },
    { id: 2, name: 'Firemní', mode: 'light', colors, typography, is_shared: true },
    { id: 3, name: 'Pokus', mode: 'light', colors, typography, is_shared: false },
  ] },
  { id: 3, username: 'adam' },
  { id: 4, username: 'Čeněk', palettes: [{ id: 1, name: 'Modrá', mode: 'light', colors, typography, is_shared: true }] },
];

test('lists only other users\' shared palettes, with their owner', () => {
  const list = sharedPalettesFromUsers(users, 1);
  assert.deepEqual(list.map((p) => `${p.owner_name}/${p.name}`), ['Čeněk/Modrá', 'eva/Firemní', 'eva/Zelená']);
  assert.equal(list[1].owner_id, 2);
  assert.equal('is_active' in list[1], false, 'the owner\'s active state is not shown to others');
});

test('the owner sees the others\' palettes but never their own', () => {
  const list = sharedPalettesFromUsers(users, 2);
  assert.deepEqual(list.map((p) => p.name), ['Modrá', 'Moje tmavá']);
});

test('Postgres rows are parsed and sorted like the JSON store', async () => {
  let seen;
  const query = async (sql, params) => {
    seen = { sql, params };
    return { rows: [
      { id: 7, name: 'B', mode: 'dark', colors: JSON.stringify(colors), typography, owner_id: 2, owner_name: 'eva' },
      { id: 8, name: 'A', mode: 'light', colors, typography: JSON.stringify(typography), owner_id: 2, owner_name: 'eva' },
    ] };
  };
  const list = await sharedPalettesFromDb(query, 1);
  assert.deepEqual(seen.params, [1]);
  assert.match(seen.sql, /is_shared = true AND p\.user_id <> \$1/);
  assert.deepEqual(list.map((p) => p.name), ['A', 'B']);
  assert.equal(list[1].colors.primary, '#000');
  assert.equal(list[0].typography.body, 'Inter');
});

test('the share flag is read only when sent', () => {
  assert.deepEqual(readShareFlag({}), {});
  assert.deepEqual(readShareFlag({ is_shared: 1 }), { is_shared: true });
  assert.deepEqual(readShareFlag({ is_shared: false }), { is_shared: false });
  assert.deepEqual(readShareFlag(undefined), {});
});
