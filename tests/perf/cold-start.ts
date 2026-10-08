// Cold start timing: the yardstick for the lean, fast-starting editor
// (docs/wayfinder/lean-fast-editor/research/01-cold-start-baseline.md).
//
// Locally, against the production build and the fake GitHub server:
//   npm run build:ui
//   ASE_NATIVE_SAVE_DIST=1 ASE_NATIVE_SAVE_PORT=5293 tsx tests/native-save/server.ts &
//   ASE_COLD_BASE=http://127.0.0.1:5293 tsx tests/perf/cold-start.ts [runs]
//
// Against a deployed editor, signed in through a saved storage state (made
// once by hand: see the findings file for the command):
//   ASE_COLD_BASE=https://preview-editor.techies.tools ASE_COLD_STORAGE=.scratch/preview-editor-state.json \
//   ASE_COLD_HASH='#repo=<id>&branch=main&file=index.html' tsx tests/perf/cold-start.ts [runs]
// Without ASE_COLD_STORAGE a deployed editor is measured signed out (the
// shell and /api/session only).
//
// Each run is a cold load (a new browser context: empty HTTP cache, no
// storage) followed by a warm load (page.reload() in the same context).
// Times are ms from navigation start of the top document:
//   session   /api/session response end (resource timing)
//   paint     first preview paint: first-contentful-paint inside the preview
//             iframe (the srcdoc frame paints nothing until the runtime has
//             rendered the page into #page)
//   usable    the later of paint and the Page structure tree listing a node
//             (the runtime is ready and has reported the page's structure,
//             so a click in the preview selects and shows the edit bar)
//   monaco    a Monaco editor has rendered code (.monaco-editor .view-lines
//             has text)
// Bytes are encoded (on-the-wire body) sizes of responses that finished before
// the first preview paint, with the largest listed.
//
// Network: ASE_COLD_NET=none (default) or "<latency ms>/<down Mbps>", e.g.
// 100/20, applied through CDP to the page (workers are not throttled).
// ASE_COLD_JSON=path writes every run's raw numbers.
// ASE_COLD_WATERFALL=1 lists the /api requests and the preview runtime before paint (first cold and warm run).
import { chromium, type BrowserContext, type Page, type Request } from "@playwright/test";
import { writeFileSync } from "node:fs";

const base = (process.env.ASE_COLD_BASE ?? "http://127.0.0.1:5293").replace(/\/$/, "");
const hash = process.env.ASE_COLD_HASH ?? "#repo=501&branch=main&file=index.html";
const storage = process.env.ASE_COLD_STORAGE;
const runs = Number(process.argv[2] ?? 5);
const net = process.env.ASE_COLD_NET ?? "none";
const timeout = Number(process.env.ASE_COLD_TIMEOUT ?? 60_000);

// Runs in every frame before its scripts: records absolute (epoch ms) times.
const INIT = `(() => {
  const now = () => performance.timeOrigin + performance.now();
  const rec = (window.__cold = {});
  if (window.top === window) {
    const check = () => {
      if (!rec.usable && document.querySelector('[role=tree][aria-label="Page structure"] [role=treeitem]')) rec.usable = now();
      if (!rec.monaco && [...document.querySelectorAll('.monaco-editor .view-lines')].some((e) => e.textContent.trim())) rec.monaco = now();
      if (!rec.monacoEl && document.querySelector('.monaco-editor')) rec.monacoEl = now();
    };
    new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true });
  } else {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'first-contentful-paint' && !rec.fcp) rec.fcp = performance.timeOrigin + e.startTime;
    }).observe({ type: 'paint', buffered: true });
  }
})();`;

interface Res { url: string; start: number; end: number; bytes: number; type: string }
interface Run {
  session: number | null; paint: number | null; usable: number | null; monaco: number | null;
  bytesBeforePaint: number; requestsBeforePaint: number; bytesTotal: number;
  top: { name: string; bytes: number }[]; signedIn: boolean;
  waterfall: { name: string; start: number; end: number; bytes: number }[];
}

function short(url: string) {
  const u = new URL(url);
  return (u.origin === base ? "" : u.host) + u.pathname.replace(/-[A-Za-z0-9_]{8}\.(js|css)$/, ".$1");
}

function track(context: BrowserContext) {
  const list: Res[] = [];
  const on = async (request: Request) => {
    try {
      const sizes = await request.sizes();
      const timing = request.timing();
      const end = timing.responseEnd >= 0 ? timing.startTime + timing.responseEnd : Date.now();
      list.push({ url: request.url(), start: timing.startTime, end, bytes: sizes.responseBodySize, type: request.resourceType() });
    } catch { /* the request's context went away */ }
  };
  context.on("requestfinished", (request) => void on(request));
  return list;
}

async function throttle(page: Page) {
  if (net === "none") return;
  const [latency, mbps] = net.split("/").map(Number);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency, downloadThroughput: (mbps * 1024 * 1024) / 8, uploadThroughput: (mbps * 1024 * 1024) / 8 / 4,
  });
}

