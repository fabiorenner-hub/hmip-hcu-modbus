# Changelog

All notable changes to the Modbus Bridge plugin are documented here. The version
is the single source of truth in `package.json` and must stay in sync with the
Dockerfile (ARG + LABEL), this file and the SPA version constant.

## 1.0.4 — 2026-06-26

- Clickable version badge next to the title that links to GitHub and shows an
  update notice (badge dot + banner) when a newer release is available. The check
  runs in the browser against the GitHub releases API, keeping the plugin local.
- New plugin icon based on the Modbus logo.

## 1.0.3 — 2026-06-26

- Full Dark-Glass visual layer per the design spec: glass-morphism surfaces
  (`backdrop-filter`), layered + optional ambient background, the motion/easing
  system, keyframes, `prefers-reduced-motion` support and an automatic light mode.
- Added a plugin icon (`image` metadata field) shown on HCUweb.

## 1.0.2 — 2026-06-26

- Native HCU configuration page (`CONFIG_TEMPLATE_REQUEST`/`CONFIG_UPDATE_REQUEST`):
  toggle the dashboard on/off, set its port, and a link to the dashboard. Fixes
  the previously non-loading "Modbus Bridge Konfiguration" page.
- Dashboard lifecycle is now managed and restartable; a bind failure is non-fatal.
- Added global `unhandledRejection`/`uncaughtException` handlers so a stray error
  cannot crash the plugin container (HCU install robustness).
- Issuer corrected to "Fabio Renner".

## 1.0.1 — 2026-06-26

- Dashboard port changed from 8089 to 8091 (single source: `MODBUS_BRIDGE_DASHBOARD_PORT`).
- Healthcheck now derives its port from `MODBUS_BRIDGE_DASHBOARD_PORT` and probes
  `127.0.0.1` (IPv4) instead of `localhost`, fixing a false "unhealthy" state.

## 1.0.0 — 2026-06-26

Initial release.

- Modbus connectivity for TCP, UDP, RTU (serial) and RTU-over-TCP hubs, with
  multiple hubs and multiple unit IDs per hub, serialized requests, configurable
  timeout/delay and exponential reconnect backoff (1 s … 60 s).
- Read direction across all register classes (coil, discrete input, holding,
  input) and data types (bool, int/uint 16/32/64, float32/64, string, bit
  extraction) with word/byte swap, scale, offset and precision.
- Write direction (HCU → Modbus) via single/multiple coil and register writes,
  bit read-modify-write, safety clamping and optional verify readback.
- Feature-based device mapping to all supported HCU device archetypes, edited in
  the dashboard mapping editor.
- Polling engine with read coalescing, stale detection and backoff, plus a
  register scan/discovery tool.
- Spec-true Connect API client (handshake headers, four-field envelope, STATUS_
  EVENT only on genuine external change).
- Dark-Glass dashboard with the mandatory tabs (Hubs & devices, Mapping, Scan,
  Trends, Decisions, Appearance & language, Diagnostics, Logs & debug with a 360°
  export, Updates, Help), live SSE updates and full DE/EN internationalization.
- Atomic `/data` persistence with a Zod single-source-of-truth configuration and
  optional Telegram notifications.
