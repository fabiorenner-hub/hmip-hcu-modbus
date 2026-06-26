# HMIP HCU Plugin: Modbus Bridge

🇬🇧 English version · 🇩🇪 [Deutsche Version → `README.de.md`](README.de.md)

A plugin for the **Homematic IP Home Control Unit (HCU)** that bridges **Modbus**
devices into the Homematic IP system. It reads Modbus registers and exposes them
as Connect API features, and turns Homematic IP control commands into Modbus
writes — so industrial and energy devices appear as regular Homematic IP devices.

- **Plugin ID:** `de.fr.renner.plugin.modbusbridge`
- **Scope:** `LOCAL` (no cloud, no telemetry)
- **HCU min. version:** `1.4.7`
- **Architecture:** `arm64`
- **Dashboard port:** `8091` (configurable)

> ⚠️ **Disclaimer:** This is a personal hobby project. It is **not affiliated
> with, endorsed by, or supported by eQ-3 AG** or the Homematic IP brand. Use at
> your own risk.

## Features

- **Transports:** Modbus **TCP, UDP, RTU (serial)** and **RTU-over-TCP**, multiple
  hubs, multiple unit IDs per hub, serialized requests and exponential reconnect.
- **Read** all register classes (coil, discrete input, holding, input) and data
  types (bool, int/uint 16/32/64, float32/64, string, bit extraction) with
  word/byte swap, scale, offset and precision.
- **Write** (HCU → Modbus): single/multiple coil and register writes, bit
  read-modify-write, safety clamping and optional verify readback.
- **Feature-based mapping** to all supported HCU device archetypes, edited in the
  built-in dashboard.
- **Register scan**, **live trends**, transparent decision log, and a 360°
  diagnostics export.
- **Dark-Glass dashboard**, full **DE/EN** UI, live updates via SSE.
- Native **HCU configuration page** to toggle the dashboard and change its port.

## Installation

1. Download the latest `hmip-hcu-modbus-<version>-arm64.tar.gz` from the
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-modbus/releases) page.
2. In **HCUweb**, open the plugin page and **upload** the `.tar.gz`.
3. After installation, run a **device search** in Homematic IP to discover the
   devices the plugin exposes.
4. Open the **dashboard** at `http://<your-hcu-address>:8091/` to configure hubs,
   devices and register bindings. The port can be changed on the plugin's
   configuration page in HCUweb.

## Configuration

- **HCU configuration page** (HCUweb): enable/disable the dashboard, set its port,
  and open the dashboard link.
- **Dashboard** (`:8091`): add Modbus hubs, define devices and map registers to
  Homematic IP features; scan address ranges; view trends and diagnostics.

All configuration is stored under `/data` and persists across updates and
restarts. No data leaves your local network.

## Build from source

```bash
npm install
npm run typecheck     # tsc (server + SPA)
npm run lint          # eslint --max-warnings=0
npm test              # vitest
npm run build         # compile server + bundle SPA + icon
npm run build:image   # arm64 image -> hmip-hcu-modbus-<version>-arm64.tar.gz
```

Requires Node ≥ 20 and (for the image) Docker with buildx.

## Architecture

- **Pure engine** (`src/plugin/engine`, `src/shared`): register codec, binding
  decode/encode, read planning, change detection, validation — no I/O, fully
  unit- and property-tested.
- **Adapters** (`src/plugin/modbus`, `connect`, `persistence`, `notifications`):
  Modbus sockets, the Connect WebSocket, atomic `/data` storage, Telegram.
- **Runtime** (`src/plugin/runtime`): polling engine and orchestrator.
- **Dashboard**: Fastify (`/api/*` + SSE) serving a Preact SPA.

Built with TypeScript (strict, ESM), Fastify, Preact + Signals, Zod, and
Vitest + fast-check.

## Support

This is a hobby project, but issues and ideas are welcome. When reporting a
problem, please open an [issue](https://github.com/fabiorenner-hub/hmip-hcu-modbus/issues)
and include:

- the **HCU firmware version** and the **plugin version**,
- a short description of the Modbus device and mapping,
- relevant **logs** (Logs & Debug tab → "All information" 360° export).

See [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) and
[`CHANGELOG.md`](CHANGELOG.md) for more.

## License

[Apache-2.0](LICENSE) © 2026 Fabio Renner.
