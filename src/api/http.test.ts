import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ApiError, getJson, isArray, hasKeys, buildAuthHeaders } from "./http.js";

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
});

describe("client-side request signing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not attach a client-generated signature or timestamp header", () => {
    const headers = buildAuthHeaders("test-token");
    expect(headers).not.toHaveProperty("X-Signature");
    expect(headers).not.toHaveProperty("X-Timestamp");
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("x-signature");
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("x-timestamp");
  });

  it("sends no signature headers on the wire", async () => {
    respond(JSON.stringify([]));
    await getJson("/resources", "Couldn't load", undefined, isArray);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.has("X-Signature")).toBe(false);
    expect(headers.has("X-Timestamp")).toBe(false);
  });

  it("embeds no HMAC secret or signing logic in the shipped bundle", () => {
    const roots = ["src", "dist"].map((p) => join(process.cwd(), p));
    const files: string[] = [];
    const walk = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) files.push(full);
      }
    };
    roots.forEach(walk);

    const offenders = files.filter((file) => {
      if (file.endsWith("http.test.ts")) return false;
      const source = readFileSync(file, "utf8");
      return /X-Signature|X-Timestamp|createHmac|HMAC_SECRET|SIGNING_SECRET/.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
