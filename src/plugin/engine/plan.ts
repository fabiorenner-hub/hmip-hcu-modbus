import type { Binding, RegisterKind } from '../../shared/schema.js';
import { bindingReadCount } from './bindings.js';

/** A binding placed at an offset within a coalesced read block. */
export interface PlannedBinding {
  binding: Binding;
  /** Offset (in registers/coils) of this binding inside the block. */
  offset: number;
  /** Number of registers/coils this binding occupies. */
  count: number;
}

/** A single Modbus read that satisfies one or more bindings. */
export interface ReadPlan {
  registerKind: RegisterKind;
  start: number;
  length: number;
  bindings: PlannedBinding[];
}

/**
 * Group a device's bindings into the minimum set of Modbus reads. Bindings of
 * the same register class whose address spans touch or overlap are coalesced
 * into one read (Requirement 8.2). Pure and deterministic.
 *
 * A configurable `maxGap` keeps unrelated registers from being merged into one
 * oversized read; spans separated by more than `maxGap` stay distinct.
 */
export function planReads(bindings: Binding[], maxBlock = 120, maxGap = 8): ReadPlan[] {
  const byKind = new Map<RegisterKind, Binding[]>();
  for (const b of bindings) {
    const list = byKind.get(b.registerKind) ?? [];
    list.push(b);
    byKind.set(b.registerKind, list);
  }

  const plans: ReadPlan[] = [];
  for (const [registerKind, list] of byKind) {
    const spans = list
      .map((binding) => ({ binding, start: binding.address, count: bindingReadCount(binding) }))
      .sort((a, b) => a.start - b.start || a.count - b.count);

    let block: { start: number; end: number; items: typeof spans } | null = null;
    const flush = () => {
      if (!block) return;
      const length = block.end - block.start;
      plans.push({
        registerKind,
        start: block.start,
        length,
        bindings: block.items.map(({ binding, start, count }) => ({
          binding,
          offset: start - block!.start,
          count,
        })),
      });
      block = null;
    };

    for (const span of spans) {
      const end = span.start + span.count;
      if (!block) {
        block = { start: span.start, end, items: [span] };
        continue;
      }
      const wouldLength = Math.max(block.end, end) - block.start;
      const gap = span.start - block.end;
      if (gap <= maxGap && wouldLength <= maxBlock) {
        block.end = Math.max(block.end, end);
        block.items.push(span);
      } else {
        flush();
        block = { start: span.start, end, items: [span] };
      }
    }
    flush();
  }

  return plans;
}
