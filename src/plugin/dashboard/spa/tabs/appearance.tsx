import type { JSX } from 'preact';
import { langPref, setLangPref, t } from '../i18n.js';
import { config, api } from '../store.js';
import { Panel, Card, Field, Segment, Toggle } from '../components.js';
import { AnalyticsCard } from '../components/AnalyticsCard.js';
import type { AppConfig } from '../../../../shared/schema.js';

async function patch(fn: (c: AppConfig) => void): Promise<void> {
  const cur = config.value;
  if (!cur) return;
  const next = structuredClone(cur) as AppConfig;
  fn(next);
  await api.saveConfig(next);
}

export function AppearanceTab(): JSX.Element {
  const cfg = config.value;
  return (
    <Panel
      title={t('Darstellung & Sprache', 'Appearance & language')}
      intro={t('Sprache pro Gerät und installationsweite Benachrichtigungssprache.', 'Per-device language and installation-wide notification language.')}
    >
      <Card title={t('Sprache', 'Language')}>
        <Field label={t('Anzeigesprache (dieses Gerät)', 'Display language (this device)')}>
          <Segment
            value={langPref.value}
            onChange={(v) => setLangPref(v)}
            options={[
              { value: 'auto', label: 'AUTO' },
              { value: 'de', label: 'DE' },
              { value: 'en', label: 'EN' },
            ]}
          />
        </Field>
      </Card>

      <Card title={t('Darstellung', 'Appearance')}>
        <Field label={t('Ambient-Modus', 'Ambient mode')} hint={t('Gedämpfte Akzente.', 'Muted accents.')}>
          <Toggle checked={cfg?.appearance.ambient ?? true} onChange={(v) => void patch((c) => { c.appearance.ambient = v; })} />
        </Field>
      </Card>

      <Card title={t('Benachrichtigungen', 'Notifications')}>
        <Field label={t('Benachrichtigungssprache', 'Notification language')} hint={t('Gilt für die ganze Installation.', 'Applies to the whole installation.')}>
          <Segment
            value={cfg?.notifications.language ?? 'de'}
            onChange={(v) => void patch((c) => { c.notifications.language = v; c.appearance.notifyLanguage = v; })}
            options={[{ value: 'de', label: 'DE' }, { value: 'en', label: 'EN' }]}
          />
        </Field>
      </Card>

      <AnalyticsCard />
    </Panel>
  );
}
