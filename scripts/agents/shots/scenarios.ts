import { expect, type Page } from "@playwright/test";
import { openEditor, openMedia, openFileDetails, openFiles, openPages, pickPicture, openImagePicker, openStructure } from "../../../tests/support/scenarios";
import { openSiteSettings } from "../../../tests/native-save/site-settings-open";
import type { Screen } from "./core";

export type RunStep = <T>(name: string, action: () => Promise<T>) => Promise<T>;

/** Seed only the fake GitHub session, leaving the real starter on disk untouched. */
async function prepareScreen(page: Page, screen: Screen) {
  if (!["image-popup", "picker", "cleanup", "inbox"].includes(screen)) return;
  await page.goto("/");
  const commit = async (path: string, content: string) => {
    expect((await page.request.post("/__demo/external-edit", { data: { path, content } })).status()).toBe(204);
  };
  if (screen === "inbox") {
    // The Inbox's kinds (TOOLS-253): a picture without a description in the shared header, and on Home a skipped
    // heading, a link with no name, a "click here" link and a video without subtitles.
    const read = async (path: string) => { const response = await page.request.get(`/__demo/file?path=${path}`); expect(response.ok()).toBe(true); return response.text(); };
    const header = await read("components/site-header/site-header.html");
    const logo = header.replace(/<header\b[^>]*>/i, '$&\n  <img src="/images/studio-desk.svg" width="24" height="24">');
    if (logo === header) throw new Error("Starter header has no header element for the Inbox scenario");
    await commit("components/site-header/site-header.html", logo);
    const home = await read("index.html");
    const problems = home.replace(/<\/main>/i, `<section><h2>Workshop</h2><h4>Opening hours</h4><p>Monday to Saturday. See <a href="/about/">click here</a> or <a href="/about/"><svg width="12" height="12" aria-hidden="true"><path d="M2 6h8"/></svg></a>.</p><video src="/images/fit.mp4" controls></video></section>\n$&`);
    if (problems === home) throw new Error("Starter home has no main element for the Inbox scenario");
    await commit("index.html", problems);
    return;
  }
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
  if (screen === "catalogue") {
    // The catalogue board (catalogue.html, atomic catalogue ticket 05): its own page, not the editor.
    await step("openCatalogue", async () => {
      await page.goto("/catalogue.html");
      await expect(page.locator('.cat-outline__item[data-id="button"]')).toBeAttached();
      // Every frame has drawn: the fixed ones show the menu open, the live one its closed button.
      await expect(page.frameLocator('#card-row-menu .cat-half[data-theme="light"] iframe').first().locator(".row-menu")).toContainText("Rename");
      await expect(page.frameLocator('#card-row-menu [data-cell="live"] iframe').getByRole("button", { name: "Actions" })).toBeVisible();
    });
    return;
  }
  await step("openEditor", () => openEditor(page));
  switch (screen) {
    case "editor": case "inbox": return;
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
        await openSiteSettings(page);
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
