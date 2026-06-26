import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import type { Logger } from '../logger.js';
import type { Orchestrator, ScanRequest } from '../runtime/orchestrator.js';
import { FEATURE_CATALOG, DEVICE_TYPE_CATALOG } from '../../shared/catalog.js';
import { CHANGELOG, GITHUB_URL } from '../../shared/version.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function err(code: string, message: string) {
  return { error: { code, message } };
}

/**
 * Fastify dashboard server. Serves the SPA from `publicDir`, exposes the
 * `/api/*` surface and a Server-Sent-Events stream for live snapshots.
 */
export function buildServer(orch: Orchestrator, logger: Logger, publicDir: string): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/state', async () => orch.getSnapshot());
  app.get('/api/config', async () => orch.getConfig());
  app.put('/api/config', async (req, reply) => {
    const result = orch.updateConfig(req.body);
    if (!result.ok) {
      reply.code(400);
      return err('INVALID_CONFIG', result.error ?? 'invalid configuration');
    }
    return { ok: true };
  });
  app.get('/api/catalog', async () => ({
    features: FEATURE_CATALOG,
    deviceTypes: DEVICE_TYPE_CATALOG,
  }));
  app.get('/api/diagnostics', async () => orch.getDiagnostics());
  app.get('/api/validation', async () => orch.getValidation());
  app.get('/api/metrics', async () => orch.getSnapshot().counters);
  app.get('/api/trends', async () => orch.getTrends());
  app.get('/api/decisions', async () => orch.getDecisions());
  app.get('/api/notifications', async () => orch.getNotifications());
  app.delete('/api/notifications', async () => {
    orch.clearNotifications();
    return { ok: true };
  });
  app.get('/api/connect/log', async () => orch.getConnectLog());
  app.get('/api/logs', async () => orch.getLogs());
  app.get('/api/updates', async () => ({
    version: orch.getSnapshot().appVersion,
    buildId: orch.getSnapshot().buildId,
    changelog: CHANGELOG,
    github: GITHUB_URL,
  }));

  app.post('/api/sources/discover', async (req, reply) => {
    const body = (req.body ?? {}) as Partial<ScanRequest>;
    if (!body.hubId || body.start === undefined || body.count === undefined || !body.registerKind) {
      reply.code(400);
      return err('BAD_SCAN', 'hubId, registerKind, start and count are required');
    }
    try {
      return await orch.scan({
        hubId: body.hubId,
        unitId: body.unitId ?? 1,
        registerKind: body.registerKind,
        start: body.start,
        count: body.count,
      });
    } catch (e) {
      reply.code(500);
      return err('SCAN_FAILED', String(e));
    }
  });

  // Server-Sent Events: push a fresh snapshot every 2s plus an immediate one.
  app.get('/api/stream', (req, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const send = () => {
      try {
        reply.raw.write(`data: ${JSON.stringify(orch.getSnapshot())}\n\n`);
      } catch {
        /* client gone */
      }
    };
    send();
    const timer = setInterval(send, 2000);
    req.raw.on('close', () => clearInterval(timer));
  });

  // SPA fallback: serve static assets, otherwise index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      reply.code(404).send(err('NOT_FOUND', `No route for ${req.url}`));
      return;
    }
    const rel = req.url.split('?')[0] ?? '/';
    const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const candidate = safe === '/' ? 'index.html' : safe.replace(/^\//, '');
    const filePath = join(publicDir, candidate);
    if (filePath.startsWith(publicDir) && existsSync(filePath) && extname(filePath)) {
      reply.header('content-type', MIME[extname(filePath)] ?? 'application/octet-stream');
      reply.send(readFileSync(filePath));
      return;
    }
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) {
      reply.header('content-type', MIME['.html']);
      reply.send(readFileSync(indexPath));
      return;
    }
    reply.code(404).send('dashboard not built');
  });

  app.addHook('onClose', async () => logger.info('dash', 'Dashboard server closed.'));
  return app;
}
