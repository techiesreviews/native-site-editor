import { expect, test, type Browser, type Page } from "@playwright/test";
import { clickOnText } from "./click-text";
import { editorMounted } from "./drafts";
import { bestRound } from "./latency-budget";

// Edits feel instant (clean-up ticket 38): after typing, finishing a text, a
// block move, a drop, a Page Structure move, Undo and Redo, a keystroke at any
// moment of the 1.5 s that follow runs within 100 ms (and a click on a Page
// Structure row right after a move shows it selected within 100 ms), and no main-thread task
// runs over 50 ms, on the real starter with the CPU slowed 2×. An action
// passes when one of its two rounds, each in a fresh session, meets both
// budgets (latency-budget.ts), so another suite's load spike does not fail it.
// ASE_LATENCY_REPORT=1 prints each action's numbers and the scripts of its long
// frames instead of failing on them; ASE_LATENCY_PROFILE=<dir> also writes each
// action's CPU profile there (open in DevTools); ASE_LATENCY_SLOWDOWN=<n>
// measures at another CPU slowdown; ASE_LATENCY_ROUNDS=<n> runs n rounds.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
// The trace's DOM snapshots are main-thread work of their own.
test.use({ trace: "off", screenshot: "off" });
const SLOWDOWN = Number(process.env.ASE_LATENCY_SLOWDOWN ?? 2), ROUNDS = Number(process.env.ASE_LATENCY_ROUNDS ?? 2);
const NEXT_INPUT_MS = 100, LONG_TASK_MS = 50, WATCH_MS = 1500;
const report = !!process.env.ASE_LATENCY_REPORT, profiles = process.env.ASE_LATENCY_PROFILE;

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const order = (page: Page) => frame(page).locator("main > *").evaluateAll((els) => els.map((el) => el.localName));
const cards = (page: Page) => frame(page).locator("#work .cards > card-project > h3").allTextContents();
const SECTIONS = ["section-hero", "section-feature", "section", "section-contact"];
const FEATURE_UP = ["section-feature", "section-hero", "section", "section-contact"];

// The editor notes its long tasks (the preview's among them: same origin, same thread) and, for
// the report, which scripts ran in each long frame.
type Notes = { long: { start: number; duration: number }[]; frames: string[]; selected?: number };
declare global { interface Window { __latency: Notes } }
interface LongFrame extends PerformanceEntry { scripts: { duration: number; invoker: string; sourceFunctionName: string; sourceURL: string }[] }
const recorder = () => {
  const notes: Notes = window.__latency = { long: [], frames: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) notes.long.push({ start: performance.timeOrigin + e.startTime, duration: e.duration });
  }).observe({ type: "longtask" });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as LongFrame[])
      notes.frames.push(`${Math.round(performance.timeOrigin + e.startTime)}+${Math.round(e.duration)}: ${e.scripts.filter((x) => x.duration >= 5)
        .map((x) => `${x.invoker}${x.sourceFunctionName ? ` ${x.sourceFunctionName}` : ""} ${x.sourceURL.split("/").pop()} ${Math.round(x.duration)}`).join("; ")}`);
  }).observe({ type: "long-animation-frame" });
};
const notes = (page: Page) => page.evaluate(() => window.__latency);
const clock = (page: Page) => page.evaluate(() => performance.timeOrigin + performance.now());

type Result = { action: string; nextInput: number; longest: number; long: string[] };

/**
 * `change`, then a harmless key (Shift) pressed again and again for 1.5 s, as a next keystroke may
 * come at any moment: the longest any press took to be handled (the browser's answer to the test
 * included; a slowed CPU stamps a keystroke only once it runs), and the long tasks meanwhile.
 */
async function measure(page: Page, results: Result[], action: string, change: () => Promise<void>, settled: () => Promise<void>, click?: () => Promise<number>) {
  const cdp = profiles ? await page.context().newCDPSession(page) : undefined;
  if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.start"); }
  const start = await clock(page), until = Date.now() + WATCH_MS;
  await change();
  // A click as the next input, when given: how long until it shows; the keystrokes follow it.
  const clicked = click ? await click() : undefined;
  let nextInput = clicked ?? 0;
  while (Date.now() < until) {
    const pressed = Date.now();
    await page.keyboard.press("Shift");
    nextInput = Math.max(nextInput, Date.now() - pressed);
  }
  await settled();
  const seen = await notes(page), within = (at: number) => at >= start && at < start + WATCH_MS;
  if (cdp) {
    const { profile } = await cdp.send("Profiler.stop");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(profiles!, { recursive: true });
    writeFileSync(`${profiles}/${action.replace(/\W+/g, "-")}-${results.length}.cpuprofile`, JSON.stringify(profile));
    await cdp.detach();
  }
  const long = seen.long.filter((task) => within(task.start));
  const result = { action, nextInput, longest: Math.round(Math.max(0, ...long.map((task) => task.duration))), long: long.map((task) => `${Math.round(task.start - start)}+${Math.round(task.duration)}`) };
  results.push(result);
  if (!report) return;
  console.log(`${action}:${clicked === undefined ? "" : ` click shown in ${clicked} ms,`} next input ${result.nextInput} ms, longest task ${result.longest} ms [${result.long.join(", ")}]`);
  for (const line of seen.frames) if (within(Number(line.split("+")[0]))) console.log(`  frame ${Math.round(Number(line.split("+")[0]) - start)}${line.slice(line.indexOf("+"))}`);
}

