/**
 * Authenticated publisher requests.
 * Requests are authenticated via the Authorization header (session token).
 */

import { networkFetch } from "./http.js";

/** Authenticated JSON fetch relying on the Authorization header. */
export async function signedPublisherFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const body = typeof init.body === "string" ? init.body : undefined;

  const headers = new Headers(init.headers);
  if (body) {
    headers.set("Content-Type", "application/json");
  }

  return networkFetch(url, { ...init, headers });
}
