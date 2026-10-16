import { expect, type Page } from "@playwright/test";
import { openEditor, openMedia, openFileDetails, openFiles, openPages, pickPicture, openImagePicker, openStructure } from "../../../tests/support/scenarios";
import type { Screen } from "./core";

export type RunStep = <T>(name: string, action: () => Promise<T>) => Promise<T>;

/** Seed only the fake GitHub session, leaving the real starter on disk untouched. */
async function prepareScreen(page: Page, screen: Screen) {
  if (!["image-popup", "picker", "cleanup"].includes(screen)) return;
  await page.goto("/");
  const commit = async (path: string, content: string) => {
    expect((await page.request.post("/__demo/external-edit", { data: { path, content } })).status()).toBe(204);
  };
  if (screen === "cleanup") {
    await commit("images/kit-shots-unused.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="seagreen"/></svg>');
    return;
  }
  const response = await page.request.get("/__demo/file?path=index.html");
  expect(response.ok()).toBe(true);
  const home = await response.text();
  // Newer starters can have no pictures on any page. Give the actual home page
  // a real editable picture for the Image popup and picker scenarios only.
  if (!/<img\b/i.test(home)) {
    const content = home.replace(/<main\b[^>]*>/i, '$&\n<img src="/images/studio-desk.svg" width="320" height="180" alt="Studio desk">');
    if (content === home) throw new Error("Starter home has no main element for the picture scenario");
    await commit("index.html", content);
  }
}

export async function runScenario(page: Page, screen: Screen, step: RunStep) {
  await step("prepare fake GitHub screen data", () => prepareScreen(page, screen));
  await step("openEditor", () => openEditor(page));
  switch (screen) {
    case "editor": return;
    case "media-gallery": await step("openMedia", () => openMedia(page)); return;
    case "file-details": await step("openFileDetails", () => openFileDetails(page)); return;
    case "files": await step("openFiles", () => openFiles(page)); return;
    case "pages": await step("openPages", () => openPages(page)); return;
    case "structure": await step("openStructure", () => openStructure(page)); return;
    case "picker": await step("openImagePicker", () => openImagePicker(page)); return;
    case "media-select": {
      const media = await step("openMedia", () => openMedia(page));
      await step("select first media tile", async () => {
        await media.getByRole("checkbox", { name: /^Select / }).first().check();
        await expect(media.getByRole("group", { name: "Selected files", exact: true })).toBeVisible();
      });
      return;
    }
    case "image-popup":
      await step("pickPicture", () => pickPicture(page));
      await step('open dialog "Image"', async () => {
        await page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__media").click();
        await expect(page.getByRole("dialog", { name: "Image", exact: true })).toBeVisible();
      });
      return;
    case "site-settings":
      await step("openPages", () => openPages(page));
      await step('open dialog "Site settings"', async () => {
        await page.getByRole("button", { name: "Site settings", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Site settings", exact: true })).toBeVisible();
      });
      return;
    case "cleanup":
    case "improve-images": {
      const media = await step("openMedia", () => openMedia(page));
      const title = screen === "cleanup" ? "Clean up" : "Improve images";
      await step(`More > ${title}`, async () => {
        await media.getByRole("button", { name: "More", exact: true }).click();
        await page.getByRole("menuitem", { name: new RegExp(`^${title}`) }).click();
        await expect(media.getByRole("heading", { name: new RegExp(`^${title}`) })).toBeVisible();
      });
      return;
    }
    case "add-panel": {
      const structure = await step("openStructure", () => openStructure(page));
      await step('open dialog "Add to the page"', async () => {
        await structure.getByRole("button", { name: "Add", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Add to the page", exact: true })).toBeVisible();
      });
    }
  }
}
