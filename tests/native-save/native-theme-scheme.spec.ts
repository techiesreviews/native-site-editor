import { expect, test, type Page } from "@playwright/test";

// src/theme.css writes every themed colour once as light-dark(<light>, <dark>),
// so a colour follows the color-scheme of the element that uses it, not only
// the system setting. A part set to `color-scheme: dark` inside a light page
// shows the same colours as the whole editor in dark mode, and the reverse.

const tokens = ["--surface", "--background", "--panel-surface", "--text", "--muted", "--link", "--line", "--focus", "--pressed", "--on-pressed", "--surface-card", "--component", "--warning-bg", "--agent-done-surface", "--hover"];

// Each token's resolved colour on a probe inside a box with the given color-scheme
// ("" inherits the page's).
function resolve(page: Page, scheme: "" | "light" | "dark") {
  return page.evaluate(({ tokens, scheme }) => {
    const box = document.createElement("div");
    box.style.colorScheme = scheme;
    const probe = box.appendChild(document.createElement("span"));
    document.body.append(box);
    const colours = Object.fromEntries(tokens.map((token) => {
      probe.style.color = `var(${token})`;
      return [token, getComputedStyle(probe).color];
    }));
    probe.style.boxShadow = "var(--shadow-light-only)";
    const shadow = getComputedStyle(probe).boxShadow;
    box.remove();
    return { colours, shadow };
  }, { tokens, scheme });
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
  // A large sheet sits flat on dark surfaces: its shadow goes transparent.
  expect(darkInLight.shadow).toMatch(/^rgba\(0, 0, 0, 0\)/);
  expect(light.shadow).not.toMatch(/^rgba\(0, 0, 0, 0\)/);
});
