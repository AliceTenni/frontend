import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signPublisherRequestHeaders } from './requestSignature';
import {
  buildCanonicalString,
  signRequest,
  generateIdempotencyKey,
  withIdempotencyKey,
} from './requestSignature';

describe('signPublisherRequestHeaders', () => {
  const originalIsSecureContext = Object.getOwnPropertyDescriptor(
    window,
    'isSecureContext',
  );
  const originalSubtle = Object.getOwnPropertyDescriptor(crypto, 'subtle');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalIsSecureContext) {
      Object.defineProperty(window, 'isSecureContext', originalIsSecureContext);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).isSecureContext;
    }

    if (originalSubtle) {
      Object.defineProperty(crypto, 'subtle', originalSubtle);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (crypto as any).subtle;
    }
  });

  it('rejects with a descriptive secure-context error when window.isSecureContext is false', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      get: () => false,
    });

    await expect(
      signPublisherRequestHeaders({
        method: 'GET',
        url: 'https://example.com/publish',
        body: '',
      }),
    ).rejects.toThrow(/secure context/i);
  });

  it('rejects with a descriptive secure-context error when crypto.subtle is unavailable', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      get: () => true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (crypto as any).subtle;

    await expect(
      signPublisherRequestHeaders({
        method: 'GET',
        url: 'https://example.com/publish',
        body: '',
      }),
    ).rejects.toThrow(/secure context/i);
  });

  it('signs request headers successfully in a secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      get: () => true,
    });

    const headers = await signPublisherRequestHeaders({
      method: 'POST',
      url: 'https://example.com/publish',
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(headers).toBeDefined();
    expect(typeof headers).toBe('object');
    expect(Object.keys(headers).length).toBeGreaterThan(0);
  });
});

describe('requestSignature', () => {
  describe('generateIdempotencyKey', () => {
    it('returns a non-empty string', () => {
      const key = generateIdempotencyKey();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('returns unique keys across invocations', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateIdempotencyKey());
      }
      expect(keys.size).toBe(100);
    });
  });

  describe('buildCanonicalString', () => {
    it('includes the idempotency key when provided', () => {
      const canonical = buildCanonicalString({
        method: 'POST',
        path: '/api/publish',
        body: '{"assetId":"a1"}',
        idempotencyKey: 'key-123',
      });
      expect(canonical).toContain('key-123');
    });

    it('produces different canonical strings for different idempotency keys', () => {
      const base = {
        method: 'POST',
        path: '/api/publish',
        body: '{"assetId":"a1"}',
      };
      const a = buildCanonicalString({ ...base, idempotencyKey: 'key-a' });
      const b = buildCanonicalString({ ...base, idempotencyKey: 'key-b' });
      expect(a).not.toEqual(b);
    });

    it('produces the same canonical string for identical inputs', () => {
      const input = {
        method: 'POST',
        path: '/api/publish',
        body: '{"assetId":"a1"}',
        idempotencyKey: 'key-123',
      };
      expect(buildCanonicalString(input)).toEqual(buildCanonicalString(input));
    });
  });

  describe('signRequest', () => {
    it('produces a signature that changes when the idempotency key changes', () => {
      const base = {
        method: 'POST',
        path: '/api/publish',
        body: '{"assetId":"a1"}',
        secret: 'secret',
      };
      const a = signRequest({ ...base, idempotencyKey: 'key-a' });
      const b = signRequest({ ...base, idempotencyKey: 'key-b' });
      expect(a).not.toEqual(b);
    });

    it('produces a stable signature for identical inputs', () => {
      const input = {
        method: 'POST',
        path: '/api/publish',
        body: '{"assetId":"a1"}',
        secret: 'secret',
        idempotencyKey: 'key-123',
      };
      expect(signRequest(input)).toEqual(signRequest(input));
    });
  });

  describe('withIdempotencyKey', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      }) as unknown as typeof fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    const mutatingFlows: Array<{
      name: string;
      method: string;
      path: string;
      body: Record<string, unknown>;
    }> = [
      {
        name: 'publish',
        method: 'POST',
        path: '/api/publish',
        body: { assetId: 'a1' },
      },
      {
        name: 'price change',
        method: 'POST',
        path: '/api/price',
        body: { assetId: 'a1', price: 100 },
      },
      {
        name: 'transfer',
        method: 'POST',
        path: '/api/transfer',
        body: { assetId: 'a1', to: '0xabc' },
      },
      {
        name: 'register',
        method: 'POST',
        path: '/api/register',
        body: { assetId: 'a1', owner: '0xdef' },
      },
    ];

    it.each(mutatingFlows)(
      'sends an Idempotency-Key header for the $name flow',
      async ({ method, path, body }) => {
        await withIdempotencyKey({ method, path, body, secret: 'secret' });

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
          .calls[0];
        const headers = init?.headers as Record<string, string>;
        expect(headers).toBeDefined();
        expect(headers['Idempotency-Key']).toBeDefined();
        expect(typeof headers['Idempotency-Key']).toBe('string');
        expect(headers['Idempotency-Key'].length).toBeGreaterThan(0);
      },
    );

    it.each(mutatingFlows)(
      'includes the Idempotency-Key in the signature for the $name flow',
      async ({ method, path, body }) => {
        await withIdempotencyKey({ method, path, body, secret: 'secret' });

        const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
          .calls[0];
        const headers = init?.headers as Record<string, string>;
        const idempotencyKey = headers['Idempotency-Key'];
        const signature = headers['X-Signature'];

        expect(idempotencyKey).toBeDefined();
        expect(signature).toBeDefined();

        const expectedSignature = signRequest({
          method,
          path,
          body: JSON.stringify(body),
          secret: 'secret',
          idempotencyKey,
        });
        expect(signature).toEqual(expectedSignature);
      },
    );

    it.each(mutatingFlows)(
      'generates a fresh Idempotency-Key per request for the $name flow',
      async ({ method, path, body }) => {
        await withIdempotencyKey({ method, path, body, secret: 'secret' });
        await withIdempotencyKey({ method, path, body, secret: 'secret' });

        const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls).toHaveLength(2);

        const firstKey = (calls[0][1]?.headers as Record<string, string>)[
          'Idempotency-Key'
        ];
        const secondKey = (calls[1][1]?.headers as Record<string, string>)[
          'Idempotency-Key'
        ];

        expect(firstKey).toBeDefined();
        expect(secondKey).toBeDefined();
        expect(firstKey).not.toEqual(secondKey);
      },
    );

    it('does not send an Idempotency-Key for non-mutating requests', async () => {
      await withIdempotencyKey({
        method: 'GET',
        path: '/api/assets/a1',
        secret: 'secret',
      });

      const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['Idempotency-Key']).toBeUndefined();
    });
  });
});