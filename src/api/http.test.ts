import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ApiError,
  getJson,
  isArray,
  hasKeys,
  hashRequestBody,
  signPublisherRequestHeaders,
  signedPublisherFetch,
  EMPTY_BODY_HASH,
} from "./http.js";
import { ApiError, getJson, isArray, hasKeys, publishLinkResource, publishFileResource } from "./http.js";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { ApiError, getJson, isArray, hasKeys } from "./http.js";

function headersOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  const call = fetchMock.mock.calls[0];
  const init = call?.[1] as RequestInit | undefined;
  return (init?.headers ?? {}) as Record<string, string>;
}

function respond(body: string, { status = 200, type = "application/json" } = {}) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status, headers: { "content-type": type } })));
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

describe("getJson", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("returns parsed JSON on success", async () => {
    respond(JSON.stringify([{ id: "1" }]));
    await expect(getJson("/resources", "Couldn't load", undefined, isArray)).resolves.toEqual([{ id: "1" }]);
  });

  it("signs read requests instead of sending a raw API key", async () => {
    respond(JSON.stringify([{ id: "1" }]));
    await getJson("/resources", "Couldn't load", undefined, isArray);
    const headers = headersOf(vi.mocked(fetch));
    expect(headers["X-Timestamp"]).toBeTruthy();
    expect(headers["X-Signature"]).toBeTruthy();
    expect(headers["x-api-key"]).toBeUndefined();
    expect(headers["X-Api-Key"]).toBeUndefined();
  it("sends the session token as a Bearer Authorization header", async () => {
    localStorage.setItem("synapsvault.sessionToken", "tok_123");
    respond(JSON.stringify([]));
    await getJson("/resources", "Couldn't load", undefined, isArray);
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_123");
  });

  it("omits the Authorization header when there is no session token", async () => {
    respond(JSON.stringify([]));
    await getJson("/resources", "Couldn't load", undefined, isArray);
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("explains an HTML response (SPA fallback) instead of 'Unexpected token <'", async () => {
    respond("<!doctype html><html></html>", { type: "text/html" });
    const err = await failure(getJson("/agent/status", "Failed to load agent status"));
    expect(err.kind).toBe("misconfigured");
    expect(err.message).toMatch(/VITE_API_URL/);
    expect(err.message).not.toMatch(/Unexpected token/);
  });

  it.each([502, 503, 504])("treats a %i gateway error as unreachable", async (status) => {
    respond(JSON.stringify({ error: "Backend unreachable at http://localhost:3000 (ECONNREFUSED)" }), { status });
    const err = await failure(getJson("/resources", "Couldn't load the catalog"));
    expect(err.kind).toBe("unreachable");
    expect(err.message).toMatch(/Can't reach the SynapsVault API/);
  });

  it("treats a bare 500 (proxy, no JSON body) as unreachable", async () => {
    respond("", { status: 500, type: "text/plain" });
    expect((await failure(getJson("/resources", "Couldn't load the catalog"))).kind).toBe("unreachable");
  });

  it("surfaces the backend's own error message", async () => {
    respond(JSON.stringify({ error: "Invalid session token" }), { status: 401 });
    const err = await failure(getJson("/publishers/me/resources", "Failed"));
    expect(err).toMatchObject({ kind: "http", status: 401, message: "Invalid session token" });
  });

  it("falls back to a readable message with the status when the backend gives none", async () => {
    respond("{}", { status: 404 });
    expect((await failure(getJson("/resources/x/meta", "Failed to load resource preview"))).message).toBe(
      "Failed to load resource preview (HTTP 404)",
    );
  });

  it("maps network failures to unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect((await failure(getJson("/resources", "Couldn't load"))).kind).toBe("unreachable");
  });

  it("rethrows aborts untouched so callers can ignore them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    await expect(getJson("/resources", "Couldn't load")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects a body of the wrong shape before it reaches the UI", async () => {
    respond(JSON.stringify({ unexpected: true }));
    const err = await failure(getJson("/agent/status", "Failed to load agent status", undefined, hasKeys("agent", "stats")));
    expect(err.message).toMatch(/unexpected response/);
  });

  it.each([
    ["/", "%2F"],
    ["?", "%3F"],
    ["#", "%23"],
    [" ", "%20"],
  ])("percent-encodes %j in the request path", async (char, encoded) => {
    respond(JSON.stringify([]));
    await getJson(`/resources/${char}/meta`, "Failed");
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain(encoded);
    expect(String(url)).not.toContain(`/resources/${char}/meta`);
  });

  it("encodes multiple special characters without double-encoding", async () => {
    respond(JSON.stringify([]));
    await getJson("/resources/a b/c?d#e/meta", "Failed");
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/resources/a%20b%2Fc%3Fd%23e/meta");
  });
});

describe("signed publish requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  function captureFetch() {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("publishLinkResource signs the POST with X-Signature, X-Timestamp and x-api-key", async () => {
    const fetchMock = captureFetch();
    await publishLinkResource("https://example.com", "key-123", "secret-456");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/resources\/link$/);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("key-123");
    expect(headers["X-Timestamp"]).toBeTruthy();
    expect(headers["X-Signature"]).toBeTruthy();
  });

  it("publishFileResource signs the POST with X-Signature, X-Timestamp and x-api-key", async () => {
    const fetchMock = captureFetch();
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    await publishFileResource(file, "key-123", "secret-456");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/resources\/upload$/);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("key-123");
    expect(headers["X-Timestamp"]).toBeTruthy();
    expect(headers["X-Signature"]).toBeTruthy();
  });
});

