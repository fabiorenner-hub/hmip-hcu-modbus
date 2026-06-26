import { signal } from '@preact/signals';

export type Lang = 'de' | 'en';
export type LangPref = 'auto' | 'de' | 'en';

const STORAGE_KEY = 'modbusbridge.lang';

function readPref(): LangPref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'de' || v === 'en' || v === 'auto') return v;
  } catch {
    /* ignore */
  }
  return 'auto';
}

export const langPref = signal<LangPref>(readPref());

function resolve(pref: LangPref): Lang {
  if (pref === 'de' || pref === 'en') return pref;
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'de';
  if (nav.startsWith('en')) return 'en';
  return 'de'; // German fallback for AUTO
}

export const lang = signal<Lang>(resolve(langPref.value));

export function setLangPref(pref: LangPref): void {
  langPref.value = pref;
  lang.value = resolve(pref);
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang.value;
}

/** Inline bilingual pair. Reactive via the `lang` signal. */
export function t(de: string, en: string): string {
  return lang.value === 'de' ? de : en;
}

/** Pick the active value from a `{ de, en }` map. */
export function pick(map: { de: string; en: string }): string {
  return lang.value === 'de' ? map.de : map.en;
}

const SERVER_MAP: Record<string, { de: string; en: string }> = {
  READY: { de: 'Bereit', en: 'Ready' },
  CONFIG_REQUIRED: { de: 'Konfiguration nötig', en: 'Configuration required' },
  ERROR: { de: 'Fehler', en: 'Error' },
  connected: { de: 'Verbunden', en: 'Connected' },
  connecting: { de: 'Verbinde…', en: 'Connecting…' },
  disconnected: { de: 'Getrennt', en: 'Disconnected' },
  offline: { de: 'Offline', en: 'Offline' },
  disabled: { de: 'Deaktiviert', en: 'Disabled' },
  error: { de: 'Fehler', en: 'Error' },
};

/** Translate a known server/engine token at the render boundary. */
export function tServer(token: string): string {
  const m = SERVER_MAP[token];
  return m ? pick(m) : token;
}

/** Number formatting: decimal comma for German, point for English. */
export function fmtNum(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '–';
  return value.toLocaleString(lang.value === 'de' ? 'de-DE' : 'en-US', {
    maximumFractionDigits: digits,
  });
}

export function fmtTime(ts: number | null): string {
  if (!ts) return '–';
  return new Date(ts).toLocaleTimeString(lang.value === 'de' ? 'de-DE' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function fmtDateTime(ts: number | null): string {
  if (!ts) return '–';
  return new Date(ts).toLocaleString(lang.value === 'de' ? 'de-DE' : 'en-US', { hour12: false });
}

export function locale(): string {
  return lang.value === 'de' ? 'de-DE' : 'en-US';
}
