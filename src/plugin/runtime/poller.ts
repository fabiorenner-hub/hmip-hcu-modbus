import type { AppConfig, ModbusDevice } from '../../shared/schema.js';
import type {
  BindingReading,
  DecisionEntry,
  DeviceStatus,
  FeaturePayload,
  TrendPoint,
  TrendSeries,
} from '../../shared/snapshot.js';
import type { Logger } from '../logger.js';
import type { HubManager } from '../modbus/manager.js';
import { assembleFeatures, decodeBinding, type DecodedValue } from '../engine/bindings.js';
import { planReads } from '../engine/plan.js';
import { diffFeatures, directionFor } from '../engine/decisions.js';

export interface PollerCallbacks {
  emitStatusEvent(deviceId: string, features: FeaturePayload[]): void;
  recordDecision(entry: DecisionEntry): void;
  onStale(device: ModbusDevice): void;
  onRecover(device: ModbusDevice): void;
}

interface DevState {
  features: FeaturePayload[];
  readings: BindingReading[];
  lastReadAt: number | null;
  errorStreak: number;
  stale: boolean;
  errorCount: number;
  lastLevel: number | null;
  timer: NodeJS.Timeout | null;
  polling: boolean;
  pendingUntil: number;
}

const MAX_TREND_POINTS = 720;
const STALE_AFTER_ERRORS = 3;

/**
 * Reads each enabled device at its poll interval, decodes registers through the
 * pure engine, caches the resulting features and emits STATUS_EVENTs only for
 * genuine external changes (Requirement 10). Holds trend ring buffers.
 */
export class Poller {
  private config: AppConfig;
  private states = new Map<string, DevState>();
  private trends = new Map<string, TrendPoint[]>();
  private running = false;

  constructor(
    config: AppConfig,
    private readonly hubs: HubManager,
    private readonly logger: Logger,
    private readonly cb: PollerCallbacks,
  ) {
    this.config = config;
  }

  start(): void {
    this.running = true;
    this.sync(this.config);
  }

  /** Reconcile device schedules with a new configuration. */
  sync(config: AppConfig): void {
    this.config = config;
    const ids = new Set(config.devices.map((d) => d.id));
    for (const [id, st] of this.states) {
      if (!ids.has(id)) {
        if (st.timer) clearTimeout(st.timer);
        this.states.delete(id);
      }
    }
    if (!this.running) return;
    for (const device of config.devices) {
      if (!this.states.has(device.id)) {
        this.states.set(device.id, {
          features: [],
          readings: [],
          lastReadAt: null,
          errorStreak: 0,
          stale: false,
          errorCount: 0,
          lastLevel: null,
          timer: null,
          polling: false,
          pendingUntil: 0,
        });
      }
      this.schedule(device, 0);
    }
  }

  private schedule(device: ModbusDevice, delayMs: number): void {
    const st = this.states.get(device.id);
    if (!st || !this.running) return;
    if (st.timer) clearTimeout(st.timer);
    if (!device.enabled) return;
    st.timer = setTimeout(() => void this.pollDevice(device.id), delayMs);
  }

  private nextInterval(device: ModbusDevice, st: DevState): number {
    if (st.stale) return Math.min(device.pollMs * 4, 60000);
    return device.pollMs;
  }

  /** Mark that a control command for a device is in flight (suppress events). */
  markPending(deviceId: string, windowMs = 4000): void {
    const st = this.states.get(deviceId);
    if (st) st.pendingUntil = Date.now() + windowMs;
  }

  /** Merge commanded feature values into the cache so the next poll diff does
   * not re-assert them as an external change (Requirement 10.5). */
  applyCommanded(deviceId: string, features: FeaturePayload[]): void {
    const st = this.states.get(deviceId);
    if (!st) return;
    const byType = new Map(st.features.map((f) => [f.type, { ...f }]));
    for (const feat of features) {
      const target = byType.get(feat.type) ?? { type: feat.type };
      for (const [k, v] of Object.entries(feat)) target[k] = v;
      byType.set(feat.type, target);
    }
    st.features = [...byType.values()];
  }

