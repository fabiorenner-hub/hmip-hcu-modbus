import type { JSX } from 'preact';
import { signal, effect } from '@preact/signals';
import { api } from '../store.js';
import { t, fmtDateTime } from '../i18n.js';
import { Panel, Card, Chip, EmptyState } from '../components.js';
import type { DecisionEntry } from '../../../../shared/snapshot.js';

const items = signal<DecisionEntry[] | null>(null);
let started = false;

function ensurePolling(): void {
  if (started) return;
  started = true;
  const tick = (): void => void api.decisions().then((d) => { items.value = d; }).catch(() => undefined);
  tick();
  effect(() => {
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  });
}

function tone(kind: DecisionEntry['kind']): 'success' | 'warn' | 'danger' | 'info' {
  if (kind === 'control_applied') return 'success';
  if (kind === 'control_rejected') return 'danger';
  if (kind === 'status_event_suppressed') return 'warn';
  return 'info';
}

function label(kind: DecisionEntry['kind']): string {
  switch (kind) {
    case 'status_event_sent': return t('Status gesendet', 'Status sent');
    case 'status_event_suppressed': return t('Status unterdrückt', 'Status suppressed');
    case 'control_applied': return t('Befehl ausgeführt', 'Command applied');
    case 'control_rejected': return t('Befehl abgelehnt', 'Command rejected');
  }
}

export function DecisionsTab(): JSX.Element {
  ensurePolling();
  const list = items.value;
  return (
    <Panel
      title={t('Entscheidungen', 'Decisions')}
      intro={t('Warum die Bridge ein STATUS_EVENT gesendet oder einen Befehl abgelehnt hat.', 'Why the bridge emitted a STATUS_EVENT or rejected a command.')}
      badge={list ? `${list.length}` : '—'}
    >
      <Card>
        {!list || list.length === 0 ? (
          <EmptyState message={t('Noch keine Entscheidungen', 'No decisions yet')} />
        ) : (
          <div class="decision-list">
            {list.map((d, i) => (
              <div key={i} class="decision-row">
                <Chip tone={tone(d.kind)}>{label(d.kind)}</Chip>
                <span class="decision-row__dev mono">{d.deviceId}</span>
                <span class="decision-row__reason">{d.reason}</span>
                <span class="decision-row__time">{fmtDateTime(d.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Panel>
  );
}
