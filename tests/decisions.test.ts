import { describe, it, expect } from 'vitest';
import { numbersDiffer, diffFeatures, directionFor, withinTarget } from '../src/plugin/engine/decisions.js';
import type { FeaturePayload } from '../src/shared/snapshot.js';

describe('numbersDiffer', () => {
  it('respects tolerance', () => {
    expect(numbersDiffer(1, 1.05, 0.1)).toBe(false);
    expect(numbersDiffer(1, 1.2, 0.1)).toBe(true);
  });
});

describe('diffFeatures', () => {
  const prev: FeaturePayload[] = [{ type: 'actualTemperature', actualTemperature: 20 }];

  it('reports a change beyond tolerance', () => {
    const next: FeaturePayload[] = [{ type: 'actualTemperature', actualTemperature: 21 }];
    const d = diffFeatures(prev, next, 0.5);
    expect(d.changedTypes).toContain('actualTemperature');
  });

  it('ignores a change within tolerance', () => {
    const next: FeaturePayload[] = [{ type: 'actualTemperature', actualTemperature: 20.2 }];
    const d = diffFeatures(prev, next, 0.5);
    expect(d.changed).toHaveLength(0);
  });

  it('reports newly appearing features', () => {
    const next: FeaturePayload[] = [
      { type: 'actualTemperature', actualTemperature: 20 },
      { type: 'humidity', humidity: 55 },
    ];
    const d = diffFeatures(prev, next, 0);
    expect(d.changedTypes).toEqual(['humidity']);
  });
});

describe('directionFor', () => {
  it('maps level change to shading direction (1 = closed)', () => {
    expect(directionFor(0.2, 0.8)).toBe('DARKER');
    expect(directionFor(0.8, 0.2)).toBe('LIGHTER');
    expect(directionFor(0.5, 0.5)).toBeNull();
  });
});

describe('withinTarget', () => {
  it('is true within tolerance', () => {
    expect(withinTarget(0.49, 0.5, 0.02)).toBe(true);
    expect(withinTarget(0.4, 0.5, 0.02)).toBe(false);
  });
});
