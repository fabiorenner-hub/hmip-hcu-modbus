import type { FeaturePayload } from '../../shared/snapshot.js';

/** Two numbers differ if their absolute distance exceeds the tolerance. */
export function numbersDiffer(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) > Math.max(0, tolerance);
}

export interface FeatureDiff {
  changed: FeaturePayload[];
  changedTypes: string[];
}

function valuesDiffer(a: unknown, b: unknown, tolerance: number): boolean {
  if (typeof a === 'number' && typeof b === 'number') return numbersDiffer(a, b, tolerance);
  return a !== b;
}

/**
 * Compute which features changed between two snapshots of a device. A feature
 * is "changed" when any of its fields differs (numbers beyond `tolerance`).
 * Pure — used to decide whether an *observed* STATUS_EVENT is warranted.
 */
export function diffFeatures(
  prev: FeaturePayload[],
  next: FeaturePayload[],
  tolerance: number,
): FeatureDiff {
  const prevByType = new Map(prev.map((f) => [f.type, f]));
  const changed: FeaturePayload[] = [];
  const changedTypes: string[] = [];
  for (const feat of next) {
    const before = prevByType.get(feat.type);
    if (!before) {
      changed.push(feat);
      changedTypes.push(feat.type);
      continue;
    }
    let differs = false;
    for (const key of Object.keys(feat)) {
      if (key === 'type') continue;
      if (valuesDiffer(before[key], feat[key], tolerance)) {
        differs = true;
        break;
      }
    }
    if (differs) {
      changed.push(feat);
      changedTypes.push(feat.type);
    }
  }
  return { changed, changedTypes };
}

/**
 * Derive shading direction from a level change. shutterLevel uses 1 = fully
 * closed, so an increasing level moves toward DARKER, a decreasing one toward
 * LIGHTER. Returns null when there is no meaningful movement.
 */
export function directionFor(fromLevel: number, toLevel: number): 'DARKER' | 'LIGHTER' | null {
  if (toLevel > fromLevel) return 'DARKER';
  if (toLevel < fromLevel) return 'LIGHTER';
  return null;
}

/** Whether an observed value is still within the commanded target tolerance. */
export function withinTarget(observed: number, target: number, tolerance: number): boolean {
  return !numbersDiffer(observed, target, tolerance);
}
