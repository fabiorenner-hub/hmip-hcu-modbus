import type { AppConfig, ModbusDevice, RegisterKind } from '../../shared/schema.js';
import { parseConfigSafe } from '../../shared/schema.js';
import type { DecisionEntry, FeaturePayload, Snapshot } from '../../shared/snapshot.js';
import { APP_VERSION } from '../../shared/version.js';
import type { Env } from '../env.js';
import { PLUGIN_FRIENDLY, PLUGIN_ID } from '../env.js';
import type { Logger } from '../logger.js';
import type { Store } from '../persistence/store.js';
import { HubManager } from '../modbus/manager.js';
import { NotificationService } from '../notifications/service.js';
import { ConnectClient } from '../connect/client.js';
import { INBOUND_TYPES, OUTBOUND_TYPES, type ControlRequestBody, type PluginMessage, type ConfigTemplateRequestBody, type ConfigUpdateRequestBody } from '../connect/types.js';
import { buildDiscoverDevices, resolveControl } from '../connect/discovery.js';
import { buildConfigTemplate, parseConfigUpdate } from '../connect/configpage.js';
import type { WriteOp } from '../engine/bindings.js';
import { validateConfig, type ValidationResult } from '../engine/validate.js';
import { numbersDiffer } from '../engine/decisions.js';
import { Poller } from './poller.js';

export interface ScanRequest {
  hubId: string;
  unitId: number;
  registerKind: RegisterKind;
  start: number;
  count: number;
}

export interface ScanHit {
  address: number;
  value: number;
}

export interface ScanResult {
  hits: ScanHit[];
  scanned: number;
  errors: number;
}

const MAX_SCAN = 2000;
const MAX_DECISIONS = 300;

/**
 * Central brain: owns mutable config, wires the Connect adapter to the hub
 * manager and poller, handles inbound Connect messages and exposes the API the
 * dashboard server consumes.
 */
export class Orchestrator {
  private config: AppConfig;
  private readonly hubs: HubManager;
  private readonly poller: Poller;
  private readonly notifications: NotificationService;
  private connect: ConnectClient | null = null;
  private decisions: DecisionEntry[] = [];
  private startedAt = Date.now();
  private dashboardApplier: ((enabled: boolean, port: number) => void) | null = null;

  constructor(
    private readonly env: Env,
    private readonly store: Store,
    private readonly logger: Logger,
  ) {
    this.config = store.loadConfig();
    this.hubs = new HubManager(logger);
    this.notifications = new NotificationService(this.config.notifications, logger);
    this.poller = new Poller(this.config, this.hubs, logger, {
      emitStatusEvent: (deviceId, features) => this.emitStatusEvent(deviceId, features),
      recordDecision: (entry) => this.pushDecision(entry),
      onStale: (device) =>
        this.notifications.notify(
          'readError',
          { de: 'Gerät nicht erreichbar', en: 'Device unreachable' },
          {
            de: `„${device.friendlyName}" liefert keine Daten mehr.`,
            en: `"${device.friendlyName}" stopped returning data.`,
          },
        ),
      onRecover: (device) => this.logger.info('poll', `Device ${device.friendlyName} recovered.`),
    });
  }

  start(): void {
    this.hubs.sync(this.config.hubs);
    this.hubs.start();
    this.poller.start();
    if (!this.env.noConnect && this.env.authToken) {
      this.startConnect();
    } else {
      this.logger.warn('connect', 'Connect disabled (no token or NO_CONNECT set); running dashboard only.');
    }
  }

  private startConnect(): void {
    this.connect = new ConnectClient(
      {
        url: this.env.connectUrl,
        pluginId: PLUGIN_ID,
        authToken: this.env.authToken ?? '',
        systemEvents: true,
      },
      this.logger,
      (msg) => this.onConnectMessage(msg),
      () => this.onConnectOpen(),
    );
    this.connect.start();
  }

  private onConnectOpen(): void {
    this.sendPluginState();
  }

