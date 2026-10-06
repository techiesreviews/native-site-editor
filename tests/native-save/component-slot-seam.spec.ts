import { test, expect } from "@playwright/test";

test("slot seam rejects stale snapshots and fills duplicated outlets as one native edit", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const modulePath = "/src/page-builder/components.ts";
    const { createComponentTools } = await import(/* @vite-ignore */ modulePath);
    const pagePath = "index.html", templatePath = "components/test-card/test-card.html";
    const original = '<test-card></test-card><test-card><span slot="title">Other host</span></test-card>';
    const template = '<slot name="link"><a href="/">Fallback</a></slot><slot name="link">Second outlet</slot>';
    let sources = { [pagePath]: original, [templatePath]: template };
    let revision = "one", currentPath = pagePath, previewPage = pagePath, proof = true;
    let selection: any = { path: pagePath, node: [0], tag: "test-card", text: "", reason: "click", selectors: [] };
    let site: any = { components: { "test-card": templatePath }, routes: { "/": pagePath } };
    let mountedSource = original, transactions = 0, opens = 0;
    const requests: any[] = [];
    const panelHost = document.createElement("div"), codeTitle = document.createElement("div");
    document.body.append(panelHost, codeTitle);
    const editor: any = {
      isMounted: (path: string) => path === currentPath,
      getMountedSource: () => mountedSource,
      closeActiveEditGroup() {},
      replaceActiveRanges(edits: any[]) {
        transactions++;
        for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
          if (edit.expected !== sources[pagePath].slice(edit.start, edit.end)) throw new Error("unexpected source");
          sources[pagePath] = sources[pagePath].slice(0, edit.start) + edit.text + sources[pagePath].slice(edit.end);
        }
        mountedSource = sources[pagePath];
      },
    };
    const tools = createComponentTools({
      site: () => site, revision: () => revision, sources: () => sources, editor: () => editor,
      currentPath: () => currentPath, selection: () => selection, previewPage: () => previewPage,
      preview: () => ({ selectAfterUpdate: (request: any) => requests.push(request), selectNode() {} }),
      openFile: async () => { opens++; return false; }, announce() {}, error(error: unknown) { throw error; },
      images: () => [], upload: async () => undefined, links: () => [], pageLabel: (path: string) => path,
      createFiles: async () => ({ error: "unused" }), panelHost, codeTitle, addStrip() {},
    });
    tools.show(selection);
    const target = { pagePath, pageNode: [0], tag: "test-card", templatePath, expectedRevision: revision,
      expectedPageSource: original, expectedTemplateSource: template, expectedSelection: selection, isCurrent: () => proof };
    const rejected: boolean[] = [];
    const reject = (mutate: () => void, restore: () => void) => {
      mutate(); rejected.push(tools.fillInstanceSlot(target, "link")); restore();
    };
    reject(() => { revision = "two"; }, () => { revision = "one"; });
    reject(() => { proof = false; }, () => { proof = true; });
    reject(() => { selection = { ...selection }; }, () => { selection = target.expectedSelection; });
    reject(() => { selection = { ...selection, node: [0, 0], tag: "span" }; }, () => { selection = target.expectedSelection; });
    reject(() => { selection.host = { tag: "test-card", selector: "test-card" }; }, () => { delete selection.host; });
    reject(() => { selection.path = "about.html"; }, () => { selection.path = pagePath; });
    reject(() => { selection.tag = "span"; }, () => { selection.tag = "test-card"; });
    reject(() => { selection.node[0] = 1; }, () => { selection.node[0] = 0; });
    reject(() => { sources[pagePath] += '<!-- elsewhere -->'; }, () => { sources[pagePath] = original; });
    reject(() => { sources[templatePath] += '<!-- changed -->'; }, () => { sources[templatePath] = template; });
    reject(() => { mountedSource += ' '; }, () => { mountedSource = original; });
    reject(() => { currentPath = templatePath; }, () => { currentPath = pagePath; });
    reject(() => { previewPage = "about.html"; }, () => { previewPage = pagePath; });
    reject(() => { site.components["test-card"] = "other.html"; }, () => { site.components["test-card"] = templatePath; });
    rejected.push(tools.fillInstanceSlot(target, "missing"));
    tools.show({ ...selection, node: [99] });
    rejected.push(tools.fillInstanceSlot(target, "link"));
    tools.show({ ...selection, node: [1] });
    rejected.push(tools.fillInstanceSlot(target, "link"));
    tools.show({ ...selection, node: [1, 0], tag: "span" });
    rejected.push(tools.fillInstanceSlot(target, "link"));
    tools.show(selection);
    const accepted = tools.fillInstanceSlot(target, "link");
    tools.show(selection);
    const focused = (document.activeElement as HTMLElement)?.dataset.field;
    const filledTarget = { ...target, expectedPageSource: sources[pagePath] };
    const filledRejected = tools.fillInstanceSlot(filledTarget, "link");
    const output = { rejected, accepted, filledRejected, source: sources[pagePath], template: sources[templatePath], transactions, requests, opens, focused };
    tools.destroy(); panelHost.remove(); codeTitle.remove();
    return output;
  });
  expect(result.rejected).toEqual(Array(18).fill(false));
  expect(result.accepted).toBe(true);
  expect(result.filledRejected).toBe(false);
  expect(result.source).toContain('<a slot="link" href="/">Fallback</a>');
  expect(result.source.match(/slot="link"/g)).toHaveLength(1);
  expect(result.template).toBe('<slot name="link"><a href="/">Fallback</a></slot><slot name="link">Second outlet</slot>');
  expect(result.transactions).toBe(1);
  expect(result.requests).toEqual([{ path: "index.html", node: [0] }]);
  expect(result.opens).toBe(0);
  expect(result.focused).toBe("href:link");
});

