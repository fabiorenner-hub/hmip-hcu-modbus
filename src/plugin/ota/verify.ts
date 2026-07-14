import { createHash, verify as edVerify } from 'node:crypto';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Matches(bytes: Uint8Array, expected: string): boolean {
  return sha256Hex(bytes).toLowerCase() === expected.toLowerCase();
}

/** Optional Ed25519. No key → no-op (true). Key + missing/broken signature → false. */
export function verifySignature(bytes: Uint8Array, signatureB64?: string, publicKeyPem?: string): boolean {
  if (!publicKeyPem) return true;
  if (!signatureB64) return false;
  try {
    return edVerify(null, bytes, publicKeyPem, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
