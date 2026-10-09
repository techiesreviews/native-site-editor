import { expect, test } from "@playwright/test";
// Only the plain sections group drops its visible heading; Blocks keeps its
// heading, and the plain section cards stay addable.
test("plain sections lose only their heading; other groups keep headings and names", async ({ page, baseURL }) => {
  await page.goto(new URL("/tests/fixtures/native-elements-panel.html", baseURL!).href);
  await page.evaluate(async () => {
    const { createAddPanel } = await import("/src/page-builder/add-panel.ts" as string);
    const { nativeElementChoices } = await import("/src/page-builder/native-elements.ts" as string);
    document.body.replaceChildren();
    const inserted: string[] = ((window as any).inserted = []);
    const plain = [{ tag: "saved-section:custom", label: "Custom saved section", group: "Plain HTML sections", kind: "native" }];
    const point = { parent: [0], index: 0 };
    const panel = createAddPanel({
      choices: () => [{ tag: "section-hero", label: "Hero" }],
      extraChoices: () => [...plain, ...nativeElementChoices],
      preview: () => ({ markup: "<p>x</p>", doc: "<!doctype html><p>x</p>" }),
      canvasWidth: () => 800, points: () => [point], defaultPoint: () => point, pointFor: (_c: any, f: any) => f,
      destinationText: () => "Inside main", prepare: () => {}, insert: (_p: any, choice: any) => inserted.push(choice.tag),
      drag: () => undefined, dock: () => ({ left: 20, top: 20, bottom: 760, width: 380 }), onState: () => {},
    });
    panel.openDocked();
  });
  const panel = page.getByRole("dialog", { name: "Add to the page" });
  await expect(panel.getByRole("heading", { name: "Plain HTML sections" })).toHaveCount(0);
  const plain = panel.getByRole("group", { name: "Page sections", exact: true });
  await expect(plain).toHaveCount(1);
  await expect(plain.getByRole("option", { name: "Custom saved section HTML", exact: true })).toHaveCount(1);
  for (const name of ["Blocks"]) {
    await expect(panel.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(panel.getByRole("group", { name, exact: true })).toHaveCount(1);
  }
  await plain.getByRole("option", { name: "Custom saved section HTML", exact: true }).click();
  expect(await page.evaluate(() => (window as any).inserted)).toEqual(["saved-section:custom"]);
});
