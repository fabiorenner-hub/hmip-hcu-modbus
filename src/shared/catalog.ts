import type { DeviceType, FeatureType } from './schema.js';

/** Kind of a feature field, used by the UI to render the right editor. */
export type FieldKind = 'number' | 'boolean' | 'shadingDirection';

export interface FeatureFieldDef {
  field: string;
  kind: FieldKind;
  /** Human readable label (German / English). */
  label: { de: string; en: string };
  unit?: string;
  /** Optional clamp range applied when emitting / writing. */
  min?: number;
  max?: number;
}

export interface FeatureDef {
  type: FeatureType;
  label: { de: string; en: string };
  fields: FeatureFieldDef[];
  /** Whether this feature can be written back to Modbus (controllable). */
  writable: boolean;
}

/** Feature schemas verified against Connect API spec 1.0.1 §6.7.x. */
export const FEATURE_CATALOG: Record<FeatureType, FeatureDef> = {
  switchState: {
    type: 'switchState',
    label: { de: 'Schalter', en: 'Switch' },
    writable: true,
    fields: [{ field: 'on', kind: 'boolean', label: { de: 'Ein', en: 'On' } }],
  },
  dimming: {
    type: 'dimming',
    label: { de: 'Dimmer', en: 'Dimmer' },
    writable: true,
    fields: [{ field: 'dimLevel', kind: 'number', label: { de: 'Helligkeit', en: 'Brightness' }, min: 0, max: 1 }],
  },
  actualTemperature: {
    type: 'actualTemperature',
    label: { de: 'Temperatur', en: 'Temperature' },
    writable: false,
    fields: [{ field: 'actualTemperature', kind: 'number', label: { de: 'Temperatur', en: 'Temperature' }, unit: '°C' }],
  },
  setPointTemperature: {
    type: 'setPointTemperature',
    label: { de: 'Solltemperatur', en: 'Setpoint temperature' },
    writable: true,
    fields: [{ field: 'setPointTemperature', kind: 'number', label: { de: 'Sollwert', en: 'Setpoint' }, unit: '°C' }],
  },
  supplyTemperature: {
    type: 'supplyTemperature',
    label: { de: 'Vorlauftemperatur', en: 'Supply temperature' },
    writable: false,
    fields: [{ field: 'supplyTemperature', kind: 'number', label: { de: 'Vorlauf', en: 'Supply' }, unit: '°C' }],
  },
  humidity: {
    type: 'humidity',
    label: { de: 'Luftfeuchte', en: 'Humidity' },
    writable: false,
    fields: [{ field: 'humidity', kind: 'number', label: { de: 'Feuchte', en: 'Humidity' }, unit: '%', min: 0, max: 100 }],
  },
  illumination: {
    type: 'illumination',
    label: { de: 'Beleuchtungsstärke', en: 'Illumination' },
    writable: false,
    fields: [{ field: 'illumination', kind: 'number', label: { de: 'Helligkeit', en: 'Illumination' }, unit: 'lx', min: 0 }],
  },
  co2: {
    type: 'co2',
    label: { de: 'CO₂', en: 'CO₂' },
    writable: false,
    fields: [{ field: 'co2', kind: 'number', label: { de: 'CO₂', en: 'CO₂' }, unit: 'ppm', min: 0 }],
  },
  currentPower: {
    type: 'currentPower',
    label: { de: 'Leistung', en: 'Power' },
    writable: false,
    fields: [{ field: 'currentPower', kind: 'number', label: { de: 'Leistung', en: 'Power' }, unit: 'W' }],
  },
  energyCounter: {
    type: 'energyCounter',
    label: { de: 'Energiezähler', en: 'Energy counter' },
    writable: false,
    fields: [
      { field: 'in', kind: 'number', label: { de: 'Bezug', en: 'Import' }, unit: 'Wh', min: 0 },
      { field: 'out', kind: 'number', label: { de: 'Einspeisung', en: 'Export' }, unit: 'Wh', min: 0 },
    ],
  },
  batteryState: {
    type: 'batteryState',
    label: { de: 'Batterie', en: 'Battery' },
    writable: false,
    fields: [
      { field: 'batteryLevel', kind: 'number', label: { de: 'Ladestand', en: 'Charge level' }, min: 0, max: 1 },
      { field: 'batteryCapacity', kind: 'number', label: { de: 'Kapazität', en: 'Capacity' }, unit: 'Wh', min: 0 },
    ],
  },
  contactSensorState: {
    type: 'contactSensorState',
    label: { de: 'Kontakt', en: 'Contact' },
    writable: false,
    fields: [{ field: 'triggered', kind: 'boolean', label: { de: 'Ausgelöst', en: 'Triggered' } }],
  },
  presenceDetected: {
    type: 'presenceDetected',
    label: { de: 'Anwesenheit', en: 'Presence' },
    writable: false,
    fields: [{ field: 'presenceDetected', kind: 'boolean', label: { de: 'Erkannt', en: 'Detected' } }],
  },
  smokeAlarm: {
    type: 'smokeAlarm',
    label: { de: 'Rauchalarm', en: 'Smoke alarm' },
    writable: false,
    fields: [{ field: 'smokeAlarm', kind: 'boolean', label: { de: 'Alarm', en: 'Alarm' } }],
  },
  waterlevelDetected: {
    type: 'waterlevelDetected',
    label: { de: 'Wasserstand', en: 'Water level' },
    writable: false,
    fields: [{ field: 'waterlevelDetected', kind: 'boolean', label: { de: 'Wasser erkannt', en: 'Water detected' } }],
  },
  moistureDetected: {
    type: 'moistureDetected',
    label: { de: 'Feuchtigkeit', en: 'Moisture' },
    writable: false,
    fields: [{ field: 'moistureDetected', kind: 'boolean', label: { de: 'Feucht', en: 'Moist' } }],
  },
  shutterLevel: {
    type: 'shutterLevel',
    label: { de: 'Rollladen', en: 'Shutter' },
    writable: true,
    fields: [{ field: 'shutterLevel', kind: 'number', label: { de: 'Position', en: 'Level' }, min: 0, max: 1 }],
  },
  slatsLevel: {
    type: 'slatsLevel',
    label: { de: 'Lamellen', en: 'Slats' },
    writable: true,
    fields: [{ field: 'slatsLevel', kind: 'number', label: { de: 'Lamellen', en: 'Slats' }, min: 0, max: 1 }],
  },
  shutterDirection: {
    type: 'shutterDirection',
    label: { de: 'Fahrtrichtung', en: 'Direction' },
    writable: false,
    fields: [{ field: 'shutterDirection', kind: 'shadingDirection', label: { de: 'Richtung', en: 'Direction' } }],
  },
  onTime: {
    type: 'onTime',
    label: { de: 'Einschaltdauer', en: 'On time' },
    writable: false,
    fields: [{ field: 'onTime', kind: 'number', label: { de: 'Dauer', en: 'Duration' }, unit: 's', min: 0 }],
  },
  raining: {
    type: 'raining',
    label: { de: 'Regen', en: 'Raining' },
    writable: false,
    fields: [{ field: 'raining', kind: 'boolean', label: { de: 'Regnet', en: 'Raining' } }],
  },
  storm: {
    type: 'storm',
    label: { de: 'Sturm', en: 'Storm' },
    writable: false,
    fields: [{ field: 'storm', kind: 'boolean', label: { de: 'Sturm', en: 'Storm' } }],
  },
  sunshine: {
    type: 'sunshine',
    label: { de: 'Sonnenschein', en: 'Sunshine' },
    writable: false,
    fields: [{ field: 'sunshine', kind: 'boolean', label: { de: 'Sonne', en: 'Sunshine' } }],
  },
  windSpeed: {
    type: 'windSpeed',
    label: { de: 'Windgeschwindigkeit', en: 'Wind speed' },
    writable: false,
    fields: [{ field: 'windSpeed', kind: 'number', label: { de: 'Wind', en: 'Wind' }, unit: 'km/h', min: 0 }],
  },
  vehicleRange: {
    type: 'vehicleRange',
    label: { de: 'Reichweite', en: 'Range' },
    writable: false,
    fields: [{ field: 'travelRange', kind: 'number', label: { de: 'Reichweite', en: 'Range' }, unit: 'km', min: 0 }],
  },
  maintenance: {
    type: 'maintenance',
    label: { de: 'Wartung', en: 'Maintenance' },
    writable: false,
    fields: [
      { field: 'unreach', kind: 'boolean', label: { de: 'Nicht erreichbar', en: 'Unreachable' } },
      { field: 'lowBat', kind: 'boolean', label: { de: 'Batterie schwach', en: 'Low battery' } },
      { field: 'sabotage', kind: 'boolean', label: { de: 'Sabotage', en: 'Sabotage' } },
    ],
  },
};

