import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Nightly, default native-starter fixture. Make component supplies a real
// CSS plan note. ASE_EDIT_MODE_SHOTS=<dir> saves each bar and colour scheme.
const bar = (page: Page) => page.locator(".canvas-bar");
async function checkControls(page: Page, withNote = true) {
  await expect(bar(page)).toHaveAttribute("data-fit", /full|note|used|wrap/);
  await expect.poll(() => bar(page).evaluate((element) => {
    const controls = [...element.querySelectorAll<HTMLElement>(".edit-mode__title, button, input")].filter((control) => control.getBoundingClientRect().width > 0);
    const rects = controls.map((control) => control.getBoundingClientRect());
    return controls.every((control, i) => {
      const r = rects[i];
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
        && (hit === control || control.contains(hit))
        && rects.every((other, j) => i === j || r.right <= other.left || other.right <= r.left || r.bottom <= other.top || other.bottom <= r.top);
    });
  })).toBe(true);
  const notes = withNote ? [".edit-mode__note-text", ".edit-mode__note-dismiss"] : [];
  for (const selector of [".edit-mode__title", ".canvas-component__used", ...notes, ".canvas-component__done", ".canvas-width__input"])
    await expect(bar(page).locator(selector)).toBeVisible();
  await expect(bar(page).locator(".canvas-device:visible")).toHaveCount(3);
  const controls = bar(page).locator("button:visible, input:visible");
  for (const control of await controls.all()) await control.click({ trial: true });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`Edit mode bar fits 1440, 1200, 1024, 760 and 390 with a plan note (${colorScheme})`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(baseURL!);
    const home = readFileSync("fixtures/native-starter/index.html", "utf8").replace("Edit plain HTML", "Edit <em>plain</em> HTML");
    const css = `${readFileSync("fixtures/native-starter/styles/site.css", "utf8")}\n.hero .lead em { font-style: italic; }\n`;
    for (const [path, content] of [["index.html", home], ["styles/site.css", css]])
      expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
    await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
    await page.getByRole("treeitem", { name: "Section A native browser preview", exact: true }).locator(".page-structure__label").first().click();
    await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Make component", exact: true }).click();
    await expect(bar(page).locator(".edit-mode__note-text")).toHaveAccessibleName(/Note:.*1 rule can't follow.*1 note/);
    // The fixture's bar takes each stage in order: the note's words go first, then "used on", then it wraps.
    const stages = { 1440: "full", 1200: "note", 1024: "used", 760: "wrap", 390: "wrap" } as const;
    for (const width of [1440, 1200, 1024, 760, 390] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(bar(page)).toHaveAttribute("data-fit", stages[width]);
      await checkControls(page);
      const full = stages[width] === "full";
      await expect(bar(page).locator(".edit-mode__note-label")).toBeVisible({ visible: full });
      await expect(bar(page).locator(".edit-mode__note-count")).toBeVisible({ visible: !full });
      const short = stages[width] === "used" || stages[width] === "wrap";
      await expect(bar(page).locator(".canvas-component__used-label")).toBeVisible({ visible: !short });
      await expect(bar(page).locator(".canvas-component__used-short")).toHaveText("1 page");
      await expect(bar(page).locator(".canvas-component__used-short")).toBeVisible({ visible: short });
      await expect(bar(page).locator(".canvas-component__used")).toHaveAccessibleName("used on 1 page");
      await expect(bar(page).locator(".edit-mode__note-text")).toHaveAccessibleName(/Note:.*1 rule can't follow.*1 note/);
      await expect(bar(page).locator(".edit-mode__note-count")).toHaveText("1");
      await bar(page).locator(".edit-mode__note-text").click();
      await expect(page.locator("#edit-mode-notes")).toBeVisible();
      await page.keyboard.press("Escape");
      await bar(page).locator(".canvas-component__used").click();
      await expect(page.locator("#component-used-on")).toBeVisible();
      await page.keyboard.press("Escape");
      for (const device of ["mobile", "tablet", "desktop"]) {
        await bar(page).locator(`[data-device="${device}"]`).click();
        await expect(bar(page).locator(`[data-device="${device}"]`)).toHaveAttribute("aria-pressed", "true");
      }
      if (process.env.ASE_EDIT_MODE_SHOTS) await bar(page).screenshot({ path: `${process.env.ASE_EDIT_MODE_SHOTS}/bar-${width}-${colorScheme}.png` });
    }
    // At the narrowest width: dismissing the note still fits, and Done leaves.
    await bar(page).getByRole("button", { name: "Dismiss the notes", exact: true }).click();
    await expect(bar(page).locator(".edit-mode__note")).toHaveCount(0);
    await checkControls(page, false);
    await expect(bar(page).getByRole("button", { name: "Done editing component", exact: true })).toBeFocused();
    await bar(page).getByRole("button", { name: "Done editing component", exact: true }).click();
    await expect(bar(page).locator(".edit-mode__title")).toHaveCount(0);
    await expect(bar(page)).not.toHaveAttribute("data-fit", /.+/);
    expect(errors).toEqual([]);
  });
}