async function measure(page: Page, resources: Res[], load: () => Promise<unknown>): Promise<Run> {
  resources.length = 0;
  const sessionResponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/session", { timeout });
  await load();
  const origin = await page.evaluate(() => performance.timeOrigin);
  const response = await sessionResponse;
  const body = await response.json().catch(() => ({}));
  const signedIn = Boolean(body?.user);
  const timing = response.request().timing();
  const session = timing.responseEnd >= 0 ? timing.startTime + timing.responseEnd - origin : null;
  let paint: number | null = null;
  let usable: number | null = null;
  let monaco: number | null = null;
  if (signedIn) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const top = await page.evaluate(() => (window as unknown as { __cold: Record<string, number> }).__cold);
      for (const frame of page.frames()) {
        if (frame === page.mainFrame() || paint !== null) continue;
        const fcp = await frame.evaluate(() => (window as unknown as { __cold?: { fcp?: number } }).__cold?.fcp).catch(() => undefined);
        if (fcp) paint = fcp - origin;
      }
      // Selectable once the structure is in and the page is on screen.
      usable = top.usable && paint !== null ? Math.max(top.usable - origin, paint) : null;
      monaco = top.monaco ? top.monaco - origin : null;
      if (paint !== null && usable !== null && monaco !== null) break;
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(1000); // let in-flight responses report
  } else {
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }
  const cutoff = paint === null ? Infinity : origin + paint;
  const before = resources.filter((r) => r.end <= cutoff);
  const grouped = new Map<string, number>();
  for (const r of before) grouped.set(short(r.url), (grouped.get(short(r.url)) ?? 0) + r.bytes);
  const top = [...grouped].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes).slice(0, 8);
  return {
    session, paint, usable, monaco, signedIn,
    bytesBeforePaint: before.reduce((sum, r) => sum + r.bytes, 0),
    requestsBeforePaint: before.length,
    bytesTotal: resources.reduce((sum, r) => sum + r.bytes, 0),
    top,
    // The editor's own data requests (/api/…) and the preview runtime that finished before paint, in start order.
    waterfall: before.filter((r) => /^\/api\/|native-preview-runtime/.test(new URL(r.url).pathname)).sort((a, b) => a.start - b.start)
      .map((r) => ({ name: short(r.url) + new URL(r.url).search.slice(0, 60), start: r.start - origin, end: r.end - origin, bytes: r.bytes })),
  };
}

const median = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const ms = (v: number | null) => (v === null ? "—" : `${Math.round(v)}`);
const kb = (v: number | null) => (v === null ? "—" : `${(v / 1024).toFixed(0)} KB`);

async function main() {
  const browser = await chromium.launch();
  const cold: Run[] = [];
  const warm: Run[] = [];
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 }, colorScheme: "light",
      ...(storage ? { storageState: storage } : {}),
    });
    await context.addInitScript(INIT);
    const resources = track(context);
    const page = await context.newPage();
    await throttle(page);
    cold.push(await measure(page, resources, () => page.goto(`${base}/${hash}`)));
    warm.push(await measure(page, resources, () => page.reload()));
    await context.close();
    const c = cold.at(-1)!, w = warm.at(-1)!;
    console.log(`run ${i + 1}: cold session ${ms(c.session)} paint ${ms(c.paint)} usable ${ms(c.usable)} monaco ${ms(c.monaco)} ${kb(c.bytesBeforePaint)} | warm session ${ms(w.session)} paint ${ms(w.paint)} usable ${ms(w.usable)} monaco ${ms(w.monaco)} ${kb(w.bytesBeforePaint)}`);
  }
  await browser.close();
  if (!cold[0].signedIn) console.log("\nSigned out: only the shell and /api/session were measured.");
  console.log(`\n${base} net=${net} runs=${runs} (median ms from navigation start)`);
  console.log("        session  paint  usable  monaco  bytes<paint  reqs<paint  bytes total");
  for (const [label, set] of [["cold", cold], ["warm", warm]] as const) {
    console.log(`${label.padEnd(8)}${ms(median(set.map((r) => r.session))).padStart(7)}${ms(median(set.map((r) => r.paint))).padStart(7)}${ms(median(set.map((r) => r.usable))).padStart(8)}${ms(median(set.map((r) => r.monaco))).padStart(8)}${kb(median(set.map((r) => r.bytesBeforePaint))).padStart(13)}${String(median(set.map((r) => r.requestsBeforePaint))).padStart(12)}${kb(median(set.map((r) => r.bytesTotal))).padStart(13)}`);
  }
  console.log("\nTop bytes before first preview paint (cold, run 1):");
  for (const r of cold[0].top) console.log(`  ${kb(r.bytes).padStart(8)}  ${r.name}`);
  // ASE_COLD_WATERFALL=1: the /api requests and the runtime before paint of the first cold and warm runs.
  if (process.env.ASE_COLD_WATERFALL === "1")
    for (const [label, run] of [["cold", cold[0]], ["warm", warm[0]]] as const) {
      console.log(`\n/api requests and runtime before first preview paint (${label}, run 1): start–end ms, bytes`);
      for (const r of run.waterfall) console.log(`  ${ms(r.start).padStart(6)}–${ms(r.end).padEnd(6)} ${kb(r.bytes).padStart(7)}  ${r.name}`);
    }
  if (process.env.ASE_COLD_JSON) writeFileSync(process.env.ASE_COLD_JSON, JSON.stringify({ base, net, cold, warm }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
