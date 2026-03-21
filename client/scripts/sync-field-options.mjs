import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientOptionsPath = path.resolve(__dirname, '../src/usersGrid/field-options.json');
const publicFormOptionsPath = path.resolve(__dirname, '../../public-form/field-options.json');

if (!existsSync(clientOptionsPath)) {
  console.error(`Missing client field options file: ${clientOptionsPath}`);
  process.exit(1);
}

const publicFormDir = path.dirname(publicFormOptionsPath);
if (!existsSync(publicFormDir)) {
  process.exit(0);
}

mkdirSync(publicFormDir, { recursive: true });
copyFileSync(clientOptionsPath, publicFormOptionsPath);
console.log('Synced field options to public-form/field-options.json');
