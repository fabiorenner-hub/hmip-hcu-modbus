import { signal, effect } from '@preact/signals';
import type { JSX } from 'preact';
import { lang, t, tServer } from './i18n.js';
import { snapshot, streamOnline, config, catalog, api, startStream, updateAvailable, latestVersion, checkForUpdate } from './store.js';
import { APP_VERSION, GITHUB_URL } from '../../../shared/version.js';
import { Chip } from './components.js';
import { HubsDevicesTab } from './tabs/hubs.js';
import { MappingTab } from './tabs/mapping.js';
import { ScanTab } from './tabs/scan.js';
import { TrendsTab } from './tabs/trends.js';
import { DecisionsTab } from './tabs/decisions.js';
import { AppearanceTab } from './tabs/appearance.js';
import { DiagnosticsTab } from './tabs/diagnostics.js';
import { LogsTab } from './tabs/logs.js';
import { UpdatesTab } from './tabs/updates.js';
import { HelpTab } from './tabs/help.js';

type TabId =
  | 'overview'
  | 'mapping'
  | 'scan'
  | 'trends'
  | 'decisions'
  | 'appearance'
  | 'diagnostics'
  | 'logs'
  | 'updates'
  | 'help';

const tab = signal<TabId>('overview');

interface TabDef {
  id: TabId;
  icon: string;
  label: () => string;
  render: () => JSX.Element;
}

const TABS: TabDef[] = [
  { id: 'overview', icon: '▦', label: () => t('Hubs & Geräte', 'Hubs & devices'), render: () => <HubsDevicesTab /> },
  { id: 'mapping', icon: '⇄', label: () => t('Zuordnung', 'Mapping'), render: () => <MappingTab /> },
  { id: 'scan', icon: '⌕', label: () => t('Scannen', 'Scan'), render: () => <ScanTab /> },
  { id: 'trends', icon: '∿', label: () => t('Verläufe', 'Trends'), render: () => <TrendsTab /> },
  { id: 'decisions', icon: '◎', label: () => t('Entscheidungen', 'Decisions'), render: () => <DecisionsTab /> },
  { id: 'appearance', icon: '◑', label: () => t('Darstellung & Sprache', 'Appearance & language'), render: () => <AppearanceTab /> },
  { id: 'diagnostics', icon: '✚', label: () => t('Diagnose', 'Diagnostics'), render: () => <DiagnosticsTab /> },
  { id: 'logs', icon: '▤', label: () => t('Logs & Debug', 'Logs & debug'), render: () => <LogsTab /> },
  { id: 'updates', icon: '↥', label: () => t('Updates', 'Updates'), render: () => <UpdatesTab /> },
  { id: 'help', icon: '?', label: () => t('Hilfe', 'Help'), render: () => <HelpTab /> },
];

export function App(): JSX.Element {
  const snap = snapshot.value;
  const readiness = snap?.readiness ?? 'CONFIG_REQUIRED';
  const readyTone = readiness === 'READY' ? 'success' : readiness === 'ERROR' ? 'danger' : 'warn';
  const connectHealth = snap?.connect.health ?? 'disabled';
  const active = TABS.find((x) => x.id === tab.value) ?? TABS[0]!;

  return (
    <div class="shell" data-lang={lang.value}>
      <header class="shell__header">
        <div class="brand">
          <span class="brand__logo" aria-hidden="true">◧</span>
          <span class="brand__name">Modbus Bridge</span>
          <a
            class={`version-badge ${updateAvailable.value ? 'version-badge--update' : ''}`}
            href={`${GITHUB_URL}/releases`}
            target="_blank"
            rel="noreferrer"
            title={updateAvailable.value ? t('Update verfügbar', 'Update available') : t('Auf GitHub ansehen', 'View on GitHub')}
          >
            v{snap?.appVersion ?? APP_VERSION}
            {updateAvailable.value ? <span class="version-badge__dot" aria-hidden="true" /> : null}
          </a>
        </div>
        <div class="shell__status">
          <Chip tone={readyTone}>{tServer(readiness)}</Chip>
          <Chip tone={connectHealth === 'connected' ? 'success' : 'muted'}>
            {t('Connect', 'Connect')}: {tServer(connectHealth)}
          </Chip>
          <span class={`dot ${streamOnline.value ? 'dot--ok' : 'dot--off'}`} title={streamOnline.value ? 'live' : 'offline'} />
        </div>
      </header>

      {updateAvailable.value ? (
        <a class="update-banner" href={`${GITHUB_URL}/releases/latest`} target="_blank" rel="noreferrer">
          {t(
            `Neue Version verfügbar: v${latestVersion.value} (installiert: v${snap?.appVersion ?? APP_VERSION}). Jetzt auf GitHub ansehen →`,
            `New version available: v${latestVersion.value} (installed: v${snap?.appVersion ?? APP_VERSION}). View it on GitHub →`,
          )}
        </a>
      ) : null}

      <nav class="shell__nav" aria-label={t('Module', 'Modules')}>
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            class={`nav-item ${tab.value === x.id ? 'nav-item--active' : ''}`}
            onClick={() => (tab.value = x.id)}
          >
            <span class="nav-item__icon" aria-hidden="true">{x.icon}</span>
            <span class="nav-item__label">{x.label()}</span>
          </button>
        ))}
      </nav>

      <main class="shell__main">{active.render()}</main>
    </div>
  );
}

function dayPhase(hour: number): 'day' | 'dusk' | 'night' {
  if (hour < 6 || hour >= 21) return 'night';
  if (hour < 9 || hour >= 18) return 'dusk';
  return 'day';
}

/** Apply the ambient background (per-device toggle, breathes with time of day). */
function applyAmbient(): void {
  if (typeof document === 'undefined') return;
  const on = config.value?.appearance.ambient ?? true;
  document.body.dataset.ambient = on ? 'on' : 'off';
  document.body.dataset.phase = dayPhase(new Date().getHours());
}

export async function boot(): Promise<void> {
  if (typeof document !== 'undefined') document.documentElement.lang = lang.value;
  startStream();
  await Promise.allSettled([api.loadConfig(), api.loadCatalog()]);
  void config.value;
  void catalog.value;
  effect(applyAmbient);
  setInterval(applyAmbient, 10 * 60 * 1000);
  void checkForUpdate(APP_VERSION, GITHUB_URL);
  setInterval(() => void checkForUpdate(APP_VERSION, GITHUB_URL), 6 * 60 * 60 * 1000);
}
