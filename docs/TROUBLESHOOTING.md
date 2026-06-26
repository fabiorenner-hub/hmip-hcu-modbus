# Troubleshooting

## English

### The plugin does not become "READY" in HCUweb
The plugin reports `CONFIG_REQUIRED` until at least one hub and one device with
all required features are configured. Open the dashboard (`:8091`), add a Modbus
hub and a device, and map the device's required feature(s).

### The configuration page ("Modbus Bridge Konfiguration") does not load
Make sure you are on plugin version **1.0.2 or newer** — earlier builds did not
answer the configuration template request. Reinstall the latest `.tar.gz`.

### The dashboard is not reachable
- Check the **port** on the plugin's HCU configuration page (default `8091`) and
  open `http://<your-hcu-address>:<port>/`.
- The dashboard can be **disabled** on the configuration page — make sure it is on.
- The exposed port must be **unique** among installed plugins on the HCU.

### A Modbus hub stays "offline" / a device shows errors
- Verify host/port (TCP/UDP/RTU-over-TCP) or serial path/baud (RTU) and the
  **unit ID**.
- Increase the **timeout** and, for chatty gateways, the inter-request **delay**.
- Use the **Scan** tab to confirm which registers actually respond.

### Values look wrong (scaled/swapped)
Adjust **data type**, **scale/offset**, **precision** and the **word/byte swap**
flags on the binding. Use the Scan tab to see raw register values.

### Serial (RTU) does not work in the container
Serial access requires the host device to be passed into the container, which the
HCU environment may not allow. Prefer **TCP**, **UDP** or **RTU-over-TCP** via a
Modbus gateway.

### Reporting a problem
Open an issue with the **HCU firmware version**, the **plugin version**, a short
description of the device/mapping, and the **360° export** from the Logs & Debug
tab.

---

## Deutsch

### Das Plugin wird in HCUweb nicht „READY"
Das Plugin meldet `CONFIG_REQUIRED`, bis mindestens ein Hub und ein Gerät mit
allen Pflicht-Features konfiguriert sind. Öffne das Dashboard (`:8091`), lege
einen Modbus-Hub und ein Gerät an und ordne die Pflicht-Features zu.

### Die Konfigurationsseite („Modbus Bridge Konfiguration") lädt nicht
Stelle sicher, dass du Plugin-Version **1.0.2 oder neuer** nutzt — frühere Builds
beantworteten die Konfigurations-Template-Anfrage nicht. Installiere die neueste
`.tar.gz` neu.

### Das Dashboard ist nicht erreichbar
- Prüfe den **Port** auf der HCU-Konfigurationsseite des Plugins (Standard `8091`)
  und öffne `http://<deine-hcu-adresse>:<port>/`.
- Das Dashboard kann auf der Konfigurationsseite **deaktiviert** sein — schalte es
  ein.
- Der exponierte Port muss unter den installierten Plugins der HCU **eindeutig**
  sein.

### Ein Modbus-Hub bleibt „offline" / ein Gerät zeigt Fehler
- Prüfe Host/Port (TCP/UDP/RTU-over-TCP) bzw. seriellen Pfad/Baud (RTU) und die
  **Unit-ID**.
- Erhöhe den **Timeout** und – bei empfindlichen Gateways – die **Pause** zwischen
  Anfragen.
- Nutze den **Scan**-Tab, um zu prüfen, welche Register tatsächlich antworten.

### Werte wirken falsch (skaliert/vertauscht)
Passe **Datentyp**, **Skala/Offset**, **Präzision** und die **Wort-/Byte-Swap**-
Schalter der Zuordnung an. Der Scan-Tab zeigt die Roh-Registerwerte.

### Seriell (RTU) funktioniert im Container nicht
Serieller Zugriff erfordert, dass das Host-Gerät in den Container durchgereicht
wird, was die HCU-Umgebung evtl. nicht erlaubt. Bevorzuge **TCP**, **UDP** oder
**RTU-over-TCP** über ein Modbus-Gateway.

### Ein Problem melden
Eröffne ein Issue mit der **HCU-Firmware-Version**, der **Plugin-Version**, einer
kurzen Beschreibung von Gerät/Zuordnung und dem **360°-Export** aus dem Tab
„Logs & Debug".
