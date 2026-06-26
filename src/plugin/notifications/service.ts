import type { NotificationsConfig } from '../../shared/schema.js';
import type { Logger } from '../logger.js';

export type NotifyEvent = 'hubOffline' | 'readError' | 'writeError' | 'valueChange';

export interface Notification {
  id: string;
  at: number;
  event: NotifyEvent;
  title: { de: string; en: string };
  body: { de: string; en: string };
}

/** Keeps a store of notifications, dedups bursts and optionally relays Telegram. */
export class NotificationService {
  private items: Notification[] = [];
  private lastKey = new Map<string, number>();

  constructor(
    private config: NotificationsConfig,
    private readonly logger: Logger,
  ) {}

  update(config: NotificationsConfig): void {
    this.config = config;
  }

  list(limit = 100): Notification[] {
    return this.items.slice(-limit).reverse();
  }

  clear(): void {
    this.items = [];
  }

  notify(event: NotifyEvent, title: { de: string; en: string }, body: { de: string; en: string }): void {
    if (!this.config.enabled) return;
    if (!this.config.events[event]) return;

    // Dedup identical events within a 60s window.
    const key = `${event}:${title.de}:${body.de}`;
    const now = Date.now();
    const last = this.lastKey.get(key) ?? 0;
    if (now - last < 60000) return;
    this.lastKey.set(key, now);

    const item: Notification = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      at: now,
      event,
      title,
      body,
    };
    this.items.push(item);
    if (this.items.length > 500) this.items.shift();

    void this.relayTelegram(item);
  }

  private async relayTelegram(item: Notification): Promise<void> {
    const tg = this.config.telegram;
    if (!tg.enabled || !tg.botToken || !tg.chatId) return;
    const lang = this.config.language;
    const text = `*${item.title[lang]}*\n${item.body[lang]}`;
    try {
      const res = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: tg.chatId, text, parse_mode: 'Markdown' }),
      });
      if (!res.ok) {
        this.logger.warn('notify', `Telegram returned HTTP ${res.status}.`);
      }
    } catch (err) {
      this.logger.warn('notify', `Telegram send failed: ${String(err)}`);
    }
  }
}
