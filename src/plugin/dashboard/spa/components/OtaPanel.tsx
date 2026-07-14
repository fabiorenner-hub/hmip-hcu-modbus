import type { JSX } from 'preact';
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { t, fmtDateTime } from '../i18n.js';
import { Card, Segment, Chip } from '../components.js';
import { config, otaStatus, otaUnavailable, otaApi, api } from '../store.js';
import type { AppConfig } from '../../../../shared/schema.js';

type Phase = 'idle' | 'installing' | 'restarting' | 'done' | 'error';
const phase = signal<Phase>('idle');
const progress = signal(0); // 0..100
const errorMsg = signal<string | null>(null);

const RESTART_DEADLINE_MS = 120_000;

function reasonText(reason?: string): string {
  switch (reason) {
    case 'requires-core':
      return t('Kern-Update nötig (.tar.gz via HCUweb).', 'Core update required (.tar.gz via HCUweb).');
    case 'already-current':
      return t('Bereits aktuell.', 'Already up to date.');
    case 'no-update':
      return t('Kein Update verfügbar.', 'No update available.');
    case 'verify-failed':
      return t('Prüfung fehlgeschlagen (Signatur/Prüfsumme).', 'Verification failed (signature/checksum).');
    case 'download-failed':
      return t('Download fehlgeschlagen.', 'Download failed.');
    case 'already-installing':
      return t('Läuft bereits.', 'Already running.');
    default:
      return reason ? t(`Fehlgeschlagen: ${reason}`, `Failed: ${reason}`) : t('Fehlgeschlagen.', 'Failed.');
  }
}

async function patchUpdates(fn: (u: AppConfig['updates']) => void): Promise<void> {
  const cur = config.value;
  if (!cur) return;
  const next = structuredClone(cur) as AppConfig;
  fn(next.updates);
  await api.saveConfig(next);
}

function runningVersion(s: { otaActive: boolean; otaVersion: string; coreVersion: string } | null): string {
  if (!s) return '';
  return s.otaActive ? s.otaVersion : s.coreVersion;
}

/** Install + monitor the restart. The button locks for the whole flow; a failed
 *  fetch during the restart window is EXPECTED and treated as "restarting".
 *  Success is detected when the plugin comes back with a different version. */
async function runInstall(beforeVersion: string): Promise<void> {
  if (phase.value === 'installing' || phase.value === 'restarting') return;
  phase.value = 'installing';
  progress.value = 8;
  errorMsg.value = null;

  // Gentle progress animation while the bundle downloads/installs (8 → 45%).
  const installAnim = setInterval(() => {
    if (phase.value === 'installing') progress.value = Math.min(45, progress.value + 3);
  }, 400);

  let assumeRestarting = false;
  try {
    const r = await otaApi.install();
    if (!r.ok) {
      clearInterval(installAnim);
      phase.value = 'error';
      errorMsg.value = reasonText(r.reason);
      return;
    }
    assumeRestarting = true;
  } catch {
    // The server may exit before answering — treat as "installed, now restarting"
    // and let the version-change check below confirm success.
    assumeRestarting = true;
  } finally {
    clearInterval(installAnim);
  }

  if (!assumeRestarting) return;

  phase.value = 'restarting';
  progress.value = Math.max(progress.value, 50);
  const started = Date.now();

  const poll = async (): Promise<void> => {
    let confirmed = false;
    try {
      const res = await fetch('/api/ota/status', { cache: 'no-store' });
      if (res.ok) {
        const s = (await res.json()) as { otaActive: boolean; otaVersion: string; coreVersion: string };
        otaStatus.value = s as typeof otaStatus.value;
        if (runningVersion(s) && runningVersion(s) !== beforeVersion) confirmed = true;
      }
    } catch {
      /* server still restarting — expected, keep polling */
    }

    if (confirmed) {
      progress.value = 100;
      phase.value = 'done';
      setTimeout(() => location.reload(), 1000);
      return;
    }
    const elapsed = Date.now() - started;
    // Advance the bar toward 92% over the restart window (indeterminate feel).
    progress.value = Math.min(92, 50 + (elapsed / RESTART_DEADLINE_MS) * 42);
    if (elapsed < RESTART_DEADLINE_MS) {
      setTimeout(() => void poll(), 1500);
    } else {
      phase.value = 'error';
      errorMsg.value = t(
        'Zeitüberschreitung beim Neustart. Lade die Seite neu und prüfe die Version.',
        'Timed out waiting for the restart. Reload the page and check the version.',
      );
    }
  };
  setTimeout(() => void poll(), 2500);
}

