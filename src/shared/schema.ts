import { z } from 'zod';

/**
 * Single source of truth for the ModbusBridge plugin configuration.
 *
 * Everything the plugin knows about Modbus hubs, devices and how their
 * registers map onto Homematic IP Connect features lives here. The schema is
 * intentionally permissive on read (defensive defaults) so a partially written
 * config never crashes the boot path.
 */

export const MODBUS_KINDS = ['tcp', 'udp', 'rtu', 'rtuovertcp'] as const;
export const ModbusKindSchema = z.enum(MODBUS_KINDS);
export type ModbusKind = z.infer<typeof ModbusKindSchema>;

export const REGISTER_KINDS = ['coil', 'discrete', 'holding', 'input'] as const;
export const RegisterKindSchema = z.enum(REGISTER_KINDS);
export type RegisterKind = z.infer<typeof RegisterKindSchema>;

export const MODBUS_DATA_TYPES = [
  'bool',
  'int16',
  'uint16',
  'int32',
  'uint32',
  'int64',
  'uint64',
  'float32',
  'float64',
  'string',
] as const;
export const ModbusDataTypeSchema = z.enum(MODBUS_DATA_TYPES);
export type ModbusDataType = z.infer<typeof ModbusDataTypeSchema>;

export const PARITIES = ['none', 'even', 'odd'] as const;
export const ParitySchema = z.enum(PARITIES);
export type Parity = z.infer<typeof ParitySchema>;

/** Connect API feature types we can emit / accept. Mirrors spec §6.6.6. */
export const FEATURE_TYPES = [
  'switchState',
  'dimming',
  'actualTemperature',
  'setPointTemperature',
  'supplyTemperature',
  'humidity',
  'illumination',
  'co2',
  'currentPower',
  'energyCounter',
  'batteryState',
  'contactSensorState',
  'presenceDetected',
  'smokeAlarm',
  'waterlevelDetected',
  'moistureDetected',
  'shutterLevel',
  'slatsLevel',
  'shutterDirection',
  'onTime',
  'raining',
  'storm',
  'sunshine',
  'windSpeed',
  'vehicleRange',
  'maintenance',
] as const;
export const FeatureTypeSchema = z.enum(FEATURE_TYPES);
export type FeatureType = z.infer<typeof FeatureTypeSchema>;

/** Plugin device archetypes. Mirrors spec §6.6.5. */
export const DEVICE_TYPES = [
  'SWITCH',
  'LIGHT',
  'WINDOW_COVERING',
  'CLIMATE_SENSOR',
  'THERMOSTAT',
  'CONTACT_SENSOR',
  'OCCUPANCY_SENSOR',
  'SMOKE_ALARM',
  'WATER_SENSOR',
  'ENERGY_METER',
  'INVERTER',
  'GRID_CONNECTION_POINT',
  'EV_CHARGER',
  'BATTERY',
  'VEHICLE',
  'HVAC',
  'HEAT_PUMP',
  'PARTICULATE_MATTER_SENSOR',
  'SWITCH_INPUT',
] as const;
export const DeviceTypeSchema = z.enum(DEVICE_TYPES);
export type DeviceType = z.infer<typeof DeviceTypeSchema>;

export const HubSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: ModbusKindSchema.default('tcp'),
  host: z.string().default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(502),
  serialPath: z.string().default(''),
  baudRate: z.number().int().positive().default(9600),
  parity: ParitySchema.default('none'),
  dataBits: z.union([z.literal(7), z.literal(8)]).default(8),
  stopBits: z.union([z.literal(1), z.literal(2)]).default(1),
  timeoutMs: z.number().int().min(50).max(60000).default(2000),
  delayMs: z.number().int().min(0).max(5000).default(0),
  enabled: z.boolean().default(true),
});
export type Hub = z.infer<typeof HubSchema>;

/**
 * A binding maps a single Modbus register (or bit) onto one field of one
 * Connect feature. A device aggregates several bindings into its feature set.
 */
