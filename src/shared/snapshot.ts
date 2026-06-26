import type { DeviceType, FeatureType, RegisterKind } from './schema.js';

/** A single Connect feature object, ready to be placed in an envelope. */
export type FeaturePayload = { type: FeatureType } & Record<string, unknown>;

export interface DiscoverDevicePayload {
  deviceType: DeviceType;
  deviceId: string;
  friendlyName: string;
  modelType: string;
  firmwareVersion: string;
  features: FeaturePayload[];
}

export type HubHealth = 'connected' | 'connecting' | 'offline' | 'disabled' | 'error';

export interface HubStatus {
  id: string;
  name: string;
  kind: string;
  target: string;
  health: HubHealth;
  lastOkAt: number | null;
  lastError: string | null;
  reads: number;
  writes: number;
  errors: number;
}

export interface BindingReading {
  bindingId: string;
  featureType: FeatureType;
  field: string;
  registerKind: RegisterKind;
  address: number;
  raw: number[] | null;
  value: number | boolean | string | null;
  error: string | null;
  at: number;
}

export interface DeviceStatus {
  id: string;
  hubId: string;
  unitId: number;
  deviceType: DeviceType;
  friendlyName: string;
  enabled: boolean;
  online: boolean;
  lastReadAt: number | null;
  readings: BindingReading[];
  features: FeaturePayload[];
  errorCount: number;
}

export type ConnectHealth = 'disconnected' | 'connecting' | 'connected' | 'disabled';

export interface DecisionEntry {
  at: number;
  deviceId: string;
  kind: 'status_event_sent' | 'status_event_suppressed' | 'control_applied' | 'control_rejected';
  reason: string;
  detail?: string;
}

export interface Snapshot {
  version: number;
  generatedAt: number;
  buildId: string;
  appVersion: string;
  readiness: 'READY' | 'CONFIG_REQUIRED' | 'ERROR';
  connect: {
    health: ConnectHealth;
    url: string;
    lastError: string | null;
    connectedSince: number | null;
  };
  hubs: HubStatus[];
  devices: DeviceStatus[];
  counters: {
    hubs: number;
    devices: number;
    bindings: number;
    onlineDevices: number;
  };
}

export interface TrendPoint {
  t: number;
  v: number;
}

export interface TrendSeries {
  deviceId: string;
  bindingId: string;
  label: string;
  unit?: string;
  points: TrendPoint[];
}

export interface ApiError {
  error: { code: string; message: string };
}