  private onConnectMessage(msg: PluginMessage): void {
    switch (msg.type) {
      case INBOUND_TYPES.DISCOVER_REQUEST:
        this.sendDiscover(msg.id);
        break;
      case INBOUND_TYPES.STATUS_REQUEST:
        this.sendStatus(msg.id);
        break;
      case INBOUND_TYPES.CONTROL_REQUEST:
        void this.handleControl(msg);
        break;
      case INBOUND_TYPES.PLUGIN_STATE_REQUEST:
        this.sendPluginState(msg.id);
        break;
      case INBOUND_TYPES.CONFIG_TEMPLATE_REQUEST:
        this.sendConfigTemplate(msg);
        break;
      case INBOUND_TYPES.CONFIG_UPDATE_REQUEST:
        this.handleConfigUpdate(msg);
        break;
      default:
        this.logger.debug('connect', `Unhandled inbound type ${msg.type}.`);
    }
  }

  private sendPluginState(id?: string): void {
    const readiness = this.readiness();
    this.connect?.send(
      OUTBOUND_TYPES.PLUGIN_STATE_RESPONSE,
      { pluginReadinessStatus: readiness, friendlyName: PLUGIN_FRIENDLY },
      id,
    );
  }

  /** Allow the boot code to wire the dashboard lifecycle (start/stop/restart). */
  setDashboardApplier(fn: (enabled: boolean, port: number) => void): void {
    this.dashboardApplier = fn;
  }

  /** Best-effort external dashboard URL derived from the Connect URL host. */
  dashboardUrl(): string {
    let host = 'hcu1-xxxx.local';
    try {
      const u = new URL(this.env.connectUrl);
      if (u.hostname && u.hostname !== 'host.containers.internal') host = u.hostname;
    } catch {
      /* keep placeholder */
    }
    return `http://${host}:${this.config.dashboard.port}/`;
  }

  private sendConfigTemplate(msg: PluginMessage): void {
    const body = (msg.body ?? {}) as ConfigTemplateRequestBody;
    try {
      const template = buildConfigTemplate(this.config, this.dashboardUrl(), body.languageCode);
      this.connect?.send(OUTBOUND_TYPES.CONFIG_TEMPLATE_RESPONSE, template, msg.id);
    } catch (err) {
      this.logger.error('config', `Failed to build config template: ${String(err)}`);
      this.connect?.send(OUTBOUND_TYPES.ERROR_RESPONSE, { error: { message: String(err) } }, msg.id);
    }
  }

  private handleConfigUpdate(msg: PluginMessage): void {
    const body = (msg.body ?? {}) as ConfigUpdateRequestBody;
    const { update, invalid } = parseConfigUpdate(body.properties ?? {});
    if (invalid.length > 0) {
      this.connect?.send(
        OUTBOUND_TYPES.CONFIG_UPDATE_RESPONSE,
        { status: 'FAILED', message: `Invalid values: ${invalid.join(', ')}` },
        msg.id,
      );
      return;
    }
    if (update.enabled !== undefined) this.config.dashboard.enabled = update.enabled;
    if (update.port !== undefined) this.config.dashboard.port = update.port;
    this.store.saveConfig(this.config);
    this.dashboardApplier?.(this.config.dashboard.enabled, this.config.dashboard.port);
    this.connect?.send(OUTBOUND_TYPES.CONFIG_UPDATE_RESPONSE, { status: 'APPLIED' }, msg.id);
    this.sendPluginState();
  }

  private sendDiscover(id: string): void {
    try {
      const devices = buildDiscoverDevices(this.config, (deviceId) => this.poller.cachedFeatures(deviceId));
      this.connect?.send(OUTBOUND_TYPES.DISCOVER_RESPONSE, { success: true, devices }, id);
    } catch (err) {
      this.connect?.send(
        OUTBOUND_TYPES.DISCOVER_RESPONSE,
        { success: false, devices: [], error: { message: String(err) } },
        id,
      );
    }
  }

  private sendStatus(id: string): void {
    try {
      const devices = this.config.devices
        .filter((d) => d.enabled)
        .map((d) => ({ deviceId: d.id, features: this.poller.cachedFeatures(d.id) }));
      this.connect?.send(OUTBOUND_TYPES.STATUS_RESPONSE, { success: true, devices }, id);
    } catch (err) {
      // Requirement 10.6: error response rather than partial success.
      this.connect?.send(OUTBOUND_TYPES.ERROR_RESPONSE, { error: { message: String(err) } }, id);
    }
  }

