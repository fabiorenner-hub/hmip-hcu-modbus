import { describe, it, expect } from 'vitest';
import { planReads } from '../src/plugin/engine/plan.js';
import type { Binding } from '../src/shared/schema.js';

function binding(over: Partial<Binding>): Binding {
  return {
    id: over.id ?? 'b',
    featureType: 'actualTemperature',
    field: 'actualTemperature',
    registerKind: 'holding',
    address: 0,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    wordSwap: false,
    byteSwap: false,
    access: 'ro',
    invert: false,
    verify: false,
    ...over,
  };
}

describe('planReads', () => {
  it('coalesces adjacent holding registers into one read', () => {
    const plans = planReads([
      binding({ id: 'a', address: 0 }),
      binding({ id: 'b', address: 1 }),
      binding({ id: 'c', address: 2 }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.start).toBe(0);
    expect(plans[0]!.length).toBe(3);
    expect(plans[0]!.bindings).toHaveLength(3);
  });

  it('keeps distant registers in separate reads', () => {
    const plans = planReads([binding({ id: 'a', address: 0 }), binding({ id: 'b', address: 500 })]);
    expect(plans).toHaveLength(2);
  });

  it('separates register classes', () => {
    const plans = planReads([
      binding({ id: 'a', registerKind: 'holding', address: 0 }),
      binding({ id: 'b', registerKind: 'coil', address: 0 }),
    ]);
    expect(plans).toHaveLength(2);
    expect(new Set(plans.map((p) => p.registerKind))).toEqual(new Set(['holding', 'coil']));
  });

  it('accounts for multi-register data types in offsets', () => {
    const plans = planReads([
      binding({ id: 'a', address: 0, dataType: 'uint32' }),
      binding({ id: 'b', address: 2, dataType: 'uint16' }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.length).toBe(3);
    const b = plans[0]!.bindings.find((x) => x.binding.id === 'b')!;
    expect(b.offset).toBe(2);
  });
});
