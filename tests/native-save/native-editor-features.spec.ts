import { expect, test, type Page } from "@playwright/test";

// Boundary guard for the trimmed Monaco build (src/components/monaco.ts), which
// keeps only the contributions and grammars the code panes use. These tests
// drive the *real* editor to prove the features the product relies on stay
// reachable — find, diff review, folding, diagnostics, completions and theme
// switching — across representative languages. native-monaco-features.spec.ts
// checks each kept contribution through the UI, and also runs on the build.
//
// The most important guard is passive: a trimmed import that drops a service
// singleton (e.g. ICodeLensCache, treeViewsDndService) throws
// "[createInstance] X depends on UNKNOWN service Y" the moment an editor mounts.
// We fail the test on any such page error rather than letting the editor
// silently degrade.

const HOST = "#content";
const MONACO = "/src/components/monaco.ts";

type MonacoModule = typeof import("../../src/components/monaco");

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e.message ?? e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

async function openFile(page: Page, baseURL: string | undefined, file: string) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator(`${HOST} .view-lines`)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`${HOST} .view-line`).first()).toBeVisible();
}

// The editor loads and edits for real without any missing-service instantiation
// error (the failure mode of a trimmed contribution set that drops a service).
test("the code editor mounts and edits with no missing-service errors", async ({ page, baseURL }) => {
  const errors = watchPageErrors(page);
  await openFile(page, baseURL, "index.html");
  await page.locator(`${HOST} .view-lines`).click();
  await page.keyboard.type("<!-- probe -->\n");
  await expect(page.locator(`${HOST} .view-lines`)).toContainText("probe");
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("the head and multi-line elements open folded, and the gutter unfolds them", async ({ page, baseURL }) => {
  const errors = watchPageErrors(page);
  await openFile(page, baseURL, "index.html");
  const lines = page.locator(`${HOST} .view-lines`);
  await expect(lines).not.toContainText("<title>");
  await page.locator(`${HOST} .codicon-folding-collapsed`).first().click({ force: true });
  await expect(lines).toContainText("<title>");
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("the find widget opens and reports matches", async ({ page, baseURL }) => {
  const errors = watchPageErrors(page);
  await openFile(page, baseURL, "index.html");
  await page.locator(`${HOST} .view-lines`).click();
  await page.keyboard.press("ControlOrMeta+f");
  const widget = page.locator(`${HOST} .find-widget`);
  await expect(widget).toBeVisible();
  await page.keyboard.type("section");
  await expect(widget.locator(".matchesCount")).toHaveText(/\d+ of \d+/);
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

// The diff editor (review mode) builds under the trimmed contribution set. The
// app reaches it through the changes popover -> setReviewMode -> createDiffEditor;
// we drive the same monaco singleton the app uses so this is the real diff widget
// runtime, the code path that breaks if the diff contribution/services are gone.
test("the diff editor builds with both panes", async ({ page, baseURL }) => {
  const errors = watchPageErrors(page);
  await openFile(page, baseURL, "styles/site.css");
  await page.evaluate(async (mod) => {
    const m = (await import(/* @vite-ignore */ mod)) as MonacoModule;
    const host = document.createElement("div");
    host.id = "diff-probe";
    Object.assign(host.style, { width: "600px", height: "300px" });
    document.body.appendChild(host);
    const original = m.monaco.editor.createModel("a { color: red; }", "css");
    const modified = m.monaco.editor.createModel("a { color: blue; }", "css");
    const diff = m.monaco.editor.createDiffEditor(host, { automaticLayout: true });
    diff.setModel({ original, modified });
  }, MONACO);
  const probe = page.locator("#diff-probe .monaco-diff-editor");
  await expect(probe).toBeVisible();
  // Both panes render their own view.
  await expect(page.locator("#diff-probe .editor.original")).toBeVisible();
  await expect(page.locator("#diff-probe .editor.modified")).toBeVisible();
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("representative files render multi-color syntax highlighting", async ({ page, baseURL }) => {
  const errors = watchPageErrors(page);
  for (const file of ["index.html", "styles/site.css"]) {
    await openFile(page, baseURL, file);
    await expect
      .poll(
        async () =>
          page.evaluate((host) => {
            const classes = new Set<string>();
            document
              .querySelectorAll(`${host} .view-line span[class*="mtk"]`)
              .forEach((s) =>
                s.className.split(/\s+/).forEach((c) => c.startsWith("mtk") && classes.add(c)),
              );
            return classes.size;
          }, HOST),
        { timeout: 20_000, message: `no multi-color tokens for ${file}` },
      )
      .toBeGreaterThan(1);
  }
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

// Grammars load lazily: create a model per language and wait until its tokenizer
// has loaded (a real grammar yields several token types on one line; an
// unregistered/plaintext language yields exactly one). Proves the grammars we
// still register work, in the real browser.
test("registered grammars load and tokenize", async ({ page, baseURL }) => {
  const errors = watchPageErrors(page);
  await openFile(page, baseURL, "index.html");
  const samples: Record<string, string> = {
    html: '<div class="x">hi</div>',
    css: "a { color: red; }",
    scss: "$c: red; a { color: $c; }",
    json: '{ "a": 1, "b": true }',
    javascript: "const x = 42; // hi",
    typescript: "const x: number = 42; // hi",
  };
  for (const [lang, code] of Object.entries(samples)) {
    await expect
      .poll(
        async () =>
          page.evaluate(
            async ([mod, language, source]) => {
              const m = (await import(/* @vite-ignore */ mod)) as MonacoModule;
              // Ensure the language's tokenizer is requested/loaded.
              const uri = m.monaco.Uri.parse(`inmemory://probe/${language}`);
              if (!m.monaco.editor.getModel(uri))
                m.monaco.editor.createModel(source, language, uri);
              const line = m.monaco.editor.tokenize(source, language)[0];
              return new Set(line.map((t) => t.type)).size;
            },
            [MONACO, lang, code] as const,
          ),
        { timeout: 20_000, message: `grammar for ${lang} did not tokenize` },
      )
      .toBeGreaterThan(1);
  }
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("CSS diagnostics surface from the language service", async ({ page, baseURL }) => {
  const errors = watchPageErrors(page);
  await openFile(page, baseURL, "styles/site.css");
  await page.locator(`${HOST} .view-lines`).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n.broken { color: }\n");
  await expect
    .poll(
      async () =>
        page.evaluate(async (mod) => {
          const m = (await import(/* @vite-ignore */ mod)) as MonacoModule;
          return m.monaco.editor.getModelMarkers({}).length;
        }, MONACO),
      { timeout: 20_000, message: "expected CSS markers from the worker" },
    )
    .toBeGreaterThan(0);
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("CSS completions come from the language service", async ({ page, baseURL }) => {
  const errors = watchPageErrors(page);
  await openFile(page, baseURL, "styles/site.css");
  await page.locator(`${HOST} .view-lines`).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n.probe { colo");
  await page.keyboard.press("Control+Space");
  const suggest = page.locator(`${HOST} .suggest-widget`);
  await expect(suggest).toBeVisible({ timeout: 15_000 });
  await expect(suggest).toContainText("color");
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("the editor follows the light and dark color scheme", async ({ page, baseURL }) => {
  const errors = watchPageErrors(page);
  await page.emulateMedia({ colorScheme: "light" });
  await openFile(page, baseURL, "index.html");
  await expect(page.locator(`${HOST} .monaco-editor.vs`).first()).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(`${HOST} .monaco-editor.vs-dark`).first()).toBeVisible();
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});