  private emitStatusEvent(deviceId: string, features: FeaturePayload[]): void {
    this.connect?.send(OUTBOUND_TYPES.STATUS_EVENT, { deviceId, features });
  }

  private async handleControl(msg: PluginMessage): Promise<void> {
    const body = msg.body as ControlRequestBody;
    const device = this.config.devices.find((d) => d.id === body.deviceId);
    if (!device) {
      this.connect?.send(OUTBOUND_TYPES.CONTROL_RESPONSE, { success: false }, msg.id);
      return;
    }
    const resolved = resolveControl(device, body);
    if (resolved.rejected) {
      this.pushDecision({
        at: Date.now(),
        deviceId: device.id,
        kind: 'control_rejected',
        reason: resolved.rejectReason ?? 'rejected',
      });
      this.connect?.send(OUTBOUND_TYPES.CONTROL_RESPONSE, { success: false }, msg.id);
      return;
    }

    this.poller.markPending(device.id);
    let ok = true;
    try {
      for (const op of resolved.writes) {
        if (op.kind === 'coil') await this.hubs.writeCoil(op.hubId, op.unitId, op.address, op.coil);
        else if (op.kind === 'bit') await this.hubs.writeBit(op.hubId, op.unitId, op.address, op.bitIndex, op.bitOn);
        else await this.hubs.writeRegisters(op.hubId, op.unitId, op.address, op.registers);
      }
      ok = await this.verifyWrites(device, resolved.writes);
    } catch (err) {
      ok = false;
      this.logger.warn('control', `Write failed for ${device.friendlyName}: ${String(err)}`);
      this.notifications.notify(
        'writeError',
        { de: 'Schreibfehler', en: 'Write error' },
        { de: `Schreiben auf „${device.friendlyName}" fehlgeschlagen.`, en: `Write to "${device.friendlyName}" failed.` },
      );
    }

    if (ok) {
      // Requirement 10.5: prime the cache so the next poll does not re-assert.
      this.poller.applyCommanded(device.id, resolved.commanded);
    }
    this.pushDecision({
      at: Date.now(),
      deviceId: device.id,
      kind: ok ? 'control_applied' : 'control_rejected',
      reason: ok ? 'write committed' : 'write/verify failed',
    });
    this.connect?.send(OUTBOUND_TYPES.CONTROL_RESPONSE, { success: ok }, msg.id);
  }

  /** Optional verify readback (Requirement 7.2/7.3/7.6). */
  private async verifyWrites(device: ModbusDevice, writes: WriteOp[]): Promise<boolean> {
    for (const w of writes) {
      const binding = device.bindings.find((b) => b.id === w.bindingId);
      if (!binding || !binding.verify) continue;
      try {
        if (w.kind === 'coil') {
          const words = await this.hubs.read(w.hubId, w.unitId, 'coil', w.address, 1);
          if (words.length === 0) return true; // inconclusive -> success per 7.6
          if (((words[0] ?? 0) !== 0) !== w.coil) return false;
        } else if (w.kind === 'register') {
          const words = await this.hubs.read(w.hubId, w.unitId, 'holding', w.address, w.registers.length);
          if (words.length === 0) return true;
          for (let i = 0; i < w.registers.length; i++) {
            if (numbersDiffer(words[i] ?? 0, w.registers[i] ?? 0, 0)) return false;
          }
        }
        // bit writes are read-modify-write; trust the underlying write.
      } catch {
        return true; // readback unavailable -> success per 7.6
      }
    }
    return true;
  }

  private pushDecision(entry: DecisionEntry): void {
    this.decisions.push(entry);
    if (this.decisions.length > MAX_DECISIONS) this.decisions.shift();
  }

  private readiness(): 'READY' | 'CONFIG_REQUIRED' | 'ERROR' {
    return validateConfig(this.config).readiness;
  }

  // ---- Dashboard API ------------------------------------------------------

