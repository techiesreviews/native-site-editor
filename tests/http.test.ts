import { test } from "node:test";
import assert from "node:assert/strict";
import { requestJson, requestText } from "../worker/http.ts";
import { HttpError } from "../worker/github.ts";

const form = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("https://editor.test/form", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body,
  });
const gzip = (bytes: Uint8Array | string) =>
  new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();

test("requestText reads a normal form within the limit", async () => {
  assert.equal(await requestText(form("grant_type=authorization_code&code=abc"), 8192), "grant_type=authorization_code&code=abc");
});

test("requestText counts decoded bytes, not characters, for multibyte input", async () => {
  const value = "name=" + "€".repeat(10); // each € is 3 UTF-8 bytes
  const bytes = new TextEncoder().encode(value);
  assert.equal(bytes.length, 35);
  assert.equal(await requestText(form(bytes), 35), value);
  await assert.rejects(requestText(form(bytes), 34), (error: HttpError) => error.status === 413);
});

test("requestText bounds a streamed body with no Content-Length and cancels the rest", async () => {
  let pulled = 0;
  const chunk = new Uint8Array(1024);
  const body = new ReadableStream({
    pull(controller) {
      pulled++;
      if (pulled > 10_000) controller.close();
      else controller.enqueue(chunk);
    },
  });
  const request = new Request("https://editor.test/form", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    duplex: "half",
  } as RequestInit);
  assert.equal(request.headers.get("content-length"), null, "the stream carries no Content-Length");
  await assert.rejects(requestText(request, 4096), (error: HttpError) => error.status === 413);
  assert.ok(pulled < 100, `over-limit body is cancelled early, not read in full (pulled ${pulled})`);
});

test("requestJson bounds a gzip bomb by what it unpacks to", async () => {
  const big = "a".repeat(200_000);
  await assert.rejects(
    requestJson(
      new Request("https://editor.test/api", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
        body: await gzip(JSON.stringify({ text: big })),
      }),
      50_000,
    ),
    (error: HttpError) => error.status === 413,
  );
});

test("requestText rejects an invalid gzip stream and an unsupported encoding", async () => {
  await assert.rejects(
    requestText(form("not gzip at all", { "Content-Encoding": "gzip" }), 8192),
    (error: HttpError) => error.status === 400,
  );
  await assert.rejects(
    requestText(form("data", { "Content-Encoding": "br" }), 8192),
    (error: HttpError) => error.status === 415,
  );
});

test("requestText unpacks a valid gzipped form", async () => {
  const request = form(await gzip("grant_type=authorization_code"), { "Content-Encoding": "gzip" });
  assert.equal(await requestText(request, 8192), "grant_type=authorization_code");
});
