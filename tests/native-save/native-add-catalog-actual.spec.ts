import { expect, test } from "@playwright/test";
import { requireActualFixture } from "./fixture-contract";

requireActualFixture();

test("a fresh Add panel offers authored components without unsaved defaults or static instructions", { tag: "@actual" }, async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Add to the page", exact: true });
  await expect(panel).toBeVisible();
  for (const label of ["Intro", "Features", "Split", "Contact"]) {
    await expect(panel.getByRole("option", { name: `${label} HTML`, exact: true })).toHaveCount(0);
  }
  await expect(panel.getByRole("option")).not.toHaveCount(0);
  await expect(panel.getByText("Click to add, or drag onto the page.", { exact: true })).toHaveCount(0);
  const position = panel.locator(".pb-add-panel__position");
  await expect(position).toBeHidden();
  expect(await position.evaluate(element => element.getBoundingClientRect().height)).toBe(0);
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const match = /(<main[^>]*>)[\s\S]*?<\/main>/.exec(before);
    if (!match) throw new Error("The fixture main was not found");
    editor.replaceActiveRange({ path: "index.html", start: match.index, end: match.index + match[0].length, expected: match[0], text: `${match[1]}</main>` });
  });
  const empty = page.getByRole("region", { name: "Empty page", exact: true });
  await expect(empty).toBeVisible();
  for (const label of ["Intro", "Features", "Split", "Contact"]) await expect(empty.getByRole("button", { name: `Add ${label}`, exact: true })).toHaveCount(0);
});
