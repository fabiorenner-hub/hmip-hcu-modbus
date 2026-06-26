import type { JSX } from 'preact';
import { snapshot } from '../store.js';
import { t, pick } from '../i18n.js';
import { Panel, Card, Kpi } from '../components.js';
import { CHANGELOG, GITHUB_URL } from '../../../../shared/version.js';

export function UpdatesTab(): JSX.Element {
  const snap = snapshot.value;
  return (
    <Panel
      title={t('Updates', 'Updates')}
      intro={t('Laufende Version, Build und Änderungsverlauf.', 'Current version, build and changelog.')}
    >
      <div class="kpi-grid">
        <Kpi label={t('Version', 'Version')} value={`v${snap?.appVersion ?? '—'}`} />
        <Kpi label="Build" value={<span class="mono small">{snap?.buildId ?? '—'}</span>} />
      </div>

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
    </Panel>
  );
}
