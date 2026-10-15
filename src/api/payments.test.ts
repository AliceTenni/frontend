import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchReceipt, receiptUrl } from './payments';

describe('receiptUrl', () => {
  it('constructs a URL for a simple receipt id', () => {
    expect(receiptUrl('abc123')).toBe('/api/payments/receipts/abc123');
  });

  it('encodes a forward slash in the receipt id', () => {
    expect(receiptUrl('a/b')).toBe('/api/payments/receipts/a%2Fb');
  });

  it('encodes a question mark in the receipt id', () => {
    expect(receiptUrl('a?b')).toBe('/api/payments/receipts/a%3Fb');
  });

  it('encodes a hash in the receipt id', () => {
    expect(receiptUrl('a#b')).toBe('/api/payments/receipts/a%23b');
  });

  it('encodes spaces in the receipt id', () => {
    expect(receiptUrl('a b')).toBe('/api/payments/receipts/a%20b');
  });

  it('encodes multiple reserved characters in the receipt id', () => {
    expect(receiptUrl('a/b?c#d e')).toBe(
      '/api/payments/receipts/a%2Fb%3Fc%23d%20e',
    );
  });
});

describe('fetchReceipt', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('requests the encoded URL for a simple receipt id', async () => {
    const mockResponse = { ok: true, json: async () => ({ id: 'abc123' }) };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse,
    );

    await fetchReceipt('abc123');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/payments/receipts/abc123',
    );
  });

  it('encodes a forward slash in the receipt id', async () => {
    const mockResponse = { ok: true, json: async () => ({ id: 'a/b' }) };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse,
    );

    await fetchReceipt('a/b');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/payments/receipts/a%2Fb',
    );
  });

  it('encodes a question mark in the receipt id', async () => {
    const mockResponse = { ok: true, json: async () => ({ id: 'a?b' }) };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse,
    );

    await fetchReceipt('a?b');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/payments/receipts/a%3Fb',
    );
  });

  it('encodes a hash in the receipt id', async () => {
    const mockResponse = { ok: true, json: async () => ({ id: 'a#b' }) };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse,
    );

    await fetchReceipt('a#b');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/payments/receipts/a%23b',
    );
  });

  it('encodes spaces in the receipt id', async () => {
    const mockResponse = { ok: true, json: async () => ({ id: 'a b' }) };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse,
    );

    await fetchReceipt('a b');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/payments/receipts/a%20b',
    );
  });

  it('encodes multiple reserved characters in the receipt id', async () => {
    const mockResponse = { ok: true, json: async () => ({ id: 'a/b?c#d e' }) };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse,
    );

    await fetchReceipt('a/b?c#d e');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/payments/receipts/a%2Fb%3Fc%23d%20e',
    );
  });
});