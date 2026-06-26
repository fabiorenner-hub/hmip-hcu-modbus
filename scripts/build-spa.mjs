import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

await build({
  entryPoints: [resolve(root, 'src/plugin/dashboard/spa/main.tsx')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  outfile: resolve(root, 'src/plugin/dashboard/public/app.js'),
  logLevel: 'info',
});

console.log('SPA bundle written to src/plugin/dashboard/public/app.js');