export const BindingSchema = z.object({
  id: z.string().min(1),
  featureType: FeatureTypeSchema,
  /** Value field within the feature, e.g. `on`, `actualTemperature`, `unreach`. */
  field: z.string().min(1),
  registerKind: RegisterKindSchema,
  /** Zero-based register / coil address. */
  address: z.number().int().min(0).max(65535),
  dataType: ModbusDataTypeSchema.default('uint16'),
  /** For bit extraction out of a 16-bit register. */
  bitIndex: z.number().int().min(0).max(63).optional(),
  scale: z.number().default(1),
  offset: z.number().default(0),
  precision: z.number().int().min(0).max(8).optional(),
  /**
   * SunSpec-style dynamic scale factor. When set, the effective scale becomes
   * `scale * 10^SF`, where SF is read live as a signed 16-bit value from this
   * register (same hub, unit and register class as the binding). Read-only path.
   */
  scaleFactorAddress: z.number().int().min(0).max(65535).optional(),
  /** Swap 16-bit word order for 32/64-bit values (CDAB vs ABCD). */
  wordSwap: z.boolean().default(false),
  /** Swap the two bytes within each 16-bit word (BADC). */
  byteSwap: z.boolean().default(false),
  /** Register count for `string` data type. */
  stringLength: z.number().int().min(1).max(64).optional(),
  access: z.enum(['ro', 'rw']).default('ro'),
  /** Invert a boolean reading/writing. */
  invert: z.boolean().default(false),
  /** Safety clamp applied before encoding a write (in final scaled units). */
  writeMin: z.number().optional(),
  writeMax: z.number().optional(),
  /** Re-read the register after writing and compare to the commanded value. */
  verify: z.boolean().default(false),
});
export type Binding = z.infer<typeof BindingSchema>;

export const ModbusDeviceSchema = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  unitId: z.number().int().min(0).max(255).default(1),
  deviceType: DeviceTypeSchema,
  friendlyName: z.string().min(1),
  modelType: z.string().default('MODBUS'),
  firmwareVersion: z.string().default('1.0.0'),
  pollMs: z.number().int().min(250).max(3600000).default(5000),
  /** Tolerance (in final scaled units) below which numeric drift is ignored. */
  snapTolerance: z.number().min(0).default(0),
  enabled: z.boolean().default(true),
  bindings: z.array(BindingSchema).default([]),
});
export type ModbusDevice = z.infer<typeof ModbusDeviceSchema>;

export const TelegramSchema = z.object({
  enabled: z.boolean().default(false),
  botToken: z.string().default(''),
  chatId: z.string().default(''),
});
export type TelegramConfig = z.infer<typeof TelegramSchema>;

export const NotificationEventsSchema = z.object({
  hubOffline: z.boolean().default(true),
  readError: z.boolean().default(true),
  writeError: z.boolean().default(true),
  valueChange: z.boolean().default(false),
});
export type NotificationEvents = z.infer<typeof NotificationEventsSchema>;

export const NotificationsSchema = z.object({
  enabled: z.boolean().default(false),
  language: z.enum(['de', 'en']).default('de'),
  telegram: TelegramSchema.default({}),
  events: NotificationEventsSchema.default({}),
});
export type NotificationsConfig = z.infer<typeof NotificationsSchema>;

export const AppearanceSchema = z.object({
  /** Installation-wide default notification language. */
  notifyLanguage: z.enum(['de', 'en']).default('de'),
  ambient: z.boolean().default(true),
});
export type AppearanceConfig = z.infer<typeof AppearanceSchema>;

/** Dashboard web server settings, editable from the HCU config page. */
export const DashboardSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().min(1025).max(65535).default(8091),
});
export type DashboardConfig = z.infer<typeof DashboardSchema>;

/** OTA update settings (channel + auto/manual + check interval). */
export const UpdatesConfigSchema = z
  .object({
    // OTA on by default, stable channel: fresh installs auto-track stable releases.
    mode: z.enum(['manual', 'auto']).default('auto'),
    channel: z.enum(['stable', 'experimental']).default('stable'),
    checkIntervalHours: z.number().int().min(1).max(168).default(6),
  })
  .default({});
export type UpdatesConfig = z.infer<typeof UpdatesConfigSchema>;

/** Anonymous usage analytics. On by default with a visible opt-out. The
 *  destination is fixed in code (see pluginMeta) — not user-configurable. */
export const AnalyticsConfigSchema = z
  .object({
    // On by default with a visible opt-out (Appearance & privacy tab).
    enabled: z.boolean().default(true),
    intervalHours: z.number().int().min(1).max(168).default(24),
  })
  .default({});
export type AnalyticsConfig = z.infer<typeof AnalyticsConfigSchema>;

export const AppConfigSchema = z.object({
  schemaVersion: z.number().int().default(1),
  hubs: z.array(HubSchema).default([]),
  devices: z.array(ModbusDeviceSchema).default([]),
  appearance: AppearanceSchema.default({}),
  notifications: NotificationsSchema.default({}),
  dashboard: DashboardSchema.default({}),
  updates: UpdatesConfigSchema,
  analytics: AnalyticsConfigSchema,
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function defaultConfig(): AppConfig {
  return AppConfigSchema.parse({});
}

/** Parse permissively; on failure fall back to defaults so boot never breaks. */
export function parseConfigSafe(input: unknown): { config: AppConfig; ok: boolean; error?: string } {
  const result = AppConfigSchema.safeParse(input ?? {});
  if (result.success) {
    return { config: result.data, ok: true };
  }
  return { config: defaultConfig(), ok: false, error: result.error.message };
}
