import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { APP_VERSION } from '../shared/version.js';
import { ENV_PREFIX } from '../plugin/pluginMeta.js';
import { readOtaState, writeOtaState, type OtaState } from '../plugin/ota/state.js';
import { isAtLeast, isNewerWithBuild } from '../plugin/ota/semver.js';

// The loader is the IMAGE-only entrypoint. It must import ONLY node builtins and
// leaf modules (state/semver/version/pluginMeta) — never app code or node_modules,
// so a broken OTA payload can never take the loader down with it.

export interface LoaderManifest {
  version?: string;
  minCoreVersion?: string;
  mainSha256?: string;
}

export type BundleTarget = 'ota' | 'image';
export interface BundleDecision {
  target: BundleTarget;
  reason: string;
  quarantine: boolean;
}

const MAX_BOOTS = 3;

/** A fresh, equal-or-newer core image supersedes an older OTA payload. */
export function otaNewerThanCore(otaVersion: string, coreVersion: string): boolean {
  return isNewerWithBuild(otaVersion, coreVersion);
}

/** Pure decision: which bundle to run, and whether to quarantine the payload. */
export function decideBundle(input: {
  hasActive: boolean;
  manifest: LoaderManifest | null;
  mainShaActual: string | null;
  coreVersion: string;
  bootAttempts: number;
  maxBoots?: number;
}): BundleDecision {
  const maxBoots = input.maxBoots ?? MAX_BOOTS;
  if (!input.hasActive) return { target: 'image', reason: 'no-ota', quarantine: false };

  const m = input.manifest;
  if (!m || !m.version || !m.minCoreVersion) {
    return { target: 'image', reason: 'bad-manifest', quarantine: true };
  }
  // Validate active/main.js against the manifest's mainSha256 (NOT the bundle
  // file hash). Missing mainSha256 (old payload) is not treated as a mismatch.
  if (m.mainSha256) {
    if (input.mainShaActual === null || input.mainShaActual.toLowerCase() !== m.mainSha256.toLowerCase()) {
      return { target: 'image', reason: 'sha-mismatch', quarantine: true };
    }
  }
  // Payload needs a newer core image → run image, but do NOT quarantine (payload is fine).
  if (!isAtLeast(input.coreVersion, m.minCoreVersion)) {
    return { target: 'image', reason: 'requires-core', quarantine: false };
  }
  // Fresh image supersedes an older/equal OTA payload.
  if (!otaNewerThanCore(m.version, input.coreVersion)) {
    return { target: 'image', reason: 'core-supersedes', quarantine: false };
  }
  // Crash-loop guard.
  if (input.bootAttempts >= maxBoots) {
    return { target: 'image', reason: 'crash-loop', quarantine: true };
  }
  return { target: 'ota', reason: 'ota', quarantine: false };
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] loader: ${msg}`);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(p: string): Promise<LoaderManifest | null> {
  try {
    const o = JSON.parse(await fs.readFile(p, 'utf8')) as Record<string, unknown>;
    return {
      ...(typeof o['version'] === 'string' ? { version: o['version'] } : {}),
      ...(typeof o['minCoreVersion'] === 'string' ? { minCoreVersion: o['minCoreVersion'] } : {}),
      ...(typeof o['mainSha256'] === 'string' ? { mainSha256: o['mainSha256'] } : {}),
    };
  } catch {
    return null;
  }
}

async function sha256File(p: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await fs.readFile(p)).digest('hex');
  } catch {
    return null;
  }
}

function installHealthyHook(otaDir: string): void {
  (globalThis as { __otaMarkHealthy?: () => void }).__otaMarkHealthy = () => {
    void (async () => {
      try {
        const st = await readOtaState(otaDir);
        st.bootAttempts = 0;
        st.lastGoodAt = Date.now();
        await writeOtaState(otaDir, st);
      } catch {
        /* ignore */
      }
    })();
  };
}

async function importAndRun(entry: string): Promise<void> {
  const mod = (await import(entry)) as { main?: () => Promise<void> | void };
  if (typeof mod.main === 'function') await mod.main();
}

async function quarantine(otaDir: string, active: string, state: OtaState, version?: string): Promise<void> {
  if (version) state.quarantined = Array.from(new Set([...state.quarantined, version]));
  try {
    await fs.rm(active, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  state.activeVersion = null;
  state.bootAttempts = 0;
  await writeOtaState(otaDir, state);
}

export async function runLoader(): Promise<void> {
  const prefix = ENV_PREFIX;
  const dataDir = process.env[`${prefix}_DATA_DIR`] ?? '/data';
  const coreVersion = process.env[`${prefix}_VERSION`] ?? APP_VERSION;
  const otaDir = join(dataDir, 'ota');
  const active = join(otaDir, 'active');
  const mainPath = join(active, 'main.js');
  const imageEntry = new URL('../plugin/index.js', import.meta.url).href;

  const hasActive = await fileExists(mainPath);
  let manifest: LoaderManifest | null = null;
  let mainShaActual: string | null = null;
  if (hasActive) {
    manifest = await readManifest(join(active, 'manifest.json'));
    mainShaActual = await sha256File(mainPath);
  }

  const state = await readOtaState(otaDir);
  const decision = decideBundle({ hasActive, manifest, mainShaActual, coreVersion, bootAttempts: state.bootAttempts });
  log(`decide → ${decision.target} (${decision.reason}); core=${coreVersion} ota=${manifest?.version ?? '-'}`);

  if (decision.quarantine) {
    await quarantine(otaDir, active, state, manifest?.version);
  }

  if (decision.target === 'image') {
    process.env[`${prefix}_PUBLIC_DIR`] = fileURLToPath(new URL('../plugin/dashboard/public', import.meta.url));
    installHealthyHook(otaDir);
    await importAndRun(imageEntry);
    return;
  }

  // Run the OTA payload; bump attempts first, __otaMarkHealthy resets on success.
  state.bootAttempts += 1;
  state.activeVersion = manifest?.version ?? null;
  await writeOtaState(otaDir, state);
  process.env[`${prefix}_OTA_ACTIVE`] = 'true';
  if (manifest?.version) process.env[`${prefix}_OTA_VERSION`] = manifest.version;
  process.env[`${prefix}_PUBLIC_DIR`] = join(active, 'public');
  installHealthyHook(otaDir);
  log(`running OTA bundle ${manifest?.version ?? '?'}`);
  try {
    await importAndRun(pathToFileURL(mainPath).href);
  } catch (err) {
    log(`OTA start failed: ${String(err)} → quarantine + image fallback`);
    await quarantine(otaDir, active, state, manifest?.version);
    delete process.env[`${prefix}_OTA_ACTIVE`];
    delete process.env[`${prefix}_OTA_VERSION`];
    installHealthyHook(otaDir);
    await importAndRun(imageEntry);
  }
}

// Only auto-run when executed as the entrypoint (not when imported by tests).
const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  void runLoader();
}
