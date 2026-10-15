/**
 * Shared URL safety utility.
 *
 * Validates a URL string and returns it only when its protocol is `http:`
 * or `https:`. Otherwise returns `null`.
 */

/**
 * Returns the given URL string if it is a valid absolute URL using the
 * `http:` or `https:` protocol. Returns `null` for anything else, including
 * `undefined`, `null`, empty strings, relative URLs, and other protocols
 * such as `javascript:`, `data:`, or `mailto:`.
 */
export function safeExternalUrl(url: string | undefined | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url;
    }
  } catch {
    // Invalid URL — fall through to return null.
  }

  return null;
}

export default safeExternalUrl;