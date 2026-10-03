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