  private async pollDevice(deviceId: string): Promise<void> {
    const device = this.config.devices.find((d) => d.id === deviceId);
    const st = this.states.get(deviceId);
    if (!device || !st || !this.running) return;
    if (st.polling) return;

    // Skip work while the hub is offline (Requirement 2.4) and retry later.
    if (!this.hubs.isOnline(device.hubId)) {
      this.schedule(device, this.nextInterval(device, st));
      return;
    }

    st.polling = true;
    try {
      const plans = planReads(device.bindings);
      const values = new Map<string, DecodedValue>();
      const readings: BindingReading[] = [];
      let hadError = false;

      for (const plan of plans) {
        let block: number[] | null = null;
        let blockError: string | null = null;
        try {
          block = await this.hubs.read(device.hubId, device.unitId, plan.registerKind, plan.start, plan.length);
        } catch (err) {
          blockError = String(err);
          hadError = true;
        }
        for (const pb of plan.bindings) {
          const slice = block ? block.slice(pb.offset, pb.offset + pb.count) : null;
          let value: DecodedValue = null;
          let error = blockError;
          if (slice) {
            try {
              value = decodeBinding(pb.binding, slice);
            } catch (err) {
              error = String(err);
            }
          }
          if (value !== null) values.set(pb.binding.id, value);
          readings.push({
            bindingId: pb.binding.id,
            featureType: pb.binding.featureType,
            field: pb.binding.field,
            registerKind: pb.binding.registerKind,
            address: pb.binding.address,
            raw: slice,
            value,
            error,
            at: Date.now(),
          });
          if (typeof value === 'number') this.pushTrend(device.id, pb.binding.id, value);
        }
      }

      st.readings = readings;

      if (hadError && values.size === 0) {
        this.registerError(device, st);
        return;
      }

      // Successful read cycle.
      st.lastReadAt = Date.now();
      if (st.stale) {
        st.stale = false;
        this.cb.onRecover(device);
        this.emitMaintenance(device, false);
      }
      st.errorStreak = 0;

      const features = assembleFeatures(device.bindings, values);
      this.maybeEmit(device, st, features);
      st.features = features;
    } finally {
      st.polling = false;
      this.schedule(device, this.nextInterval(device, st));
    }
  }

  private registerError(device: ModbusDevice, st: DevState): void {
    st.errorCount += 1;
    st.errorStreak += 1;
    if (!st.stale && st.errorStreak >= STALE_AFTER_ERRORS) {
      st.stale = true;
      this.logger.warn('poll', `Device ${device.friendlyName} marked stale after ${st.errorStreak} errors.`);
      this.cb.onStale(device);
      this.emitMaintenance(device, true);
    }
  }

  /** Report the `unreach` maintenance flag for a stale/recovered device that
   * exposes a maintenance feature (Requirement 8.5). */
  private emitMaintenance(device: ModbusDevice, unreach: boolean): void {
    if (!deviceHasMaintenance(device)) return;
    this.cb.emitStatusEvent(device.id, [{ type: 'maintenance', unreach }]);
    this.cb.recordDecision({
      at: Date.now(),
      deviceId: device.id,
      kind: 'status_event_sent',
      reason: unreach ? 'device became unreachable (stale)' : 'device recovered',
    });
  }

