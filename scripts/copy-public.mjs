import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const src = resolve(root, 'src/plugin/dashboard/public');
const dest = resolve(root, 'dist/plugin/dashboard/public');

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

console.log(`Copied public assets to ${dest}`);