  getSnapshot(): Snapshot {
    const hubStatuses = this.hubs.statuses();
    const deviceStatuses = this.poller.deviceStatuses();
    return {
      version: 1,
      generatedAt: Date.now(),
      buildId: this.env.buildId,
      appVersion: APP_VERSION,
      readiness: this.readiness(),
      connect: {
        health: this.connect?.getHealth() ?? 'disabled',
        url: this.env.connectUrl,
        lastError: this.connect?.getLastError() ?? null,
        connectedSince: this.connect?.getConnectedSince() ?? null,
      },
      hubs: hubStatuses,
      devices: deviceStatuses,
      counters: {
        hubs: this.config.hubs.length,
        devices: this.config.devices.length,
        bindings: this.config.devices.reduce((n, d) => n + d.bindings.length, 0),
        onlineDevices: deviceStatuses.filter((d) => d.online).length,
      },
    };
  }

  getConfig(): AppConfig {
    return maskConfig(this.config);
  }

  getRawConfig(): AppConfig {
    return this.config;
  }

  updateConfig(input: unknown): { ok: boolean; error?: string } {
    const { config, ok, error } = parseConfigSafe(input);
    if (!ok) return error !== undefined ? { ok: false, error } : { ok: false };
    // Preserve secrets that arrive masked from the dashboard.
    config.notifications.telegram.botToken = mergeSecret(
      config.notifications.telegram.botToken,
      this.config.notifications.telegram.botToken,
    );
    this.config = config;
    this.store.saveConfig(config);
    this.hubs.sync(config.hubs);
    this.poller.sync(config);
    this.notifications.update(config.notifications);
    this.dashboardApplier?.(config.dashboard.enabled, config.dashboard.port);
    this.sendPluginState();
    this.sendDiscoverUnsolicited();
    return { ok: true };
  }

  private sendDiscoverUnsolicited(): void {
    if (this.connect?.getHealth() !== 'connected') return;
    const devices = buildDiscoverDevices(this.config, (id) => this.poller.cachedFeatures(id));
    this.connect.send(OUTBOUND_TYPES.DISCOVER_RESPONSE, { success: true, devices });
  }

  getValidation(): ValidationResult {
    return validateConfig(this.config);
  }

  getTrends() {
    return this.poller.trendSeries();
  }

  getDecisions(): DecisionEntry[] {
    return [...this.decisions].reverse();
  }

  getNotifications() {
    return this.notifications.list();
  }

  clearNotifications(): void {
    this.notifications.clear();
  }

  getConnectLog() {
    return this.connect?.recentLog() ?? [];
  }

  getLogs() {
    return this.logger.recent();
  }

  getDiagnostics() {
    return {
      buildId: this.env.buildId,
      appVersion: APP_VERSION,
      uptimeMs: Date.now() - this.startedAt,
      connect: {
        health: this.connect?.getHealth() ?? 'disabled',
        url: this.env.connectUrl,
        lastError: this.connect?.getLastError() ?? null,
      },
      hubs: this.hubs.statuses(),
      readiness: this.readiness(),
      validation: validateConfig(this.config).issues,
    };
  }

  async scan(req: ScanRequest): Promise<ScanResult> {
    const count = Math.min(Math.max(1, req.count), MAX_SCAN);
    const hits: ScanHit[] = [];
    let errors = 0;
    for (let i = 0; i < count; i++) {
      const address = req.start + i;
      try {
        const words = await this.hubs.read(req.hubId, req.unitId, req.registerKind, address, 1);
        if (words.length > 0) hits.push({ address, value: words[0] ?? 0 });
      } catch {
        errors += 1;
      }
    }
    return { hits, scanned: count, errors };
  }

  async stop(): Promise<void> {
    this.poller.stop();
    this.connect?.stop();
    await this.hubs.stop();
  }
}

function maskConfig(config: AppConfig): AppConfig {
  const clone: AppConfig = JSON.parse(JSON.stringify(config));
  if (clone.notifications.telegram.botToken) {
    clone.notifications.telegram.botToken = '***';
  }
  return clone;
}

function mergeSecret(incoming: string, current: string): string {
  return incoming === '***' || incoming === '' ? current : incoming;
}
