import type { DiscoverDevicePayload, FeaturePayload } from '../../shared/snapshot.js';

/** PluginMessage envelope — exactly four fields per spec §6.2. */
export interface PluginMessage<TBody = unknown> {
  id: string;
  pluginId: string;
  type: string;
  body: TBody;
}

export type ReadinessStatus = 'READY' | 'CONFIG_REQUIRED' | 'ERROR';

export interface PluginStateResponseBody {
  pluginReadinessStatus: ReadinessStatus;
  friendlyName?: Record<string, string>;
}

export interface DiscoverResponseBody {
  success: boolean;
  devices: DiscoverDevicePayload[];
  error?: { code?: string; message?: string };
}

export interface StatusResponseBody {
  success: boolean;
  devices: { deviceId: string; features: FeaturePayload[] }[];
}

export interface StatusEventBody {
  deviceId: string;
  features: FeaturePayload[];
}

export interface ControlRequestBody {
  deviceId: string;
  features: FeaturePayload[];
}

export interface ConfigTemplateRequestBody {
  languageCode?: string;
}

export interface PropertyTemplate {
  dataType: 'BOOLEAN' | 'INTEGER' | 'NUMBER' | 'STRING' | 'PASSWORD' | 'READONLY' | 'WEBLINK' | 'ENUM' | 'TYPEAHEAD' | 'QRCODE';
  friendlyName: string;
  description?: string;
  currentValue?: string;
  defaultValue?: string;
  groupId?: string;
  minimum?: number;
  maximum?: number;
  order?: number;
  required?: boolean;
}

export interface GroupTemplate {
  friendlyName: string;
  description?: string;
  order?: number;
}

export interface ConfigTemplateResponseBody {
  groups?: Record<string, GroupTemplate>;
  properties: Record<string, PropertyTemplate>;
}

export interface ConfigUpdateRequestBody {
  languageCode?: string;
  properties: Record<string, unknown>;
}

export type ConfigUpdateStatus = 'APPLIED' | 'FAILED' | 'PENDING';

export interface ConfigUpdateResponseBody {
  status: ConfigUpdateStatus;
  message?: string;
}

export const INBOUND_TYPES = {
  DISCOVER_REQUEST: 'DISCOVER_REQUEST',
  STATUS_REQUEST: 'STATUS_REQUEST',
  CONTROL_REQUEST: 'CONTROL_REQUEST',
  PLUGIN_STATE_REQUEST: 'PLUGIN_STATE_REQUEST',
  CONFIG_TEMPLATE_REQUEST: 'CONFIG_TEMPLATE_REQUEST',
  CONFIG_UPDATE_REQUEST: 'CONFIG_UPDATE_REQUEST',
} as const;

export const OUTBOUND_TYPES = {
  DISCOVER_RESPONSE: 'DISCOVER_RESPONSE',
  STATUS_RESPONSE: 'STATUS_RESPONSE',
  CONTROL_RESPONSE: 'CONTROL_RESPONSE',
  PLUGIN_STATE_RESPONSE: 'PLUGIN_STATE_RESPONSE',
  STATUS_EVENT: 'STATUS_EVENT',
  CONFIG_TEMPLATE_RESPONSE: 'CONFIG_TEMPLATE_RESPONSE',
  CONFIG_UPDATE_RESPONSE: 'CONFIG_UPDATE_RESPONSE',
  ERROR_RESPONSE: 'ERROR_RESPONSE',
} as const;
