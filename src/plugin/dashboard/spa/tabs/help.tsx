import type { JSX } from 'preact';
import { t } from '../i18n.js';
import { Panel, Card } from '../components.js';

interface HelpItem {
  title: () => string;
  body: () => string;
}

const ITEMS: HelpItem[] = [
  {
    title: () => t('Hubs', 'Hubs'),
    body: () => t('Ein Hub ist ein Modbus-Endpunkt: TCP, UDP, RTU (seriell) oder RTU-over-TCP. Jeder Hub bedient mehrere Unit-IDs.', 'A hub is a Modbus endpoint: TCP, UDP, RTU (serial) or RTU-over-TCP. Each hub serves multiple unit IDs.'),
  },
  {
    title: () => t('Zuordnungen', 'Bindings'),
    body: () => t('Eine Zuordnung bildet ein Register (oder Bit) auf ein Feld eines Homematic-IP-Features ab – inklusive Datentyp, Skala, Offset und Wort-/Byte-Reihenfolge.', 'A binding maps a register (or bit) to a field of a Homematic IP feature, including data type, scale, offset and word/byte order.'),
  },
  {
    title: () => t('Lesen & Schreiben', 'Reading & writing'),
    body: () => t('Lesbare Register erscheinen als Sensorwerte. Beschreibbare Register (Zugriff „rw") lassen sich aus Homematic IP steuern; optional mit Verify-Readback und Sicherheitsgrenzen.', 'Readable registers appear as sensor values. Writable registers (access "rw") can be controlled from Homematic IP, optionally with verify readback and safety limits.'),
  },
  {
    title: () => t('Scannen', 'Scanning'),
    body: () => t('Der Scan tastet einen Adressbereich ab und zeigt, welche Register antworten – als Hilfe beim Anlegen von Zuordnungen.', 'The scan probes an address range and shows which registers respond, to help you create bindings.'),
  },
  {
    title: () => t('Status-Ereignisse', 'Status events'),
    body: () => t('Die Bridge meldet Änderungen nur, wenn sie sie tatsächlich am Gerät beobachtet – keine optimistischen Meldungen nach eigenen Befehlen.', 'The bridge reports changes only when it actually observes them at the device — no optimistic events after its own commands.'),
  },
];

export function HelpTab(): JSX.Element {
  return (
    <Panel
      title={t('Hilfe', 'Help')}
      intro={t('Kurzüberblick über die wichtigsten Funktionen.', 'A short overview of the main features.')}
    >
      {ITEMS.map((it, i) => (
        <Card key={i} title={it.title()}>
          <p class="help-body">{it.body()}</p>
        </Card>
      ))}
    </Panel>
  );
}
