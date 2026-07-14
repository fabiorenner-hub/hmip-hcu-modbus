import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const channel = process.argv[2] === 'experimental' ? 'experimental' : 'stable';
const name = pkg.name; // hmip-hcu-modbus
const version = pkg.version; // X.Y.Z
const repo = (pkg.repository?.url ?? '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '')
  .replace('https://github.com/', '');

function utcStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
}

const otaVersion = channel === 'experimental' ? `${version}+exp.${utcStamp()}` : version;
const bundleName = channel === 'experimental' ? `${name}-ota-exp.json` : `${name}-ota-${version}.json`;
const manifestName = channel === 'experimental' ? 'ota-manifest-exp.json' : 'ota-manifest.json';
const tag = channel === 'experimental' ? 'experimental' : `v${version}`;
const assetUrl = `https://github.com/${repo}/releases/download/${tag}/${bundleName}`;

// Ensure the SPA + icon are fresh before packing.
execFileSync(process.execPath, [resolve(here, 'build-spa.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(here, 'make-icon.mjs')], { cwd: root, stdio: 'inherit' });

// Bundle the OTA payload entry (same source as the image bundle's main).
const outDir = resolve(root, 'dist/ota');
mkdirSync(outDir, { recursive: true });
await build({
  entryPoints: [resolve(root, 'src/plugin/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: join(outDir, 'main.js'),
  banner: { js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);" },
  logLevel: 'info',
});

const files = {};
files['main.js'] = readFileSync(join(outDir, 'main.js')).toString('base64');

const publicDir = resolve(root, 'src/plugin/dashboard/public');
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else {
      const rel = `public/${relative(publicDir, full).split('\\').join('/')}`;
      files[rel] = readFileSync(full).toString('base64');
    }
  }
}
walk(publicDir);

const bundleObj = { format: `${name}-ota-1`, version: otaVersion, files };
const bundleBytes = Buffer.from(JSON.stringify(bundleObj));
const sha256 = createHash('sha256').update(bundleBytes).digest('hex');

const manifest = {
  version: otaVersion,
  minCoreVersion: version,
  sha256,
  assetUrl,
  bundleName,
};

writeFileSync(resolve(root, bundleName), bundleBytes);
writeFileSync(resolve(root, manifestName), JSON.stringify(manifest, null, 2));

console.log(`OTA ${channel}: ${bundleName} (${(bundleBytes.length / 1024).toFixed(1)} KiB), version ${otaVersion}`);
console.log(`manifest: ${manifestName} → ${assetUrl}`);
