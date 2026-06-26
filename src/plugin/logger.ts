/** Tiny ring-buffer logger. Keeps the last N lines for the diagnostics export. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  at: number;
  level: LogLevel;
  scope: string;
  message: string;
}

const SECRET_PATTERNS = [/authtoken/i, /token/i, /botToken/i];

function redact(message: string): string {
  let out = message;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(new RegExp(`(${pattern.source})\\s*[:=]\\s*\\S+`, 'gi'), '$1=***');
  }
  return out;
}

export class Logger {
  private lines: LogLine[] = [];

  constructor(private readonly capacity = 1000) {}

  private push(level: LogLevel, scope: string, message: string): void {
    const line: LogLine = { at: Date.now(), level, scope, message: redact(message) };
    this.lines.push(line);
    if (this.lines.length > this.capacity) this.lines.shift();
    const prefix = `[${new Date(line.at).toISOString()}] ${level.toUpperCase()} ${scope}:`;
    if (level === 'error') console.error(prefix, line.message);
    else if (level === 'warn') console.warn(prefix, line.message);
    else console.log(prefix, line.message);
  }

  debug(scope: string, message: string): void {
    this.push('debug', scope, message);
  }
  info(scope: string, message: string): void {
    this.push('info', scope, message);
  }
  warn(scope: string, message: string): void {
    this.push('warn', scope, message);
  }
  error(scope: string, message: string): void {
    this.push('error', scope, message);
  }

  recent(limit = 500): LogLine[] {
    return this.lines.slice(-limit);
  }
}
