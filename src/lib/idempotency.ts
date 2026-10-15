import { randomUUID } from 'crypto';

/**
 * Generates a new idempotency key.
 *
 * Uses `crypto.randomUUID` when available, falling back to a
 * time + random based key for environments where it is not.
 */
export function newIdempotencyKey(): string {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;

  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }

  // Fallback: combine a timestamp with random segments.
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2);
  const randomPart2 = Math.random().toString(36).slice(2);

  return `${timestamp}-${randomPart}-${randomPart2}`;
}

export default newIdempotencyKey;