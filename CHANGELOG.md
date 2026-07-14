# Changelog

All notable changes to the Modbus Bridge plugin are documented here. The version
is the single source of truth in `package.json` and must stay in sync with the
Dockerfile (ARG + LABEL), this file and the SPA version constant.

## 1.0.9 — 2026-07-14

- Renamed the dashboard title (top-left header, browser tab and boot splash) to
  "HmIP Modbus Bridge".

## 1.0.8 — 2026-07-14

- Internal stability and maintenance improvements to update handling (more robust
  retry/backoff on transient errors; no retry on rejected requests).

## 1.0.7 — 2026-07-14

- OTA updater with two channels (`stable` + rolling `experimental`): a
  node-builtins-only bootstrap loader chooses between the image bundle and a
  verified OTA payload under `/data/ota/active`, with sha256 verification,
  optional Ed25519, crash-loop quarantine and rollback to the image. Managed from
  the Updates tab (channel/mode switch, check/install) with a progress indicator
  and a robust restart flow.
- Build migrated to an esbuild bundle (`dist/bootstrap/loader.js` +
  `dist/plugin/index.js`); the container now runs the loader.

## 1.0.6 — 2026-07-02

- Self-healing connections: repeated read/framing errors (e.g. "Data length
  error, expected 7 got 8") now force a fresh reconnect so the Modbus framing
  re-synchronises automatically — no more manual disable/enable of the hub.
- Readable error messages: thrown Modbus errors are serialized properly instead
  of showing "[object Object]", and the last hub error is surfaced in the Hubs
  table and the Diagnostics tab.

## 1.0.5 — 2026-06-26

- Dynamic scale factor support (SunSpec-style): a binding can reference a second
  register as its scale factor, so the value becomes `raw × 10^SF` with SF read
  live each poll. Covers e.g. inverter power/scale-factor register pairs.

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
