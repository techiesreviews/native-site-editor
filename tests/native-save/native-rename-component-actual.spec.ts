import { readFileSync } from "node:fs";
import { effectiveSource } from "./drafts";
import { expect, test, type Page } from "@playwright/test";

// Slice 76: the component is renamed in place in Edit component mode's bar.
// Home and About both use section-work; styles/sections.css names it too.
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
// ASE_RENAME_SHOTS=<dir> saves screenshots there.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const tag = (page: Page) => page.locator(".edit-mode__tag[aria-current]");
const shots = process.env.ASE_RENAME_SHOTS;
const OLD = { html: "components/section-work/section-work.html", css: "components/section-work/section-work.css" };
const NEW = { html: "components/section-showcase/section-showcase.html", css: "components/section-showcase/section-showcase.css" };
const ABOUT = "about/index.html";
const SHEET = "styles/sections.css";

const workTemplate = `<section class="flow">
  <slot name="title"><h2>Section title</h2></slot>
  <div class="cards">
    <slot>
      <card-project></card-project>
    </slot>
  </div>
</section>
`;
const workCss = `:host {
  display: block;
}

section {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
`;
const fixture = (path: string) => readFileSync(`${process.env.ASE_NATIVE_SAVE_FIXTURE}/${path}`, "utf8");
function homeWithWork() {
  const home = fixture("index.html");
  const start = home.indexOf(`<section class="flow" id="work">`);
  const end = home.indexOf("</section>", start) + "</section>".length;
  expect(start).toBeGreaterThan(0);
  const cards = home.slice(start, end).match(/<card-project>[\s\S]*?<\/card-project>/g)!;
  return `${home.slice(0, start)}<section-work id="work">
      <h2 slot="title">Recent work</h2>
      ${cards.join("\n      ")}
    </section-work>${home.slice(end)}`;
}
function aboutWithWork() {
  const about = fixture(ABOUT);
  const at = about.indexOf(`    <section class="contact flow"`);
  expect(at).toBeGreaterThan(0);
  return `${about.slice(0, at)}    <section-work>
      <h2 slot="title">How we work</h2>
    </section-work>
    <p>Our section-work is shown above.</p>
${about.slice(at)}`;
}
const sheet = () => `${fixture(SHEET)}
section-work {
  scroll-margin-top: 4rem;
}
`;

test("the component's tag is renamed in place everywhere as one undo step", { tag: "@actual" }, async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const home = homeWithWork(), about = aboutWithWork(), styles = sheet();
  for (const [path, content] of [[OLD.html, workTemplate], [OLD.css, workCss], ["index.html", home], [ABOUT, about], [SHEET, styles]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Recent work", { timeout: 30_000 });
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", OLD.html);
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
  await expect(tag(page)).toHaveText("<section-work>");

  const files = () => Promise.all([OLD.html, OLD.css, NEW.html, NEW.css, "index.html", ABOUT, SHEET].map((path) => effectiveSource(page, baseURL, path)));
  const before = [workTemplate, workCss, undefined, undefined, home, about, styles];
  const rename = (text: string) => text.replaceAll("<section-work", "<section-showcase").replaceAll("</section-work>", "</section-showcase>");
  const after = [undefined, undefined, workTemplate, workCss, rename(home), rename(about), styles.replace("\nsection-work {", "\nsection-showcase {")];
  const name = tag(page).locator(".edit-mode__name");

  // Esc cancels: nothing changes.
  await tag(page).dblclick();
  await expect(name).toBeFocused();
  await page.keyboard.type("Other Name");
  await expect(name).toHaveText("other-name");
  await page.keyboard.press("Escape");
  await expect(tag(page)).toHaveText("<section-work>");
  await expect.poll(files).toEqual(before);

  // A taken name is refused, the reason shown; the old name comes back.
  await tag(page).dblclick();
  await page.keyboard.type("section-hero");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toHaveText("There is a component <section-hero> already.");
  await expect(page.locator(".refusal-note")).toHaveText("There is a component <section-hero> already.");
  await expect(tag(page)).toHaveText("<section-work>");
  await expect.poll(files).toEqual(before);

  // "showcase" in a section becomes section-showcase, shown as typed.
  await tag(page).dblclick();
  await page.keyboard.type("showcase");
  await expect(tag(page)).toHaveText("<section-showcase>");
  await expect(tag(page).locator(".edit-mode__prefix")).toHaveText("section-");
  if (shots) await page.screenshot({ path: `${shots}/1-typing.png` });
  await page.keyboard.press("Enter");
  await expect.poll(files).toEqual(after);
  await expect(tag(page)).toHaveText("<section-showcase>");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", NEW.html);
  await expect(page.locator("#status")).toHaveText("Renamed <section-work> to <section-showcase>. 2 pages using it follow.");
  await expect(page.locator(".edit-mode__note")).toContainText("styles/sections.css (1 rule)");
  // The mode shows the template's placeholders on the renamed instance.
  await expect(frame(page).locator("section-showcase h2:visible").first()).toHaveText("Section title");
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/2-renamed.png` });

  // One Undo restores everything, the mode still on; Redo applies it again.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(files).toEqual(before);
  await expect(tag(page)).toHaveText("<section-work>");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", OLD.html);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Section title");
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(files).toEqual(after);
  await expect(tag(page)).toHaveText("<section-showcase>");
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();

  // Done; About shows the renamed instance.
  await page.getByRole("button", { name: "Done editing component" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(frame(page).locator("section-showcase h2:visible").first()).toHaveText("Recent work");
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${ABOUT}`);
  await expect(frame(page).locator("section-showcase h2:visible")).toHaveText("How we work", { timeout: 30_000 });
  if (shots) await page.screenshot({ path: `${shots}/3-about.png` });
});
