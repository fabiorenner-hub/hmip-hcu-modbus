import { existsSync, readFileSync } from 'node:fs';
import { APP_VERSION } from '../shared/version.js';

export const PLUGIN_ID = 'de.fr.renner.plugin.modbusbridge';
export const PLUGIN_FRIENDLY = { de: 'Modbus Bridge', en: 'Modbus Bridge' };

export interface Env {
  dataDir: string;
  dashboardPort: number;
  noConnect: boolean;
  connectUrl: string;
  authToken: string | null;
  buildId: string;
}

function resolveToken(explicit: string | undefined, tokenPath: string | undefined): string | null {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const candidates = [tokenPath, '/TOKEN'].filter((p): p is string => Boolean(p));
  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        const raw = readFileSync(path, 'utf8').trim();
        if (raw.length > 0) return raw;
      }
    } catch {
      // ignore unreadable token candidates
    }
  }
  return null;
}

function makeBuildId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
  const sha = process.env.MODBUS_BRIDGE_GIT_SHA ?? process.env.GIT_SHA;
  return `${APP_VERSION}+${stamp}${sha ? `.${sha.slice(0, 7)}` : ''}`;
}

export function readEnv(): Env {
  const e = process.env;
  const port = Number.parseInt(e.MODBUS_BRIDGE_DASHBOARD_PORT ?? '8091', 10);
  return {
    dataDir: e.MODBUS_BRIDGE_DATA_DIR ?? '/data',
    dashboardPort: Number.isFinite(port) ? port : 8091,
    noConnect: e.MODBUS_BRIDGE_NO_CONNECT === 'true' || e.MODBUS_BRIDGE_NO_CONNECT === '1',
    connectUrl: e.MODBUS_BRIDGE_CONNECT_URL ?? 'wss://host.containers.internal:9001',
    authToken: resolveToken(e.MODBUS_BRIDGE_AUTH_TOKEN, e.MODBUS_BRIDGE_TOKEN_PATH),
    buildId: process.env.MODBUS_BRIDGE_BUILD_ID ?? makeBuildId(),
  };
}
