/**
 * The single place for project-specific values. Everything else (OTA, analytics,
 * env, metadata) derives from here — no hardcoding elsewhere.
 */
export const PLUGIN_ID = 'de.fr.renner.plugin.modbusbridge';
export const GITHUB_REPO = 'fabiorenner-hub/hmip-hcu-modbus';
export const ENV_PREFIX = 'MODBUS_BRIDGE';
export const DASHBOARD_PORT = 8091;

/** Fixed analytics endpoint (not user-configurable, not shown in the UI). */
export const ANALYTICS_ENDPOINT = 'https://hcu.fabiorenner.de/ingest.php';
