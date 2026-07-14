export function parseSemver(v: string): [number, number, number] {
  const core = v.trim().replace(/^v/iu, '').split(/[-+]/u)[0] ?? '';
  const p = core.split('.');
  const num = (s?: string): number => {
    const n = Number.parseInt(s ?? '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return [num(p[0]), num(p[1]), num(p[2])];
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a),
    pb = parseSemver(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i]! > pb[i]!) return 1;
    if (pa[i]! < pb[i]!) return -1;
  }
  return 0;
}

export const isNewer = (a: string, b: string): boolean => compareSemver(a, b) > 0;
export const isAtLeast = (a: string, b: string): boolean => compareSemver(a, b) >= 0;

export function buildTail(v: string): string {
  const i = v.indexOf('+');
  return i >= 0 ? v.slice(i + 1) : '';
}

/** Experimental compare: same X.Y.Z → build stamp lexicographically (UTC timestamps sort correctly). */
export function isNewerWithBuild(a: string, b: string): boolean {
  const c = compareSemver(a, b);
  if (c !== 0) return c > 0;
  const ta = buildTail(a),
    tb = buildTail(b);
  if (ta === tb) return false;
  return ta > tb;
}
