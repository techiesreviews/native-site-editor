import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { editorMounted } from "./drafts";

test.use({ ignoreHTTPSErrors: true });

// Default fixture group. Route real upstream headers into HTTPS responses;
// Chromium must enforce CORS itself, rather than a fake fetch rejecting.
test("HTTPS outside pictures read only with CORS and load in the real canvas", async ({ page, baseURL }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const server = createServer((request, response) => {
    if (request.url === "/open.png") response.setHeader("Access-Control-Allow-Origin", "*");
    if (["/open.png", "/closed.png"].includes(request.url ?? "")) {
      response.setHeader("Content-Type", "image/png"); response.end(png);
    } else { response.statusCode = 404; response.end("Gone"); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const local = server.address();
  if (!local || typeof local === "string") throw new Error("Picture server has no port.");
  // Playwright fulfills bypass Chromium's CORS checks. A real TLS endpoint
  // provides the faithful red/green check; ignoreHTTPSErrors affects TLS only.
  const temporary = mkdtempSync(join(tmpdir(), "outside-pictures-"));
  const key = join(temporary, "key.pem"), cert = join(temporary, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  const secure = createSecureServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    if (request.url === "/open.png") response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Content-Type", "image/png"); response.end(png);
  });
  secure.listen(0, "127.0.0.1");
  await once(secure, "listening");
  const tls = secure.address();
  if (!tls || typeof tls === "string") throw new Error("TLS picture server has no port.");
  const corsErrors: string[] = [];
  page.on("console", message => { if (/CORS policy/.test(message.text())) corsErrors.push(message.text()); });
  try {
    await page.route("https://pictures.test/**", async route => {
      const upstream = await route.fetch({ url: `http://127.0.0.1:${local.port}${new URL(route.request().url()).pathname}` });
      await route.fulfill({ response: upstream });
    });
    await page.route("https://gone.test/**", route => route.abort("namenotresolved"));
    await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
    await editorMounted(page);
    const results = await page.evaluate(async (tlsPort) => {
      const violations: string[] = [];
      document.addEventListener("securitypolicyviolation", event => { violations.push(event.effectiveDirective); });
      const { readOutsidePicture } = await import("/src/page-builder/outside-pictures.ts");
      // Red/green proof: identical bytes and route setup; only ACAO differs.
      let closedReadRefused = false;
      try { await fetch("https://pictures.test/closed.png", { mode: "cors", credentials: "omit" }); }
      catch { closedReadRefused = true; }
      const routedClosed = await readOutsidePicture("https://pictures.test/closed.png");
      const open = await readOutsidePicture("https://pictures.test/open.png");
      const secureUrl = `https://127.0.0.1:${tlsPort}`;
      let realClosedReadRefused = false;
      try { await fetch(secureUrl + "/closed.png", { mode: "cors", credentials: "omit" }); }
      catch { realClosedReadRefused = true; }
      const realOpen = await readOutsidePicture(secureUrl + "/open.png");
      const closed = await readOutsidePicture(secureUrl + "/closed.png");
      const gone = await readOutsidePicture("https://gone.test/x.png");
      const missing = await readOutsidePicture("https://pictures.test/missing.png");
      return { open: open.status, closed: closed.status, gone: gone.status, missing: missing.status, closedReadRefused, routedClosed: routedClosed.status, realOpen: realOpen.status, realClosedReadRefused, violations };
    }, tls.port);
    expect(results).toEqual({ open: "read", closed: "not-allowed", gone: "gone", missing: "gone", closedReadRefused: false, routedClosed: "read", realOpen: "read", realClosedReadRefused: true, violations: [] });
    expect(corsErrors.length).toBeGreaterThan(0);
    await page.evaluate(async () => {
      const { monaco } = await import("/src/components/monaco.ts");
      const model = monaco.editor.getModels().find(model => model.uri.path.endsWith("/index.html"))!;
      model.setValue(model.getValue().replace("</body>", '<img id="outside-policy-picture" src="https://pictures.test/open.png"></body>'));
    });
    const image = page.frameLocator(".native-preview-frame").locator("#outside-policy-picture");
    await expect(image).toBeAttached();
    await expect.poll(() => image.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  } finally {
    secure.closeAllConnections();
    await new Promise<void>((resolve, reject) => secure.close(error => error ? reject(error) : resolve()));
    rmSync(temporary, { recursive: true, force: true });
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