describe("hashRequestBody", () => {
  it("hashes a string body as its UTF-8 bytes", async () => {
    const expected = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode("hello"))
      .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));
    await expect(hashRequestBody("hello")).resolves.toBe(expected);
  });

  it("hashes an empty string to EMPTY_BODY_HASH", async () => {
    await expect(hashRequestBody("")).resolves.toBe(EMPTY_BODY_HASH);
  });

  it("hashes null and undefined to EMPTY_BODY_HASH", async () => {
    await expect(hashRequestBody(null)).resolves.toBe(EMPTY_BODY_HASH);
    await expect(hashRequestBody(undefined)).resolves.toBe(EMPTY_BODY_HASH);
  });

  it("hashes a Blob's bytes and differs from the empty-body hash", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const hash = await hashRequestBody(blob);
    expect(hash).not.toBe(EMPTY_BODY_HASH);
    const expected = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode("hello"))
      .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));
    expect(hash).toBe(expected);
  });

  it("hashes URLSearchParams by its serialized form", async () => {
    const params = new URLSearchParams({ a: "1", b: "two" });
    const hash = await hashRequestBody(params);
    const expected = await hashRequestBody(params.toString());
    expect(hash).toBe(expected);
    expect(hash).not.toBe(EMPTY_BODY_HASH);
  });

  it("hashes equivalent FormData instances deterministically", async () => {
    const make = () => {
      const fd = new FormData();
      fd.append("name", "value");
      fd.append("file", new Blob(["file-bytes"], { type: "application/octet-stream" }), "file.bin");
      return fd;
    };
    const a = await hashRequestBody(make());
    const b = await hashRequestBody(make());
    expect(a).toBe(b);
    expect(a).not.toBe(EMPTY_BODY_HASH);
  });

  it("throws a clear error for unsupported body types", async () => {
    await expect(hashRequestBody({ foo: "bar" })).rejects.toThrow(/unsupported/i);
    await expect(hashRequestBody(new ReadableStream())).rejects.toThrow(/unsupported/i);
  });
});

describe("signPublisherRequestHeaders / signedPublisherFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards a Blob body unchanged and does not set a JSON content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const blob = new Blob(["hello"], { type: "text/plain" });

    await signedPublisherFetch("/publishers/me/resources", { method: "POST", body: blob });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/publishers/me/resources");
    expect(init.body).toBe(blob);
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).not.toBe("application/json");
  });

  it("forwards a FormData body unchanged and does not set a JSON content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const fd = new FormData();
    fd.append("name", "value");
    fd.append("file", new Blob(["file-bytes"]), "file.bin");

    await signedPublisherFetch("/publishers/me/resources", { method: "POST", body: fd });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(fd);
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).not.toBe("application/json");
  });

  it("signPublisherRequestHeaders returns headers without a JSON content type for a Blob body", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const headers = await signPublisherRequestHeaders({ method: "POST", body: blob });
    const h = new Headers(headers);
    expect(h.get("content-type")).not.toBe("application/json");
  });
});
