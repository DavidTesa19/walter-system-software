// Motivy from a website (palettes/siteColors.js): the SSRF guard refuses
// every non-public address, and the colour/font extraction reads what a
// site's styles actually use. No network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl, extractStyle, isBlockedAddress, toHex } from '../palettes/siteColors.js';

test('private, loopback, link-local and metadata addresses are blocked', () => {
  for (const address of ['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  for (const address of ['8.8.8.8', '151.101.1.69', '2606:4700::6810:84e5']) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

test('only plain http(s) addresses on the usual ports are accepted', () => {
  assert.ok(checkUrl('https://firma.cz/o-nas'));
  for (const bad of ['file:///etc/passwd', 'ftp://firma.cz', 'http://user:pw@firma.cz', 'http://firma.cz:8080', 'http://127.0.0.1/', 'http://[::1]/', 'not a url']) {
    assert.throws(() => checkUrl(bad), undefined, bad);
  }
});

test('colours are normalised to #rrggbb, transparent ones dropped', () => {
  assert.equal(toHex('#ABC'), '#aabbcc');
  assert.equal(toHex('#0050ffcc'), '#0050ff');
  assert.equal(toHex('rgb(0, 80, 255)'), '#0050ff');
  assert.equal(toHex('rgba(0,0,0,0.1)'), null);
});

test('theme-color, brand variables, the most used colours and fonts are found', () => {
  const html = `<html><head><meta name="theme-color" content="#0050ff">
    <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;700" rel="stylesheet">
    <style>:root { --brand-primary: #0050ff; --text: #111; } body { font-family: 'Work Sans', sans-serif; }</style></head></html>`;
  const css = 'a, .btn { color: #0050FF; background: #00dc7d; } .btn:hover { background: #0050ff; } h1 { font-family: "Onair", Arial !important; color: #222222 }';
  const style = extractStyle(html, [css]);
  assert.equal(style.themeColor, '#0050ff');
  assert.deepEqual(style.variables, [{ name: '--brand-primary', color: '#0050ff' }]);
  assert.equal(style.brand[0].color, '#0050ff');
  assert.ok(style.brand.some((entry) => entry.color === '#00dc7d'));
  assert.ok(style.neutrals.some((entry) => entry.color === '#222222'));
  assert.equal(style.fonts[0], 'Work Sans');
  assert.ok(style.fonts.includes('Onair'));
});
