import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, getJson, isArray, hasKeys } from "./http.js";

function respond(body: string, { status = 200, type = "application/json" } = {}) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status, headers: { "content-type": type } })));
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

describe("getJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns parsed JSON on success", async () => {
    respond(JSON.stringify([{ id: "1" }]));
    await expect(getJson("/resources", "Couldn't load", undefined, isArray)).resolves.toEqual([{ id: "1" }]);
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
    respond(JSON.stringify({ error: "Invalid API key" }), { status: 401 });
    const err = await failure(getJson("/publishers/me/resources", "Failed"));
    expect(err).toMatchObject({ kind: "http", status: 401, message: "Invalid API key" });
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
