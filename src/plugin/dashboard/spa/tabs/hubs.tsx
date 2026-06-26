import type { JSX } from 'preact';
import { snapshot } from '../store.js';
import { t, tServer, fmtNum, fmtTime, pick } from '../i18n.js';
import { Panel, Card, Kpi, Chip, EmptyState, LoadingState } from '../components.js';
import { FEATURE_CATALOG } from '../../../../shared/catalog.js';
import type { FeaturePayload } from '../../../../shared/snapshot.js';

function hubTone(health: string): 'success' | 'warn' | 'danger' | 'muted' {
  if (health === 'connected') return 'success';
  if (health === 'connecting' || health === 'offline') return 'warn';
  if (health === 'error') return 'danger';
  return 'muted';
}

function featureSummary(features: FeaturePayload[]): string {
  if (features.length === 0) return t('keine Werte', 'no values');
  return features
    .filter((f) => f.type !== 'shutterDirection')
    .map((f) => {
      const def = FEATURE_CATALOG[f.type];
      const field = def?.fields[0];
      const v = field ? f[field.field] : undefined;
      const val = typeof v === 'number' ? fmtNum(v) : typeof v === 'boolean' ? (v ? '✓' : '✗') : String(v ?? '');
      return `${def ? pick(def.label) : f.type}: ${val}${field?.unit ?? ''}`;
    })
    .join(' · ');
}

export function HubsDevicesTab(): JSX.Element {
  const snap = snapshot.value;
  if (!snap) {
    return (
      <Panel title={t('Hubs & Geräte', 'Hubs & devices')}>
        <LoadingState message={t('Lade Status…', 'Loading status…')} />
      </Panel>
    );
  }

  const badge = `${snap.counters.onlineDevices}/${snap.counters.devices} ${t('online', 'online')}`;

  return (
    <Panel
      title={t('Hubs & Geräte', 'Hubs & devices')}
      badge={badge}
      intro={t(
        'Live-Übersicht aller Modbus-Hubs und der angebundenen Geräte.',
        'Live overview of all Modbus hubs and the connected devices.',
      )}
    >
      <div class="kpi-grid">
        <Kpi label={t('Hubs', 'Hubs')} value={fmtNum(snap.counters.hubs, 0)} />
        <Kpi label={t('Geräte', 'Devices')} value={fmtNum(snap.counters.devices, 0)} />
        <Kpi label={t('Zuordnungen', 'Bindings')} value={fmtNum(snap.counters.bindings, 0)} />
        <Kpi label={t('Online', 'Online')} value={fmtNum(snap.counters.onlineDevices, 0)} />
      </div>

      <Card title={t('Hubs', 'Hubs')}>
        {snap.hubs.length === 0 ? (
          <EmptyState
            message={t('Kein Hub konfiguriert', 'No hub configured')}
            hint={t('Lege im Tab „Zuordnung" einen Hub an.', 'Create a hub in the "Mapping" tab.')}
          />
        ) : (
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>{t('Name', 'Name')}</th>
                  <th>{t('Typ', 'Type')}</th>
                  <th>{t('Ziel', 'Target')}</th>
                  <th>{t('Status', 'Status')}</th>
                  <th>{t('Lesen/Schreiben/Fehler', 'Reads/Writes/Errors')}</th>
                  <th>{t('Zuletzt OK', 'Last OK')}</th>
                </tr>
              </thead>
              <tbody>
                {snap.hubs.map((h) => (
                  <tr key={h.id}>
                    <td>{h.name}</td>
                    <td>{h.kind.toUpperCase()}</td>
                    <td class="mono">{h.target}</td>
                    <td><Chip tone={hubTone(h.health)}>{tServer(h.health)}</Chip></td>
                    <td class="mono">{h.reads}/{h.writes}/{h.errors}</td>
                    <td>{fmtTime(h.lastOkAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('Geräte', 'Devices')}>
        {snap.devices.length === 0 ? (
          <EmptyState message={t('Kein Gerät konfiguriert', 'No device configured')} />
        ) : (
          <div class="device-list">
            {snap.devices.map((d) => (
              <div key={d.id} class={`device-row ${d.online ? '' : 'device-row--off'}`}>
                <div class="device-row__main">
                  <span class="device-row__name">{d.friendlyName}</span>
                  <Chip tone={d.online ? 'success' : 'muted'}>{d.deviceType}</Chip>
                </div>
                <div class="device-row__values">{featureSummary(d.features)}</div>
                <div class="device-row__meta">
                  {t('Stand', 'As of')} {fmtTime(d.lastReadAt)}
                  {d.errorCount > 0 ? ` · ${d.errorCount} ${t('Fehler', 'errors')}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Panel>
  );
}
