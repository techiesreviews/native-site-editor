// Edit component switch latency, measured on the production build.
//
//   npm run build:ui
//   ASE_NATIVE_SAVE_DIST=1 ASE_NATIVE_SAVE_PORT=5291 tsx tests/native-save/server.ts &
//   ASE_TEST_PORT=5291 tsx tests/perf/edit-component-latency.ts [runs] [label]
//
// Two builds compare fairly on a busy machine when their runs alternate:
// serve each (ASE_NATIVE_SAVE_DIST=<folder>) on its own port and list both,
// ASE_TEST_PORT=5291,5292; the labels follow (`before,after`).
//
// Each run loads index.html in a fresh page (network latency and bandwidth
// emulated throughout), lets it settle, throttles the CPU 4x, selects the
// first Project card through Page structure and clicks Edit component in the
// edit bar. Times from the click, in ms:
//   path     #current-page data-path is the template
//   code     the template's code shows in the code pane
//   focus    the template's editor has the caret (a key typed now lands)
//   preview  the edit bar is back over the template's root in the preview
//   typed    a Z typed at `focus` shows in the code
//   keyPaint from that keydown to the frame showing the Z
// It also lists the requests and the app's `ase:` performance marks inside
// the window, and prints medians.
import { chromium, type Page } from "@playwright/test";

const ports = (process.env.ASE_TEST_PORT ?? "5291").split(",").map(Number);
const runs = Number(process.argv[2] ?? 5);
const labels = (process.argv[3] ?? "").split(",");
const latency = Number(process.env.ASE_PERF_LATENCY ?? 100);
const cpu = Number(process.env.ASE_PERF_CPU ?? 4);
const verbose = process.env.ASE_PERF_VERBOSE === "1";
const TEMPLATE = "components/project-card/project-card.html";

type Result = Record<"path" | "code" | "focus" | "preview" | "typed" | "keyPaint", number> & {
  resources: { name: string; start: number; end: number; size: number }[];
  marks: { name: string; at: number; duration: number }[];
  longTasks: { at: number; duration: number }[];
};

