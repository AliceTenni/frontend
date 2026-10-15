/**
 * Build-time configuration, read once from Vite env vars.
 * See .env.example for the full list.
 *
 * SECURITY: Never expose secrets (API keys, private keys, tokens) through
 * `VITE_*` variables. Vite inlines these values into the client bundle, so
 * anything read here is publicly visible. Secrets must live server-side only.
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

/** Human-readable description of where API requests go, for error messages. */
export function describeApiTarget(): string {
  return API_BASE || "this site (no VITE_API_URL set)";
}