import type { JSX } from 'preact';
import { signal } from '@preact/signals';
import { config, catalog, api } from '../store.js';
import { t, pick } from '../i18n.js';
import { Panel, Card, Field, Toggle, EmptyState, LoadingState } from '../components.js';
import type { AppConfig, Binding, Hub, ModbusDevice } from '../../../../shared/schema.js';
import {
  MODBUS_KINDS,
  REGISTER_KINDS,
  MODBUS_DATA_TYPES,
  DEVICE_TYPES,
} from '../../../../shared/schema.js';

const saving = signal(false);
const saveError = signal<string | null>(null);
const selectedDevice = signal<string | null>(null);

function uid(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}`;
}

async function mutate(fn: (cfg: AppConfig) => void): Promise<void> {
  const current = config.value;
  if (!current) return;
  const next = structuredClone(current) as AppConfig;
  fn(next);
  saving.value = true;
  saveError.value = null;
  const res = await api.saveConfig(next);
  saving.value = false;
  if (!res.ok) saveError.value = res.error ?? 'error';
}

/** Set a numeric optional field, deleting it when the input is empty. */
function setOpt<T extends object>(obj: T, key: keyof T, raw: string): void {
  if (raw.trim() === '') delete obj[key];
  else (obj[key] as unknown as number) = Number(raw);
}

function HubEditor(props: { hub: Hub }): JSX.Element {
  const h = props.hub;
  const isSerial = h.kind === 'rtu';
  const isNet = h.kind === 'tcp' || h.kind === 'udp' || h.kind === 'rtuovertcp';
  return (
    <Card class="editor-card">
      <div class="editor-card__head">
        <strong>{h.name || h.id}</strong>
        <button class="btn btn--danger-ghost" type="button" onClick={() => void mutate((c) => { c.hubs = c.hubs.filter((x) => x.id !== h.id); })}>
          {t('Entfernen', 'Remove')}
        </button>
      </div>
      <div class="form-grid">
        <Field label={t('Name', 'Name')}>
          <input value={h.name} onInput={(e) => void mutate((c) => { const x = c.hubs.find((y) => y.id === h.id); if (x) x.name = (e.target as HTMLInputElement).value; })} />
        </Field>
        <Field label={t('Transport', 'Transport')}>
          <select value={h.kind} onChange={(e) => void mutate((c) => { const x = c.hubs.find((y) => y.id === h.id); if (x) x.kind = (e.target as HTMLSelectElement).value as Hub['kind']; })}>
            {MODBUS_KINDS.map((k) => <option value={k}>{k.toUpperCase()}</option>)}
          </select>
        </Field>
        {isNet ? (
          <>
            <Field label={t('Host', 'Host')}>
              <input value={h.host} onInput={(e) => void mutate((c) => { const x = c.hubs.find((y) => y.id === h.id); if (x) x.host = (e.target as HTMLInputElement).value; })} />
            </Field>
            <Field label={t('Port', 'Port')}>
              <input type="number" value={h.port} onInput={(e) => void mutate((c) => { const x = c.hubs.find((y) => y.id === h.id); if (x) x.port = Number((e.target as HTMLInputElement).value); })} />
            </Field>
          </>
        ) : null}
        {isSerial ? (
          <>
            <Field label={t('Serieller Port', 'Serial port')}>
              <input value={h.serialPath} placeholder="/dev/ttyUSB0" onInput={(e) => void mutate((c) => { const x = c.hubs.find((y) => y.id === h.id); if (x) x.serialPath = (e.target as HTMLInputElement).value; })} />
            </Field>
            <Field label={t('Baudrate', 'Baud rate')}>
              <input type="number" value={h.baudRate} onInput={(e) => void mutate((c) => { const x = c.hubs.find((y) => y.id === h.id); if (x) x.baudRate = Number((e.target as HTMLInputElement).value); })} />
            </Field>
            <Field label={t('Parität', 'Parity')}>
              <select value={h.parity} onChange={(e) => void mutate((c) => { const x = c.hubs.find((y) => y.id === h.id); if (x) x.parity = (e.target as HTMLSelectElement).value as Hub['parity']; })}>
                <option value="none">none</option>
                <option value="even">even</option>
                <option value="odd">odd</option>
              </select>
            </Field>
          </>
        ) : null}
        <Field label={t('Timeout (ms)', 'Timeout (ms)')}>
          <input type="number" value={h.timeoutMs} onInput={(e) => void mutate((c) => { const x = c.hubs.find((y) => y.id === h.id); if (x) x.timeoutMs = Number((e.target as HTMLInputElement).value); })} />
        </Field>
        <Field label={t('Pause (ms)', 'Delay (ms)')}>
          <input type="number" value={h.delayMs} onInput={(e) => void mutate((c) => { const x = c.hubs.find((y) => y.id === h.id); if (x) x.delayMs = Number((e.target as HTMLInputElement).value); })} />
        </Field>
        <Field label={t('Aktiv', 'Enabled')}>
          <Toggle checked={h.enabled} onChange={(v) => void mutate((c) => { const x = c.hubs.find((y) => y.id === h.id); if (x) x.enabled = v; })} />
        </Field>
      </div>
    </Card>
  );
}

function BindingRow(props: { device: ModbusDevice; binding: Binding }): JSX.Element {
  const { device, binding: b } = props;
  const cat = catalog.value;
  const featureTypes = cat ? cat.deviceTypes[device.deviceType] : null;
  const allowed = featureTypes ? [...featureTypes.required, ...featureTypes.optional] : [];
  const featureDef = cat?.features[b.featureType];

  const patch = (fn: (x: Binding) => void): void =>
    void mutate((c) => {
      const dev = c.devices.find((d) => d.id === device.id);
      const target = dev?.bindings.find((x) => x.id === b.id);
      if (target) fn(target);
    });

  return (
    <tr>
      <td>
        <select value={b.featureType} onChange={(e) => patch((x) => { x.featureType = (e.target as HTMLSelectElement).value as Binding['featureType']; const fd = cat?.features[x.featureType]; if (fd?.fields[0]) x.field = fd.fields[0].field; })}>
          {allowed.map((ft) => <option value={ft}>{cat ? pick(cat.features[ft].label) : ft}</option>)}
        </select>
      </td>
      <td>
        <select value={b.field} onChange={(e) => patch((x) => { x.field = (e.target as HTMLSelectElement).value; })}>
          {(featureDef?.fields ?? []).map((f) => <option value={f.field}>{f.field}</option>)}
        </select>
      </td>
      <td>
        <select value={b.registerKind} onChange={(e) => patch((x) => { x.registerKind = (e.target as HTMLSelectElement).value as Binding['registerKind']; })}>
          {REGISTER_KINDS.map((r) => <option value={r}>{r}</option>)}
        </select>
      </td>
      <td><input class="w-num" type="number" value={b.address} onInput={(e) => patch((x) => { x.address = Number((e.target as HTMLInputElement).value); })} /></td>
      <td>
        <select value={b.dataType} onChange={(e) => patch((x) => { x.dataType = (e.target as HTMLSelectElement).value as Binding['dataType']; })}>
          {MODBUS_DATA_TYPES.map((d) => <option value={d}>{d}</option>)}
        </select>
      </td>
      <td><input class="w-num" type="number" step="any" value={b.scale} onInput={(e) => patch((x) => { x.scale = Number((e.target as HTMLInputElement).value); })} /></td>
      <td><input class="w-num" type="number" step="any" value={b.offset} onInput={(e) => patch((x) => { x.offset = Number((e.target as HTMLInputElement).value); })} /></td>
      <td><input class="w-num" type="number" value={b.precision ?? ''} onInput={(e) => patch((x) => setOpt(x, 'precision', (e.target as HTMLInputElement).value))} /></td>
      <td class="center"><input type="checkbox" checked={b.wordSwap} onChange={(e) => patch((x) => { x.wordSwap = (e.target as HTMLInputElement).checked; })} /></td>
      <td class="center"><input type="checkbox" checked={b.byteSwap} onChange={(e) => patch((x) => { x.byteSwap = (e.target as HTMLInputElement).checked; })} /></td>
      <td>
        <select value={b.access} onChange={(e) => patch((x) => { x.access = (e.target as HTMLSelectElement).value as Binding['access']; })}>
          <option value="ro">ro</option>
          <option value="rw">rw</option>
        </select>
      </td>
      <td class="center"><input type="checkbox" checked={b.verify} onChange={(e) => patch((x) => { x.verify = (e.target as HTMLInputElement).checked; })} /></td>
      <td>
        <button class="btn btn--danger-ghost" type="button" onClick={() => void mutate((c) => { const dev = c.devices.find((d) => d.id === device.id); if (dev) dev.bindings = dev.bindings.filter((x) => x.id !== b.id); })}>✕</button>
      </td>
    </tr>
  );
}

function newBinding(device: ModbusDevice, cat: NonNullable<typeof catalog.value>): Binding {
  const dt = cat.deviceTypes[device.deviceType];
  const ft = dt.required[0] ?? dt.optional[0] ?? 'switchState';
  const field = cat.features[ft].fields[0]?.field ?? 'on';
  return {
    id: uid('bind'),
    featureType: ft,
    field,
    registerKind: 'holding',
    address: 0,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    wordSwap: false,
    byteSwap: false,
    access: 'ro',
    invert: false,
    verify: false,
  };
}

function DeviceEditor(props: { device: ModbusDevice }): JSX.Element {
  const d = props.device;
  const cfg = config.value!;
  const cat = catalog.value!;
  const patchDev = (fn: (x: ModbusDevice) => void): void =>
    void mutate((c) => { const x = c.devices.find((y) => y.id === d.id); if (x) fn(x); });

  return (
    <Card class="editor-card">
      <div class="editor-card__head">
        <strong>{d.friendlyName || d.id}</strong>
        <button class="btn btn--danger-ghost" type="button" onClick={() => void mutate((c) => { c.devices = c.devices.filter((x) => x.id !== d.id); })}>
          {t('Gerät entfernen', 'Remove device')}
        </button>
      </div>
      <div class="form-grid">
        <Field label={t('Name', 'Name')}>
          <input value={d.friendlyName} onInput={(e) => patchDev((x) => { x.friendlyName = (e.target as HTMLInputElement).value; })} />
        </Field>
        <Field label={t('Hub', 'Hub')}>
          <select value={d.hubId} onChange={(e) => patchDev((x) => { x.hubId = (e.target as HTMLSelectElement).value; })}>
            <option value="">—</option>
            {cfg.hubs.map((h) => <option value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <Field label={t('Unit-ID', 'Unit ID')}>
          <input type="number" value={d.unitId} onInput={(e) => patchDev((x) => { x.unitId = Number((e.target as HTMLInputElement).value); })} />
        </Field>
        <Field label={t('Gerätetyp', 'Device type')}>
          <select value={d.deviceType} onChange={(e) => patchDev((x) => { x.deviceType = (e.target as HTMLSelectElement).value as ModbusDevice['deviceType']; })}>
            {DEVICE_TYPES.map((dt) => <option value={dt}>{pick(cat.deviceTypes[dt].label)}</option>)}
          </select>
        </Field>
        <Field label={t('Abfrage (ms)', 'Poll (ms)')}>
          <input type="number" value={d.pollMs} onInput={(e) => patchDev((x) => { x.pollMs = Number((e.target as HTMLInputElement).value); })} />
        </Field>
        <Field label={t('Toleranz', 'Snap tolerance')}>
          <input type="number" step="any" value={d.snapTolerance} onInput={(e) => patchDev((x) => { x.snapTolerance = Number((e.target as HTMLInputElement).value); })} />
        </Field>
        <Field label={t('Aktiv', 'Enabled')}>
          <Toggle checked={d.enabled} onChange={(v) => patchDev((x) => { x.enabled = v; })} />
        </Field>
      </div>

      <div class="binding-head">
        <span>{t('Register-Zuordnungen', 'Register bindings')}</span>
        <button class="btn" type="button" onClick={() => void mutate((c) => { const dev = c.devices.find((y) => y.id === d.id); if (dev) dev.bindings.push(newBinding(d, cat)); })}>
          + {t('Zuordnung', 'Binding')}
        </button>
      </div>
      {d.bindings.length === 0 ? (
        <EmptyState message={t('Noch keine Zuordnung', 'No bindings yet')} />
      ) : (
        <div class="table-wrap">
          <table class="data-table data-table--compact">
            <thead>
              <tr>
                <th>{t('Feature', 'Feature')}</th><th>{t('Feld', 'Field')}</th><th>{t('Klasse', 'Class')}</th>
                <th>{t('Adr.', 'Addr.')}</th><th>{t('Typ', 'Type')}</th><th>{t('Skala', 'Scale')}</th>
                <th>{t('Offset', 'Offset')}</th><th>{t('Präz.', 'Prec.')}</th><th>WS</th><th>BS</th>
                <th>{t('Zugriff', 'Access')}</th><th>{t('Verify', 'Verify')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {d.bindings.map((b) => <BindingRow key={b.id} device={d} binding={b} />)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function MappingTab(): JSX.Element {
  const cfg = config.value;
  const cat = catalog.value;
  if (!cfg || !cat) {
    return (
      <Panel title={t('Zuordnung', 'Mapping')}>
        <LoadingState message={t('Lade Konfiguration…', 'Loading configuration…')} />
      </Panel>
    );
  }

  const addHub = (): void =>
    void mutate((c) => {
      c.hubs.push({
        id: uid('hub'), name: t('Neuer Hub', 'New hub'), kind: 'tcp', host: '127.0.0.1', port: 502,
        serialPath: '', baudRate: 9600, parity: 'none', dataBits: 8, stopBits: 1, timeoutMs: 2000, delayMs: 0, enabled: true,
      });
    });

  const addDevice = (): void =>
    void mutate((c) => {
      const hubId = c.hubs[0]?.id ?? '';
      c.devices.push({
        id: uid('dev'), hubId, unitId: 1, deviceType: 'SWITCH', friendlyName: t('Neues Gerät', 'New device'),
        modelType: 'MODBUS', firmwareVersion: '1.0.0', pollMs: 5000, snapTolerance: 0, enabled: true, bindings: [],
      });
    });

  const shown = selectedDevice.value ? cfg.devices.filter((d) => d.id === selectedDevice.value) : cfg.devices;

  return (
    <Panel
      title={t('Zuordnung', 'Mapping')}
      badge={saving.value ? t('Speichere…', 'Saving…') : `${cfg.hubs.length} ${t('Hubs', 'hubs')} · ${cfg.devices.length} ${t('Geräte', 'devices')}`}
      intro={t('Hubs anlegen und Register auf Homematic-IP-Features abbilden.', 'Create hubs and map registers onto Homematic IP features.')}
    >
      {saveError.value ? <Card><div class="state state--error">{saveError.value}</div></Card> : null}

      <Card title={t('Hubs', 'Hubs')}>
        <button class="btn btn--accent" type="button" onClick={addHub}>+ {t('Hub hinzufügen', 'Add hub')}</button>
        {cfg.hubs.map((h) => <HubEditor key={h.id} hub={h} />)}
      </Card>

      <Card title={t('Geräte', 'Devices')}>
        <div class="row-between">
          <button class="btn btn--accent" type="button" onClick={addDevice} disabled={cfg.hubs.length === 0}>
            + {t('Gerät hinzufügen', 'Add device')}
          </button>
          <select value={selectedDevice.value ?? ''} onChange={(e) => { selectedDevice.value = (e.target as HTMLSelectElement).value || null; }}>
            <option value="">{t('Alle Geräte', 'All devices')}</option>
            {cfg.devices.map((d) => <option value={d.id}>{d.friendlyName}</option>)}
          </select>
        </div>
        {cfg.hubs.length === 0 ? (
          <EmptyState message={t('Erst einen Hub anlegen', 'Create a hub first')} />
        ) : shown.length === 0 ? (
          <EmptyState message={t('Kein Gerät', 'No device')} />
        ) : (
          shown.map((d) => <DeviceEditor key={d.id} device={d} />)
        )}
      </Card>
    </Panel>
  );
}
