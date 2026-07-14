import type { JSX } from 'preact';
import { signal } from '@preact/signals';
import { t } from '../i18n.js';
import { Card, Field, Toggle } from '../components.js';
import { config, api, otaApi } from '../store.js';
import type { AppConfig } from '../../../../shared/schema.js';

const preview = signal<string | null>(null);
const showPreview = signal(false);

async function patchAnalytics(fn: (a: AppConfig['analytics']) => void): Promise<void> {
  const cur = config.value;
  if (!cur) return;
  const next = structuredClone(cur) as AppConfig;
  fn(next.analytics);
  await api.saveConfig(next);
}

async function loadPreview(): Promise<void> {
  try {
    preview.value = JSON.stringify(await otaApi.analyticsPreview(), null, 2);
  } catch {
    preview.value = t('Vorschau nicht verfügbar.', 'Preview unavailable.');
  }
}

export function AnalyticsCard(): JSX.Element | null {
  const cfg = config.value;
  if (!cfg) return null;
  const a = cfg.analytics;

  return (
    <Card title={t('Anonyme Nutzungsstatistik', 'Anonymous usage analytics')}>
      <p class="module-panel__hint">
        {t(
          'Standardmäßig aktiv. Sendet in großen Abständen pseudonyme, technische Statistik (Versionen, Architektur, Sprache) – keine Raum-/Gerätedaten, Messwerte, Orte, Namen, IPs oder Tokens. Hier jederzeit abschaltbar.',
          'On by default. Sends pseudonymous technical statistics (versions, architecture, language) at long intervals — no room/device data, values, locations, names, IPs or tokens. You can turn it off here anytime.',
        )}
      </p>

      <Field label={t('Anonyme Nutzungsstatistik senden', 'Send anonymous usage analytics')}>
        <Toggle checked={a.enabled} onChange={(v) => void patchAnalytics((x) => { x.enabled = v; })} />
      </Field>

      <Field
        label={t('Endpoint (HTTPS)', 'Endpoint (HTTPS)')}
        hint={t('Leer = es wird nichts gesendet.', 'Empty = nothing is sent.')}
      >
        <input
          type="url"
          placeholder="https://…"
          value={a.endpoint ?? ''}
          onInput={(e) => void patchAnalytics((x) => {
            const v = (e.target as HTMLInputElement).value.trim();
            x.endpoint = v || 'https://hcu.fabiorenner.de/ingest.php';
          })}
        />
      </Field>

      <button
        class="btn"
        type="button"
        onClick={() => {
          showPreview.value = !showPreview.value;
          if (showPreview.value && preview.value === null) void loadPreview();
        }}
      >
        {t('Was wird gesendet?', 'What is sent?')}
      </button>
      {showPreview.value ? <pre class="analytics-preview mono">{preview.value ?? '…'}</pre> : null}
    </Card>
  );
}
