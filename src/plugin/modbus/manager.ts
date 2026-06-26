import type { Hub, RegisterKind } from '../../shared/schema.js';
import type { HubStatus } from '../../shared/snapshot.js';
import type { Logger } from '../logger.js';
import { ModbusHub } from './hub.js';

/**
 * Owns one {@link ModbusHub} per configured hub. Synchronises the live set with
 * the configuration, runs a periodic reconnect tick (exponential backoff lives
 * in the hub) and exposes read/write helpers the polling engine calls.
 */
export class HubManager {
  private hubs = new Map<string, ModbusHub>();
  private tickTimer: NodeJS.Timeout | null = null;

  constructor(private readonly logger: Logger) {}

  /** Reconcile the live hub set with the given configuration. */
  sync(configs: Hub[]): void {
    const seen = new Set<string>();
    for (const cfg of configs) {
      seen.add(cfg.id);
      const existing = this.hubs.get(cfg.id);
      if (existing) {
        existing.update(cfg);
      } else {
        this.hubs.set(cfg.id, new ModbusHub(cfg, this.logger));
      }
    }
    for (const [id, hub] of this.hubs) {
      if (!seen.has(id)) {
        void hub.close();
        this.hubs.delete(id);
      }
    }
  }

  get(hubId: string): ModbusHub | undefined {
    return this.hubs.get(hubId);
  }

  statuses(): HubStatus[] {
    return [...this.hubs.values()].map((h) => h.status());
  }

  isOnline(hubId: string): boolean {
    return this.hubs.get(hubId)?.isConnected() ?? false;
  }

  /** Start a reconnect tick that proactively connects offline hubs. */
  start(intervalMs = 5000): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => void this.tick(), intervalMs);
  }

  private async tick(): Promise<void> {
    for (const hub of this.hubs.values()) {
      if (hub.canAttempt()) {
        await hub.ensureConnected().catch(() => undefined);
      }
    }
  }

  async read(
    hubId: string,
    unitId: number,
    kind: RegisterKind,
    address: number,
    length: number,
  ): Promise<number[]> {
    const hub = this.hubs.get(hubId);
    if (!hub) throw new Error(`unknown hub ${hubId}`);
    return hub.read(unitId, kind, address, length);
  }

  async writeCoil(hubId: string, unitId: number, address: number, value: boolean): Promise<void> {
    const hub = this.hubs.get(hubId);
    if (!hub) throw new Error(`unknown hub ${hubId}`);
    await hub.writeCoil(unitId, address, value);
  }

  async writeRegisters(hubId: string, unitId: number, address: number, values: number[]): Promise<void> {
    const hub = this.hubs.get(hubId);
    if (!hub) throw new Error(`unknown hub ${hubId}`);
    await hub.writeRegisters(unitId, address, values);
  }

  async writeBit(hubId: string, unitId: number, address: number, bitIndex: number, on: boolean): Promise<void> {
    const hub = this.hubs.get(hubId);
    if (!hub) throw new Error(`unknown hub ${hubId}`);
    await hub.writeBit(unitId, address, bitIndex, on);
  }

  async stop(): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    await Promise.all([...this.hubs.values()].map((h) => h.close()));
    this.hubs.clear();
  }
}
