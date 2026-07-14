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
          'Sendet ausschließlich pseudonyme technische Informationen wie Plugin-Version, HCU-Firmware, Architektur und Sprache. Es werden keine Geräte-, Raum-, Mess- oder Konfigurationsdaten übertragen. Standardmäßig aktiv, hier jederzeit abschaltbar.',
          'Sends only pseudonymous technical information such as plugin version, HCU firmware, architecture and language. No device, room, measurement or configuration data is transmitted. On by default, can be turned off here anytime.',
        )}{' '}
        <a href="https://hcu.fabiorenner.de/privacy.php" target="_blank" rel="noreferrer">
          {t('Datenschutz', 'Privacy')}
        </a>
      </p>

      <Field label={t('Anonyme Nutzungsstatistik senden', 'Send anonymous usage analytics')}>
        <Toggle checked={a.enabled} onChange={(v) => void patchAnalytics((x) => { x.enabled = v; })} />
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
