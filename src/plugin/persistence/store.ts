import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from '../../shared/schema.js';
import { parseConfigSafe } from '../../shared/schema.js';
import type { Logger } from '../logger.js';

/**
 * Atomic JSON persistence under the data directory. Writes go to a temp file
 * and are renamed into place; reads fall back to defaults on any failure so a
 * corrupt file never breaks boot.
 */
export class Store {
  constructor(
    private readonly dataDir: string,
    private readonly logger: Logger,
  ) {
    try {
      mkdirSync(this.dataDir, { recursive: true });
    } catch (err) {
      this.logger.warn('store', `Could not create data dir: ${String(err)}`);
    }
  }

  private path(name: string): string {
    return join(this.dataDir, name);
  }

  private writeAtomic(name: string, data: unknown): void {
    const target = this.path(name);
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    renameSync(tmp, target);
  }

  private readJson<T>(name: string): T | null {
    const target = this.path(name);
    if (!existsSync(target)) return null;
    try {
      return JSON.parse(readFileSync(target, 'utf8')) as T;
    } catch (err) {
      this.logger.warn('store', `Failed to read ${name}: ${String(err)}`);
      return null;
    }
  }

  loadConfig(): AppConfig {
    const raw = this.readJson<unknown>('config.json');
    const { config, ok, error } = parseConfigSafe(raw);
    if (!ok) this.logger.warn('store', `config.json invalid, using defaults: ${error ?? ''}`);
    return config;
  }

  saveConfig(config: AppConfig): void {
    try {
      this.writeAtomic('config.json', config);
    } catch (err) {
      this.logger.error('store', `Failed to persist config: ${String(err)}`);
      throw err;
    }
  }

  loadJson<T>(name: string, fallback: T): T {
    return this.readJson<T>(name) ?? fallback;
  }

  saveJson(name: string, data: unknown): void {
    try {
      this.writeAtomic(name, data);
    } catch (err) {
      this.logger.warn('store', `Failed to persist ${name}: ${String(err)}`);
    }
  }
}
