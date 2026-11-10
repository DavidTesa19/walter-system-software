// CI check: no stylesheet may name a serif font, or a font stack without a
// sans-serif (or monospace) fallback. The page font comes from
// src/styles/global.css; a component either inherits it, uses
// var(--font-body) / var(--font-heading), or names a stack that ends in a
// sans-serif generic. Run: npm run check:fonts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const SAFE_GENERICS = /(^|,)\s*(sans-serif|monospace|system-ui|ui-sans-serif|ui-monospace|emoji)\s*(!important)?\s*$/i;
const KEYWORDS = /^(inherit|initial|unset|revert)\s*(!important)?$/i;

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.css')) files.push(full);
  }
};
walk(root);

const problems = [];
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = /(?:^|[\s;{])font-family\s*:\s*([^;}]+)/i.exec(line);
    if (!match) return;
    const value = match[1].trim();
    if (value.includes('var(') || KEYWORDS.test(value)) return;
    if (SAFE_GENERICS.test(value)) return;
    problems.push(`${path.relative(path.join(root, '..'), file)}:${index + 1}  font-family: ${value}`);
  });
}

if (problems.length) {
  console.error('Fonts must be sans-serif: inherit, use var(--font-body), or end the stack with sans-serif.');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Fonts OK (${files.length} stylesheets).`);