async function pointIn(page: Page, selector: string, fx: number, fy: number) {
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const r = await frame(page).locator(selector).first().evaluate((el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  return { x: box.x + r.left + r.width * fx, y: box.y + r.top + r.height * fy };
}

/**
 * Readies a click on `name`'s row, read before the change (Page Structure redraws its rows
 * after it, and this row keeps its place): the click then resolves to the ms from the click
 * until the row shows selected (`aria-selected`; the tree is watched, its rows being redrawn).
 */
async function rowClick(page: Page, name: RegExp) {
  const box = (await tree(page).getByRole("treeitem", { name }).first().locator(".page-structure__label").boundingBox())!;
  await tree(page).evaluate((root, source) => {
    const named = new RegExp(source);
    const selected = () => [...root.querySelectorAll("[role='treeitem'][aria-selected='true']")].some((row) => named.test(row.textContent ?? ""));
    window.__latency.selected = undefined;
    new MutationObserver((_, observer) => {
      if (!selected()) return;
      window.__latency.selected = performance.timeOrigin + performance.now();
      observer.disconnect();
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-selected"] });
  }, name.source);
  return async () => {
    const clicked = await clock(page);
    await page.mouse.click(box.x + 12, box.y + box.height / 2);
    await expect.poll(() => page.evaluate(() => window.__latency.selected)).toBeDefined();
    return Math.round((await page.evaluate(() => window.__latency.selected))! - clicked);
  };
}

/** One round in a fresh session (its own copy of the fake repository and its own drafts). */
async function round(browser: Browser, baseURL: string): Promise<Result[]> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1400, height: 1100 }, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage(), results: Result[] = [];
  try {
    await page.addInitScript(recorder);
    await page.goto("/#repo=501&branch=main&file=index.html");
    const heading = frame(page).locator("section-hero > h1");
    await expect(heading).toBeVisible({ timeout: 30_000 });
    await editorMounted(page);
    await expect(tree(page).getByRole("treeitem", { name: /^Section feature/ })).toBeVisible();
    // fixed-wait: boot's deferred work (text index, usage check) finishes before the clock starts.
    await page.waitForTimeout(3000);
    await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: SLOWDOWN });

    await clickOnText(heading);
    await expect(heading).toHaveAttribute("contenteditable", /.+/);
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" Wo");
    await measure(page, results, "type a letter", () => page.keyboard.press("r"), () => expect(heading).toHaveText(/ Wor$/));
    await measure(page, results, "finish the text (Enter)", () => page.keyboard.press("Enter"),
      () => expect(heading).not.toHaveAttribute("contenteditable", /.+/));

    await frame(page).locator("section-feature").evaluate((el) => (el as HTMLElement).click());
    await expect(bar(page).locator(".edit-bar__kind")).toContainText(/feature/i);
    await page.locator(".native-preview-frame").focus();
    await measure(page, results, "move a block (Alt+Up)", () => page.keyboard.press("Alt+ArrowUp"), () => expect.poll(() => order(page)).toEqual(FEATURE_UP));

    await page.locator(".native-preview-frame").focus();
    await measure(page, results, "Undo the move", () => page.keyboard.press("ControlOrMeta+Z"), () => expect.poll(() => order(page)).toEqual(SECTIONS));
    await page.locator(".native-preview-frame").focus();
    await measure(page, results, "Undo the text", () => page.keyboard.press("ControlOrMeta+Z"), () => expect(heading).toHaveText(/headline for the page\.$/));
    await page.locator(".native-preview-frame").focus();
    await measure(page, results, "Redo the text", () => page.keyboard.press("ControlOrMeta+Shift+Z"), () => expect(heading).toHaveText(/ Wor$/));

    await tree(page).getByRole("treeitem", { name: /^Section feature/ }).first().locator(".page-structure__label").click();
    await measure(page, results, "Page Structure move (Alt+Up)", () => page.keyboard.press("Alt+ArrowUp"), () => expect.poll(() => order(page)).toEqual(FEATURE_UP));
    // The next input a click: another row, selected at once after the move back.
    const click = await rowClick(page, /^Section contact/);
    await tree(page).getByRole("treeitem", { name: /^Section feature/ }).first().focus();
    await measure(page, results, "Page Structure move, then a click on a row", () => page.keyboard.press("Alt+ArrowDown"),
      () => expect.poll(() => order(page)).toEqual(SECTIONS), click);

    const before = await cards(page);
    await frame(page).locator("#work .cards").scrollIntoViewIfNeeded();
    const from = await pointIn(page, "#work .cards > card-project:nth-child(1)", 0.5, 0.15);
    const to = await pointIn(page, "#work .cards > card-project:nth-child(2)", 0.97, 0.5);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(page.locator(".pb-drag-ghost")).toBeVisible();
    await measure(page, results, "drop a block", () => page.mouse.up(), () => expect.poll(() => cards(page)).toEqual([before[1], before[0], before[2]]));
    return results;
  } finally {
    await context.close();
  }
}

test("each edit and Undo takes the next input at once, with no long task after it", { tag: "@actual" }, async ({ browser, baseURL }) => {
  test.setTimeout(120_000 * ROUNDS);
  const rounds: Result[][] = [];
  for (let n = 0; n < ROUNDS; n++) {
    if (report) console.log(`--- round ${n + 1}, CPU slowed ${SLOWDOWN}×`);
    rounds.push(await round(browser, baseURL!));
  }
  if (report) return;
  for (const [index, { action }] of rounds[0].entries()) {
    const tries = rounds.map((results) => results[index]);
    const said = tries.map((result) => `next input ${result.nextInput} ms, tasks [${result.long.join(", ")}]`).join(" / ");
    const { passed, round: closest } = bestRound(tries, { nextInput: NEXT_INPUT_MS, longest: LONG_TASK_MS });
    expect.soft(passed, `${action}: no round met both budgets (keystroke ${NEXT_INPUT_MS} ms, task ${LONG_TASK_MS} ms); closest: next input ${closest.nextInput} ms, longest task ${closest.longest} ms (rounds: ${said})`).toBe(true);
  }
});
