import type { JSX } from 'preact';
import { signal, effect } from '@preact/signals';
import { api } from '../store.js';
import { t, fmtDateTime } from '../i18n.js';
import { Panel, Card, Chip, EmptyState } from '../components.js';

interface LogLine { at: number; level: string; scope: string; message: string }

const logs = signal<LogLine[]>([]);
const exporting = signal(false);
const exportError = signal<string | null>(null);
let started = false;

const API_ENDPOINTS = [
  '/api/state', '/api/config', '/api/catalog', '/api/diagnostics', '/api/validation',
  '/api/metrics', '/api/trends', '/api/decisions', '/api/notifications', '/api/connect/log',
  '/api/logs', '/api/updates',
];

function ensurePolling(): void {
  if (started) return;
  started = true;
  const tick = (): void => void api.logs().then((l) => { logs.value = l as LogLine[]; }).catch(() => undefined);
  tick();
  effect(() => {
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  });
}

async function exportAll(): Promise<void> {
  exporting.value = true;
  exportError.value = null;
  const parts: string[] = [];
  const missing: string[] = [];
  parts.push('=== Modbus Bridge — 360° Diagnostics Export ===');
  parts.push(`Generated: ${new Date().toISOString()}`);
  parts.push('');
  parts.push('--- Browser / System ---');
  parts.push(`userAgent: ${navigator.userAgent}`);
  parts.push(`language: ${navigator.language}`);
  parts.push(`platform: ${navigator.platform}`);
  parts.push(`screen: ${screen.width}x${screen.height}`);
  parts.push(`viewport: ${window.innerWidth}x${window.innerHeight}`);
  parts.push('');

  for (const ep of API_ENDPOINTS) {
    parts.push(`--- ${ep} ---`);
    try {
      const res = await fetch(ep);
      if (!res.ok) {
        parts.push(`[MISSING] HTTP ${res.status}`);
        missing.push(ep);
      } else {
        const text = await res.text();
        try {
          parts.push(JSON.stringify(JSON.parse(text), null, 2));
        } catch {
          parts.push(text);
        }
      }
    } catch (e) {
      parts.push(`[MISSING] ${String(e)}`);
      missing.push(ep);
    }
    parts.push('');
  }

  if (missing.length > 0) {
    exportError.value = t(
      `Export unvollständig — fehlende Abschnitte: ${missing.join(', ')}`,
      `Export incomplete — missing sections: ${missing.join(', ')}`,
    );
    parts.splice(3, 0, `[WARNING] Missing sections: ${missing.join(', ')}`);
  }

  const blob = new Blob([parts.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `modbus-bridge-diagnostics-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  exporting.value = false;
}

function tone(level: string): 'danger' | 'warn' | 'info' | 'muted' {
  if (level === 'error') return 'danger';
  if (level === 'warn') return 'warn';
  if (level === 'info') return 'info';
  return 'muted';
}

export function LogsTab(): JSX.Element {
  ensurePolling();
  return (
    <Panel
      title={t('Logs & Debug', 'Logs & debug')}
      intro={t('Laufzeit-Logs und ein 360°-Export aller Diagnosedaten in eine Textdatei.', 'Runtime logs and a 360° export of all diagnostics into a single text file.')}
    >
      <Card title={t('360°-Export', '360° export')}>
        <p class="module-panel__hint">
          {t('Sammelt alle /api/*-Antworten plus Browser- und Systeminfos in einer .txt-Datei.', 'Collects all /api/* responses plus browser and system info into one .txt file.')}
        </p>
        <button class="btn btn--accent" type="button" disabled={exporting.value} onClick={() => void exportAll()}>
          {exporting.value ? t('Exportiere…', 'Exporting…') : t('Alle Informationen', 'All information')}
        </button>
        {exportError.value ? <div class="state state--error">{exportError.value}</div> : null}
      </Card>

      <Card title={t('Logs', 'Logs')}>
        {logs.value.length === 0 ? (
          <EmptyState message={t('Keine Logzeilen', 'No log lines')} />
        ) : (
          <div class="log-list mono">
            {logs.value.slice(-300).reverse().map((l, i) => (
              <div key={i} class="log-line">
                <span class="log-line__time">{fmtDateTime(l.at)}</span>
                <Chip tone={tone(l.level)}>{l.level}</Chip>
                <span class="log-line__scope">{l.scope}</span>
                <span class="log-line__msg">{l.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Panel>
  );
}
