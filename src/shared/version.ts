/**
 * Version constants mirrored from package.json. Keep APP_VERSION in sync with
 * package.json, Dockerfile (ARG + LABEL) and CHANGELOG.md on every build.
 */
export const APP_VERSION = '1.0.3';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: { de: string; en: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3',
    date: '2026-06-26',
    changes: [
      {
        de: 'Dark-Glass-Optik vollständig: Glas-Flächen, geschichteter/Ambient-Hintergrund, Bewegungssystem, Light-Mode und reduzierte Bewegung.',
        en: 'Full Dark-Glass look: glass surfaces, layered/ambient background, motion system, light mode and reduced-motion support.',
      },
      {
        de: 'Plugin-Icon für die HCUweb-Anzeige ergänzt.',
        en: 'Added a plugin icon for the HCUweb display.',
      },
    ],
  },
  {
    version: '1.0.2',
    date: '2026-06-26',
    changes: [
      {
        de: 'Native HCU-Konfigurationsseite: Dashboard an/aus, Port und Link zum Dashboard.',
        en: 'Native HCU configuration page: dashboard on/off, port and a link to the dashboard.',
      },
      {
        de: 'Dashboard-Start ist nicht-fatal; globale Crash-Handler ergänzt.',
        en: 'Dashboard start is non-fatal; added global crash handlers.',
      },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-06-26',
    changes: [
      {
        de: 'Dashboard-Port auf 8091 geändert; Healthcheck folgt jetzt der Port-Variable und nutzt IPv4.',
        en: 'Dashboard port changed to 8091; healthcheck now follows the port variable and uses IPv4.',
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-26',
    changes: [
      {
        de: 'Erste Version: Modbus TCP/UDP/RTU-Bridge mit Lesen und Schreiben, Mapping-Editor, Trends und 360°-Diagnose.',
        en: 'Initial release: Modbus TCP/UDP/RTU bridge with read and write, mapping editor, trends and 360° diagnostics.',
      },
    ],
  },
];

export const GITHUB_URL = 'https://github.com/fabiorenner-hub/hmip-hcu-modbus';
