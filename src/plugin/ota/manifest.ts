import { z } from 'zod';

const SEMVER_RE = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const SHA256_RE = /^[0-9a-f]{64}$/iu;

export const OtaManifestSchema = z.object({
  version: z.string().regex(SEMVER_RE),
  minCoreVersion: z.string().regex(SEMVER_RE),
  sha256: z.string().regex(SHA256_RE),
  assetUrl: z.string().url().refine((u) => u.startsWith('https://'), 'https only'),
  bundleName: z.string().min(1),
  signature: z.string().min(1).optional(),
  notes: z.string().optional(),
});
export type OtaManifest = z.infer<typeof OtaManifestSchema>;

export function parseManifestJson(json: string): OtaManifest | null {
  try {
    const r = OtaManifestSchema.safeParse(JSON.parse(json));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
