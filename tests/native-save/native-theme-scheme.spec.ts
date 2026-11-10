import { expect, test, type Page } from "@playwright/test";

// src/theme.css writes every themed colour once as light-dark(<light>, <dark>),
// so a colour follows the color-scheme of the element that uses it, not only
// the system setting. A part set to `color-scheme: dark` inside a light page
// shows the same colours as the whole editor in dark mode, and the reverse.

// Every colour in src/theme.css written as light-dark(), through the alias components use where there is one.
const tokens = [
  "--surface", "--background", "--surface-subtle", "--surface-raised", "--surface-input", "--surface-toolbar", "--panel-surface", "--surface-card",
  "--selected", "--text", "--muted", "--link", "--line", "--focus", "--pressed", "--on-pressed", "--hover",
  "--warning-bg", "--warning-fg", "--success-bg", "--success-fg",
  "--component", "--component-surface", "--component-text",
  "--agent-question-surface", "--agent-question-text", "--agent-done-surface", "--agent-done-bubble", "--agent-done-bubble-ink",
  "--structure-edit-highlight", "--semantic-shadow",
];
const shadows = ["--shadow-light-only", "--structure-edit-drop"];

// Each token's resolved colour on a probe inside a box with the given color-scheme
// ("" inherits the page's).
function resolve(page: Page, scheme: "" | "light" | "dark") {
  return page.evaluate(({ tokens, shadowTokens, scheme }) => {
    const box = document.createElement("div");
    box.style.colorScheme = scheme;
    const probe = box.appendChild(document.createElement("span"));
    document.body.append(box);
    const colours = Object.fromEntries(tokens.map((token) => {
      probe.style.color = `var(${token})`;
      return [token, getComputedStyle(probe).color];
    }));
    const shadows = Object.fromEntries(shadowTokens.map((token) => {
      probe.style.boxShadow = `var(${token})`;
      return [token, getComputedStyle(probe).boxShadow];
    }));
    box.remove();
    return { colours, shadows };
  }, { tokens, shadowTokens: shadows, scheme });
}

test("a themed part set to dark inside a light page shows the dark palette, and light inside dark the light one", async ({ page, baseURL }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });

  const light = await resolve(page, "");
  const darkInLight = await resolve(page, "dark");
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await resolve(page, "");
  const lightInDark = await resolve(page, "light");

  for (const token of tokens) expect(dark.colours[token], `${token} differs between the themes`).not.toBe(light.colours[token]);
  expect(darkInLight.colours).toEqual(dark.colours);
  expect(lightInDark.colours).toEqual(light.colours);
  // Shadows keep each theme's own layers.
  for (const token of shadows) expect(dark.shadows[token], `${token} differs between the themes`).not.toBe(light.shadows[token]);
  expect(darkInLight.shadows).toEqual(dark.shadows);
  expect(lightInDark.shadows).toEqual(light.shadows);
  // A large sheet sits flat on dark surfaces: its shadow goes transparent.
  expect(dark.shadows["--shadow-light-only"]).toMatch(/^rgba\(0, 0, 0, 0\)/);
  expect(light.shadows["--shadow-light-only"]).not.toMatch(/^rgba\(0, 0, 0, 0\)/);
  // The structure editor's lift: the light layers show in light, the dark layers in dark.
  // A layer shows unless its colour is fully transparent (rgba(…, 0) or oklch(… / 0)).
  const layers = (shadow: string) => shadow.split(/,(?![^(]*\))/).map((layer) => !/(?:rgba\(\d+, \d+, \d+, 0\)|\/ 0\))/.test(layer));
  expect(layers(light.shadows["--structure-edit-drop"])).toEqual([true, true, false, false]);
  expect(layers(dark.shadows["--structure-edit-drop"])).toEqual([false, false, true, true]);
});