export interface DeviceTypeDef {
  type: DeviceType;
  label: { de: string; en: string };
  required: FeatureType[];
  optional: FeatureType[];
}

/** Device archetype → feature requirements, verified against spec §6.6.5. */
export const DEVICE_TYPE_CATALOG: Record<DeviceType, DeviceTypeDef> = {
  SWITCH: {
    type: 'SWITCH',
    label: { de: 'Schalter', en: 'Switch' },
    required: ['switchState'],
    optional: ['onTime', 'maintenance'],
  },
  LIGHT: {
    type: 'LIGHT',
    label: { de: 'Licht', en: 'Light' },
    required: ['switchState'],
    optional: ['dimming', 'onTime', 'maintenance'],
  },
  WINDOW_COVERING: {
    type: 'WINDOW_COVERING',
    label: { de: 'Rollladen', en: 'Window covering' },
    required: ['shutterLevel'],
    optional: ['slatsLevel', 'shutterDirection', 'maintenance'],
  },
  CLIMATE_SENSOR: {
    type: 'CLIMATE_SENSOR',
    label: { de: 'Klimasensor', en: 'Climate sensor' },
    required: [],
    optional: ['actualTemperature', 'humidity', 'illumination', 'co2', 'windSpeed', 'raining', 'storm', 'sunshine', 'maintenance'],
  },
  THERMOSTAT: {
    type: 'THERMOSTAT',
    label: { de: 'Thermostat', en: 'Thermostat' },
    required: ['setPointTemperature'],
    optional: ['actualTemperature', 'humidity', 'co2', 'maintenance'],
  },
  CONTACT_SENSOR: {
    type: 'CONTACT_SENSOR',
    label: { de: 'Kontaktsensor', en: 'Contact sensor' },
    required: ['contactSensorState'],
    optional: ['maintenance'],
  },
  OCCUPANCY_SENSOR: {
    type: 'OCCUPANCY_SENSOR',
    label: { de: 'Anwesenheitssensor', en: 'Occupancy sensor' },
    required: ['presenceDetected'],
    optional: ['maintenance'],
  },
  SMOKE_ALARM: {
    type: 'SMOKE_ALARM',
    label: { de: 'Rauchmelder', en: 'Smoke alarm' },
    required: ['smokeAlarm'],
    optional: ['maintenance'],
  },
  WATER_SENSOR: {
    type: 'WATER_SENSOR',
    label: { de: 'Wassersensor', en: 'Water sensor' },
    required: ['waterlevelDetected'],
    optional: ['moistureDetected', 'maintenance'],
  },
  ENERGY_METER: {
    type: 'ENERGY_METER',
    label: { de: 'Energiezähler', en: 'Energy meter' },
    required: ['currentPower'],
    optional: ['energyCounter', 'maintenance'],
  },
  INVERTER: {
    type: 'INVERTER',
    label: { de: 'Wechselrichter', en: 'Inverter' },
    required: ['currentPower'],
    optional: ['energyCounter', 'maintenance'],
  },
  GRID_CONNECTION_POINT: {
    type: 'GRID_CONNECTION_POINT',
    label: { de: 'Netzanschlusspunkt', en: 'Grid connection point' },
    required: ['currentPower'],
    optional: ['energyCounter', 'maintenance'],
  },
  EV_CHARGER: {
    type: 'EV_CHARGER',
    label: { de: 'Wallbox', en: 'EV charger' },
    required: ['currentPower'],
    optional: ['energyCounter', 'maintenance'],
  },
  BATTERY: {
    type: 'BATTERY',
    label: { de: 'Batterie', en: 'Battery' },
    required: ['batteryState'],
    optional: ['currentPower', 'energyCounter', 'maintenance'],
  },
  VEHICLE: {
    type: 'VEHICLE',
    label: { de: 'Fahrzeug', en: 'Vehicle' },
    required: ['batteryState'],
    optional: ['vehicleRange', 'maintenance'],
  },
  HVAC: {
    type: 'HVAC',
    label: { de: 'Klimaanlage', en: 'HVAC' },
    required: ['currentPower'],
    optional: ['energyCounter', 'maintenance'],
  },
  HEAT_PUMP: {
    type: 'HEAT_PUMP',
    label: { de: 'Wärmepumpe', en: 'Heat pump' },
    required: [],
    optional: ['supplyTemperature', 'maintenance'],
  },
  PARTICULATE_MATTER_SENSOR: {
    type: 'PARTICULATE_MATTER_SENSOR',
    label: { de: 'Feinstaubsensor', en: 'Particulate matter sensor' },
    required: [],
    optional: ['actualTemperature', 'humidity', 'maintenance'],
  },
  SWITCH_INPUT: {
    type: 'SWITCH_INPUT',
    label: { de: 'Tastereingang', en: 'Switch input' },
    required: [],
    optional: ['maintenance'],
  },
};