async function once(page: Page, base: string): Promise<Result> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency, downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8,
  });
  await page.goto(`${base}/#repo=501&branch=main&file=index.html`);
  const frame = page.frameLocator(".native-preview-frame");
  await frame.locator(".hero h1").waitFor({ timeout: 60_000 });
  await page.locator("#content [role=textbox]").first().waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForTimeout(2500);
  const row = page.getByRole("treeitem", { name: "Section", exact: true });
  await row.locator(".page-structure__toggle").click();
  await page.getByRole("treeitem", { name: /^Project card Reusable cards$/ }).locator(".page-structure__label").click();
  const edit = page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Edit Project card component", exact: true });
  await edit.waitFor();
  await page.waitForTimeout(1500);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.evaluate((template) => {
    const w = window as unknown as { __perf: Record<string, number> & { t0?: number } };
    const perf: Record<string, number> & { t0?: number } = (w.__perf = {});
    performance.clearMarks();
    performance.clearResourceTimings();
    performance.setResourceTimingBufferSize(1000);
    const longTasks: { at: number; duration: number }[] = [];
    (w as unknown as { __long: typeof longTasks }).__long = longTasks;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push({ at: entry.startTime, duration: entry.duration });
    }).observe({ type: "longtask" });
    document.addEventListener("pointerdown", () => { perf.t0 ??= performance.now(); }, { capture: true, once: true });
    // A frame's start time, checked once it has painted (every rAF callback,
    // the app's and Monaco's, has run): each time is the frame that shows it.
    const check = (now: number) => {
      if (perf.t0 === undefined) return;
      if (perf.path === undefined && document.querySelector("#current-page")?.getAttribute("data-path") === template) perf.path = now;
      const lines = document.querySelector("#content .view-lines");
      if (perf.code === undefined && lines?.textContent?.includes("project-card__title")) perf.code = now;
      const active = document.activeElement;
      if (perf.focus === undefined && perf.code !== undefined && active?.closest("#content .monaco-editor")) perf.focus = now;
      // The edit bar over the template's root: its chip selects the page's instance.
      const bar = document.querySelector<HTMLElement>("[role=toolbar][aria-label='Edit bar']");
      if (perf.preview === undefined && perf.path !== undefined && document.querySelector(".component-banner") && bar?.checkVisibility() &&
          bar.querySelector("[title^='Select this Project card instance']")) perf.preview = now;
      if (perf.typed === undefined && perf.focus !== undefined && lines?.textContent?.includes("Z")) perf.typed = now;
    };
    document.addEventListener("keydown", (event) => { if (event.key === "Z") perf.key ??= performance.now(); }, true);
    const after = new MessageChannel();
    let frameAt = 0;
    after.port1.onmessage = () => check(frameAt);
    const frame = () => { frameAt = performance.now(); after.port2.postMessage(0); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }, TEMPLATE);
  const profile = process.env.ASE_PERF_PROFILE;
  if (profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await cdp.send("Profiler.start");
  }
  await edit.click();
  await page.waitForFunction(() => (window as unknown as { __perf: { focus?: number } }).__perf.focus !== undefined, null, { timeout: 30_000, polling: 5 });
  if (profile) {
    await page.waitForFunction(() => (window as unknown as { __perf: { preview?: number } }).__perf.preview !== undefined, null, { timeout: 30_000 });
    const { profile: data } = await cdp.send("Profiler.stop");
    (await import("node:fs")).writeFileSync(profile, JSON.stringify(data));
  }
  await page.keyboard.type("Z");
  await page.waitForFunction(() => {
    const perf = (window as unknown as { __perf: Record<string, number> }).__perf;
    return perf.typed !== undefined && perf.preview !== undefined;
  }, null, { timeout: 30_000 }).catch(async (error) => {
    console.log(await page.evaluate(() => JSON.stringify({ perf: (window as any).__perf, banner: !!document.querySelector(".component-banner"),
      bars: [...document.querySelectorAll("[class*=edit-bar]")].slice(0, 5).map((el) => el.className) })));
    throw error;
  });
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const perf = (window as unknown as { __perf: Record<string, number> & { t0: number } }).__perf;
    const t0 = perf.t0;
    const rel = (value: number) => Math.round(value - t0);
    return {
      path: rel(perf.path), code: rel(perf.code), focus: rel(perf.focus), preview: rel(perf.preview), typed: rel(perf.typed),
      keyPaint: Math.round(perf.typed - perf.key),
      resources: (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        .filter((entry) => entry.startTime >= t0)
        .map((entry) => ({ name: entry.name.replace(location.origin, ""), start: rel(entry.startTime), end: rel(entry.responseEnd), size: entry.transferSize })),
      marks: performance.getEntriesByType("mark").concat(performance.getEntriesByType("measure"))
        .filter((entry) => entry.name.startsWith("ase:") && entry.startTime >= t0)
        .map((entry) => ({ name: entry.name, at: rel(entry.startTime), duration: Math.round(entry.duration) })),
      longTasks: (window as unknown as { __long: { at: number; duration: number }[] }).__long
        .filter((task) => task.at >= t0).map((task) => ({ at: rel(task.at), duration: Math.round(task.duration) })),
    };
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return result;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const browser = await chromium.launch();
const results: Result[][] = ports.map(() => []);
try {
  for (let run = 0; run < runs; run++) {
    for (const [index, port] of ports.entries()) {
      const base = `http://127.0.0.1:${port}`;
      const name = labels[index] || String(port);
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", reducedMotion: "reduce" });
      // tsx keeps function names with a `__name` helper the page lacks.
      await context.addInitScript("globalThis.__name = (fn) => fn");
      const page = await context.newPage();
      // Workers spawned per mount, as the network sees them.
      const workers: string[] = [];
      page.on("worker", (worker) => workers.push(worker.url().replace(base, "")));
      const result = await once(page, base);
      results[index].push(result);
      console.log(`${name} run ${run + 1}: path ${result.path} code ${result.code} focus ${result.focus} preview ${result.preview} typed ${result.typed} keyPaint ${result.keyPaint}`);
      if (verbose || run === 0) {
        for (const resource of result.resources) console.log(`  req ${resource.start}→${resource.end} ${resource.size}B ${resource.name.slice(0, 100)}`);
        for (const mark of result.marks) console.log(`  mark ${mark.at}${mark.duration ? ` +${mark.duration}` : ""} ${mark.name}`);
        for (const task of result.longTasks) console.log(`  long ${task.at} +${task.duration}`);
        console.log(`  workers this page: ${workers.join(", ")}`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const keys = ["path", "code", "focus", "preview", "typed", "keyPaint"] as const;
for (const [index, port] of ports.entries())
  console.log(`${labels[index] || port}: median of ${runs} (latency ${latency}ms, cpu ${cpu}x): ` +
    keys.map((key) => `${key} ${median(results[index].map((result) => result[key]))}`).join("  "));
