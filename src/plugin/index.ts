import { fileURLToPath, pathToFileURL } from 'node:url';
import { readEnv } from './env.js';
import { ENV_PREFIX } from './pluginMeta.js';
import { Logger } from './logger.js';
import { Store } from './persistence/store.js';
import { Orchestrator } from './runtime/orchestrator.js';
import { DashboardManager } from './dashboard/manager.js';

export async function main(): Promise<void> {
  const env = readEnv();
  const logger = new Logger();
  logger.info('boot', `Modbus Bridge starting (build ${env.buildId}).`);

  // Robustness (HCU rule): a stray rejection or exception must not crash the
  // plugin container — that aborts the HCU installation.
  process.on('unhandledRejection', (reason) => {
    logger.error('boot', `Unhandled promise rejection: ${String(reason)}`);
  });
  process.on('uncaughtException', (err) => {
    logger.error('boot', `Uncaught exception: ${String(err)}`);
  });

  const store = new Store(env.dataDir, logger);
  const orch = new Orchestrator(env, store, logger);

  const publicDir =
    process.env[`${ENV_PREFIX}_PUBLIC_DIR`] ?? fileURLToPath(new URL('./dashboard/public', import.meta.url));
  const dashboard = new DashboardManager(orch, logger, publicDir);
  orch.setDashboardApplier((enabled, port) => void dashboard.apply(enabled, port));

  orch.start();

  // Start the dashboard according to the persisted configuration. A bind
  // failure here is non-fatal (handled inside the manager).
  const cfg = orch.getRawConfig();
  await dashboard.apply(cfg.dashboard.enabled, cfg.dashboard.port);

  // Tell the OTA loader the boot succeeded (resets the crash-loop counter).
  (globalThis as { __otaMarkHealthy?: () => void }).__otaMarkHealthy?.();
  logger.info('boot', 'Startup complete.');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('boot', `Received ${signal}, shutting down.`);
    try {
      await dashboard.stop();
      await orch.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// Run directly only when this file is the entrypoint. In production the bootstrap
// loader imports this module and calls main() (image bundle or OTA payload).
const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) void main();
