import type { FastifyInstance } from 'fastify';
import type { Logger } from '../logger.js';
import type { Orchestrator } from '../runtime/orchestrator.js';
import { buildServer } from './server.js';

/**
 * Owns the Fastify dashboard lifecycle so it can be enabled/disabled and moved
 * to a different port at runtime (driven by the HCU config page). All failures
 * are non-fatal: a bind error must never kill the plugin (HCU robustness rule).
 */
export class DashboardManager {
  private app: FastifyInstance | null = null;
  private currentPort: number | null = null;
  private applying = false;

  constructor(
    private readonly orch: Orchestrator,
    private readonly logger: Logger,
    private readonly publicDir: string,
  ) {}

  /** Reconcile the running server with the desired enabled/port state. */
  async apply(enabled: boolean, port: number): Promise<void> {
    if (this.applying) return;
    this.applying = true;
    try {
      if (!enabled) {
        if (this.app) this.logger.info('dash', 'Dashboard disabled via configuration.');
        await this.stop();
        return;
      }
      if (this.app && this.currentPort === port) return;
      await this.stop();
      const app = buildServer(this.orch, this.logger, this.publicDir);
      try {
        await app.listen({ host: '0.0.0.0', port });
        this.app = app;
        this.currentPort = port;
        this.logger.info('dash', `Dashboard listening on :${port}.`);
      } catch (err) {
        // Non-fatal: keep the plugin (and Connect API) alive even if the bind fails.
        this.logger.error('dash', `Dashboard failed to start on :${port}: ${String(err)}`);
        try {
          await app.close();
        } catch {
          /* ignore */
        }
      }
    } finally {
      this.applying = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.app) return;
    try {
      await this.app.close();
    } catch {
      /* ignore */
    }
    this.app = null;
    this.currentPort = null;
  }
}
