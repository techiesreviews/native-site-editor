import { expect, test, type Page } from "@playwright/test";
import { requireActualFixture } from "./fixture-contract";

// Structure reads the draft store, not Monaco (06c2469): painted before the
// code editor module loads, it already has its component fields (instance
// rows, slot badges, slot-only rows), and keeps exactly those once the editor
// mounts on the same bytes, with no source edit in between.
// Runs on the actual starter: ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
requireActualFixture();

const counts = (page: Page) => page.evaluate(() => ({
  rows: document.querySelectorAll('[aria-label="Page structure"] [role=treeitem]').length,
  instanceRows: document.querySelectorAll(".page-structure__row--instance").length,
  slotBadges: document.querySelectorAll(".page-structure__slot-badge").length,
  slotOnly: document.querySelectorAll(".page-structure__row--slot-only").length,
  monaco: document.querySelectorAll("#content .monaco-editor").length,
}));
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);

async function openHeld(page: Page, baseURL: string | undefined, codeHidden: boolean) {
  // Hold the real code editor module request until Structure has painted once.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/src\/components\/code-editor\.ts(\?|$)/, async (route) => { await held; await route.continue(); });
  if (codeHidden) await page.addInitScript(() => { try { localStorage.setItem("astro-editor.code-height", JSON.stringify({ height: 0.4, collapsed: true })); } catch { /* storage off */ } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator('[aria-label="Page structure"] [role=treeitem]').first()).toBeVisible({ timeout: 30_000 });
  // The component fields arrive with the first paint's bytes, while Monaco is still held.
  await expect.poll(async () => {
    const { slotBadges, instanceRows, slotOnly } = await counts(page);
    return slotBadges > 0 && instanceRows > 0 && slotOnly > 0;
  }, { timeout: 15_000 }).toBe(true);
  const before = await counts(page);
  expect(before.monaco).toBe(0);
  release();
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
  return before;
}

for (const codeHidden of [false, true]) {
  test(`Structure has component fields before the editor mounts and keeps them on the same bytes${codeHidden ? " (code pane hidden)" : ""}`, { tag: "@actual" }, async ({ page, baseURL }) => {
    const before = await openHeld(page, baseURL, codeHidden);
    const start = await source(page);
    expect(typeof start).toBe("string");
    expect(start!.length).toBeGreaterThan(0);
    if (codeHidden) await expect(page.getByRole("separator", { name: "Resize code" })).toHaveAttribute("aria-valuenow", "0");
    // Once the editor has mounted, Structure shows the same rows and fields as before.
    if (!codeHidden) await expect.poll(async () => (await counts(page)).monaco, { timeout: 15_000 }).toBeGreaterThan(0);
    const { monaco: _before, ...fields } = before;
    await expect.poll(async () => { const { monaco: _monaco, ...after } = await counts(page); return after; }, { timeout: 15_000 }).toEqual(fields);
    // No source edit was needed for the fields to appear.
    expect(await source(page)).toBe(start);
    if (process.env.ASE_READINESS_SHOTS) await page.screenshot({ path: `${process.env.ASE_READINESS_SHOTS}/readiness-after-mount${codeHidden ? "-code-hidden" : ""}.png` });
  });
}
