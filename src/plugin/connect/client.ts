import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '../logger.js';
import type { ConnectHealth } from '../../shared/snapshot.js';
import type { PluginMessage } from './types.js';

export interface ConnectOptions {
  url: string;
  pluginId: string;
  authToken: string;
  systemEvents?: boolean;
}

export interface ConnectLogLine {
  at: number;
  dir: 'in' | 'out';
  type: string;
  id: string;
}

type MessageHandler = (msg: PluginMessage) => void;

/**
 * WebSocket client for the Homematic IP Connect API. Handles the handshake
 * headers, JSON envelope framing, reconnection with backoff and a small ring
 * buffer of recent message metadata for diagnostics (never payload secrets).
 */
export class ConnectClient {
  private ws: WebSocket | null = null;
  private health: ConnectHealth = 'disconnected';
  private lastError: string | null = null;
  private connectedSince: number | null = null;
  private backoffMs = 1000;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly log: ConnectLogLine[] = [];

  constructor(
    private readonly opts: ConnectOptions,
    private readonly logger: Logger,
    private readonly onMessage: MessageHandler,
    private readonly onOpen: () => void,
  ) {}

  getHealth(): ConnectHealth {
    return this.health;
  }
  getLastError(): string | null {
    return this.lastError;
  }
  getConnectedSince(): number | null {
    return this.connectedSince;
  }
  recentLog(limit = 200): ConnectLogLine[] {
    return this.log.slice(-limit);
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  private open(): void {
    if (this.stopped) return;
    this.health = 'connecting';
    try {
      this.ws = new WebSocket(this.opts.url, {
        headers: {
          authtoken: this.opts.authToken,
          'plugin-id': this.opts.pluginId,
          ...(this.opts.systemEvents ? { 'hmip-system-events': 'true' } : {}),
        },
        rejectUnauthorized: false,
        handshakeTimeout: 10000,
      });
    } catch (err) {
      this.lastError = String(err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.health = 'connected';
      this.connectedSince = Date.now();
      this.backoffMs = 1000;
      this.lastError = null;
      this.logger.info('connect', `WebSocket open to ${this.opts.url}.`);
      this.onOpen();
    });

    this.ws.on('message', (data) => {
      let msg: PluginMessage;
      try {
        msg = JSON.parse(data.toString()) as PluginMessage;
      } catch (err) {
        this.logger.warn('connect', `Unparseable message: ${String(err)}`);
        return;
      }
      this.record('in', msg.type, msg.id);
      try {
        this.onMessage(msg);
      } catch (err) {
        this.logger.error('connect', `Handler error for ${msg.type}: ${String(err)}`);
      }
    });

    this.ws.on('close', () => {
      this.health = 'disconnected';
      this.connectedSince = null;
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.lastError = String(err);
      this.logger.warn('connect', `WebSocket error: ${String(err)}`);
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) return;
    const wait = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, wait);
  }

  send(type: string, body: unknown, id?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.debug('connect', `Drop ${type}: socket not open.`);
      return;
    }
    const envelope: PluginMessage = {
      id: id ?? uuidv4(),
      pluginId: this.opts.pluginId,
      type,
      body,
    };
    this.ws.send(JSON.stringify(envelope));
    this.record('out', type, envelope.id);
  }

  private record(dir: 'in' | 'out', type: string, id: string): void {
    this.log.push({ at: Date.now(), dir, type, id });
    if (this.log.length > 300) this.log.shift();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.health = 'disabled';
  }
}
