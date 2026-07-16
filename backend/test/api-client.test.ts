import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchApi, parseApiEnvelope } from "../../shared/utils/api-client";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

test("AIN-P3-02 parseApiEnvelope surfaces backend envelope errors", async () => {
  await assert.rejects(
    () =>
      parseApiEnvelope(
        jsonResponse({ success: false, error: "Backend validation failed", data: null }, { status: 400 }),
        "Fallback error",
      ),
    /Backend validation failed/,
  );
});

test("AIN-P3-02 fetchApi retries configured transient status responses", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse({ success: false, error: "Service unavailable", data: null }, { status: 503 });
    }
    return jsonResponse({ success: true, data: { ok: true } });
  };

  const result = await fetchApi<{ ok: boolean }>("/api/example", undefined, {
    fallbackMessage: "Request failed",
    fetchImpl,
    retries: 1,
    retryDelayMs: 0,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("AIN-P3-02 fetchApi reports one standardized error after retries are exhausted", async () => {
  const errors: string[] = [];
  const fetchImpl: typeof fetch = async () =>
    jsonResponse({ success: false, error: "Still unavailable", data: null }, { status: 503 });

  await assert.rejects(
    () =>
      fetchApi("/api/example", undefined, {
        fallbackMessage: "Request failed",
        fetchImpl,
        retries: 1,
        retryDelayMs: 0,
        onError: (message) => errors.push(message),
      }),
    /Still unavailable/,
  );

  assert.deepEqual(errors, ["Still unavailable"]);
});

test("413 pove, da je priloga prevelika (streznik vrne HTML, ne ovojnice)", async () => {
  const html = new Response("<!DOCTYPE html><html><body>PayloadTooLargeError</body></html>", {
    status: 413,
    headers: { "Content-Type": "text/html" },
  });
  await assert.rejects(() => parseApiEnvelope(html, "Fallback error"), /prevelika/);
});
