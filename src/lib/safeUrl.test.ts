import { describe, it, expect } from 'vitest';
import { isSafeUrl } from './safeUrl';

describe('isSafeUrl', () => {
  it('accepts valid http URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com/path?query=1#hash')).toBe(true);
    expect(isSafeUrl('http://localhost:3000')).toBe(true);
  });

  it('accepts valid https URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('https://example.com/path?query=1#hash')).toBe(true);
    expect(isSafeUrl('https://sub.domain.example.com:8443/path')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeUrl('  javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
  });

  it('rejects vbscript: URLs', () => {
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('VBScript:msgbox(1)')).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('file://localhost/etc/passwd')).toBe(false);
  });

  it('rejects malformed strings', () => {
    expect(isSafeUrl('not a url')).toBe(false);
    expect(isSafeUrl('http://')).toBe(false);
    expect(isSafeUrl('://example.com')).toBe(false);
    expect(isSafeUrl('ht!tp://example.com')).toBe(false);
  });

  it('rejects empty and undefined input', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
  });

  it('rejects protocol-relative URLs', () => {
    expect(isSafeUrl('//example.com')).toBe(false);
    expect(isSafeUrl('//example.com/path')).toBe(false);
  });

  it('rejects relative URLs', () => {
    expect(isSafeUrl('/path/to/page')).toBe(false);
    expect(isSafeUrl('path/to/page')).toBe(false);
    expect(isSafeUrl('./relative')).toBe(false);
    expect(isSafeUrl('../relative')).toBe(false);
  });
});