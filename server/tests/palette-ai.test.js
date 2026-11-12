// Motivy › AI návrh: the checks run on every proposal before it is shown.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkProposal, contrast, normalizeWebsite } from '../palettes/aiPalette.js';

const light = {
  primary: '#2563eb',
  accent: '#0d9488',
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#0f172a',
  muted: '#475569',
  border: '#e2e8f0',
};

test('WCAG contrast of known pairs', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(contrast('#ffffff', '#ffffff').toFixed(1), '1.0');
  assert.ok(Math.abs(contrast('#767676', '#ffffff') - 4.54) < 0.01, 'the classic 4.5:1 grey');
});

test('a readable light palette passes, unreadable text and the wrong mode do not', () => {
  assert.deepEqual(checkProposal({ colors: light }, 'light'), []);
  const greyText = checkProposal({ colors: { ...light, text: '#cbd5e1' } }, 'light');
  assert.equal(greyText.length, 2, 'text on background and on cards');
  assert.match(greyText[0], /Text na pozadí/);
  assert.ok(checkProposal({ colors: light }, 'dark').some((problem) => /tmavý režim/.test(problem)));
  assert.match(checkProposal({ colors: { ...light, border: 'grey' } }, 'light')[0], /border/);
});

test('web addresses: a bare domain gets https, other schemes are refused', () => {
  assert.equal(normalizeWebsite(''), '');
  assert.equal(normalizeWebsite('alza.cz'), 'https://alza.cz/');
  assert.equal(normalizeWebsite('http://example.com/brand'), 'http://example.com/brand');
  assert.equal(normalizeWebsite('javascript:alert(1)'), null);
  assert.equal(normalizeWebsite('file:///etc/passwd'), null);
  assert.equal(normalizeWebsite('example.com:8080/x'), 'https://example.com:8080/x');
  assert.equal(normalizeWebsite('ftp://example.com'), null);
});

test('a theme to adjust is read from the form, and a malformed one is refused', async () => {
  const { parseBasePalette } = await import('../palettes/aiPalette.js');
  const colors = { primary: '#2563eb', accent: '#f59e0b', background: '#f8fafc', surface: '#ffffff', text: '#0f172a', muted: '#475569', border: '#e2e8f0' };
  assert.equal(parseBasePalette(''), null);
  const base = parseBasePalette(JSON.stringify({ name: 'Firemní', colors, typography: { heading: "'Inter', sans-serif" }, id: 7 }));
  assert.equal(base.name, 'Firemní');
  assert.equal(base.colors.primary, '#2563eb');
  assert.equal(base.id, undefined, 'only what the prompt needs');
  assert.equal(parseBasePalette('{not json'), undefined);
  assert.equal(parseBasePalette(JSON.stringify({ name: 'X', colors: { ...colors, text: 'black' } })), undefined);
});
