import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { PLUGIN_ID } from '../pluginMeta.js';

export type TelemetryEvent = 'start' | 'heartbeat' | 'update';

export interface TelemetryPayload {
  schema: 1;
  event: TelemetryEvent;
  installId: string;
  pluginId: string;
  coreVersion: string;
  otaVersion: string;
  buildId?: string;
  arch?: string;
  hcuFirmware?: string;
  lang?: string;
  ts: string;
}

/** Technical, non-identifying metadata assembled by the host. */
export type TelemetryMeta = Omit<TelemetryPayload, 'schema' | 'event' | 'installId' | 'pluginId' | 'ts'>;

const MAX_BYTES = 4096;
const TIMEOUT_MS = 5000;
const RETRY_MS = 15 * 60 * 1000;

/** Pseudonymous, stable 64-hex install id. Derived from a random value (never
 *  from the HCU serial), stored once under /data — no serial is ever sent. */
async function loadInstallId(dataDir: string): Promise<string> {
  const p = path.join(dataDir, 'analytics-id');
  try {
    const v = (await fs.readFile(p, 'utf8')).trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(v)) return v;
  } catch {
    /* new */
  }
  const id = createHash('sha256').update(randomUUID()).digest('hex');
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(p, `${id}\n`, 'utf8');
  } catch {
    /* ignore */
  }
  return id;
}

interface TelemetryState {
  lastTelemetrySuccess: number | null;
  lastTelemetryAttempt: number | null;
  lastTelemetryEvent: TelemetryEvent | null;
  lastVersion: string | null;
}

export interface CallHomeDeps {
  dataDir: string;
  getConfig: () => { enabled: boolean; endpoint?: string; intervalHours: number; secret?: string };
  buildMeta: () => TelemetryMeta;
  fetchImpl?: (url: string, init: unknown) => Promise<{ ok: boolean; status: number }>;
  logger?: (lvl: 'info' | 'warn', msg: string) => void;
}

export class CallHome {
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private idPromise: Promise<string> | null = null;
  private readonly fetchImpl: (url: string, init: unknown) => Promise<{ ok: boolean; status: number }>;

  constructor(private readonly deps: CallHomeDeps) {
    this.fetchImpl =
      deps.fetchImpl ??
      ((u: string, i: unknown) =>
        (globalThis as unknown as { fetch: (a: string, b: unknown) => Promise<{ ok: boolean; status: number }> }).fetch(u, i));
  }

  private statePath(): string {
    return path.join(this.deps.dataDir, 'analytics-state.json');
  }

  private async readState(): Promise<TelemetryState> {
    try {
      const o = JSON.parse(await fs.readFile(this.statePath(), 'utf8')) as Partial<TelemetryState>;
      return {
        lastTelemetrySuccess: typeof o.lastTelemetrySuccess === 'number' ? o.lastTelemetrySuccess : null,
        lastTelemetryAttempt: typeof o.lastTelemetryAttempt === 'number' ? o.lastTelemetryAttempt : null,
        lastTelemetryEvent: (o.lastTelemetryEvent as TelemetryEvent) ?? null,
        lastVersion: typeof o.lastVersion === 'string' ? o.lastVersion : null,
      };
    } catch {
      return { lastTelemetrySuccess: null, lastTelemetryAttempt: null, lastTelemetryEvent: null, lastVersion: null };
    }
  }

  private async writeState(patch: Partial<TelemetryState>): Promise<void> {
    try {
      const cur = await this.readState();
      const next = { ...cur, ...patch };
      await fs.mkdir(this.deps.dataDir, { recursive: true });
      await fs.writeFile(this.statePath(), JSON.stringify(next), 'utf8');
    } catch {
      /* ignore */
    }
  }

  /** Build the exact payload (also shown in the UI for transparency). */
  async preview(event: TelemetryEvent = 'start'): Promise<TelemetryPayload> {
    this.idPromise ??= loadInstallId(this.deps.dataDir);
    const meta = this.deps.buildMeta();
    return {
      schema: 1,
      event,
      installId: await this.idPromise,
      pluginId: PLUGIN_ID,
      ts: new Date().toISOString(),
      coreVersion: meta.coreVersion,
      otaVersion: meta.otaVersion,
      ...(meta.buildId !== undefined ? { buildId: meta.buildId } : {}),
      ...(meta.arch !== undefined ? { arch: meta.arch } : {}),
      ...(meta.hcuFirmware !== undefined ? { hcuFirmware: meta.hcuFirmware } : {}),
      ...(meta.lang !== undefined ? { lang: meta.lang } : {}),
    };
  }

  /** Fire-and-forget send. Never throws, never blocks the plugin. */
  private async send(event: TelemetryEvent): Promise<void> {
    const cfg = this.deps.getConfig();
    if (!cfg.enabled || !cfg.endpoint || !cfg.endpoint.startsWith('https://')) return;

    await this.writeState({ lastTelemetryAttempt: Date.now() });
    let body = JSON.stringify(await this.preview(event));
    if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) return; // never send oversized

    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cfg.secret) headers['X-HPA-Ping-Secret'] = cfg.secret;
      const res = await this.fetchImpl(cfg.endpoint, { method: 'POST', headers, body, signal: controller.signal });
      if (res.status === 204 || res.ok) {
        await this.writeState({ lastTelemetrySuccess: Date.now(), lastTelemetryEvent: event });
      } else {
        this.scheduleRetry(event);
      }
    } catch {
      this.scheduleRetry(event);
    } finally {
      clearTimeout(abort);
      body = '';
    }
  }

  /** One delayed retry (>= 15 min); no unbounded fast retries. */
  private scheduleRetry(event: TelemetryEvent): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.send(event).catch(() => undefined);
    }, RETRY_MS);
    this.deps.logger?.('warn', `telemetry ${event} failed; retry in ${RETRY_MS / 60000} min`);
  }

  start(): void {
    if (this.timer) return;
    // Determine start vs update from the last-seen running version.
    void (async () => {
      const state = await this.readState();
      const current = this.deps.buildMeta().otaVersion;
      const event: TelemetryEvent = state.lastVersion && state.lastVersion !== current ? 'update' : 'start';
      await this.writeState({ lastVersion: current });
      setTimeout(() => void this.send(event).catch(() => undefined), 8000);
    })();

    const h = Math.min(168, Math.max(1, this.deps.getConfig().intervalHours));
    this.timer = setInterval(() => {
      void this.send('heartbeat').catch(() => undefined);
    }, h * 3_600_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
