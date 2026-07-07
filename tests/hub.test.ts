import { describe, it, expect } from 'vitest';
import { serializeModbusError } from '../src/plugin/modbus/hub.js';

describe('serializeModbusError', () => {
  it('uses the message of an Error', () => {
    expect(serializeModbusError(new Error('Data length error, expected 7 got 8'))).toBe(
      'Data length error, expected 7 got 8',
    );
  });

  it('never returns "[object Object]" for plain objects', () => {
    expect(serializeModbusError({ message: 'boom' })).toBe('boom');
    expect(serializeModbusError({ modbusCode: 2 })).toBe('Modbus exception (code 2)');
    const generic = serializeModbusError({ foo: 'bar' });
    expect(generic).not.toBe('[object Object]');
    expect(generic).toContain('bar');
  });

  it('passes through strings', () => {
    expect(serializeModbusError('ECONNREFUSED')).toBe('ECONNREFUSED');
  });
});