// The two entry points for an empty optional slot, the canvas fill-in
// (fillInstanceSlot) and Structure's eye (structure().setVisible), must write
// the same bytes in one transaction, agree that the slot is then filled, and
// hiding it again from Structure restores the page (exactly, or up to blank
// white space).
test("canvas fill-in and Structure Show write identical source for every slot shape", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30000 });
  const cases = [
    { name: "link", template: '<h2><slot name="title"></slot></h2><p><slot name="link"></slot></p>', page: '<test-card>\n  <span slot="title">Kept</span>\n</test-card>' },
    { name: "image", template: '<figure><slot name="image"></slot></figure><h2><slot name="title">T</slot></h2>', page: '<test-card>\n  <span slot="title">Kept</span>\n</test-card>' },
    { name: "cta", template: '<slot name="cta"><a href="/x" class="b">Go &amp; see</a></slot>', page: '<test-card><span slot="title">One line</span></test-card>' },
    { name: "note", template: '<slot name="note"><p>One</p> <em>two</em></slot>', page: '<test-card></test-card>' },
    { name: "", template: '<h2><slot name="title"></slot></h2><slot></slot>', page: '<test-card>\n  <span slot="title">Kept</span>\n</test-card>' },
  ];
  const results = await page.evaluate(async (cases) => {
    const modulePath = "/src/page-builder/components.ts";
    const { createComponentTools } = await import(/* @vite-ignore */ modulePath);
    const pagePath = "index.html", templatePath = "components/test-card/test-card.html";
    const out: any[] = [];
    for (const entry of cases) {
      const run = (via: "canvas" | "structure") => {
        let sources: Record<string, string> = { [pagePath]: entry.page, [templatePath]: entry.template };
        let transactions = 0;
        const selection: any = { path: pagePath, node: [0], tag: "test-card", text: "", reason: "click", selectors: [] };
        const panelHost = document.createElement("div"), codeTitle = document.createElement("div");
        document.body.append(panelHost, codeTitle);
        const editor: any = {
          isMounted: (path: string) => path === pagePath,
          getMountedSource: () => sources[pagePath],
          captureHistoryHost: () => ({ isCurrent: () => true }),
          closeActiveEditGroup() {},
          replaceActiveRanges(edits: any[]) {
            transactions++;
            for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
              if (edit.expected !== sources[pagePath].slice(edit.start, edit.end)) throw new Error("unexpected source");
              sources[pagePath] = sources[pagePath].slice(0, edit.start) + edit.text + sources[pagePath].slice(edit.end);
            }
          },
        };
        const tools = createComponentTools({
          structureFields: via === "structure",
          site: () => ({ components: { "test-card": templatePath }, routes: { "/": pagePath } }), revision: () => "one",
          sources: () => sources, editor: () => editor, currentPath: () => pagePath, selection: () => selection, previewPage: () => pagePath,
          preview: () => ({ selectAfterUpdate() {}, selectNode() {} }), openFile: async () => false, announce() {}, error(error: unknown) { throw error; },
          images: () => [], upload: async () => undefined, links: () => [], pageLabel: (path: string) => path,
          createFiles: async () => ({ error: "unused" }), panelHost, codeTitle, addStrip() {},
        });
        const before = tools.structure(pagePath, [0])?.slots.find((slot: any) => slot.name === entry.name);
        let accepted: boolean;
        if (via === "canvas") {
          tools.show(selection);
          accepted = tools.fillInstanceSlot({ pagePath, pageNode: [0], tag: "test-card", templatePath, expectedRevision: "one",
            expectedPageSource: entry.page, expectedTemplateSource: entry.template, expectedSelection: selection, isCurrent: () => true }, entry.name);
        } else accepted = tools.structure(pagePath, [0])!.setVisible(entry.name, true);
        const filled = sources[pagePath];
        const after = tools.structure(pagePath, [0])?.slots.find((slot: any) => slot.name === entry.name);
        const hidden = tools.structure(pagePath, [0])!.setVisible(entry.name, false);
        const result = { accepted, filled, transactions, before: before && { filled: before.filled, whenEmpty: before.whenEmpty },
          after: after && { filled: after.filled }, restored: hidden && sources[pagePath].replace(/\s+/g, "") === entry.page.replace(/\s+/g, ""), exact: sources[pagePath] === entry.page, template: sources[templatePath] === entry.template };
        tools.destroy(); panelHost.remove(); codeTitle.remove();
        return result;
      };
      out.push({ name: entry.name, canvas: run("canvas"), structure: run("structure") });
    }
    return out;
  }, cases);
  for (const { name, canvas, structure } of results) {
    expect(canvas.accepted, name).toBe(true);
    expect(canvas.filled, name).not.toBe(cases.find((entry) => entry.name === name)!.page);
    expect(canvas, name).toEqual(structure);
    expect(canvas.before, name).toEqual({ filled: false, whenEmpty: canvas.before!.whenEmpty });
    expect(canvas.after, name).toEqual({ filled: true });
    expect(canvas.transactions, name).toBe(2);
    expect(canvas.restored && canvas.template, name).toBe(true);
    expect(canvas.filled, name).not.toMatch(/data-native|contenteditable|slot-ghost|page-structure|<slot/);
  }
  // Hide gives back the exact bytes for elements on lines of their own; a one-line instance, a
  // multi-element fallback and bare text keep only blank white space, which renders nothing.
  expect(results.map((entry) => [entry.name, entry.canvas.exact])).toEqual([["link", true], ["image", true], ["cta", false], ["note", false], ["", false]]);
  // The exact bytes of two shapes, so "identical" is not identically wrong.
  expect(results[0].canvas.filled).toBe('<test-card>\n  <span slot="title">Kept</span>\n  <a slot="link" href="">Link</a>\n</test-card>');
  expect(results[1].canvas.filled).toBe('<test-card>\n  <img slot="image" src="" alt="">\n  <span slot="title">Kept</span>\n</test-card>');
});
