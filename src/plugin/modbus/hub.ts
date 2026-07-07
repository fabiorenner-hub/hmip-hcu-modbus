import ModbusNs from 'modbus-serial';
import type { Hub, RegisterKind } from '../../shared/schema.js';
import type { HubHealth, HubStatus } from '../../shared/snapshot.js';
import type { Logger } from '../logger.js';

// modbus-serial ships as CommonJS; under NodeNext the constructable class is
// exposed on the `.default` property of the imported namespace.
const ModbusRTU = ModbusNs.default;
type ModbusClient = InstanceType<typeof ModbusRTU>;

/** Turn any thrown value into a readable message (never "[object Object]"). */
export function serializeModbusError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) return o.message;
    if (o.modbusCode !== undefined) return `Modbus exception (code ${String(o.modbusCode)})`;
    try {
      return JSON.stringify(err);
    } catch {
      return 'unknown error';
    }
  }
  return String(err);
}

/** Serialises Modbus operations against a single hub (one socket per hub). */
export class ModbusHub {
  private client: ModbusClient = new ModbusRTU();
  private connected = false;
  private connecting: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private health: HubHealth;
  private lastOkAt: number | null = null;
  private lastError: string | null = null;
  private reads = 0;
  private writes = 0;
  private errors = 0;
  private consecutiveErrors = 0;
  /** Exponential reconnect backoff, 1s … 60s per Requirement 2. */
  private backoffMs = 1000;
  private nextAttemptAt = 0;

  constructor(
    private config: Hub,
    private readonly logger: Logger,
  ) {
    this.health = config.enabled ? 'offline' : 'disabled';
  }

  update(config: Hub): void {
    const changed = JSON.stringify(config) !== JSON.stringify(this.config);
    this.config = config;
    if (!config.enabled) {
      this.health = 'disabled';
      void this.close();
    } else if (changed) {
      void this.close();
      this.health = 'offline';
      this.backoffMs = 1000;
      this.nextAttemptAt = 0;
    }
  }

  /** Proactively attempt a connection (used by the manager's reconnect tick). */
  async ensureConnected(): Promise<void> {
    if (!this.config.enabled || this.connected) return;
    await this.run(async () => undefined);
  }

  target(): string {
    if (this.config.kind === 'rtu') {
      return `${this.config.serialPath}@${this.config.baudRate}`;
    }
    return `${this.config.host}:${this.config.port}`;
  }

  status(): HubStatus {
    return {
      id: this.config.id,
      name: this.config.name,
      kind: this.config.kind,
      target: this.target(),
      health: this.health,
      lastOkAt: this.lastOkAt,
      lastError: this.lastError,
      reads: this.reads,
      writes: this.writes,
      errors: this.errors,
    };
  }