  private maybeEmit(device: ModbusDevice, st: DevState, next: FeaturePayload[]): void {
    if (st.features.length === 0) {
      // First successful read just primes the cache; no event.
      st.lastLevel = levelOf(next);
      return;
    }
    if (Date.now() < st.pendingUntil) {
      // A command we issued is settling; do not emit an observed change for it.
      if (diffFeatures(st.features, next, 0).changed.length > 0) {
        this.cb.recordDecision({
          at: Date.now(),
          deviceId: device.id,
          kind: 'status_event_suppressed',
          reason: 'command settling — value re-asserted by the HCU',
        });
      }
      st.lastLevel = levelOf(next);
      return;
    }
    const diff = diffFeatures(st.features, next, device.snapTolerance);
    if (diff.changed.length === 0) {
      // Distinguish "no change at all" from "change below snap tolerance".
      if (device.snapTolerance > 0 && diffFeatures(st.features, next, 0).changed.length > 0) {
        this.cb.recordDecision({
          at: Date.now(),
          deviceId: device.id,
          kind: 'status_event_suppressed',
          reason: `change below snap tolerance (${device.snapTolerance})`,
        });
      }
      return;
    }

    const emitted = [...diff.changed];

    // Window coverings: surface a transient direction while a move is observed.
    const nextLevel = levelOf(next);
    const hasCover = device.bindings.some((b) => b.featureType === 'shutterLevel');
    if (hasCover && st.lastLevel !== null && nextLevel !== null) {
      const dir = directionFor(st.lastLevel, nextLevel);
      if (dir) emitted.push({ type: 'shutterDirection', shutterDirection: dir });
    }
    st.lastLevel = nextLevel;

    this.cb.emitStatusEvent(device.id, emitted);
    this.cb.recordDecision({
      at: Date.now(),
      deviceId: device.id,
      kind: 'status_event_sent',
      reason: `observed change: ${diff.changedTypes.join(', ')}`,
    });
  }

  private pushTrend(deviceId: string, bindingId: string, v: number): void {
    const key = `${deviceId}:${bindingId}`;
    const arr = this.trends.get(key) ?? [];
    arr.push({ t: Date.now(), v });
    if (arr.length > MAX_TREND_POINTS) arr.shift();
    this.trends.set(key, arr);
  }

  cachedFeatures(deviceId: string): FeaturePayload[] {
    const st = this.states.get(deviceId);
    if (!st) return [];
    const device = this.config.devices.find((d) => d.id === deviceId);
    if (!device || !deviceHasMaintenance(device)) return st.features;
    // Overlay the live unreach flag so STATUS/DISCOVER reflect staleness (Req 8.5).
    const features = st.features.map((f) => ({ ...f }));
    const maint = features.find((f) => f.type === 'maintenance');
    if (maint) maint.unreach = st.stale;
    else features.push({ type: 'maintenance', unreach: st.stale });
    return features;
  }

  deviceStatuses(): DeviceStatus[] {
    return this.config.devices.map((device) => {
      const st = this.states.get(device.id);
      return {
        id: device.id,
        hubId: device.hubId,
        unitId: device.unitId,
        deviceType: device.deviceType,
        friendlyName: device.friendlyName,
        enabled: device.enabled,
        online: this.hubs.isOnline(device.hubId) && !(st?.stale ?? false),
        lastReadAt: st?.lastReadAt ?? null,
        readings: st?.readings ?? [],
        features: st?.features ?? [],
        errorCount: st?.errorCount ?? 0,
      };
    });
  }

  trendSeries(): TrendSeries[] {
    const series: TrendSeries[] = [];
    for (const device of this.config.devices) {
      for (const binding of device.bindings) {
        const key = `${device.id}:${binding.id}`;
        const points = this.trends.get(key);
        if (!points || points.length === 0) continue;
        series.push({
          deviceId: device.id,
          bindingId: binding.id,
          label: `${device.friendlyName} · ${binding.featureType}.${binding.field}`,
          points: [...points],
        });
      }
    }
    return series;
  }

  stop(): void {
    this.running = false;
    for (const st of this.states.values()) {
      if (st.timer) clearTimeout(st.timer);
      st.timer = null;
    }
  }
}

/** Extract a shutterLevel value from a feature set, if present. */
function levelOf(features: FeaturePayload[]): number | null {
  const f = features.find((x) => x.type === 'shutterLevel');
  const v = f?.shutterLevel;
  return typeof v === 'number' ? v : null;
}

/** Whether a device exposes a maintenance feature (has a maintenance binding). */
function deviceHasMaintenance(device: ModbusDevice): boolean {
  return device.bindings.some((b) => b.featureType === 'maintenance');
}
