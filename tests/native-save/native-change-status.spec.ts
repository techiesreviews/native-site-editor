import { publishButton, showPublish } from "./publish";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { unzipStored } from "../../src/zip.ts";

// Change status after Save to GitHub, on the Publish button (Saved →
// Deploying… → Published, back to Publish, or Deploy failed), with the link to
// look in its menu; read through the Worker from the fake GitHub's workflow
// runs, which the tests set through /__demo/actions; View live site from .editor/config.json, and
// Download site (the repository's files as edited, as a .zip).

const indexPath = "index.html";
const aboutPath = "about/index.html";
const stylesPath = "styles/site.css";
const indexSource = readFileSync(resolve("fixtures/native-starter", indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

type Run = { name?: string; status: string; conclusion?: string | null; details_url?: string };
async function setActions(page: Page, baseURL: string | undefined, mode: "none" | "forbidden" | "runs", runs: Run[] = [], checks?: Run[]) {
  const response = await page.request.post(`${baseURL}/__demo/actions`, { data: { mode, runs, checks } });
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
  await showPublish(page);
  await publishButton(page).click();
  const message = page.locator(".publish-menu__message");
  await expect(message).toContainText("Saved to GitHub", { timeout: 30_000 });
  await expect(message).not.toContainText("not tracked");
  await page.keyboard.press("Escape");
}

// The button's label, and its menu (hovered open) with the link to look.
const label = (page: Page) => page.locator(".publish-menu__label");
async function deployLink(page: Page, name: string) {
  // Off and back on, so the hover opens it again after Escape.
  await page.mouse.move(0, 0);
  await trigger(page).hover();
  return page.locator("#publish-files .publish-menu__message").getByRole("link", { name });
}
const trigger = (page: Page) => page.locator(".publish-menu > .button");

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
  const menuLink = page.locator("#repository-actions .site-actions__live");
  await expect(menuLink).toHaveAttribute("href", "https://larkspur.example/");
  await expect(menuLink).toHaveAttribute("target", "_blank");
  // The menu hides View live site and Download site for now.
  await expect(menuLink).toBeHidden();
  await page.keyboard.press("Escape");

  // Workflows exist but GitHub has not queued a run for the commit yet.
  await setActions(page, baseURL, "runs", []);
  await editAndSave(page, "Followed to live");
  await expect(label(page)).toHaveText("Saved");
  await expect(trigger(page)).toHaveAttribute("data-state", "saved");
  // Nothing to publish: it looks disabled, but its menu still opens.
  await expect(trigger(page)).toBeDisabled();
  await expect(await deployLink(page, "View the commit on GitHub")).toHaveAttribute("href", /\/commit\/[0-9a-f]{40}$/);
  await expect(page.locator(".topbar .change-status")).toHaveCount(0);

  await setActions(page, baseURL, "runs", [{ name: "Deploy test site", status: "in_progress" }]);
  await expect(label(page)).toHaveText("Deploying…");
  await expect(trigger(page)).toHaveAttribute("data-state", "building");
  await expect(await deployLink(page, "Watch the deploy on GitHub")).toHaveAttribute("href", /\/actions\/runs\/1$/);
  await expect(page.locator("#publish-files .publish-menu__message")).toContainText("Deploying…");
  await expect(page.locator("#change-status [role=status]")).toHaveText("Building");

  await setActions(page, baseURL, "runs", [{ name: "Deploy test site", status: "completed", conclusion: "success" }]);
  await expect(label(page)).toHaveText("Published");
  await expect(await deployLink(page, "View live site")).toHaveAttribute("href", "https://larkspur.example/");
  await expect(page.locator("#change-status [role=status]")).toHaveText("Live: the site is updated.");
  // Then the button is back as it was: Publish, disabled, no state.
  await expect(label(page)).toHaveText("Publish", { timeout: 10_000 });
  await expect(trigger(page)).not.toHaveAttribute("data-state");
  await expect(trigger(page)).not.toHaveAttribute("aria-disabled");
  await expect(publishButton(page)).toBeDisabled();

  // The editor asked about the saved commit, the branch's new head.
  const asked = (await (await page.request.get(`${baseURL}/__demo/actions`)).json()).asked as string[];
  const head = await page.locator("#revision").getAttribute("title");
  expect(asked.length).toBeGreaterThan(1);
  expect(new Set(asked)).toEqual(new Set([head]));
});

test("a host that deploys without a workflow (Cloudflare Workers Builds) is followed through its check runs", async ({ page, baseURL }) => {
  const build = (status: string, conclusion: string | null = null) =>
    [{ name: "Workers Builds: site", status, conclusion, details_url: "https://dash.cloudflare.com/builds/7" }];
  await setActions(page, baseURL, "none", [], build("in_progress"));
  await editAndSave(page, "Workers Builds heading");
  await expect(label(page)).toHaveText("Deploying…");
  await expect(await deployLink(page, "Watch the deploy on GitHub")).toHaveAttribute("href", "https://dash.cloudflare.com/builds/7");

  await setActions(page, baseURL, "none", [], build("completed", "success"));
  await expect(label(page)).toHaveText("Published");
  await expect(label(page)).toHaveText("Publish", { timeout: 10_000 });
});

test("a failed workflow run shows Failed with a link to the run", async ({ page, baseURL }) => {
  await setActions(page, baseURL, "runs", [{ name: "Deploy test site", status: "completed", conclusion: "failure" }]);
  await editAndSave(page, "Failing build heading");
  await expect(label(page)).toHaveText("Deploy failed");
  await expect(trigger(page)).toHaveAttribute("data-state", "failed");
  const run = await deployLink(page, "View the failed run on GitHub");
  await expect(run).toHaveAttribute("href", /\/actions\/runs\/1$/);
  await expect(run).toHaveAttribute("target", "_blank");
  await expect(page.locator("#change-status [role=status]")).toHaveText("Failed: the site was not updated.");
});

test("without the Actions permission (403) the status stays Saved", async ({ page, baseURL }) => {
  await setActions(page, baseURL, "forbidden");
  await editAndSave(page, "Forbidden status heading");
  // The answer came back: the hint names the permission; the state is Saved.
  await expect(label(page)).toHaveText("Saved");
  const commit = await deployLink(page, "View the commit on GitHub");
  await expect(page.locator("#publish-files .publish-menu__message")).toContainText("Actions: read", { timeout: 15_000 });
  await expect(commit).toBeVisible();
  await expect(page.locator("#publish-files .publish-menu__message").getByRole("link", { name: /run/ })).toHaveCount(0);
  await expect(page.locator("#notice")).toBeHidden();
});

test("a repository with no workflows just shows Saved, and no View live site without a url", async ({ page, baseURL }) => {
  await setActions(page, baseURL, "none");
  await editAndSave(page, "No workflows heading");
  await expect(label(page)).toHaveText("Saved");
  // One answer ("none") ends the following; Saved settles back to Publish.
  await expect(label(page)).toHaveText("Publish", { timeout: 10_000 });
  const asked = (await (await page.request.get(`${baseURL}/__demo/actions`)).json()).asked as string[];
  expect(asked.length).toBe(1);
  await openProjectMenu(page);
  await expect(page.locator("#repository-actions .site-actions__download")).toBeHidden();
  await expect(page.locator("#repository-actions .site-actions__live")).toBeHidden();
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
  // Hidden from the menu for now, so pressed directly.
  await page.locator("#repository-actions .site-actions__download").evaluate((el) => (el as HTMLElement).click());
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
  await expect(publishButton(page)).toBeEnabled();
});
