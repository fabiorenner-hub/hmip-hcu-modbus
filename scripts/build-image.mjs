import { execSync } from 'node:child_process';
import { readFileSync, createReadStream, createWriteStream, rmSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
const name = 'hmip-hcu-modbus';
const tag = `${name}:${version}`;
const tarFile = `${name}-${version}-arm64.tar`;
const artifact = `${tarFile}.gz`;

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

// Build an arm64 image and load it into the local daemon.
run(`docker buildx build --platform linux/arm64 --build-arg MODBUS_BRIDGE_VERSION=${version} -t ${tag} --load .`);

// Export as a plain tar, then gzip it with Node's zlib (cross-platform; the
// Windows shell has no `gzip`). Finally remove the intermediate tar.
run(`docker save ${tag} -o ${tarFile}`);
const src = resolve(root, tarFile);
const dest = resolve(root, artifact);
console.log(`Compressing ${tarFile} -> ${artifact}`);
await pipeline(createReadStream(src), createGzip({ level: 9 }), createWriteStream(dest));
rmSync(src, { force: true });

console.log(`\nArtifact written: ${artifact}`);

