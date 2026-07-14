# HMIP HCU Plugin: Modbus Bridge

🇩🇪 Deutsche Version · 🇬🇧 [English version → `README.md`](README.md)

Ein Plugin für die **Homematic IP Home Control Unit (HCU)**, das **Modbus**-Geräte
in das Homematic-IP-System einbindet. Es liest Modbus-Register und stellt sie als
Connect-API-Features bereit und setzt Homematic-IP-Steuerbefehle in Modbus-
Schreibvorgänge um — so erscheinen Industrie- und Energiegeräte als reguläre
Homematic-IP-Geräte.

- **Plugin-ID:** `de.fr.renner.plugin.modbusbridge`
- **Scope:** `LOCAL` (keine Cloud-Abhängigkeit)
- **HCU-Mindestversion:** `1.4.7`
- **Architektur:** `arm64`
- **Dashboard-Port:** `8091` (konfigurierbar)

> ⚠️ **Hinweis:** Dies ist ein privates Hobbyprojekt. Es ist **nicht mit eQ-3 AG
> oder der Marke Homematic IP verbunden, von ihnen unterstützt oder freigegeben**.
> Nutzung auf eigene Gefahr.

## Funktionen

- **Transporte:** Modbus **TCP, UDP, RTU (seriell)** und **RTU-over-TCP**, mehrere
  Hubs, mehrere Unit-IDs pro Hub, serialisierte Anfragen und exponentielles
  Reconnect.
- **Lesen** aller Registerklassen (Coil, Discrete Input, Holding, Input) und
  Datentypen (bool, int/uint 16/32/64, float32/64, String, Bit-Extraktion) mit
  Wort-/Byte-Swap, Skala, Offset und Präzision.
- **Schreiben** (HCU → Modbus): Single/Multiple Coil und Register, Bit-Read-
  Modify-Write, Sicherheits-Clamping und optionaler Verify-Readback.
- **Feature-basierte Zuordnung** zu allen unterstützten HCU-Gerätetypen, editiert
  im eingebauten Dashboard.
- **Register-Scan**, **Live-Verläufe**, transparentes Entscheidungs-Log und ein
  360°-Diagnose-Export.
- **Dark-Glass-Dashboard**, vollständig **DE/EN**, Live-Updates via SSE.
- Native **HCU-Konfigurationsseite** zum Ein-/Ausschalten des Dashboards und zum
  Ändern des Ports.

## Installation

1. Lade die neueste `hmip-hcu-modbus-<version>-arm64.tar.gz` von der
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-modbus/releases)-Seite.
2. Öffne in **HCUweb** die Plugin-Seite und **lade** die `.tar.gz` hoch.
3. Starte nach der Installation in Homematic IP eine **Gerätesuche**, um die vom
   Plugin bereitgestellten Geräte zu finden.
4. Öffne das **Dashboard** unter `http://<deine-hcu-adresse>:8091/`, um Hubs,
   Geräte und Register-Zuordnungen zu konfigurieren. Den Port kannst du auf der
   Konfigurationsseite des Plugins in HCUweb ändern.

## Konfiguration

- **HCU-Konfigurationsseite** (HCUweb): Dashboard ein-/ausschalten, Port setzen
  und den Dashboard-Link öffnen.
- **Dashboard** (`:8091`): Modbus-Hubs anlegen, Geräte definieren und Register auf
  Homematic-IP-Features abbilden; Adressbereiche scannen; Verläufe und Diagnose
  ansehen.

Die gesamte Konfiguration wird unter `/data` gespeichert und übersteht Updates und Neustarts.

## Updates (over-the-air)

Unter **Erweitert** lassen sich Update-Kanal und -Modus wählen:

- **stable** (Standard) — geprüfte GitHub-Releases.
- **experimental** — rollende Vorabversionen, over-the-air ausgeliefert ohne
  neuen `.tar.gz`-/HCUweb-Upload. Für Tester.

Modus **manuell** (Standard) prüft im Hintergrund und lässt dich bei Bedarf
installieren; **auto** installiert neue Versionen im gewählten Kanal automatisch.

Das Plugin startet über einen kleinen Bootstrap-Loader, der entweder das im Image
enthaltene oder ein installiertes OTA-Payload ausführt, mit **Crash-Loop-Schutz**:
Scheitert ein OTA-Payload dreimal beim Start, wird es unter Quarantäne gestellt
und das Plugin fällt automatisch auf das Image zurück. Ein stabiles Core-Image hat
immer Vorrang vor einem älteren OTA-Payload. Größere Upgrades, die einen neueren
Core benötigen, werden weiterhin als `.tar.gz` über HCUweb ausgeliefert.

## Aus dem Quellcode bauen

```bash
npm install
npm run typecheck     # tsc (Server + SPA)
npm run lint          # eslint --max-warnings=0
npm test              # vitest
npm run build         # Server kompilieren + SPA bündeln + Icon
npm run build:image   # arm64-Image -> hmip-hcu-modbus-<version>-arm64.tar.gz
```

Benötigt Node ≥ 20 und (für das Image) Docker mit buildx.

## Architektur

- **Pure Engine** (`src/plugin/engine`, `src/shared`): Register-Codec, Binding-
  Decode/Encode, Lese-Planung, Änderungserkennung, Validierung — kein I/O, voll
  unit- und property-getestet.
- **Adapter** (`src/plugin/modbus`, `connect`, `persistence`, `notifications`):
  Modbus-Sockets, Connect-WebSocket, atomare `/data`-Speicherung, Telegram.
- **Runtime** (`src/plugin/runtime`): Polling-Engine und Orchestrator.
- **Dashboard**: Fastify (`/api/*` + SSE), das eine Preact-SPA ausliefert.

Gebaut mit TypeScript (strict, ESM), Fastify, Preact + Signals, Zod und
Vitest + fast-check.

## Support

Dies ist ein Hobbyprojekt, aber Issues und Ideen sind willkommen. Bitte bei einem
Problem ein [Issue](https://github.com/fabiorenner-hub/hmip-hcu-modbus/issues)
eröffnen und Folgendes angeben:

- die **HCU-Firmware-Version** und die **Plugin-Version**,
- eine kurze Beschreibung des Modbus-Geräts und der Zuordnung,
- relevante **Logs** (Tab „Logs & Debug" → „Alle Informationen" 360°-Export).

Siehe [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) und
[`CHANGELOG.md`](CHANGELOG.md) für mehr.

## Lizenz

[Apache-2.0](LICENSE) © 2026 Fabio Renner.
