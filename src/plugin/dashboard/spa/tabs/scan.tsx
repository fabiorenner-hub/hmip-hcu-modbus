import type { JSX } from 'preact';
import { signal } from '@preact/signals';
import { config, api } from '../store.js';
import { t } from '../i18n.js';
import { Panel, Card, Field, EmptyState, LoadingState, ErrorState } from '../components.js';
import { REGISTER_KINDS } from '../../../../shared/schema.js';
import type { RegisterKind } from '../../../../shared/schema.js';

const hubId = signal('');
const unitId = signal(1);
const registerKind = signal<RegisterKind>('holding');
const start = signal(0);
const count = signal(32);
const busy = signal(false);
const error = signal<string | null>(null);
const result = signal<{ hits: { address: number; value: number }[]; scanned: number; errors: number } | null>(null);

async function runScan(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    result.value = await api.scan({
      hubId: hubId.value,
      unitId: unitId.value,
      registerKind: registerKind.value,
      start: start.value,
      count: count.value,
    });
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}

export function ScanTab(): JSX.Element {
  const cfg = config.value;
  if (!cfg) {
    return <Panel title={t('Scannen', 'Scan')}><LoadingState message={t('Lade…', 'Loading…')} /></Panel>;
  }
  if (!hubId.value && cfg.hubs[0]) hubId.value = cfg.hubs[0].id;

  return (
    <Panel
      title={t('Scannen', 'Scan')}
      intro={t('Adressbereich eines Geräts abtasten, um belegte Register zu finden.', 'Probe a device address range to find which registers respond.')}
    >
      <Card title={t('Bereich', 'Range')}>
        {cfg.hubs.length === 0 ? (
          <EmptyState message={t('Kein Hub vorhanden', 'No hub available')} />
        ) : (
          <>
            <div class="form-grid">
              <Field label={t('Hub', 'Hub')}>
                <select value={hubId.value} onChange={(e) => { hubId.value = (e.target as HTMLSelectElement).value; }}>
                  {cfg.hubs.map((h) => <option value={h.id}>{h.name}</option>)}
                </select>
              </Field>
              <Field label={t('Unit-ID', 'Unit ID')}>
                <input type="number" value={unitId.value} onInput={(e) => { unitId.value = Number((e.target as HTMLInputElement).value); }} />
              </Field>
              <Field label={t('Register-Klasse', 'Register class')}>
                <select value={registerKind.value} onChange={(e) => { registerKind.value = (e.target as HTMLSelectElement).value as RegisterKind; }}>
                  {REGISTER_KINDS.map((r) => <option value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label={t('Startadresse', 'Start address')}>
                <input type="number" value={start.value} onInput={(e) => { start.value = Number((e.target as HTMLInputElement).value); }} />
              </Field>
              <Field label={t('Anzahl', 'Count')} hint={t('max. 2000', 'max 2000')}>
                <input type="number" value={count.value} onInput={(e) => { count.value = Number((e.target as HTMLInputElement).value); }} />
              </Field>
            </div>
            <button class="btn btn--accent" type="button" disabled={busy.value} onClick={() => void runScan()}>
              {busy.value ? t('Scanne…', 'Scanning…') : t('Scan starten', 'Start scan')}
            </button>
          </>
        )}
      </Card>

      {error.value ? <Card><ErrorState message={error.value} /></Card> : null}

      {result.value ? (
        <Card title={t('Ergebnis', 'Result')}>
          <p class="module-panel__hint">
            {t('Geprüft', 'Scanned')}: {result.value.scanned} · {t('Antworten', 'Responses')}: {result.value.hits.length} · {t('Fehler', 'Errors')}: {result.value.errors}
          </p>
          {result.value.hits.length === 0 ? (
            <EmptyState message={t('Keine Register geantwortet', 'No registers responded')} />
          ) : (
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>{t('Adresse', 'Address')}</th><th>{t('Rohwert', 'Raw value')}</th><th>Hex</th></tr></thead>
                <tbody>
                  {result.value.hits.map((h) => (
                    <tr key={h.address}>
                      <td class="mono">{h.address}</td>
                      <td class="mono">{h.value}</td>
                      <td class="mono">0x{h.value.toString(16).padStart(4, '0')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </Panel>
  );
}
