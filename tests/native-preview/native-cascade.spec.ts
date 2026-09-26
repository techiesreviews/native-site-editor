import { readdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The style panel against sites whose CSS differs in structure, one fixture
// repository each (fixtures/cascade/<name>, served by tests/native-save/server.ts
// as `cascade-<name>`, ids from 510 in folder order). For every property
// checked, the rule the panel shows winning must hold the declaration whose
// value getComputedStyle reports.

const fixtures = readdirSync("fixtures/cascade", { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name).sort();
const indexPath = "index.html";
const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

async function openFixture(page: Page, baseURL: string | undefined, name: string) {
  const id = 510 + fixtures.indexOf(name);
  await page.goto(`${baseURL}/#repo=${id}&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  return page.frameLocator(".native-preview-frame");
}

interface Chip {
  selector: string;
  origin: string;
  cascade: string;
  wins: string[];
  overridden: string[];
  path: string;
  title: string;
}

function chips(page: Page): Promise<Chip[]> {
  return page.locator("#secondary-rules button").evaluateAll((buttons) => buttons.map((button) => {
    const el = button as HTMLElement;
    const words = (value: string | undefined) => (value ?? "").split(" ").filter(Boolean);
    return {
      selector: el.querySelector(".code-pane__rule-selector")?.textContent ?? "",
      origin: el.querySelector(".code-pane__rule-origin")?.textContent ?? "",
      cascade: el.dataset.cascade ?? "",
      wins: words(el.dataset.wins),
      overridden: words(el.dataset.overridden),
      path: el.title.split("\n")[1]?.replace(/ \(imported by .*\)$/, "") ?? "",
      title: el.title,
    };
  }));
}

const declared = (chip: Chip, property: string) =>
  new RegExp(`^✓ ${property}: (.*?)( !important)?$`, "m").exec(chip.title)?.[1];

// The panel's winner for `property`: selector, file, origin tags and the
// declared value, which must be what the browser computes for the element.
async function expectWinner(page: Page, target: Locator, property: string, expected: { selector: string; path: string; origin?: string | RegExp; value?: string }) {
  await expect.poll(async () => {
    const winners = (await chips(page)).filter((chip) => chip.wins.includes(property));
    return winners.map((chip) => ({ selector: chip.selector, path: chip.path }));
  }, { message: `winner for ${property}` }).toEqual([{ selector: expected.selector, path: expected.path }]);
  const chip = (await chips(page)).find((item) => item.wins.includes(property))!;
  if (expected.origin !== undefined) expect(chip.origin).toMatch(expected.origin);
  const computed = await target.evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);
  // Literal values compare as written; a var() one through `expected.value`.
  const value = declared(chip, property);
  expect(value, `${property} as declared by ${chip.selector}`).toBeDefined();
  if (!value!.includes("var(")) expect(value, `${property} as declared by ${chip.selector}`).toBe(computed);
  if (expected.value !== undefined) expect(computed).toBe(expected.value);
}

async function expectOverridden(page: Page, selector: string, path: string, origin?: string | RegExp) {
  const found = (await chips(page)).filter((chip) => chip.selector === selector && chip.path === path &&
    (origin === undefined || (typeof origin === "string" ? chip.origin === origin : origin.test(chip.origin))));
  expect(found.length, `${selector} in ${path}`).toBe(1);
  expect(found[0].cascade).toBe("overridden");
  expect(found[0].wins).toEqual([]);
}

// Rules that decide something come first, fully overridden ones last.
async function expectDecidingFirst(page: Page) {
  const list = (await chips(page)).map((chip) => chip.cascade);
  const lastWin = list.lastIndexOf("wins");
  const firstOverridden = list.indexOf("overridden");
  if (firstOverridden >= 0) expect(lastWin).toBeLessThan(firstOverridden);
}

test("no layers: specificity and order across files, conditions, nesting and the style attribute", async ({ page, baseURL }) => {
  const frame = await openFixture(page, baseURL, "flat");
  const note = frame.locator("#flat-note");
  await expect(note).toBeVisible({ timeout: 30_000 });
  await note.click();
  await expectWinner(page, note, "color", { selector: ".note", path: "styles/theme.css", value: "rgb(3, 3, 3)" });
  await expectOverridden(page, ".note", "styles/base.css", "");
  await expectWinner(page, note, "margin-top", { selector: "p", path: "styles/base.css" });
  await expectWinner(page, note, "text-transform", { selector: ".note--loud", path: "styles/base.css", value: "uppercase" });
  await expectOverridden(page, "p.note", "styles/theme.css");
  await expectWinner(page, note, "letter-spacing", { selector: ".card .note", path: "styles/base.css", origin: "@media" });
  await expectWinner(page, note, "font-style", { selector: "& .note", path: "styles/theme.css", value: "italic" });
  await expectWinner(page, note, "text-indent", { selector: "p", path: "styles/base.css", origin: "@scope", value: "3px" });
  // Two @container rules: the one the computed value shows applies wins; the
  // other is neither winning nor claimed overridden.
  await expectWinner(page, note, "word-spacing", { selector: ".note", path: "styles/base.css", origin: "@container", value: "4px" });
  const containers = (await chips(page)).filter((chip) => chip.origin === "@container");
  expect(containers.map((chip) => chip.cascade).sort()).toEqual(["neutral", "wins"]);
  expect(containers.find((chip) => chip.cascade === "neutral")!.title).toContain("word-spacing: 9px — @container not met");
  // A @media rule that does not apply is not listed.
  expect((await chips(page)).some((chip) => chip.title.includes("max-width: 1px) "))).toBe(false);
  await expectDecidingFirst(page);

  // The style attribute beats the rules of its tree.
  const plain = frame.locator(".plain");
  await plain.click();
  await expectWinner(page, plain, "color", { selector: "style=\"…\"", path: indexPath, origin: "", value: "rgb(5, 5, 5)" });
  await expectOverridden(page, ".plain", "styles/base.css");
});

test("layers declared up front: unlayered wins normal declarations, earlier layers win !important", async ({ page, baseURL }) => {
  const frame = await openFixture(page, baseURL, "layers-upfront");
  const link = frame.locator("#cta");
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  // A plain unlayered `a` beats `.button` in a layer.
  await expectWinner(page, link, "color", { selector: "a", path: "styles/site.css", origin: "", value: "rgb(9, 9, 9)" });
  // A later layer beats an earlier one, whatever the specificity.
  await expectWinner(page, link, "padding-top", { selector: ".button", path: "styles/site.css", origin: "components", value: "4px" });
  // !important: the earliest layer wins, and a layered one beats an unlayered one.
  await expectWinner(page, link, "text-decoration-line", { selector: "a", path: "styles/site.css", origin: "reset", value: "none" });
  await expectWinner(page, link, "font-weight", { selector: "p a", path: "styles/site.css", origin: "base", value: "700" });
  const unlayered = (await chips(page)).find((chip) => chip.selector === "a" && chip.origin === "")!;
  expect(unlayered.overridden).toEqual(["font-weight"]);
  await expectDecidingFirst(page);
});

test("layers in first-use order, anonymous and nested", async ({ page, baseURL }) => {
  const frame = await openFixture(page, baseURL, "layers-implicit");
  const title = frame.locator("#title");
  await expect(title).toBeVisible({ timeout: 30_000 });
  await title.click();
  await expectWinner(page, title, "color", { selector: "h1", path: "styles/one.css", origin: "base", value: "rgb(50, 0, 0)" });
  await expectWinner(page, title, "font-size", { selector: "h1", path: "styles/one.css", origin: "base", value: "30px" });
  await expectWinner(page, title, "letter-spacing", { selector: "h1", path: "styles/two.css", origin: "anonymous layer", value: "1px" });
  await expectWinner(page, title, "text-transform", { selector: "h1", path: "styles/two.css", origin: "outer", value: "lowercase" });
  await expectOverridden(page, "h1", "styles/one.css", "theme");
  await expectOverridden(page, "h1", "styles/one.css", "anonymous layer");
  await expectOverridden(page, "#title.title", "styles/two.css", "theme");
  await expectOverridden(page, "#title", "styles/two.css", "base.type");
  await expectOverridden(page, "#title", "styles/two.css", "outer.inner");
  await expectDecidingFirst(page);
});

test("@import with layer(), media and a declared layer order", async ({ page, baseURL }) => {
  const frame = await openFixture(page, baseURL, "imports");
  const intro = frame.locator("#intro");
  await expect(intro).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => intro.evaluate((el) => getComputedStyle(el).fontStyle)).toBe("italic");
  await intro.click();
  // `@layer base, theme;` puts theme after base, though base is imported later.
  await expectWinner(page, intro, "color", { selector: ".intro", path: "styles/theme.css", origin: "theme", value: "rgb(70, 0, 0)" });
  await expectWinner(page, intro, "font-weight", { selector: ".intro", path: "styles/parts/base.css", origin: "base", value: "700" });
  await expectWinner(page, intro, "font-style", { selector: "p.intro", path: "styles/parts/base.css", origin: "base" });
  await expectWinner(page, intro, "text-decoration-line", { selector: ".intro", path: "styles/wide.css", origin: "wide @media", value: "underline" });
  await expectWinner(page, intro, "margin-top", { selector: ".intro", path: "styles/site.css", origin: "" });
  expect((await chips(page)).some((chip) => chip.path === "styles/print.css")).toBe(false);
  const base = (await chips(page)).find((chip) => chip.selector === ".intro" && chip.path === "styles/parts/base.css")!;
  expect(base.overridden).toEqual(["color"]);
  expect(base.title).toContain("(imported by styles/site.css)");
});

test("shadow DOM: the page beats ::slotted() and :host, except for !important", async ({ page, baseURL }) => {
  const frame = await openFixture(page, baseURL, "shadow");
  const lead = frame.locator("p.lead");
  const box = frame.locator("#box");
  await expect(lead).toBeVisible({ timeout: 30_000 });
  // The component's stylesheet arrives after the first render.
  await expect.poll(() => lead.evaluate((el) => getComputedStyle(el).fontStyle)).toBe("italic");
  await lead.click();
  await expectWinner(page, lead, "color", { selector: ".lead", path: "styles/site.css", value: "rgb(100, 0, 0)" });
  await expectWinner(page, lead, "font-style", { selector: "::slotted(p)", path: "components/info-box/info-box.css", origin: "::slotted" });
  await expectWinner(page, lead, "letter-spacing", { selector: ".lead", path: "styles/site.css", value: "5px" });
  await expectWinner(page, lead, "font-weight", { selector: "slot::slotted(.lead)", path: "components/info-box/info-box.css", origin: "::slotted", value: "700" });
  // A rule written only as `.lead` reaches the slotted lead through its added twin.
  await expect.poll(() => lead.evaluate((el) => getComputedStyle(el).textTransform)).toBe("uppercase");
  await expectWinner(page, lead, "text-transform", { selector: "::slotted(.lead)", path: "components/info-box/info-box.css", origin: "::slotted", value: "uppercase" });
  await expectOverridden(page, "p", "styles/site.css");
  const slotted = (await chips(page)).find((chip) => chip.selector === "::slotted(p)")!;
  expect(slotted.overridden).toEqual(["color"]);
  await expectDecidingFirst(page);

  // A click on the host itself (its padding), not on the slotted paragraph.
  await box.evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator("#secondary-rules")).toContainText(":host");
  await expectWinner(page, box, "padding-top", { selector: "info-box", path: "styles/site.css", value: "9px" });
  await expectWinner(page, box, "margin-top", { selector: "info-box.boxed", path: "styles/site.css", value: "1px" });
  await expectWinner(page, box, "display", { selector: ":host", path: "components/info-box/info-box.css", origin: ":host", value: "block" });
  await expectWinner(page, box, "color", { selector: ":host", path: "components/info-box/info-box.css", origin: ":host" });
  await expectOverridden(page, ":host(.boxed)", "components/info-box/info-box.css", ":host");
  await expectDecidingFirst(page);
});

test("the starter's footer link: the component's unlayered `a` beats the shared layered `p a`", async ({ page, baseURL }) => {
  const frame = await openFixture(page, baseURL, "starter");
  // With nothing selected, the stylesheet the cascade puts first for <body> opens.
  await expect(page.locator("#secondary-title")).toHaveText("styles/elements.css", { timeout: 30_000 });
  await expect(page.locator("#secondary-rules")).toContainText("body");

  const link = frame.locator("site-footer a");
  await expect(link).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => frame.locator("site-footer footer").evaluate((el) => getComputedStyle(el).paddingTop)).toBe("24px");
  await link.click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/site-footer/site-footer.html");
  await expect(page.locator("#secondary-title")).toHaveText("components/site-footer/site-footer.css");
  // The pointer is still over the link, so `a:hover` applies right now; the
  // panel lists the link's resting styles and the hover rule as a state.
  await expect.poll(async () => (await chips(page)).map((chip) => `${chip.selector} ${chip.cascade}`)).toEqual([
    "a wins",
    "a:hover neutral",
    "p a overridden",
  ]);
  const winner = (await chips(page))[0];
  expect(winner.wins).toEqual(["color"]);
  expect(winner.title).toContain("✓ color: var(--muted)");
  const layered = (await chips(page))[2];
  expect(layered.path).toBe("styles/elements.css");
  expect(layered.origin).toBe("elements");
  expect(layered.title).toContain("✕ color: var(--accent) — overridden by a (site-footer.css)");
  expect((await chips(page))[1].title).toContain("in :hover state");
  // The shared rule is crossed out in its file.
  await page.locator("#secondary-rules button", { hasText: "p a" }).click();
  await expect(page.locator("#secondary-title")).toHaveText("styles/elements.css");
  // Monaco splits the mark per token; together they are the one declaration.
  await expect.poll(() => page.locator("#content-secondary .code-editor__overridden")
    .evaluateAll((marks) => marks.map((mark) => mark.textContent).join("").replace(/\u00a0/g, " "))).toBe("color: var(--accent);");

  // In the page's own paragraph the same shared rule wins.
  await page.mouse.move(0, 0);
  const pageLink = frame.locator("main a");
  await pageLink.click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expectWinner(page, pageLink, "color", { selector: "p a", path: "styles/elements.css", origin: "elements", value: "rgb(47, 109, 58)" });
});
