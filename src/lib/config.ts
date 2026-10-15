/**
 * Build-time configuration, read once from Vite env vars.
 * See .env.example for the full list.
 */

/**
 * Backend base URL without a trailing slash. Empty means "same origin": in
 * development the Vite dev server proxies API paths to the backend.
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

export type StellarNetwork = "testnet" | "mainnet";

/**
 * Target Stellar network. `VITE_NETWORK` is the documented variable;
 * `VITE_STELLAR_NETWORK` is still honoured for older deployments.
 */
export const STELLAR_NETWORK: StellarNetwork = (() => {
  const raw = (import.meta.env.VITE_NETWORK ?? import.meta.env.VITE_STELLAR_NETWORK ?? "")
    .trim()
    .toLowerCase();
  return raw === "mainnet" || raw === "public" || raw === "pubnet" ? "mainnet" : "testnet";
})();

/**
 * URL of the signing proxy / token endpoint, without a trailing slash.
 *
 * The raw API key must never be shipped to the browser. Instead, the client
 * requests short-lived tokens (or signed requests) from this endpoint, which
 * holds the secret server-side. Empty means "same origin": in development the
 * Vite dev server proxies the auth path to the backend.
 */
export const AUTH_PROXY_URL = (import.meta.env.VITE_AUTH_PROXY_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

/**
 * Whether a signing proxy / token endpoint is configured. When false, the
 * client cannot obtain credentials and must not attempt authenticated calls.
 */
export const HAS_AUTH_PROXY = AUTH_PROXY_URL.length > 0;

/** Human-readable description of where API requests go, for error messages. */
export function describeApiTarget(): string {
  return API_BASE || "this site (no VITE_API_URL set)";
}

/** Human-readable description of where auth requests go, for error messages. */
export function describeAuthTarget(): string {
  return AUTH_PROXY_URL || "this site (no VITE_AUTH_PROXY_URL set)";
}