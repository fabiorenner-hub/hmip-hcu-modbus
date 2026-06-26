# syntax=docker/dockerfile:1

# ---- Build stage: compile TypeScript + bundle the SPA, then prune dev deps ----
# alpine-node-simple ships node + npm; the alpine-node-typescript image has no npm.
FROM ghcr.io/homematicip/alpine-node-simple:0.0.1 AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- Runtime stage: minimal Node image (no npm) ----
FROM ghcr.io/homematicip/alpine-node-simple:0.0.1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV MODBUS_BRIDGE_DASHBOARD_PORT=8091
ENV MODBUS_BRIDGE_DATA_DIR=/data

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

ARG MODBUS_BRIDGE_VERSION=1.0.3

LABEL de.eq3.hmip.plugin.metadata='{"pluginId":"de.fr.renner.plugin.modbusbridge","version":"1.0.3","issuer":"Fabio Renner","hcuMinVersion":"1.4.7","scope":"LOCAL","friendlyName":{"de":"Modbus Bridge","en":"Modbus Bridge"},"description":{"de":"Bindet Modbus-Geraete (TCP, UDP, RTU, RTU-over-TCP) als Homematic IP Geraete ein - lesen und schreiben.","en":"Bridges Modbus devices (TCP, UDP, RTU, RTU-over-TCP) into Homematic IP - read and write."},"image":"iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACGElEQVR42u3dMWrDQBAF0O0DKX2C4GPnKj5VKhcJLlxKDgJrd+Y/wZTB3v8fAkvRaoyTj8/L9ddsz+hwKDIQh4JCMSgjFILwgyEIPBSBkIMhCDYYgUCDEQgyGIEAgxEILhyB0IIBCCwYgaDCEQgpGICAwhEIJxiAYMIRCAUAwaQCEEg4AmEAIBAADAAGAAOASQIgiHAEK32Z++1LKWkAHqVvjYKaA9grHwIAAAAAgLYA/lM+BM4ASgJASQAY1wGMK4GmG4Cf74/d6RLyyuscKwXRBUSldY4qoVRBUG2do1IoqyOouM5RLZRVEVRd56gYymoIKq8TAAAEA4BgAKgWyioIqq8TAAAEA4BgABAMAIIBQDAACAaAisGc9XmzPheANwZb5XsCcEKYADQHUPW7A/CmELf+ExmA5gBePYcAAAAAdAJw5GkkAJwBAAAAAL8CAHAdAABXAgHoeDPo6N+6GeR2MAAAAAAAAAAAAAAAAAAAAAAAAODxcI+HAwAAAAAAEA/ANnHh28TZKNJGkbaKtVWszaJtFm27eNvFGy+MMAu+GQWA8HcjATC5/NkIAABAQQCYqeXPRACAM4CCADAAGNcBTOKVwMehlND7AM9DGAAIBAADgAHAAGDSAEAQXj4AAACQDgCC8PIBAACC9PIBAACC9PIhUD4AAEAQXz4EyodA+RAoHwLlg6B4CJQPguJBUDwMSoejUcl/dqH6QfxhEHkAAAAASUVORK5CYII=","changelog":"1.0.3 - Dark-Glass-Visual-Layer (Glas-Flaechen, Ambient-Hintergrund, Bewegungssystem, Light-Mode) und Plugin-Icon. 1.0.2 - Native HCU-Konfigurationsseite. 1.0.1 - Dashboard-Port 8091, Healthcheck IPv4. 1.0.0 - Erste Version.","logsEnabled":true}'

EXPOSE 8091
VOLUME ["/data"]
# Healthcheck honours MODBUS_BRIDGE_DASHBOARD_PORT so a runtime port override
# (e.g. -e MODBUS_BRIDGE_DASHBOARD_PORT=9090) keeps the check correct. Uses
# 127.0.0.1 (not localhost) to force IPv4 — the server binds 0.0.0.0 (IPv4).
HEALTHCHECK --interval=30s --timeout=5s CMD wget --quiet --spider "http://127.0.0.1:${MODBUS_BRIDGE_DASHBOARD_PORT}/api/state" || exit 1

CMD ["node", "dist/plugin/index.js"]
