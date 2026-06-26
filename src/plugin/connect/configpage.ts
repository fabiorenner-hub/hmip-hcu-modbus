import type { AppConfig } from '../../shared/schema.js';
import type { ConfigTemplateResponseBody, PropertyTemplate } from './types.js';

/** Pick a localized string; HCU sends a languageCode (e.g. "de", "en"). */
function loc(lang: string | undefined, de: string, en: string): string {
  return (lang ?? 'de').toLowerCase().startsWith('en') ? en : de;
}

/**
 * Build the CONFIG_TEMPLATE_RESPONSE body shown on the native HCU plugin
 * configuration page. Exposes the dashboard on/off switch, its port and a link
 * to the dashboard. Pure — no I/O.
 *
 * Per spec §6.5.4 all property values are String-typed (`currentValue`,
 * `defaultValue`), while `minimum`/`maximum` are integers.
 */
export function buildConfigTemplate(
  config: AppConfig,
  dashboardUrl: string,
  languageCode?: string,
): ConfigTemplateResponseBody {
  const dashboardEnabled: PropertyTemplate = {
    dataType: 'BOOLEAN',
    friendlyName: loc(languageCode, 'Dashboard aktiv', 'Dashboard enabled'),
    description: loc(
      languageCode,
      'Schaltet den eingebauten Web-Konfigurator (Hubs, Geräte, Zuordnungen) ein oder aus.',
      'Enables or disables the built-in web configurator (hubs, devices, bindings).',
    ),
    currentValue: config.dashboard.enabled ? 'true' : 'false',
    groupId: 'dashboard',
    order: 1,
  };

  const dashboardPort: PropertyTemplate = {
    dataType: 'INTEGER',
    friendlyName: loc(languageCode, 'Dashboard-Port', 'Dashboard port'),
    description: loc(
      languageCode,
      'Port des Web-Konfigurators. Muss auf der HCU eindeutig sein. Nach Änderung startet das Dashboard neu.',
      'Port of the web configurator. Must be unique on the HCU. The dashboard restarts after a change.',
    ),
    minimum: 1025,
    maximum: 65535,
    currentValue: String(config.dashboard.port),
    groupId: 'dashboard',
    order: 2,
  };

  const dashboardLink: PropertyTemplate = {
    dataType: 'WEBLINK',
    friendlyName: loc(languageCode, 'Dashboard öffnen', 'Open dashboard'),
    // WEBLINK: currentValue = link, defaultValue = additional info text (spec §6.6.x).
    currentValue: dashboardUrl,
    defaultValue: loc(
      languageCode,
      `Erreichbar auf Port ${config.dashboard.port} unter der Adresse deiner HCU.`,
      `Reachable on port ${config.dashboard.port} at your HCU's address.`,
    ),
    groupId: 'dashboard',
    order: 3,
  };

  return {
    groups: {
      dashboard: {
        friendlyName: loc(languageCode, 'Dashboard', 'Dashboard'),
        description: loc(
          languageCode,
          'Web-Konfigurator für Hubs, Geräte und Register-Zuordnungen.',
          'Web configurator for hubs, devices and register bindings.',
        ),
        order: 1,
      },
    },
    properties: {
      dashboardEnabled,
      dashboardPort,
      ...(config.dashboard.enabled ? { dashboardLink } : {}),
    },
  };
}

export interface DashboardUpdate {
  enabled?: boolean;
  port?: number;
}

/** Coerce a possibly-string update value to boolean. */
function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;
  }
  return undefined;
}

/** Coerce a possibly-string update value to an integer port. */
function toPort(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (Number.isInteger(n) && n >= 1025 && n <= 65535) return n;
  return undefined;
}

/**
 * Parse a CONFIG_UPDATE_REQUEST properties map into dashboard changes. Returns
 * the recognised changes and whether any value was invalid.
 */
export function parseConfigUpdate(properties: Record<string, unknown>): {
  update: DashboardUpdate;
  invalid: string[];
} {
  const update: DashboardUpdate = {};
  const invalid: string[] = [];

  if ('dashboardEnabled' in properties) {
    const b = toBool(properties.dashboardEnabled);
    if (b === undefined) invalid.push('dashboardEnabled');
    else update.enabled = b;
  }
  if ('dashboardPort' in properties) {
    const p = toPort(properties.dashboardPort);
    if (p === undefined) invalid.push('dashboardPort');
    else update.port = p;
  }
  return { update, invalid };
}
