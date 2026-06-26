import { describe, it, expect } from 'vitest';
import { buildConfigTemplate, parseConfigUpdate } from '../src/plugin/connect/configpage.js';
import { defaultConfig } from '../src/shared/schema.js';

describe('buildConfigTemplate', () => {
  it('exposes dashboard enabled, port and link with valid property types', () => {
    const cfg = defaultConfig();
    const tpl = buildConfigTemplate(cfg, 'http://hcu1-1234.local:8091/', 'de');
    expect(tpl.properties.dashboardEnabled!.dataType).toBe('BOOLEAN');
    expect(tpl.properties.dashboardEnabled!.currentValue).toBe('true');
    expect(tpl.properties.dashboardPort!.dataType).toBe('INTEGER');
    expect(tpl.properties.dashboardPort!.currentValue).toBe('8091');
    expect(tpl.properties.dashboardPort!.minimum).toBe(1025);
    expect(tpl.properties.dashboardLink!.dataType).toBe('WEBLINK');
    expect(tpl.properties.dashboardLink!.currentValue).toBe('http://hcu1-1234.local:8091/');
    expect(tpl.groups!.dashboard).toBeDefined();
  });

  it('hides the link when the dashboard is disabled and localizes to EN', () => {
    const cfg = defaultConfig();
    cfg.dashboard.enabled = false;
    const tpl = buildConfigTemplate(cfg, 'http://x/', 'en');
    expect(tpl.properties.dashboardLink).toBeUndefined();
    expect(tpl.properties.dashboardEnabled!.currentValue).toBe('false');
    expect(tpl.properties.dashboardEnabled!.friendlyName).toBe('Dashboard enabled');
  });
});

describe('parseConfigUpdate', () => {
  it('coerces boolean and integer values from strings or natives', () => {
    expect(parseConfigUpdate({ dashboardEnabled: 'false', dashboardPort: '9090' }).update).toEqual({
      enabled: false,
      port: 9090,
    });
    expect(parseConfigUpdate({ dashboardEnabled: true, dashboardPort: 8080 }).update).toEqual({
      enabled: true,
      port: 8080,
    });
  });

  it('flags invalid values', () => {
    const res = parseConfigUpdate({ dashboardPort: 70000, dashboardEnabled: 'maybe' });
    expect(res.invalid).toContain('dashboardPort');
    expect(res.invalid).toContain('dashboardEnabled');
    expect(res.update).toEqual({});
  });

  it('ignores unknown properties', () => {
    expect(parseConfigUpdate({ foo: 'bar' }).update).toEqual({});
  });
});
