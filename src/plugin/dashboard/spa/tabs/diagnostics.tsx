import type { JSX } from 'preact';
import { signal, effect } from '@preact/signals';
import { snapshot, api } from '../store.js';
import { t, tServer, pick, fmtTime, fmtDateTime } from '../i18n.js';
import { Panel, Card, Kpi, Chip, EmptyState } from '../components.js';
import type { ValidationIssue } from '../../../engine/validate.js';

interface ConnectLogLine { at: number; dir: 'in' | 'out'; type: string; id: string }

const connectLog = signal<ConnectLogLine[]>([]);
const issues = signal<ValidationIssue[]>([]);
let started = false;

function ensurePolling(): void {
  if (started) return;
  started = true;
  const tick = (): void => {
    void api.connectLog().then((l) => { connectLog.value = l as ConnectLogLine[]; }).catch(() => undefined);
    void api.diagnostics().then((d) => { issues.value = (d.validation as ValidationIssue[]) ?? []; }).catch(() => undefined);
  };
  tick();
  effect(() => {
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  });
}

export function DiagnosticsTab(): JSX.Element {
  ensurePolling();
  const snap = snapshot.value;
  const connectHealth = snap?.connect.health ?? 'disabled';
  return (
    <Panel
      title={t('Diagnose', 'Diagnostics')}
      intro={t('Verbindungsstatus, Konfigurationsprüfung und Connect-Nachrichtenprotokoll.', 'Connection status, configuration checks and the Connect message log.')}
    >
      <div class="kpi-grid">
        <Kpi label={t('Connect', 'Connect')} value={<Chip tone={connectHealth === 'connected' ? 'success' : 'muted'}>{tServer(connectHealth)}</Chip>} hint={snap?.connect.url} />
        <Kpi label={t('Bereitschaft', 'Readiness')} value={tServer(snap?.readiness ?? 'CONFIG_REQUIRED')} />
        <Kpi label={t('Verbunden seit', 'Connected since')} value={fmtTime(snap?.connect.connectedSince ?? null)} />
      </div>

      {snap?.connect.lastError ? (
        <Card title={t('Letzter Connect-Fehler', 'Last connect error')}>
          <div class="state state--error">{snap.connect.lastError}</div>
        </Card>
      ) : null}

      <Card title={t('Hub-Status', 'Hub status')}>
        {!snap || snap.hubs.length === 0 ? (
          <EmptyState message={t('Kein Hub', 'No hub')} />
        ) : (
          <div class="issue-list">
            {snap.hubs.map((h) => (
              <div key={h.id} class="issue-row">
                <Chip tone={h.health === 'connected' ? 'success' : h.health === 'error' ? 'danger' : 'warn'}>{tServer(h.health)}</Chip>
                <span class="mono">{h.name} · {h.target}</span>
                {h.lastError ? <span class="hub-error">{h.lastError}</span> : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('Konfigurationsprüfung', 'Configuration checks')}>
        {issues.value.length === 0 ? (
          <EmptyState message={t('Keine Hinweise', 'No issues')} />
        ) : (
          <div class="issue-list">
            {issues.value.map((iss, i) => (
              <div key={i} class="issue-row">
                <Chip tone={iss.level === 'error' ? 'danger' : 'warn'}>{iss.level}</Chip>
                <span>{pick(iss.message)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('Connect-Protokoll', 'Connect log')}>
        {connectLog.value.length === 0 ? (
          <EmptyState message={t('Keine Nachrichten', 'No messages')} />
        ) : (
          <div class="table-wrap">
            <table class="data-table data-table--compact">
              <thead><tr><th>{t('Zeit', 'Time')}</th><th>{t('Richtung', 'Dir')}</th><th>{t('Typ', 'Type')}</th></tr></thead>
              <tbody>
                {connectLog.value.slice(-100).reverse().map((l, i) => (
                  <tr key={i}>
                    <td>{fmtDateTime(l.at)}</td>
                    <td><Chip tone={l.dir === 'in' ? 'info' : 'muted'}>{l.dir}</Chip></td>
                    <td class="mono">{l.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Panel>
  );
}
