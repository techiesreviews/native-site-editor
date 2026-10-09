import { expect, test, type Locator, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// The edit bar reads as groups (name, style, content, arrange: moves, Move to,
// duplicate, delete, add) split by thin
// rules that are decoration only: hidden from assistive tech, not focusable,
// and never between two controls of the same group.
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent("index.html")}`;

// Every rule leads its group; no line of the bar ends on a rule, and each
// rule is decoration only.
async function groupLayout(bar: Locator) {
  return bar.evaluate((el) => {
    const items = [...el.querySelectorAll<HTMLElement>(".edit-bar__kind, button, select, .edit-bar__rule")].filter((item) => item.getClientRects().length);
    return items.map((item) => {
      const r = item.getBoundingClientRect();
      return {
        rule: item.classList.contains("edit-bar__rule"),
        leads: item.classList.contains("edit-bar__rule") && item.parentElement!.classList.contains("edit-bar__group") && item.parentElement!.firstElementChild === item,
        hidden: item.getAttribute("aria-hidden"),
        tabindex: item.getAttribute("tabindex"),
        label: item.getAttribute("aria-label") ?? item.textContent ?? "",
        top: Math.round(r.top), mid: r.top + r.height / 2, width: r.width, right: r.right,
      };
    });
  });
}

function expectRulesAttached(layout: Awaited<ReturnType<typeof groupLayout>>) {
  const rules = layout.filter((entry) => entry.rule);
  expect(rules.length).toBeGreaterThan(0);
  for (const rule of rules) expect(rule).toMatchObject({ leads: true, hidden: "true", tabindex: null, width: 1 });
  expect(layout[0].rule).toBe(false);
  expect(layout.at(-1)!.rule).toBe(false);
  layout.forEach((entry, i) => {
    if (!entry.rule) return;
    // The control after a rule shares its line: a wrap moves both together.
    expect(Math.abs(layout[i + 1].mid - entry.mid)).toBeLessThan(4);
  });
}

const sameRow = (layout: Awaited<ReturnType<typeof groupLayout>>, a: string, b: string) => {
  const one = layout.find((entry) => entry.label === a)!; const two = layout.find((entry) => entry.label === b)!;
  return Math.abs(one.mid - two.mid) < 4;
};

test("the bar's controls sit in groups split by decorative rules", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  const heading = page.frameLocator(".native-preview-frame").locator(".hero h1");
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await heading.click();
  const bar = page.getByRole("toolbar", { name: "Edit bar" });
  await expect(bar).toBeVisible();
  expectRulesAttached(await groupLayout(bar));
  // Group wrappers add no roles or names.
  for (const group of await bar.locator(".edit-bar__group").all()) {
    expect(await group.evaluate((el) => [el.getAttribute("role"), el.getAttribute("aria-label"), el.getAttribute("tabindex")])).toEqual([null, null, null]);
  }
});

const editor = (page: Page) => ({
  source: () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!),
  undo: async () => expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true),
});

// An ordinary section: a paragraph with a real link, a sibling, and a second
// section to move into.
async function ordinaryMain(page: Page) {
  await page.evaluate(async () => {
    const code = await import("/src/components/code-editor.ts");
    const before = code.getMountedSource("index.html")!;
    const next = before.replace(/(<main[^>]*>)[\s\S]*?<\/main>/, '$1\n<section id="first"><p id="moving">Moving <a id="lnk" href="/">home link</a> text</p><p id="second">Second paragraph</p></section>\n<section id="target"><p>Target paragraph</p></section>\n</main>');
    code.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: next });
  });
}

test("in a 340px canvas, groups wrap whole and keep keyboard order", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto(`${baseURL}/${nativeHash}`);
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
  await ordinaryMain(page);
  await expect(frame.locator("#moving")).toBeVisible();
  await page.getByRole("separator", { name: "Resize code pane", exact: true }).click();
  const width = page.getByRole("textbox", { name: "Frame width in pixels" });
  await width.fill("340");
  await width.press("Enter");
  const canvas = (await page.locator(".native-preview-frame").boundingBox())!;
  expect(canvas.width).toBeLessThan(400);
  const bar = page.getByRole("toolbar", { name: "Edit bar", exact: true });
  const { source, undo } = editor(page);
  let wrapped = 0;

  async function check(mustShare: [string, string][]) {
    await expect(bar).toBeVisible();
    const layout = await groupLayout(bar);
    expectRulesAttached(layout);
    if (new Set(layout.map((entry) => entry.top)).size > 1) wrapped++;
    const box = (await bar.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    // A wrapped panel ends at its widest row, with no empty space after it.
    const rightGap = await bar.evaluate((el) => {
      const panel = el.querySelector(":scope > .edit-bar__controls")!;
      const controls = [...panel.querySelectorAll(".edit-bar__group > :not(.edit-bar__rule)")].filter((control) => control.getClientRects().length);
      return panel.getBoundingClientRect().right - Math.max(...controls.map((control) => control.getBoundingClientRect().right));
    });
    expect(rightGap).toBeGreaterThanOrEqual(0); // no control past the panel's end
    expect(rightGap).toBeLessThanOrEqual(6);
    const labels = layout.map((entry) => entry.label);
    for (const [a, b] of mustShare) {
      expect(labels).toContain(a); expect(labels).toContain(b);
      expect(sameRow(layout, a, b), `${a} beside ${b}`).toBe(true);
    }
    // Tab walks the enabled controls in DOM order across group wrappers.
    const controls = await bar.evaluate((el) => [...el.querySelectorAll<HTMLElement>("button:not([disabled]), select")].map((c) => c.getAttribute("aria-label") ?? c.textContent));
    await bar.locator("button:not([disabled]), select").first().focus();
    const walked = [];
    for (let i = 0; i < controls.length; i++) {
      walked.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent));
      if (i < controls.length - 1) await page.keyboard.press("Tab");
    }
    expect(walked).toEqual(controls);
  }

  // The link: Bold, Italic and its Address stay one content group.
  await frame.locator("#lnk").click();
  await expect(bar.locator(".edit-bar__kind")).toHaveText("Link");
  await check([["Bold", "Italic"], ["Italic", "Address"]]);
  await expect(bar.getByRole("button", { name: "Make component", exact: true })).toHaveCount(0);

  // The paragraph: Bold/Italic together, and no move controls (only a
  // whole section moves from the bar). Select the paragraph itself so the
  // click does not hit an edit-bar control.
  await frame.locator("#moving").evaluate((el) => (el as HTMLElement).click());
  await expect(bar.locator(".edit-bar__kind")).toHaveText("Paragraph");
  await check([["Bold", "Italic"]]);
  await expect(bar.getByRole("button", { name: "Make component", exact: true })).toHaveCount(0);
  for (const name of ["Move up", "Move down", "Move to"]) await expect(bar.getByRole("button", { name, exact: true })).toHaveCount(0);
  // The section: its moves share the arrange group, beside Duplicate.
  await frame.locator("#first").evaluate((el) => (el as HTMLElement).click());
  await check([["Move up", "Move down"], ["Move down", "Duplicate"]]);
  // The narrow canvas really makes the bar wrap, so the checks above bite.
  expect(wrapped).toBeGreaterThan(0);

  // Keyboard Bold changes source; one Undo restores it exactly.
  const before = await source();
  // The section's bar is pinned under the sticky header and, wrapped in the
  // narrow canvas, covers the paragraph; the click goes to the paragraph itself.
  await frame.locator("#moving").evaluate((el) => (el as HTMLElement).click());
  await expect(bar.locator(".edit-bar__kind")).toHaveText("Paragraph");
  const bold = bar.getByRole("button", { name: "Bold", exact: true });
  await bold.focus(); await bold.press("Enter");
  await expect.poll(source).not.toBe(before);
  await undo(); await expect.poll(source).toBe(before);

  // Keyboard Move down moves the section in source order; one Undo restores it exactly.
  await frame.locator("#first").evaluate((el) => (el as HTMLElement).click());
  const down = bar.getByRole("button", { name: "Move down", exact: true });
  await down.focus(); await down.press("Enter");
  await expect(frame.locator("main > section").first()).toHaveAttribute("id", "target");
  await undo(); await expect.poll(source).toBe(before);
});

test("a child has no Move down or Move to; its section's Move down still works as one undo step", async ({ page, baseURL }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
  const undo = async () => expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(frame.locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const next = before.replace(/(<main[^>]*>)[\s\S]*?<\/main>/, '$1\n<section id="first"><p id="moving">Moving paragraph</p><p id="second">Second paragraph</p></section>\n<section id="target"><p>Target paragraph</p></section>\n</main>');
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: next });
  });
  await frame.locator("#moving").click({ position: { x: 5, y: 5 } });
  const bar = page.getByRole("toolbar", { name: "Edit bar", exact: true });
  await expect(bar.locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect(bar.getByRole("button", { name: "Move down", exact: true })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Move to", exact: true })).toHaveCount(0);
  // Alt+Down from the child's bar does not move it.
  const before = await source();
  await bar.getByRole("button", { name: "Bold", exact: true }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForTimeout(300);
  expect(await source()).toBe(before);

  await frame.locator("#first").evaluate((el) => (el as HTMLElement).click());
  const down = bar.getByRole("button", { name: "Move down", exact: true });
  await expect(down).toBeVisible();
  await down.focus(); await down.press("Enter");
  await expect(frame.locator("main > section").first()).toHaveAttribute("id", "target");
  await undo(); await expect.poll(source).toBe(before);
});
