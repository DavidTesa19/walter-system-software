// The section guards at the top of both servers. Until 2026-10-29 they were
// written /^\/api\/projects(\/|$)/, which Express 4 only applied to the bare
// prefix, so no section was enforced below it. This reads the guards out of
// the servers and checks each one really runs for the paths under it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import express from 'express';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every regex literal a server passes to app.use(), or lists for the
// app.use() loop over the public section's paths.
function guardPatterns(file) {
  const source = fs.readFileSync(path.join(serverDir, file), 'utf8');
  const literals = [
    ...source.matchAll(/app\.use\((\/\^\\\/[^\n]*?\/),/g),
    ...source.matchAll(/^\s+(\/\^\\\/[^\n]*?\/),\s*$/gm),
  ].map((match) => match[1]);
  // Our own source, so evaluating the literals is safe.
  return literals.map((literal) => new Function(`return ${literal}`)());
}

// The prefix a guard names, with the first choice of any (a|b) group:
// ^\/api\/partner-(entities|commissions)(?=\/|$) -> /api/partner-entities
const samplePath = (pattern) =>
  pattern.source
    .replace(/^\^/, '')
    .replace(/\(\?=\\\/\|\$\)$/, '')
    .replace(/\(\\\/\|\$\)$/, '')
    .replace(/\(([^|()]+)\|[^)]*\)/g, '$1')
    .replace(/\\\//g, '/');

for (const file of ['server.js', 'server-postgres.js']) {
  test(`${file}: every section guard uses a lookahead`, () => {
    const patterns = guardPatterns(file);
    assert.ok(patterns.length >= 10, `found ${patterns.length} guards`);
    for (const pattern of patterns) {
      assert.ok(!pattern.source.endsWith('(\\/|$)'), `${pattern} consumes the slash; write (?=\\/|$)`);
    }
  });

  test(`${file}: every section guard runs for the paths below it`, async () => {
    const patterns = guardPatterns(file).filter((pattern) => !pattern.source.includes('\\d'));
    const app = express();
    patterns.forEach((pattern, index) => app.use(pattern, (req, res, next) => {
      res.append('x-guard', String(index));
      next();
    }));
    app.use((req, res) => res.end());
    const server = app.listen(0);
    try {
      const { port } = server.address();
      for (const [index, pattern] of patterns.entries()) {
        const prefix = samplePath(pattern);
        const response = await fetch(`http://127.0.0.1:${port}${prefix}/1/x`);
        const ran = (response.headers.get('x-guard') ?? '').split(/,\s*/);
        assert.ok(ran.includes(String(index)), `${pattern} did not run for ${prefix}/1/x`);
      }
    } finally {
      server.close();
    }
  });
}
