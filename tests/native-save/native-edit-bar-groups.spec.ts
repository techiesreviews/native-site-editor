import { expect, test } from "@playwright/test";

// The edit bar reads as groups (name, style, content, arrange: moves, Move to,
// duplicate, delete, add) split by thin
// rules that are decoration only: hidden from assistive tech, not focusable,
// and never between two controls of the same group.
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent("index.html")}`;

test("the bar's controls sit in groups split by decorative rules", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  const heading = page.frameLocator(".native-preview-frame").locator(".hero h1");
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await heading.click();
  const bar = page.getByRole("toolbar", { name: "Edit bar" });
  await expect(bar).toBeVisible();

  const layout = await bar.evaluate((el) => [...el.children].map((child) => ({
    rule: child.classList.contains("edit-bar__rule"),
    hidden: child.getAttribute("aria-hidden"),
    tag: child.tagName,
    width: child.getBoundingClientRect().width,
  })));
  const rules = layout.filter((entry) => entry.rule);
  expect(rules.length).toBeGreaterThan(0);
  for (const rule of rules) {
    expect(rule).toMatchObject({ hidden: "true", tag: "SPAN", width: 1 });
  }
  // Never first, last, or doubled.
  expect(layout[0].rule).toBe(false);
  expect(layout.at(-1)!.rule).toBe(false);
  layout.forEach((entry, i) => { if (entry.rule) expect(layout[i + 1].rule).toBe(false); });
  // The rules leave keyboard order alone: no rule takes focus.
  await expect(bar.locator(".edit-bar__rule[tabindex]")).toHaveCount(0);
});

test("Move down and Move to share the arrange group and both still work", async ({ page, baseURL }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
  const undo = async () => expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(frame.locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const next = before.replace(/(<main[^>]*>)[\s\S]*?<\/main>/, '$1\n<section id="first"><p id="moving">Moving paragraph</p><p id="second">Second paragraph</p></section>\n<section id="target"><p>Target paragraph</p></section>\n</main>');
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: next });
  });
  await frame.locator("#moving").click({ position: { x: 5, y: 5 } });
  const bar = page.getByRole("toolbar", { name: "Edit bar", exact: true });
  const down = bar.getByRole("button", { name: "Move down", exact: true });
  const moveTo = bar.getByRole("button", { name: "Move to", exact: true });
  await expect(moveTo).toBeVisible();

  // Move down, then Move to, with no rule between them.
  const next = await down.evaluate((el) => {
    let sib = el.nextElementSibling;
    while (sib && sib.textContent !== "Move to" && !sib.classList.contains("edit-bar__rule")) sib = sib.nextElementSibling;
    return sib?.classList.contains("edit-bar__rule") ? "rule" : sib?.textContent;
  });
  expect(next).toBe("Move to");

  const before = await source();
  await down.focus(); await down.press("Enter");
  await expect(frame.locator("#first > p").first()).toHaveAttribute("id", "second");
  await undo(); await expect.poll(source).toBe(before);

  await frame.locator("#moving").click({ position: { x: 5, y: 5 } });
  await moveTo.focus(); await moveTo.press("Enter");
  const destination = page.getByRole("menuitem", { name: /^Inside section#target, at the end/ });
  await destination.focus(); await destination.press("Enter");
  await expect(frame.locator("#target > #moving")).toBeVisible();
  await undo(); await expect.poll(source).toBe(before);
});