  /** Whether enough backoff time has elapsed to attempt a new connection. */
  canAttempt(): boolean {
    return this.config.enabled && !this.connected && Date.now() >= this.nextAttemptAt;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    if (Date.now() < this.nextAttemptAt) {
      throw new Error('reconnect backoff in progress');
    }
    this.health = 'connecting';
    this.connecting = (async () => {
      try {
        this.client = new ModbusRTU();
        this.client.setTimeout(this.config.timeoutMs);
        const { kind, host, port, serialPath, baudRate, parity, dataBits, stopBits } = this.config;
        if (kind === 'tcp') {
          await this.client.connectTCP(host, { port });
        } else if (kind === 'udp') {
          await this.client.connectUDP(host, { port });
        } else if (kind === 'rtuovertcp') {
          await this.client.connectTcpRTUBuffered(host, { port });
        } else {
          await this.client.connectRTUBuffered(serialPath, { baudRate, parity, dataBits, stopBits });
        }
        this.connected = true;
        this.health = 'connected';
        this.lastError = null;
        this.backoffMs = 1000;
        this.nextAttemptAt = 0;
        this.consecutiveErrors = 0;
        this.logger.info('modbus', `Hub ${this.config.name} connected (${this.target()}).`);
      } catch (err) {
        this.connected = false;
        this.health = 'error';
        this.lastError = String(err);
        this.errors += 1;
        this.nextAttemptAt = Date.now() + this.backoffMs;
        this.backoffMs = Math.min(this.backoffMs * 2, 60000);
        throw err;
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  /** Run an operation on the serialized queue with connect + delay handling. */
  private run<T>(op: () => Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      if (!this.config.enabled) throw new Error('hub disabled');
      await this.connect();
      if (this.config.delayMs > 0) await delay(this.config.delayMs);
      return op();
    });
    // Keep the queue chained but swallow errors so one failure doesn't poison it.
    this.queue = task.catch(() => undefined);
    return task;
  }

  async read(unitId: number, kind: RegisterKind, address: number, length: number): Promise<number[]> {
    return this.run(async () => {
      try {
        this.client.setID(unitId);
        let data: number[];
        if (kind === 'coil') {
          data = (await this.client.readCoils(address, length)).data.map((b: boolean) => (b ? 1 : 0));
        } else if (kind === 'discrete') {
          data = (await this.client.readDiscreteInputs(address, length)).data.map((b: boolean) => (b ? 1 : 0));
        } else if (kind === 'input') {
          data = (await this.client.readInputRegisters(address, length)).data;
        } else {
          data = (await this.client.readHoldingRegisters(address, length)).data;
        }
        this.reads += 1;
        this.lastOkAt = Date.now();
        this.health = 'connected';
        this.consecutiveErrors = 0;
        this.lastError = null;
        return data.slice(0, length);
      } catch (err) {
        this.fail(err);
        throw err;
      }
    });
  }

  async writeCoil(unitId: number, address: number, value: boolean): Promise<void> {
    return this.run(async () => {
      try {
        this.client.setID(unitId);
        await this.client.writeCoil(address, value);
        this.writes += 1;
        this.lastOkAt = Date.now();
        this.consecutiveErrors = 0;
        this.lastError = null;
      } catch (err) {
        this.fail(err);
        throw err;
      }
    });
  }

  async writeRegisters(unitId: number, address: number, values: number[]): Promise<void> {
    return this.run(async () => {
      try {
        this.client.setID(unitId);
        if (values.length === 1) {
          await this.client.writeRegister(address, values[0] ?? 0);
        } else {
          await this.client.writeRegisters(address, values);
        }
        this.writes += 1;
        this.lastOkAt = Date.now();
        this.consecutiveErrors = 0;
        this.lastError = null;
      } catch (err) {
        this.fail(err);
        throw err;
      }
    });
  }

  /** Read-modify-write a single bit inside a holding register. */
  async writeBit(unitId: number, address: number, bitIndex: number, on: boolean): Promise<void> {
    const current = await this.read(unitId, 'holding', address, 1);
    const base = current[0] ?? 0;
    const next = on ? base | (1 << bitIndex) : base & ~(1 << bitIndex) & 0xffff;
    await this.writeRegisters(unitId, address, [next]);
  }

  private fail(err: unknown): void {
    this.errors += 1;
    this.consecutiveErrors += 1;
    const msg = serializeModbusError(err);
    this.lastError = msg;
    this.health = 'error';
    // Self-heal: drop the socket on connection/framing errors (or after several
    // consecutive failures) so the next operation reconnects with a fresh client
    // and re-synchronises the Modbus framing. connect() builds a new client.
    const fatal =
      /ECONN|ETIMEDOUT|EHOSTUNREACH|EPIPE|ECONNRESET|closed|Port Not Open|timed out|data length|length error|crc|transaction|not open/i.test(
        msg,
      );
    if (fatal || this.consecutiveErrors >= 5) {
      this.connected = false;
      this.consecutiveErrors = 0;
    }
  }

  async close(): Promise<void> {
    this.connected = false;
    try {
      await new Promise<void>((resolve) => {
        try {
          this.client.close(() => resolve());
        } catch {
          resolve();
        }
      });
    } catch {
      // ignore
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
