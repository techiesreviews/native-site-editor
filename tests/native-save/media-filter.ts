import type { Locator } from "@playwright/test";

/** Choose one of Media's Filter items (slice 116): a collection ("All collections" for every one),
 * Manage collections…, a kind (Show) or a view (View). */
export async function filterTo(library: Locator, choice: string) {
  await library.getByRole("button", { name: /^Filter/ }).click();
  const menu = library.page().getByRole("menu", { name: "Filter", exact: true });
  await menu.getByRole(choice === "Manage collections…" ? "menuitem" : "menuitemradio", { name: choice, exact: true }).click();
}

/** Filter's button, named "Filter: <the choice in short>" ("Filter: All", "Filter: Garden · Video"). */
export const filterButton = (library: Locator) => library.getByRole("button", { name: /^Filter/ });

/** The collections Filter lists, in order (All collections first); the menu closes again. */
export async function collectionChoices(library: Locator) {
  await filterButton(library).click();
  const menu = library.page().getByRole("menu", { name: "Filter", exact: true });
  const names = await menu.getByRole("group", { name: "Collections", exact: true }).getByRole("menuitemradio").allInnerTexts();
  await library.page().keyboard.press("Escape");
  return names.map(name => name.trim());
}
