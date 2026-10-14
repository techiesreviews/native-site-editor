// Production-only encoder check; deliberately outside the per-push smoke set.
// npm run test:media-encoders-csp -- --no-build
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const port = Number(process.env.ASE_TEST_PORT ?? 5295);
const base = `http://127.0.0.1:${port}`;
const patch = `
self.addEventListener("securitypolicyviolation", event => self.postMessage({ csp: event.violatedDirective + ": " + event.blockedURI }));
const nativeConvert = OffscreenCanvas.prototype.convertToBlob;
OffscreenCanvas.prototype.convertToBlob = function(options) {
  return nativeConvert.call(this, options?.type === "image/webp" ? { ...options, type: "image/png" } : options);
};
if (self.Worker) {
  const NativeWorker = self.Worker;
  self.Worker = class extends NativeWorker {
    constructor(url, options) {
      if (String(url).startsWith("blob:")) {
        self.postMessage({ csp: "Attempted blob: worker" });
        throw new Error("Unexpected blob: worker");
      }
      super(url, options);
    }
  };
}
`;

async function main() {
  if (!process.argv.includes("--no-build")) {
    const build = spawnSync("npm", ["run", "build:ui"], { stdio: "inherit" });
    assert.equal(build.status, 0, "Production build failed");
  }
  const worker = readdirSync("dist/assets").find(name => /^image-optimise\.worker-.*\.js$/.test(name));
  assert.ok(worker, "Built image worker missing");
  const server = spawn("node", ["--import", "tsx", "tests/native-save/server.ts"], {
    env: { ...process.env, ASE_NATIVE_SAVE_DIST: "1", ASE_NATIVE_SAVE_PORT: String(port) },
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch();
    const deadline = Date.now() + 120_000;
    while (true) {
      assert.equal(server.exitCode, null, "Dist server exited");
      try { if ((await fetch(`${base}/api/session`)).ok) break; } catch { /* Starting. */ }
      assert.ok(Date.now() < deadline, "Dist server did not start");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const page = await browser.newPage();
    const violations: string[] = [], fetched: string[] = [];
    page.on("console", message => {
      if (/content security policy|violat.*(?:policy|directive)|refused to/i.test(message.text())) violations.push(message.text());
    });
    page.on("request", request => fetched.push(new URL(request.url()).pathname));
    await page.exposeFunction("encoderCspViolation", (text: string) => violations.push(text));
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", event => {
        const report = Reflect.get(window, "encoderCspViolation");
        void report(`${event.violatedDirective}: ${event.blockedURI}`);
      });
    });
    // Use the dist origin and its actual production headers, with no editor startup traffic.
    await page.route(`${base}/encoder-check`, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: "<!doctype html><title>Production encoder check</title>" });
    });
    const document = await page.goto(`${base}/encoder-check`);
    const policy = document?.headers()["content-security-policy"];
    assert.ok(policy?.includes("worker-src 'self';"));
    assert.ok(policy?.includes("script-src 'self' 'wasm-unsafe-eval';"));
    assert.ok(!policy?.includes("'unsafe-eval'"));
    const workerUrl = `${base}/assets/${worker}`;
    async function encode(format: "webp" | "avif") {
      return page.evaluate(async ({ workerUrl, format }) => {
        if (crossOriginIsolated) throw new Error("Check must run without cross-origin isolation");
        const source = document.createElement("canvas");
        source.width = 1024; source.height = 512;
        const context = source.getContext("2d")!;
        const pixels = context.createImageData(source.width, source.height);
        // Deterministic opaque noise compresses poorly as PNG, well with lossy encoders.
        let seed = 12345;
        for (let i = 0; i < pixels.data.length; i += 4) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          pixels.data[i] = seed & 255; pixels.data[i + 1] = seed >>> 8 & 255;
          pixels.data[i + 2] = seed >>> 16 & 255; pixels.data[i + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
        const input = await new Promise<Blob>(resolve => source.toBlob(blob => resolve(blob!), "image/png"));
        const worker = new Worker(workerUrl, { type: "module" });
        try {
          return await new Promise<{ type: string; bytes: number[]; copies: string[]; note?: string }>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Encoder check timed out")), 300_000);
            worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
            worker.onmessage = async event => {
              if (event.data.csp) { clearTimeout(timer); reject(new Error(event.data.csp)); return; }
              if (event.data.error) { clearTimeout(timer); reject(new Error(event.data.error)); return; }
              clearTimeout(timer);
              const result = event.data.result;
              const output: Blob = result.outputs[0].blob;
              resolve({ type: output.type, bytes: [...new Uint8Array(await output.arrayBuffer()).slice(0, 16)],
                copies: result.outputs.slice(1).map((copy: { blob: Blob }) => copy.blob.type), note: result.note });
            };
            worker.postMessage({ file: new File([input], "opaque.png", { type: "image/png" }),
              options: { format, quality: format === "avif" ? 50 : 80, speed: format === "avif" ? 8 : undefined,
                maxWidth: 2400, responsive: true, keepOriginal: false } });
          });
        } finally { worker.terminate(); }
      }, { workerUrl, format });
    }
    const native = await encode("webp");
    assert.equal(native.type, "image/webp");
    assert.ok(!fetched.some(path => /encode-|_enc|\.wasm$/.test(path)), "Native path loaded an encoder");
    await page.route(workerUrl, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: patch + await response.text() });
    });
    const webp = await encode("webp");
    assert.equal(webp.type, "image/webp");
    assert.equal(String.fromCharCode(...webp.bytes.slice(0, 4)), "RIFF");
    assert.equal(String.fromCharCode(...webp.bytes.slice(8, 12)), "WEBP");
    assert.equal(webp.copies.length, 2);
    assert.ok(webp.copies.every(type => type === "image/webp"));
    assert.equal(webp.note, undefined);
    assert.ok(fetched.some(path => /webp_enc.*\.wasm$/.test(path)), "WebP WASM was not fetched");
    assert.ok(!fetched.some(path => /avif_enc/.test(path)), "WebP path loaded AVIF");
    const avif = await encode("avif");
    assert.equal(avif.type, "image/avif");
    assert.equal(String.fromCharCode(...avif.bytes.slice(4, 12)), "ftypavif");
    assert.equal(avif.copies.length, 2);
    assert.ok(avif.copies.every(type => type === "image/avif"));
    assert.equal(avif.note, undefined);
    assert.ok(fetched.some(path => /avif_enc-[\w-]+\.wasm$/.test(path)), "Single-threaded AVIF WASM was not fetched");
    assert.ok(!fetched.some(path => /avif_enc_mt/.test(path)), "Multi-threaded AVIF was fetched");
    assert.deepEqual(violations, [], "Production CSP violation");
    console.log("Production CSP: native WebP loads no encoder; forced Safari outputs real WebP; single-threaded AVIF outputs ftypavif; copies match; zero CSP violations.");
    console.log("Encoder assets fetched:", [...new Set(fetched.filter(path => /encode-|_enc|\.wasm$/.test(path)))].join(", "));
  } finally {
    await browser?.close();
    try { process.kill(-server.pid!, "SIGTERM"); } catch { /* Already stopped. */ }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
