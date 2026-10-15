import { signedPublisherFetch } from "./requestSignature.js";
import { apiFetch, apiUrl, getJson, isArray, readJson } from "./http.js";

export interface Resource {
  id: string;
  title: string;
  price: string;
  resourceType: string;
  publisherName?: string;
  walletAddress: string;
  verificationStatus: string;
  onchainStatus: string;
  onchainTxHash?: string;
  listed: boolean;
  accessUrl: string;
}

/** Signed publisher request against a backend path like "/resources/1/price". */
function signedFetch(path: string, apiKey: string, init: RequestInit): Promise<Response> {
  return signedPublisherFetch(apiUrl(path), apiKey, init);
}

export interface CatalogFilters {
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  verificationStatus?: "all" | "verified" | "pending" | "rejected";
  resourceType?: "all" | "file" | "link";
}

export interface ResourceMeta {
  id: string;
  title: string;
  description?: string | null;
  price: string;
  resourceType: string;
  mimeType?: string | null;
  verificationStatus: string;
  publisherName?: string;
  publisherWallet: string;
  onchainStatus: string;
  onchainTxHash?: string | null;
  contentHash?: string | null;
  thumbnailUrl?: string | null;
  createdAt: string;
  accessUrl: string;
}

export async function fetchResourceMeta(id: string, signal?: AbortSignal): Promise<ResourceMeta> {
  return getJson<ResourceMeta>(`/resources/${id}/meta`, "Failed to load resource preview", { signal });
}

export async function fetchCatalog(filters?: CatalogFilters): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.minPrice) params.set("minPrice", filters.minPrice);
  if (filters?.maxPrice) params.set("maxPrice", filters.maxPrice);
  if (filters?.verificationStatus && filters.verificationStatus !== "all")
    params.set("verificationStatus", filters.verificationStatus);
  if (filters?.resourceType && filters.resourceType !== "all")
    params.set("resourceType", filters.resourceType);

  const qs = params.toString();
  return getJson<unknown[]>(`/resources${qs ? `?${qs}` : ""}`, "Couldn't load the catalog", undefined, isArray);
}

/** Resources owned by the API key holder. Callers supply the row shape. */
export async function fetchMyResources<T = unknown>(apiKey: string): Promise<T[]> {
  return getJson<T[]>(
    "/publishers/me/resources",
    "Failed to fetch your resources",
    { headers: { "x-api-key": apiKey } },
    isArray,
  );
}

export async function prepareRegisterTx(
  resourceId: string,
  apiKey: string,
): Promise<{
  unsignedXdr: string;
  networkPassphrase: string;
  metadata: {
    resourceId: string;
    creator: string;
    price: string;
    title: string;
    description?: string;
  };
}> {
  return getJson(`/resources/${resourceId}/register/prepare`, "Failed to prepare register transaction", {
    headers: { "x-api-key": apiKey },
  });
}

/**
 * Error thrown when on-chain registration fails. Carries the structured
 * recovery guidance the server returns (next steps, retry endpoint, and a
 * transaction hash / explorer link when a transaction was broadcast) so the UI
 * can show the creator exactly how to recover.
 */
export class RegistrationError extends Error {
  txHash?: string;
  txStatusUrl?: string;
  nextSteps?: string[];
  retryEndpoint?: string;

  constructor(
    message: string,
    details: {
      txHash?: string;
      txStatusUrl?: string;
      nextSteps?: string[];
      retryEndpoint?: string;
    } = {},
  ) {
    super(message);
    this.name = "RegistrationError";
    this.txHash = details.txHash;
    this.txStatusUrl = details.txStatusUrl;
    this.nextSteps = details.nextSteps;
    this.retryEndpoint = details.retryEndpoint;
  }
}

export async function submitRegisterTx(
  resourceId: string,
  signedXdr: string,
  apiKey: string,
): Promise<{ id: string; onchainStatus: string; txHash: string }> {
  const body = JSON.stringify({ signedXdr });
  const res = await signedFetch(`/resources/${resourceId}/register`, apiKey, {
    method: "POST",
    body,
  });
  if (!res.ok && (res.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await res.json().catch(() => ({}));
    throw new RegistrationError(
      body.message ?? body.error ?? "Failed to submit register transaction",
      {
        txHash: body.txHash,
        txStatusUrl: body.txStatusUrl,
        nextSteps: body.nextSteps,
        retryEndpoint: body.retryEndpoint,
      },
    );
  }
  return readJson(res, "Failed to submit register transaction");
}

export async function prepareSetPrice(
  resourceId: string,
  price: string,
  apiKey: string,
): Promise<{ unsignedXdr: string; networkPassphrase: string }> {
  const body = JSON.stringify({ price });
  const res = await signedFetch(`/resources/${resourceId}/price/prepare`, apiKey, { method: "POST", body });
  return readJson(res, "Failed to prepare transaction");
}

/**
 * On-chain registry stats for the sidebar. Non-critical, so it never throws;
 * null means "unknown" and the UI hides the stat rather than showing a fake 0.
 */
export async function fetchRegistryStatus(): Promise<{ resourceCount: number } | null> {
  try {
    return await getJson<{ resourceCount: number }>("/registry/status", "Registry unavailable");
  } catch {
    return null;
  }
}

export async function prepareTransferOwnership(
  resourceId: string,
  newCreator: string,
  apiKey: string,
): Promise<{ unsignedXdr: string; networkPassphrase: string }> {
  const body = JSON.stringify({ newCreator });
  const res = await signedFetch(`/resources/${resourceId}/ownership/prepare`, apiKey, { method: "POST", body });
  return readJson(res, "Failed to prepare transfer transaction");
}

export async function submitTransferOwnership(
  resourceId: string,
  signedXdr: string,
  newCreator: string,
  apiKey: string,
): Promise<{ id: string; newCreator: string; status: string }> {
  const body = JSON.stringify({ signedXdr, newCreator });
  const res = await signedFetch(`/resources/${resourceId}/ownership`, apiKey, { method: "POST", body });
  return readJson(res, "Failed to submit transfer transaction");
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  walletAddress: string;
  joinedAt: string;
  totalResources: number;
  listedResources: number;
  verifiedResources: number;
  totalSales: number;
  totalEarned: string;
}

export async function fetchLeaderboard(signal?: AbortSignal): Promise<LeaderboardEntry[]> {
  return getJson<LeaderboardEntry[]>("/publishers/leaderboard", "Failed to fetch leaderboard", { signal }, isArray);
}

export async function publishLinkResource(
  data: { title: string; description?: string; price: string; externalUrl: string },
  apiKey: string,
  signal?: AbortSignal,
): Promise<unknown> {
  let scheme: string;
  try {
    scheme = new URL(data.externalUrl).protocol;
  } catch {
    throw new Error("External URL must be a valid URL");
  }
  if (scheme !== "http:" && scheme !== "https:") {
    throw new Error("External URL must use http or https");
  }
  const res = await apiFetch("/resources", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(data),
    signal,
  });
  return readJson(res, "Failed to publish resource");
}

export async function publishFileResource(
  formData: FormData,
  apiKey: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await apiFetch("/resources", {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: formData,
    signal,
  });
  return readJson(res, "Failed to publish resource");
}

export async function submitSetPrice(
  resourceId: string,
  signedXdr: string,
  price: string,
  apiKey: string,
): Promise<{ id: string; price: string; status: string }> {
  const body = JSON.stringify({ signedXdr, price });
  const res = await signedFetch(`/resources/${resourceId}/price`, apiKey, { method: "POST", body });
  return readJson(res, "Failed to submit transaction");
}