export function OtaPanel(): JSX.Element | null {
  useEffect(() => {
    void otaApi.status();
  }, []);

  const cfg = config.value;
  const s = otaStatus.value;
  if (otaUnavailable.value || !cfg) return null;

  const latest = s?.latest ?? null;
  const active = phase.value === 'installing' || phase.value === 'restarting' || phase.value === 'done';

  return (
    <Card title={t('OTA-Updates (Experte)', 'OTA updates (expert)')}>
      <details class="ota-details">
        <summary>{t('Direkt-Updates ohne HCUweb-Upload', 'Direct updates without HCUweb upload')}</summary>

        <div class="ota-grid">
          <div>
            <div class="field__label">{t('Kern (Image)', 'Core (image)')}</div>
            <div class="mono">v{s?.coreVersion ?? '—'}</div>
          </div>
          <div>
            <div class="field__label">{t('OTA-Payload', 'OTA payload')}</div>
            <div class="mono">{s?.otaActive ? `v${s.otaVersion}` : t('keins', 'none')}</div>
          </div>
          <div>
            <div class="field__label">{t('Neueste', 'Latest')}</div>
            <div class="mono">{latest ? `v${latest.version}` : '—'}</div>
          </div>
        </div>

        <div class="row-between" style={{ marginTop: '12px' }}>
          <label class="field">
            <span class="field__label">{t('Modus', 'Mode')}</span>
            <Segment
              value={cfg.updates.mode}
              onChange={(v) => void patchUpdates((u) => { u.mode = v; })}
              options={[
                { value: 'manual', label: t('Manuell', 'Manual') },
                { value: 'auto', label: t('Automatisch', 'Automatic') },
              ]}
            />
          </label>
          <label class="field">
            <span class="field__label">{t('Kanal', 'Channel')}</span>
            <Segment
              value={cfg.updates.channel}
              onChange={(v) => void patchUpdates((u) => { u.channel = v; }).then(() => otaApi.check())}
              options={[
                { value: 'stable', label: t('Stabil', 'Stable') },
                { value: 'experimental', label: t('Experimentell', 'Experimental') },
              ]}
            />
          </label>
        </div>

        {cfg.updates.channel === 'experimental' ? (
          <p class="module-panel__hint">
            {t(
              'Experimentell: rollierende Vorabversionen zum Testen. Kann instabil sein; erhöht nicht die Versionsnummer.',
              'Experimental: rolling pre-releases for testing. May be unstable; does not raise the version number.',
            )}
          </p>
        ) : null}

        {/* Progress UI (shown during install/restart) */}
        {active || phase.value === 'error' ? (
          <div class="ota-progress-wrap">
            <div class="ota-progress">
              <div
                class={`ota-progress__bar ${phase.value === 'restarting' ? 'ota-progress__bar--pulse' : ''} ${phase.value === 'error' ? 'ota-progress__bar--error' : ''}`}
                style={{ width: `${phase.value === 'error' ? 100 : progress.value}%` }}
              />
            </div>
            <div class="ota-progress__label">
              {phase.value === 'installing' && t('Lade & installiere Update…', 'Downloading & installing update…')}
              {phase.value === 'restarting' && t('Starte Plugin neu…', 'Restarting the plugin…')}
              {phase.value === 'done' && t('Fertig – Seite wird neu geladen…', 'Done – reloading the page…')}
              {phase.value === 'error' && (errorMsg.value ?? t('Fehlgeschlagen.', 'Failed.'))}
            </div>
          </div>
        ) : null}

        <div class="row-between" style={{ marginTop: '12px' }}>
          <button
            class="btn"
            type="button"
            disabled={active}
            onClick={() => void otaApi.check()}
          >
            {t('Jetzt prüfen', 'Check now')}
          </button>

          {latest?.canInstall ? (
            <button
              class="btn btn--accent"
              type="button"
              disabled={active}
              onClick={() => void runInstall(runningVersion(s))}
            >
              {active ? t('Bitte warten…', 'Please wait…') : t('Jetzt aktualisieren', 'Update now')}
            </button>
          ) : phase.value === 'error' ? (
            <button class="btn btn--accent" type="button" onClick={() => void runInstall(runningVersion(s))}>
              {t('Erneut versuchen', 'Try again')}
            </button>
          ) : latest?.requiresCore ? (
            <Chip tone="warn">{t('Kern-Update nötig (.tar.gz via HCUweb)', 'Core update required (.tar.gz via HCUweb)')}</Chip>
          ) : (
            <Chip tone="success">{t('Aktuell', 'Up to date')}</Chip>
          )}
        </div>

        {s?.lastError && phase.value !== 'error' ? <p class="state state--error">{s.lastError}</p> : null}
        {s?.lastCheckAt ? (
          <p class="module-panel__hint">{t('Zuletzt geprüft', 'Last checked')}: {fmtDateTime(s.lastCheckAt)}</p>
        ) : null}
      </details>
    </Card>
  );
}
