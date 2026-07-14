import type { JSX } from 'preact';
import { snapshot, updateAvailable, latestVersion } from '../store.js';
import { t, pick } from '../i18n.js';
import { Panel, Card, Kpi, Chip } from '../components.js';
import { OtaPanel } from '../components/OtaPanel.js';
import { CHANGELOG, GITHUB_URL } from '../../../../shared/version.js';

export function UpdatesTab(): JSX.Element {
  const snap = snapshot.value;
  return (
    <Panel
      title={t('Updates', 'Updates')}
      intro={t('Laufende Version, Build und Änderungsverlauf.', 'Current version, build and changelog.')}
      badge={updateAvailable.value ? t('Update verfügbar', 'Update available') : undefined}
    >
      <div class="kpi-grid">
        <Kpi label={t('Version', 'Version')} value={`v${snap?.appVersion ?? '—'}`} />
        <Kpi label="Build" value={<span class="mono small">{snap?.buildId ?? '—'}</span>} />
        <Kpi
          label={t('Aktualität', 'Up to date')}
          value={
            updateAvailable.value ? (
              <Chip tone="warn">{t('Update', 'Update')} v{latestVersion.value}</Chip>
            ) : (
              <Chip tone="success">{t('Aktuell', 'Latest')}</Chip>
            )
          }
        />
      </div>

      {updateAvailable.value ? (
        <Card title={t('Update verfügbar', 'Update available')}>
          <p class="module-panel__hint">
            {t(
              `Version v${latestVersion.value} ist auf GitHub verfügbar. Lade die .tar.gz aus den Releases und installiere sie in HCUweb.`,
              `Version v${latestVersion.value} is available on GitHub. Download the .tar.gz from Releases and install it in HCUweb.`,
            )}
          </p>
          <a class="btn btn--accent" href={`${GITHUB_URL}/releases/latest`} target="_blank" rel="noreferrer">
            {t('Zum neuesten Release', 'Go to latest release')}
          </a>
        </Card>
      ) : null}

      <Card title={t('Änderungsverlauf', 'Changelog')}>
        {CHANGELOG.map((entry) => (
          <div key={entry.version} class="changelog-entry">
            <div class="changelog-entry__head">
              <strong>v{entry.version}</strong>
              <span class="changelog-entry__date">{entry.date}</span>
            </div>
            <ul>
              {entry.changes.map((c, i) => <li key={i}>{pick(c)}</li>)}
            </ul>
          </div>
        ))}
      </Card>

      <Card title="GitHub">
        <a class="btn" href={GITHUB_URL} target="_blank" rel="noreferrer">{t('Repository öffnen', 'Open repository')}</a>
      </Card>

      <OtaPanel />
    </Panel>
  );
}
