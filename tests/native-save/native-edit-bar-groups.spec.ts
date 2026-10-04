import { expect, test } from "@playwright/test";

// The edit bar reads as groups (name, style, content, arrange) split by thin
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
