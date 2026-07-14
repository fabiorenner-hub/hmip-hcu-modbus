import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/** Persistent OTA state under /data/ota/state.json. Node builtins only so the
 *  bootstrap loader can use it without pulling in app code or node_modules. */
export interface OtaState {
  activeVersion: string | null;
  bootAttempts: number;
  lastGoodAt: number | null;
  quarantined: string[];
}

export function defaultOtaState(): OtaState {
  return { activeVersion: null, bootAttempts: 0, lastGoodAt: null, quarantined: [] };
}

export function statePath(otaDir: string): string {
  return join(otaDir, 'state.json');
}

export async function readOtaState(otaDir: string): Promise<OtaState> {
  try {
    const raw = await fs.readFile(statePath(otaDir), 'utf8');
    const o = JSON.parse(raw) as Partial<OtaState>;
    return {
      activeVersion: typeof o.activeVersion === 'string' ? o.activeVersion : null,
      bootAttempts: Number.isFinite(o.bootAttempts) ? Number(o.bootAttempts) : 0,
      lastGoodAt: typeof o.lastGoodAt === 'number' ? o.lastGoodAt : null,
      quarantined: Array.isArray(o.quarantined)
        ? o.quarantined.filter((x): x is string => typeof x === 'string')
        : [],
    };
  } catch {
    return defaultOtaState();
  }
}

export async function writeOtaState(otaDir: string, state: OtaState): Promise<void> {
  await fs.mkdir(otaDir, { recursive: true });
  const tmp = join(otaDir, `state.json.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, statePath(otaDir));
}
