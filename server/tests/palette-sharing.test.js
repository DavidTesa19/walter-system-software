import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVisibility, sharedPalettesFromDb, sharedPalettesFromUsers } from '../palettes/sharing.js';

const base = { primary: '#000', accent: '#111', background: '#fff', surface: '#fff', text: '#000', muted: '#666', border: '#ddd' };
const look = (primary) => ({ ...base, primary });
const typography = { heading: 'Inter', subheading: 'Inter', body: 'Inter' };

const users = [
  { id: 1, username: 'david', palettes: [
    { id: 1, name: 'Moje tmavá', mode: 'dark', colors: look('#a00'), typography, is_active: true, is_shared: true },
    { id: 2, name: 'Soukromá', mode: 'light', colors: look('#b00'), typography, is_active: true, is_private: true },
  ] },
  { id: 2, username: 'eva', palettes: [
    { id: 1, name: 'Zelená', mode: 'dark', colors: look('#0a0'), typography, is_shared: true },
    { id: 2, name: 'Firemní', mode: 'light', colors: look('#0b0'), typography },
    { id: 3, name: 'Pokus', mode: 'light', colors: look('#0c0'), typography, is_private: true },
  ] },
  { id: 3, username: 'adam' },
  { id: 4, username: 'Čeněk', palettes: [{ id: 1, name: 'Modrá', mode: 'light', colors: look('#00a'), typography }] },
];

test('every other user\'s palette is public unless private, with owner and team flag', () => {
  const list = sharedPalettesFromUsers(users, 1);
  assert.deepEqual(list.map((p) => `${p.owner_name}/${p.name}`), ['Čeněk/Modrá', 'eva/Firemní', 'eva/Zelená']);
  assert.equal(list[1].owner_id, 2);
  assert.equal(list[1].is_shared, false);
  assert.equal(list[2].is_shared, true, 'a team palette is marked');
  assert.equal('is_active' in list[1], false, 'the owner\'s active state is not shown to others');
});

test('the owner never sees their own palettes in the list, and private ones stay hidden', () => {
  const list = sharedPalettesFromUsers(users, 2);
  assert.deepEqual(list.map((p) => p.name), ['Modrá', 'Moje tmavá']);
});

test('untouched starter palettes are left out unless put in Tým', () => {
  const starter = { mode: 'light', colors: look('hsl(221, 83%, 55%)') };
  const people = [
    { id: 2, username: 'eva', palettes: [
      { id: 1, name: 'Walter Light', mode: 'light', colors: look('hsl(221,83%,55%)'), typography },
      { id: 2, name: 'Přejmenovaná', mode: 'light', colors: look('hsl(221, 83%, 55%)'), typography, is_shared: true },
      { id: 3, name: 'Tmavá stejná', mode: 'dark', colors: look('hsl(221, 83%, 55%)'), typography },
    ] },
  ];
  const list = sharedPalettesFromUsers(people, 1, [starter]);
  assert.deepEqual(list.map((p) => p.name), ['Přejmenovaná', 'Tmavá stejná'], 'spacing is ignored, mode matters, a team starter shows');
});

test('a look several people have is listed once, under whoever had it first', () => {
  const people = [
    { id: 1, username: 'david', palettes: [{ id: 5, name: 'Červená', mode: 'light', colors: look('#f00'), typography }] },
    { id: 2, username: 'eva', palettes: [{ id: 1, name: 'Červená', mode: 'light', colors: look('#f00'), typography }] },
    { id: 3, username: 'max', palettes: [
      { id: 1, name: 'Červená kopie', mode: 'light', colors: look('#f00'), typography },
      { id: 2, name: 'Max týmová kopie', mode: 'light', colors: look('#f00'), typography, is_shared: true },
    ] },
  ];
  // david (user 1) had it first: max sees it under david only (his own are never listed to him).
  assert.deepEqual(sharedPalettesFromUsers(people, 3).map((p) => `${p.owner_name}/${p.name}`), ['david/Červená']);
  // david's own earlier copy hides eva's and max's plain copies; a team copy always shows.
  assert.deepEqual(sharedPalettesFromUsers(people, 1).map((p) => `${p.owner_name}/${p.name}`), ['max/Max týmová kopie']);
  // created_at, when present, decides the age.
  const dated = people.map((user) => ({
    ...user,
    palettes: user.palettes.map((p) => ({ ...p, created_at: user.id === 2 ? '2026-01-01T00:00:00Z' : '2026-06-01T00:00:00Z' })),
  }));
  assert.deepEqual(sharedPalettesFromUsers(dated, 3).map((p) => `${p.owner_name}/${p.name}`), ['eva/Červená']);
});

test('Postgres: private rows are not read, starters and later copies are left out, rows parsed and sorted', async () => {
  let seen;
  const seed = look('#123456');
  const query = async (sql, params) => {
    if (/FROM color_palettes/.test(sql)) return { rows: [{ mode: 'light', colors: JSON.stringify(seed) }] };
    seen = { sql, params };
    return { rows: [
      { id: 7, name: 'B', mode: 'dark', colors: JSON.stringify(look('#0a0')), typography, is_shared: true, owner_id: 2, owner_name: 'eva' },
      { id: 8, name: 'A', mode: 'light', colors: look('#0b0'), typography: JSON.stringify(typography), is_shared: false, owner_id: 2, owner_name: 'eva' },
      { id: 9, name: 'Startovní', mode: 'light', colors: seed, typography, is_shared: false, owner_id: 2, owner_name: 'eva' },
      { id: 3, name: 'Moje', mode: 'light', colors: look('#0c0'), typography, is_shared: false, owner_id: 1, owner_name: 'david' },
      { id: 10, name: 'Kopie mé', mode: 'light', colors: look('#0c0'), typography, is_shared: false, owner_id: 2, owner_name: 'eva' },
    ] };
  };
  const list = await sharedPalettesFromDb(query, 1);
  assert.match(seen.sql, /WHERE p\.is_private = false/);
  assert.deepEqual(list.map((p) => p.name), ['A', 'B']);
  assert.equal(list[1].colors.primary, '#0a0');
  assert.equal(list[1].is_shared, true);
  assert.equal(list[0].typography.body, 'Inter');
});

test('visibility flags are read only when sent, and private wins over team', () => {
  assert.deepEqual(readVisibility({}), {});
  assert.deepEqual(readVisibility(undefined), {});
  assert.deepEqual(readVisibility({ is_shared: 1 }), { is_shared: true, is_private: false });
  assert.deepEqual(readVisibility({ is_shared: false }), { is_shared: false });
  assert.deepEqual(readVisibility({ is_private: true }), { is_private: true, is_shared: false });
  assert.deepEqual(readVisibility({ is_private: false }), { is_private: false });
  assert.deepEqual(readVisibility({ is_private: true, is_shared: true }), { is_private: true, is_shared: false });
});
