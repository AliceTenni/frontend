import { API_BASE, describeApiTarget } from "../lib/config.js";

/**
 * Why a request to the SynapsVault backend failed:
 *  - "unreachable": network error, CORS rejection, or a gateway/proxy error
 *    (backend down). Retrying later may help.
 *  - "misconfigured": the response was a web page, not JSON. The request hit
 *    the frontend host (VITE_API_URL unset or wrong), not the API.
 *  - "http": the backend answered with an error status.
 */
export type ApiErrorKind = "unreachable" | "misconfigured" | "http";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

const UNREACHABLE_STATUSES = new Set([502, 503, 504]);

function unreachable(status?: number): ApiError {
  const hint = import.meta.env.DEV
    ? ` Make sure the backend is running (npm run dev in SynapsVault/backend, default http://localhost:3000).`
    : " Please try again in a moment.";
  return new ApiError(`Can't reach the SynapsVault API.${hint}`, "unreachable", status);
}

function misconfigured(status: number): ApiError {
  return new ApiError(
    `The API returned a web page instead of data — requests are going to ${describeApiTarget()}. ` +
      "Set VITE_API_URL to your SynapsVault backend URL and rebuild.",
    "misconfigured",
    status,
  );
}

/** Build a full API URL from a path like "/resources". */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * fetch() that turns network failures (backend down, DNS, CORS) into an
 * "unreachable" ApiError. Abort errors are rethrown untouched so callers can
 * ignore them.
 */
export async function networkFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw unreachable();
  }
}

/** networkFetch against a backend path like "/resources". */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return networkFetch(apiUrl(path), init);
}

function isHtml(res: Response): boolean {
  return (res.headers.get("content-type") ?? "").includes("text/html");
}

async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body = await res.clone().json();
    const message = body?.error ?? body?.message;
    return typeof message === "string" && message.trim() ? message : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Throw a descriptive ApiError when `res` is not a successful JSON response.
 * `fallback` is used when the backend gives no error message of its own.
 */
export async function ensureOk(res: Response, fallback: string): Promise<void> {
  if (isHtml(res)) throw misconfigured(res.status);
  if (res.ok) return;
  // Gateway errors mean the backend itself didn't answer.
  if (UNREACHABLE_STATUSES.has(res.status)) throw unreachable(res.status);
  const message = await readErrorMessage(res);
  // The backend always sends a JSON body with its 500s; a bare one comes
  // from a proxy in front of it.
  if (!message && res.status === 500) throw unreachable(res.status);
  throw new ApiError(message ?? `${fallback} (HTTP ${res.status})`, "http", res.status);
}

/** Shape check applied to a parsed body before it reaches the UI. */
export type Validator = (body: unknown) => boolean;

export const isArray: Validator = (body) => Array.isArray(body);

/** Object whose listed keys are all present (non-null). */
export const hasKeys =
  (...keys: string[]): Validator =>
  (body) =>
    typeof body === "object" && body !== null && keys.every((k) => (body as Record<string, unknown>)[k] != null);

/**
 * Validate `res` (see ensureOk) and parse its JSON body. When `isValid` is
 * given, a body of the wrong shape becomes an ApiError instead of crashing
 * whichever component renders it.
 */
export async function readJson<T>(res: Response, fallback: string, isValid?: Validator): Promise<T> {
  await ensureOk(res, fallback);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw misconfigured(res.status);
  }
  if (isValid && !isValid(body)) {
    throw new ApiError(
      `${fallback}: the API returned an unexpected response. Check that VITE_API_URL points to a compatible SynapsVault backend.`,
      "misconfigured",
      res.status,
    );
  }
  return body as T;
}

/** apiFetch + readJson in one call, for simple GETs. */
export async function getJson<T>(
  path: string,
  fallback: string,
  init?: RequestInit,
  isValid?: Validator,
): Promise<T> {
  return readJson<T>(await apiFetch(path, init), fallback, isValid);
}

/**
 * A signing credential/token used to authenticate reads. Callers pass the
 * token itself rather than the raw key so the key never leaves the signer.
 */
export interface SigningCredential {
  /** Header name carrying the signature (e.g. "x-signature"). */
  header: string;
  /** Signature value for this request. */
  signature: string;
  /** Optional header carrying the token/public identifier. */
  tokenHeader?: string;
  /** Optional token/public identifier value. */
  token?: string;
}

/** Build the signature headers for a signed request. */
export function signatureHeaders(credential: SigningCredential): Record<string, string> {
  const headers: Record<string, string> = { [credential.header]: credential.signature };
  if (credential.tokenHeader && credential.token != null) {
    headers[credential.tokenHeader] = credential.token;
  }
  return headers;
}

/**
 * Signed GET: like getJson, but forwards the signature headers from a
 * signing credential so authenticated reads are expressed uniformly.
 */
export async function signedGetJson<T>(
  path: string,
  fallback: string,
  credential: SigningCredential,
  init?: RequestInit,
  isValid?: Validator,
): Promise<T> {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(signatureHeaders(credential))) {
    headers.set(name, value);
  }
  return readJson<T>(await apiFetch(path, { ...init, headers }), fallback, isValid);
}
