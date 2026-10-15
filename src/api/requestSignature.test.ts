import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signPublisherRequestHeaders } from './requestSignature';

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