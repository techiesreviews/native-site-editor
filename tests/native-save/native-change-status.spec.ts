import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { unzipStored } from "../../src/zip.ts";

// Change status after Save to GitHub (Saved → Building → Live or Failed, read
// through the Worker from the fake GitHub's workflow runs, which the tests set
// through /__demo/actions), View live site from .editor/config.json, and
// Download site (the repository's files as edited, as a .zip).

const indexPath = "index.html";
const aboutPath = "about/index.html";
const stylesPath = "styles/site.css";
const indexSource = readFileSync(resolve("fixtures/native-starter", indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

type Run = { name?: string; status: string; conclusion?: string | null };
async function setActions(page: Page, baseURL: string | undefined, mode: "none" | "forbidden" | "runs", runs: Run[] = []) {
  const response = await page.request.post(`${baseURL}/__demo/actions`, { data: { mode, runs } });
  expect(response.status()).toBe(204);
}

async function openEditor(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});

async function editAndSave(page: Page, heading: string) {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content .view-lines")).toContainText("A native browser preview", { timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), indexSource.replace("A native browser preview", heading));
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect(frame.getByRole("heading", { name: heading })).toBeVisible();
  await page.getByRole("button", { name: "Save to GitHub", exact: true }).click();
  await page.getByRole("button", { name: "Save selected files", exact: true }).click();
  const message = page.locator(".publish-menu__message");
  await expect(message).toContainText("Saved to GitHub", { timeout: 30_000 });
  await expect(message).toContainText("Its status shows in the top bar.");
  await expect(message).not.toContainText("not tracked");
  await page.keyboard.press("Escape");
}

const status = (page: Page) => page.locator("#change-status .change-status");

async function openProjectMenu(page: Page) {
  await page.locator(".repository-menu__trigger").click();
  await expect(page.locator("#repository-actions")).toBeVisible();
}

test("a save shows Saved, then Building while its workflow runs, then Live with View live site", async ({ page, baseURL }) => {
  // The site's address comes from .editor/config.json, committed on GitHub.
  await page.request.post(`${baseURL}/__demo/external-edit`, {
    data: { path: ".editor/config.json", content: JSON.stringify({ site: { name: "Demo", url: "https://larkspur.example" } }, null, 2) + "\n" },
  });
  await page.reload();
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await openProjectMenu(page);
  const menuLink = page.locator("#repository-actions").getByRole("link", { name: "View live site ↗" });
  await expect(menuLink).toHaveAttribute("href", "https://larkspur.example/");
  await expect(menuLink).toHaveAttribute("target", "_blank");
  await page.keyboard.press("Escape");

  // Workflows exist but GitHub has not queued a run for the commit yet.
  await setActions(page, baseURL, "runs", []);
  await expect(status(page)).toBeHidden();
  await editAndSave(page, "Followed to live");
  await expect(status(page)).toBeVisible();
  await expect(status(page)).toHaveAttribute("data-state", "saved");
  await expect(status(page).locator(".change-status__label")).toHaveText("Saved");
  await expect(status(page).getByRole("link", { name: "View the commit on GitHub" })).toHaveAttribute("href", /\/commit\/[0-9a-f]{40}$/);

  await setActions(page, baseURL, "runs", [{ name: "Deploy test site", status: "in_progress" }]);
  await expect(status(page).locator(".change-status__label")).toHaveText("Building");
  await expect(status(page)).toHaveAttribute("data-state", "building");
  await expect(status(page).getByRole("link", { name: "View the run on GitHub" })).toHaveAttribute("href", /\/actions\/runs\/1$/);
  await expect(page.locator("#change-status [role=status]")).toHaveText("Building");

  await setActions(page, baseURL, "runs", [{ name: "Deploy test site", status: "completed", conclusion: "success" }]);
  await expect(status(page).locator(".change-status__label")).toHaveText("Live");
  await expect(status(page)).toHaveAttribute("data-state", "live");
  await expect(status(page).getByRole("link", { name: "View live site" })).toHaveAttribute("href", "https://larkspur.example/");
  await expect(page.locator("#change-status [role=status]")).toHaveText("Live: the site is updated.");

  // The editor asked about the saved commit, the branch's new head.
  const asked = (await (await page.request.get(`${baseURL}/__demo/actions`)).json()).asked as string[];
  const head = await page.locator("#revision").getAttribute("title");
  expect(asked.length).toBeGreaterThan(1);
  expect(new Set(asked)).toEqual(new Set([head]));
});

test("a failed workflow run shows Failed with a link to the run", async ({ page, baseURL }) => {
  await setActions(page, baseURL, "runs", [{ name: "Deploy test site", status: "completed", conclusion: "failure" }]);
  await editAndSave(page, "Failing build heading");
  await expect(status(page).locator(".change-status__label")).toHaveText("Failed");
  await expect(status(page)).toHaveAttribute("data-state", "failed");
  const run = status(page).getByRole("link", { name: "View the failed run on GitHub" });
  await expect(run).toHaveAttribute("href", /\/actions\/runs\/1$/);
  await expect(run).toHaveAttribute("target", "_blank");
  await expect(page.locator("#change-status [role=status]")).toHaveText("Failed: the site was not updated.");
});

test("without the Actions permission (403) the status stays Saved", async ({ page, baseURL }) => {
  await setActions(page, baseURL, "forbidden");
  await editAndSave(page, "Forbidden status heading");
  // The answer came back: the hint names the permission; the state is Saved.
  await expect(status(page)).toHaveAttribute("title", /Actions: read/, { timeout: 15_000 });
  await expect(status(page).locator(".change-status__label")).toHaveText("Saved");
  await expect(status(page)).toHaveAttribute("data-state", "saved");
  await expect(status(page).getByRole("link", { name: "View the commit on GitHub" })).toBeVisible();
  await expect(status(page).getByRole("link", { name: /run/ })).toHaveCount(0);
  await expect(page.locator("#notice")).toBeHidden();
});

test("a repository with no workflows just shows Saved, and no View live site without a url", async ({ page, baseURL }) => {
  await setActions(page, baseURL, "none");
  await editAndSave(page, "No workflows heading");
  await expect(status(page).locator(".change-status__label")).toHaveText("Saved");
  // One answer ("none") ends the following; the status stays Saved.
  await page.waitForTimeout(4_000);
  await expect(status(page).locator(".change-status__label")).toHaveText("Saved");
  const asked = (await (await page.request.get(`${baseURL}/__demo/actions`)).json()).asked as string[];
  expect(asked.length).toBe(1);
  await openProjectMenu(page);
  await expect(page.locator("#repository-actions").getByRole("button", { name: "Download site" })).toBeVisible();
  await expect(page.locator("#repository-actions").getByRole("link", { name: /View live site/ })).toHaveCount(0);
});

test("Download site zips the repository's files as edited, unsaved drafts included", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content .view-lines")).toContainText("A native browser preview", { timeout: 20_000 });
  const edited = indexSource.replace("A native browser preview", "Unsaved download heading");
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), edited);
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect(frame.getByRole("heading", { name: "Unsaved download heading" })).toBeVisible();

  await openProjectMenu(page);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#repository-actions").getByRole("button", { name: "Download site" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("native-demo-site.zip");
  const path = await download.path();
  const files = unzipStored(new Uint8Array(readFileSync(path)));
  const names = Object.keys(files);
  const decoder = new TextDecoder();
  // The draft as it is, and every other file as the branch has it.
  expect(decoder.decode(files[indexPath])).toBe(edited);
  expect(decoder.decode(files[stylesPath])).toBe(readFileSync(resolve("fixtures/native-starter", stylesPath), "utf8"));
  expect(names).toContain(aboutPath);
  await expect(page.locator("#status")).toHaveText(`Downloaded native-demo-site.zip, ${names.length} files.`);
  // Nothing was saved: the draft is still there.
  await expect(page.getByRole("button", { name: "Save to GitHub", exact: true })).toBeEnabled();
});
