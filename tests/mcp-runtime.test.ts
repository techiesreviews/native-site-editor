import { MEDIA_ADDING_CHOICES, MEDIA_ADDING_DEFAULTS } from "../src/page-builder/media-settings";
import { applySiteCommand, type AgentSiteActions } from "../src/agent-site";
import { createFileOperationsController, type FileOperationsPorts } from "../src/controllers/file-operations-controller";
import { DraftStore } from "../src/drafts";
import { resolveNativeProject } from "../shared/native-project";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace } from "./fakes/memory-workspace";
import { applyAgentMedia } from "../src/agent-media-actions";
import type { AgentCommand } from "../shared/agent";
import { createMediaController, type MediaControllerPorts } from "../src/controllers/media-controller";
import type { MediaModule } from "../src/controllers/media-controller";
import type { MediaPickerOptions } from "../src/page-builder/media-picker";
import type { MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { readSource } from "../src/page-builder/source-tree";
import { mediaImageForPlacement } from "../src/page-builder/media-markup";
import { MEDIA_RECORDS_PATH } from "../shared/media-records";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { INSPECTION_LIMIT, MEDIA_LIST_LIMIT, MEDIA_PREVIEW_LIMIT, THREAD_LIMIT, THREAD_TEXT_LIMIT, agentResultLimit, applyReplacements, textHash } from "../shared/agent.ts";
import { mediaListReport } from "../src/agent-media.ts";
import { mediaUsageRecords } from "../src/page-builder/media-usage.ts";
import { parseMediaRecords } from "../shared/media-records.ts";
import { requestOperation } from "../worker/agent-requests.ts";
import { componentsChapter, mediaChapter, siteConventions } from "../worker/site-conventions.ts";
import { MEDIA_RECORDS_REFUSED } from "../shared/protected-paths.ts";
import { editorTab, files, origin, payload, repo, signIn, siteContext, startWorker, workerFetch } from "./mcp-harness.ts";

test("applyReplacements needs each old text exactly once, or all", () => {
  assert.deepEqual(applyReplacements("a b a", [{ oldText: "b", newText: "c" }]), { ok: true, text: "a c a" });
  assert.equal(applyReplacements("a b a", [{ oldText: "a", newText: "c" }]).ok, false);
  assert.deepEqual(applyReplacements("a b a", [{ oldText: "a", newText: "c", all: true }]), { ok: true, text: "c b c" });
  assert.equal(applyReplacements("a", [{ oldText: "z", newText: "c" }]).ok, false);
  assert.deepEqual(
    applyReplacements("one two", [{ oldText: "one", newText: "1" }, { oldText: "1 two", newText: "done" }]),
    { ok: true, text: "done" },
  );
});

test("a request kept from before threads reads as one, and its answer starts the thread from its text and reply", () => {
  const legacy: any = {
    id: "req-old",
    text: "Fix this",
    createdAt: 1,
    repoId: 1,
    repository: "lex/site",
    state: "question",
    element: { file: "index.html", id: "1", tag: "h1", text: "Hi" },
    returnedTo: ["grant-1"],
    reply: { status: "question", message: "Which way?", at: 2 },
  };
  const { list, result } = requestOperation([legacy], { type: "answer", id: "req-old", text: "The short way" }) as any;
  assert.equal(result.state, "open");
  assert.equal(result.returnedTo, undefined);
  assert.deepEqual(list[0].thread.map((item: any) => [item.from, item.text]), [["user", "Fix this"], ["agent", "Which way?"], ["user", "The short way"]]);
  assert.equal(requestOperation(list, { type: "take-requests", grantId: "grant-1", repoId: 1 }).result.requests.length, 1);
});

test("MCP site tools read the site, queue guarded changes for the editor tab, report them, and revoke access in Workers", async () => {
  const { worker, github } = await startWorker();
  let client: Client | undefined;
  try {
    const { cookie } = await signIn(worker);
    const tab = editorTab(worker, cookie);
    const connection = await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id });
    assert.equal(connection.status, 200);
    const { id, token } = await connection.json();
    // The tab sees the connection and starts sharing.
    assert.deepEqual((await tab.hub()).grants.map((grant: any) => [grant.id, grant.via]), [[id, "token"]]);
    const context = await siteContext();
    assert.equal((await tab.share(context)).status, 200);

    const denied = await worker.dispatchFetch(origin + "/mcp", {
      method: "POST",
      headers: { Origin: "https://evil.example", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(denied.status, 403);
    const legacy = await worker.dispatchFetch(origin + "/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy-test", version: "1" } } }),
    });
    assert.equal(legacy.status, 200);
    assert.ok((await legacy.text()).includes('"protocolVersion":"2025-11-25"'));

    const transport = new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: workerFetch(worker),
    });
    client = new Client({ name: "integration-test", version: "1.0.0" });
    await client.connect(transport);
    const listing = (await client.listTools()).tools;
    // The descriptions speak of the repository as the site, not the old src/ layout.
    assert.doesNotMatch(JSON.stringify(listing), /src\/|page comment|native\.json|#\//);
    const tools = listing.map((tool) => tool.name).sort();
    assert.deepEqual(tools, [
      "add_section", "adding_settings", "change_collection", "create_page", "delete_file", "describe_media", "edit_file", "export_site", "frame_image", "get_command_status", "get_page", "get_selection", "get_site",
      "inspect_preview", "keep_media", "list_files", "list_media", "make_component", "move_file", "move_section", "open_page", "place_media", "preview_media", "read_file", "remove_media", "remove_section", "replace_media", "reply_to_request", "restore_media", "set_page_details",
      "wait_for_requests", "write_file",
    ]);
    const documentation = readFileSync(new URL("../docs/mcp.md", import.meta.url), "utf8");
    for (const name of tools) assert.ok(documentation.includes(`\`${name}\``), `docs/mcp.md must list ${name}`);
    const documentedCount = documentation.match(/The server exposes (\d+) tools/);
    assert.ok(documentedCount, "docs/mcp.md must state the tool count");
    assert.equal(Number(documentedCount[1]), listing.length);
    const call = (name: string, args: Record<string, unknown> = {}) => client!.callTool({ name, arguments: args });

    // The site: settings, pages as a tree with their head details, the
    // not-found page, components, stylesheets, the preview selection, drafts.
    const site = payload(await call("get_site"));
    assert.equal(site.repository, "lex/starter");
    assert.equal(site.stale, false);
    assert.equal(site.native, true);
    assert.equal("manifest" in site, false);
    assert.deepEqual(site.settings, { file: ".editor/config.json", name: "Starter", url: "https://starter.example/" });
    assert.deepEqual(site.pages.map((page: any) => [page.route, page.new ?? false]), [["/", false], ["/about/", false], ["/new/", true], ["/404.html", false]]);
    assert.equal(site.pages[1].description, "Who we are.");
    assert.deepEqual(site.pages[1].subpages, [{ route: "/about/team/", file: "about/team/index.html", title: "Team" }]);
    assert.deepEqual(site.notFound, { route: "/404.html", file: "404.html" });
    const feature = site.components.find((item: any) => item.tag === "feature-block");
    assert.deepEqual(feature, {
      tag: "feature-block", file: "components/feature-block/feature-block.html", css: "components/feature-block/feature-block.css", section: true, slots: ["title"],
      variants: [
        { attribute: "data-layout", label: "Layout", kind: "choice", values: [
          { value: "split", label: "Split", conditions: [] },
          { value: "centered", label: "Centered", conditions: ["@media (min-width: 60rem)"] },
        ], conditions: [] },
        { attribute: "data-wide", label: "Wide", kind: "yes-no", form: "bare", values: [], conditions: [] },
        { attribute: "data-color-scheme", label: "Color scheme", kind: "choice", values: [{ value: "dark", label: "Dark", conditions: ["@media (min-width: 40rem)"] }], conditions: ["@media (min-width: 40rem)"] },
        { attribute: "data-tone", label: "Tone", kind: "choice", values: [{ value: "dark", label: "Dark", conditions: [] }], conditions: [] },
      ],
    });
    const header = site.components.find((item: any) => item.tag === "site-header");
    assert.deepEqual(header.variants, [feature.variants[2]]);
    assert.equal("variantWarnings" in header, false);
    // One batched query a round: the pages, component CSS and the sheets the tab
    // lists; the loader the pages load; the script the loader imports.
    assert.equal(github.requests.filter((path) => path === "/graphql").length, 3, "saved variant files are batched");
    assert.equal(github.requests.filter((path) => path.includes("/git/blobs/")).length, 1, "only the truncated import needs an individual read");
    assert.deepEqual(site.stylesheets, [{ file: "styles/site.css", imports: ["styles/tokens.css"] }]);
    assert.deepEqual(site.editor.previewSelection, { file: "index.html", id: "1.0", tag: "section", text: "Welcome" });
    assert.deepEqual(site.changes.map((change: any) => change.kind), ["M", "A"]);
    assert.ok(!JSON.stringify(site).includes("github-private-token"));
    const conventions = JSON.stringify(await client.readResource({ uri: "native-site://conventions" }));
    assert.doesNotMatch(conventions, /add the tag to the loader|TAGS/);
    assert.match(conventions, /:not\(:defined\)/);
    assert.match(conventions, /_redirects/);
    assert.match(conventions, /\.editor\/config\.json/);
    assert.doesNotMatch(conventions, /src\/(?:pages|components|styles|public)|page comment|native\.json/);
    // The Components chapter, from its heading to the next `## `, is the one
    // source of how components are made; the starter's AGENTS.md copies it.
    const served = ((await client.readResource({ uri: "native-site://conventions" })).contents[0] as { text: string }).text;
    const chapter = componentsChapter(served)!;
    const servedMedia = mediaChapter(served);
    assert.ok(servedMedia?.startsWith("## Media\n"));
    assert.equal(servedMedia, mediaChapter(siteConventions));
    for (const rule of ["adding_settings", "media/images/", "srcset", "### Shape, focus and trims", "frame_image", "whole new trim", "### Removing, keeping and restoring", "### Renaming and Replace everywhere"]) assert.ok(servedMedia.includes(rule));
    assert.doesNotMatch(servedMedia.slice(1), /^## /m);
    for (const name of ["list_media", "preview_media", "place_media", "describe_media", "change_collection", "adding_settings", "frame_image", "remove_media", "keep_media", "restore_media", "replace_media"])
      assert.match(listing.find(tool => tool.name === name)!.description!, /Media chapter.*native-site:\/\/conventions/);
    assert.match(client.getInstructions()!, /Media chapter before listing, placing or describing media, changing collections, reading or changing adding settings, using frame_image/);
    assert.ok(chapter.startsWith("## Components\n"));
    assert.doesNotMatch(chapter.slice(1), /^## /m);
    assert.match(chapter, /```html\n<section>[\s\S]*<\/section>\n```$/, "the chapter ends with its example template");
    for (const rule of [
      // File layout: a template plus optional CSS, nothing registered.
      /A new component is just its files\*\*: its template, `components\/<tag>\/<tag>\.html`, and, when it has styles of its own, the sibling `components\/<tag>\/<tag>\.css`\. Nothing is registered/,
      // Whole-element slots and the default editables rule.
      /`<slot name="title"><h2>Headline<\/h2><\/slot>`, not `<h2><slot name="title">Headline<\/slot><\/h2>`/,
      /Inline `a`, `strong`, `em` and `br` stay inside it as rich text/,
      /a link is a slot of its own only when it stands alone/,
      /every `<img>` and `<picture>`, whatever its alt text\. Inline `<svg>` icons and CSS backgrounds stay fixed/,
      /a `<ul>` or `<ol>` is one slot, `list`/,
      /the first heading is `title`, a paragraph `text`, then `image`, `link` and `list`, numbered on repeats \(`text-2`\)/,
      /When parts share a role, each one's own class tells them apart/,
      /a nested instance is one whole slot/,
      /In a section component that the page fills at all, each slot the page leaves out is hidden/,
      // A repeated item is its own card component, in an items slot.
      /A repeated item [^\n]* is a component of its own, `card-…`/,
      // A card component is the editor's (component-model.ts isCardComponent, hasHeadingSlot): `card-…` with a heading slot.
      /A \*\*card component\*\* is a `card-…` component whose template has a heading slot: a slot whose fallback is one heading \(`<slot name="title"><h3>Title<\/h3><\/slot>`\), or a slot that is a heading's only content/,
      /\*\*items slot\*\*: the unnamed slot, or a slot whose fallback is card components only \(one or more, with only white space between them\)/,
      /A slot whose fallback is card components is an items slot instead/,
      /<slot><card-project><\/card-project><\/slot>/,
      /Add card adds a fresh instance of the items slot's card component/,
      /A named slot is an items slot only when its fallback is card components, so name only cards `card-…` and give each a heading slot: a `card-…` component without one is no card component, and a slot holding it is an ordinary slot/,
      /a named items slot [^\n]* its items carry that name: `<card-service slot="services">`/,
      // Card links: a link slot, or the title's link stretched by the shared card link rule.
      /through a link slot/,
      /the title's whole content is one link/,
      /Card components set `:host \{ position: relative; \}`/,
      /\.cards > \* :is\(h2, h3, h4, \[slot="title"\]\) > a:only-child::after,\n  :not\(main, body, section, div\) > \* > \[slot="title"\] > a:only-child::after/,
      /\.cards > \* a:not\(:is\(h2, h3, h4, \[slot="title"\]\) > a:only-child\) \{ position: relative; z-index: 1; \}/,
      /:not\(main, body, section, div\) > :has\(> \[slot="title"\] > a:only-child\) a:not\(\[slot="title"\] > a:only-child\) \{ position: relative; z-index: 1; \}/,
      /There is no `stretched` class/,
      /A card that is one link around everything [^\n]* becomes a card component without the wrapping link/,
      // Variants.
      /a rule on the bare attribute \(`\[data-x="v"\]`\) is offered on every component \(except `data-tone`, below\)/,
      /:host\(\[data-layout="image-left"\]\) \{ \.media \{ order: 2; \} \}/,
      /\.media \{ :host\(\[data-layout="image-left"\]\) & \{ order: 2; \} \}/,
      /Never `:host\[data-layout="…"\]` or `:host \{ &\[data-layout="…"\] \{ … \} \}`/,
      /written bare on the instance \(`<section-split data-reverse>`\) when a rule matches its presence, and as `data-reverse="true"` when the CSS only matches `"true"`/,
      /`data-layout` \(`content-left`, `image-left`, `centered`\)/,
      // Tones on page bands only, where the site defines them.
      /Tones work this way where the site's CSS defines them/,
      /Tone rules should keep text readable \(WCAG AA\)/,
      /`data-tone` colours a page band: a section component, a plain `<section>`, the header or the footer/,
      /Its values are `light`, `dark`, `brand` and `accent`\. With no `data-tone`, the band follows the page, which may follow the visitor's light or dark setting; `light` and `dark` force a scheme/,
      /plain `\[data-tone="…"\]` rules \(never in a component's CSS\)/,
      /`contrast-color\(\)` of the surface under `@supports`/,
      // The header, footer and skip link.
      /The header and footer are components with no slots/,
      /Each page puts the skip link, `<a class="skip" href="#main">Skip to content<\/a>`, before `<site-header>` as a plain link, so it works without JavaScript/,
      // Base resets leave slotted parts to component CSS.
      /Base element resets skip slotted parts the same way \(`:is\(h1, h2, p, ul, ol\):not\(\[slot\]\) \{ margin: 0 \}`, not `p \{ margin: 0 \}`\): the component's CSS then sets the margins of what a page slots in/,
      // How a section component is placed through the editor.
      /write the template \(and its CSS, if it has any\), then place it with add_section/,
      // What add_section copies (src/native-insert.ts, slotMarkup).
      /add_section writes the tag with a copy of each named slot's fallback that is one element holding only text and inline markup/,
      /is copied inside a `<span slot="…">`\. It copies nothing for the unnamed slot or for any other fallback/,
    ]) assert.match(chapter, rule);
    assert.doesNotMatch(chapter, /`card-…` instances/, "a `card-…` tag alone does not make an items slot; the card needs a heading slot");
    assert.match(chapter, /<section-work>[\s\S]*<card-project>\s*<h3 slot="title">[^\n]*<\/h3>\s*<p slot="body" class="body">A one-page site/, "the card-project example uses its real body slot and fallback class");
    assert.match(chapter, /a component rule beats a shared rule on the template's own elements\. On an element a page slots in, the page's CSS beats the component's `::slotted\(\)` rules whatever the layers[^\n]*`:not\(\[slot\]\)`[^\n]*Both hold for declarations without `!important`, which reverses them/, "shadow-root layers do not override document styles on slotted elements");
    // The tool descriptions and the server's instructions point to the
    // chapter and state no component rules of their own.
    const described = (name: string) => listing.find((tool) => tool.name === name)!.description!;
    for (const text of [client.getInstructions()!, described("write_file"), described("add_section"), described("make_component"), described("get_site")])
      assert.match(text, /Components chapter/);
    for (const text of [client.getInstructions()!, ...listing.map((tool) => tool.description ?? "")])
      assert.doesNotMatch(text, /<slot\b|slot=|whole element|fallback|::slotted|registered|data-(?:layout|tone)|card-/);
    const prompt = await client.getPrompt({ name: "edit_site", arguments: { goal: "Add a team page" } });
    assert.match(JSON.stringify(prompt), /Add a team page/);

    // Files: drafts win over GitHub, and every read carries its hash.
    const listed = payload(await call("list_files"));
    assert.deepEqual(listed.files.filter((path: string) => /\.html(?: \(\w\))?$/.test(path) && !path.startsWith("components/")), ["404.html", "about/index.html (M)", "index.html", "new/index.html (A)"]);
    assert.deepEqual(payload(await call("list_files", { folder: "styles" })).files, ["styles/site.css", "styles/tokens.css"]);
    const about = payload(await call("read_file", { path: "about/index.html" }));
    assert.equal(about.source, "draft");
    assert.match(about.content, /About the studio/);
    const css = payload(await call("read_file", { path: "styles/site.css" }));
    assert.equal(css.source, "github");
    assert.equal(css.hash, await textHash(files["styles/site.css"]));
    assert.equal((await call("read_file", { path: "missing.html" })).isError, true);
    const page = payload(await call("get_page", { page: "/" }));
    assert.equal(page.file, "index.html");
    assert.deepEqual(page.sections.map((section: any) => section.id), ["1.0", "1.1"]);
    assert.match(page.html, /<h1>Welcome<\/h1>/);
    // A page by its URL as a link gives it, or by its file.
    for (const ref of ["/about/", "/about", "about/", "/about/index.html", "about/index.html"])
      assert.equal(payload(await call("get_page", { page: ref, source: false })).file, "about/index.html", ref);
    const notFound = payload(await call("get_page", { page: "/404.html", source: false }));
    assert.deepEqual([notFound.route, notFound.file, notFound.title], ["/404.html", "404.html", "Page not found"]);
    assert.equal((await call("get_page", { page: "/nowhere/" })).isError, true);

    // edit_file needs the hash just read, and a unique old text.
    const stale = await call("edit_file", { path: "styles/site.css", expectedHash: "0".repeat(64), edits: [{ oldText: "margin: 0", newText: "margin: 1px" }], waitSeconds: 0 });
    assert.equal(stale.isError, true);
    assert.match(JSON.stringify(stale), /changed since you read it/);
    const edit = { path: "styles/site.css", expectedHash: css.hash, edits: [{ oldText: "margin: 0", newText: "margin: 1px" }], requestId: "css-1", waitSeconds: 0 };
    assert.equal(payload(await call("edit_file", edit)).state, "pending");
    assert.equal(payload(await call("edit_file", edit)).state, "pending", "a retry with the same requestId is the same change");
    const queued = (await tab.hub()).commands;
    assert.equal(queued.length, 1);
    assert.equal(queued[0].operation, "write_file");
    assert.equal(queued[0].content, files["styles/site.css"].replace("margin: 0", "margin: 1px"));
    assert.equal(queued[0].expectedHash, css.hash);
    // A second tab cannot take a change the first one claimed.
    assert.equal((await tab.claim("css-1", queued[0].grantId)).status, 200);
    const other = editorTab(worker, cookie, "tab-test-0002");
    assert.equal((await other.claim("css-1", queued[0].grantId)).status, 409);
    assert.equal((await tab.ack("css-1", queued[0].grantId, "applied", { message: "Changed.", result: { path: "styles/site.css", hash: "f".repeat(64) } })).status, 200);
    const done = payload(await call("get_command_status", { requestId: "css-1" }));
    assert.equal(done.state, "applied");
    assert.equal(done.result.hash, "f".repeat(64));

    // write_file: replacing needs the hash, creating needs a free path.
    assert.equal((await call("write_file", { path: "styles/site.css", content: "x", waitSeconds: 0 })).isError, true);
    assert.equal((await call("write_file", { path: "about", content: "x", waitSeconds: 0 })).isError, true);
    assert.equal((await call("write_file", { path: ".git/config", content: "x", waitSeconds: 0 })).isError, true);
    // Workflows run with the repository's secrets: no tool reaches them, by file or by folder.
    for (const path of [".github/workflows/pwn.yml", ".GitHub/Workflows/pwn.yml", "./.github//workflows/pwn.yml", ".github./workflows./pwn.yml", ".github/workflows", ".github", ".github/actions/deploy/action.yml", ".github/CODEOWNERS"]) {
      assert.equal((await call("write_file", { path, content: "x", waitSeconds: 0 })).isError, true, path);
      assert.equal((await call("delete_file", { path, waitSeconds: 0 })).isError, true, `delete ${path}`);
      assert.equal((await call("move_file", { path: "styles/site.css", to: path, waitSeconds: 0 })).isError, true, `move to ${path}`);
      assert.equal((await call("move_file", { path, to: "elsewhere", waitSeconds: 0 })).isError, true, `move from ${path}`);
    }
    // Media records are readable, but only Media in the editor changes them.
    for (const path of [".editor/media.json", ".Editor/media.json", "./.editor//media.json", ".editor", "./.Editor//"]) {
      const operations = [
        ["write_file", { path, content: "x" }],
        ["edit_file", { path, expectedHash: css.hash, edits: [{ oldText: "x", newText: "y" }] }],
        ["delete_file", { path }],
        ["move_file", { path, to: "elsewhere" }],
        ["move_file", { path: "styles/site.css", to: path }],
      ] as const;
      for (const [name, args] of operations) {
        const refused = await call(name, { ...args, waitSeconds: 0 });
        assert.equal(refused.isError, true, `${name} ${path}`);
        assert.ok(JSON.stringify(refused).includes(MEDIA_RECORDS_REFUSED), `${name} ${path}`);
      }
    }
    const records = await call("read_file", { path: ".editor/media.json" });
    assert.ok(!records.isError);
    assert.equal(payload(records).content, files[".editor/media.json"]);
    const openedRecords = await call("open_page", { page: ".editor/media.json", requestId: "open-media-records", waitSeconds: 0 });
    assert.ok(!openedRecords.isError, JSON.stringify(openedRecords));
    assert.equal(payload(openedRecords).state, "pending");
    const openCommand = (await tab.hub()).commands.find((item: any) => item.id === "open-media-records");
    assert.equal(openCommand.operation, "open_page");
    await tab.claim(openCommand.id, openCommand.grantId);
    await tab.ack(openCommand.id, openCommand.grantId, "applied");
    assert.equal(payload(await call("write_file", { path: "styles/extra.css", content: "p {}\n", requestId: "new-css", waitSeconds: 0 })).state, "pending");
    assert.equal((await call("write_file", { path: "styles/extra.css", content: "a {}\n", waitSeconds: 0 })).isError, true, "one waiting change per file");

    // Make component validates cheaply, then leaves planning to the tab.
    const makeTool = listing.find((tool) => tool.name === "make_component")!;
    assert.deepEqual(makeTool.inputSchema.required, ["page", "element", "tag", "expectedHash"]);
    assert.deepEqual(Object.keys(makeTool.inputSchema.properties!).sort(), ["element", "expectedHash", "fixed", "page", "requestId", "tag", "waitSeconds"]);
    const makeArgs = { page: "/", element: "1.0", tag: "section-welcome", expectedHash: page.hash, waitSeconds: 0 };
    for (const [extra, reason] of [
      [{ element: "bad.id" }, /not an element id/],
      [{ tag: "section" }, /not a valid custom-element name/],
      [{ tag: "font-face" }, /not a valid custom-element name/],
      [{ tag: "feature-block" }, /component.*already/],
      [{ expectedHash: "0".repeat(64) }, /changed since you read it/],
      [{ element: "" }, /not an element id/],
    ] as const) {
      const refused = await call("make_component", { ...makeArgs, ...extra });
      assert.equal(refused.isError, true);
      assert.match(JSON.stringify(refused), reason);
    }
    // <main> and the header and footer components are refused before queueing.
    const refusing = structuredClone(context);
    refusing.site!.outlines[0].containers.push({ id: "1.5", tag: "main", children: 0 });
    refusing.site!.outlines[0].sections.push({ id: "1.6", tag: "site-header" }, { id: "1.7", tag: "card-note" });
    await tab.share(refusing);
    for (const [element, reason] of [["1.5", /A <main> cannot be a component/], ["1.6", /site's header component already/], ["1.7", /<card-note> is a component already/]] as const) {
      const refused = await call("make_component", { ...makeArgs, element });
      assert.equal(refused.isError, true);
      assert.match(JSON.stringify(refused), reason);
    }
    await tab.share(context);
    for (const extra of [{ fixed: Array(33).fill("title") }, { fixed: ["x".repeat(101)] }, { fixed: [1] }]) {
      assert.equal((await call("make_component", { ...makeArgs, ...extra })).isError, true);
    }
    const made = await call("make_component", { ...makeArgs, fixed: ["title"], requestId: "make-1" });
    assert.equal(payload(made).state, "pending", JSON.stringify(made));
    const makeCommand = (await tab.hub()).commands.find((item: any) => item.id === "make-1");
    assert.equal(makeCommand.operation, "make_component");
    assert.equal(makeCommand.path, "index.html");
    assert.equal(makeCommand.expectedHash, page.hash);
    assert.deepEqual(makeCommand.args, { element: "1.0", tag: "section-welcome", fixed: ["title"] });
    await tab.claim("make-1", makeCommand.grantId);
    await tab.ack("make-1", makeCommand.grantId, "applied");

    // Sections: section components only, at a place the outline has, on the page hash read.
    const homeHash = page.hash;
    assert.equal((await call("add_section", { page: "/", component: "site-header", expectedHash: homeHash, waitSeconds: 0 })).isError, true);
    assert.equal((await call("add_section", { page: "/", component: "feature-block", expectedHash: "0".repeat(64), waitSeconds: 0 })).isError, true);
    assert.equal((await call("add_section", { page: "/", component: "feature-block", expectedHash: homeHash, after: "9.9", waitSeconds: 0 })).isError, true);
    const added = await call("add_section", { page: "/", component: "feature-block", expectedHash: homeHash, after: "1.0", requestId: "add-1", waitSeconds: 0 });
    assert.equal(payload(added).state, "pending", JSON.stringify(added));
    const addCommand = (await tab.hub()).commands.find((item: any) => item.id === "add-1");
    assert.deepEqual(addCommand.args, { component: "feature-block", container: "1", index: 1 });
    assert.equal(addCommand.path, "index.html");

    // Waiting: a change the tab applies meanwhile comes back applied.
    const waiting = call("create_page", { title: "Our team", parent: "/about/", requestId: "page-1", waitSeconds: 5 });
    let pageCommand: any;
    for (let tries = 0; !pageCommand && tries < 50; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      pageCommand = (await tab.hub()).commands.find((item: any) => item.id === "page-1");
    }
    assert.deepEqual(pageCommand.args, { parent: "/about/", title: "Our team" });
    assert.equal(pageCommand.path, "about");
    await tab.claim("page-1", pageCommand.grantId);
    await tab.ack("page-1", pageCommand.grantId, "applied", { result: { file: "about/our-team/index.html", route: "/about/our-team/" } });
    const created = payload(await waiting);
    assert.equal(created.state, "applied");
    assert.equal(created.result.route, "/about/our-team/");
    assert.equal((await call("create_page", { title: "Orphan", parent: "/nowhere/", waitSeconds: 0 })).isError, true);
    assert.equal((await call("create_page", { title: "Orphan", parent: "/404.html", waitSeconds: 0 })).isError, true, "a single-file page has no subpages");

    // A conflict the tab reports is an error result.
    const details = await call("set_page_details", { page: "about/index.html", description: "Who we are", requestId: "details-1", waitSeconds: 0 });
    assert.equal(payload(details).state, "pending");
    const detailsCommand = (await tab.hub()).commands.find((item: any) => item.id === "details-1");
    await tab.claim("details-1", detailsCommand.grantId);
    await tab.ack("details-1", detailsCommand.grantId, "conflict", { message: "The page changed." });
    const conflicted = await call("get_command_status", { requestId: "details-1" });
    assert.equal(conflicted.isError, true);
    assert.equal(payload(conflicted).state, "conflict");

    // The connection follows the repository the tab shows, when the
    // installation includes it.
    const otherRepo = { ...repo, id: 2, name: "other", full_name: "lex/other" };
    github.others.push(otherRepo);
    await tab.share({ ...context, repository: { id: 2, fullName: "lex/other" } });
    assert.equal(payload(await call("get_site")).repository, "lex/other");
    await tab.share(context);
    assert.equal(payload(await call("get_site")).repository, "lex/starter");
    assert.equal(github.writes, 0, "MCP must not write to GitHub");

    // Tool calls reuse the installation listing for a minute instead of
    // asking GitHub twice each; one removed from the installation stops
    // working within that minute (tests/github.test.ts). Revoked and logged
    // out stop at once.
    const listings = github.requests.filter((path) => path === "/user/installations").length;
    github.allowed = false;
    await client!.listTools();
    await call("get_site");
    assert.equal(github.requests.filter((path) => path === "/user/installations").length, listings, "tool calls reuse a recent listing");
    github.allowed = true;
    assert.equal((await tab.post("/api/agent/revoke", { id })).status, 200);
    assert.deepEqual((await tab.hub()).grants, []);
    await assert.rejects(() => client!.listTools());
    const reconnected = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id })).json();
    await tab.post("/auth/logout", {});
    const expired = await worker.dispatchFetch(origin + "/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${reconnected.token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(expired.status, 401);
    assert.equal(expired.headers.get("cache-control"), "no-store");
    assert.match(expired.headers.get("www-authenticate") ?? "", /resource_metadata="https:\/\/editor\.example\/\.well-known\/oauth-protected-resource\/mcp"/);
  } finally {
    await client?.close();
    await worker.dispose();
  }
});

test("every draft up to 1 MB is readable and writable however many there are; a larger or binary one is refused by name", async () => {
  const { worker } = await startWorker();
  let client: Client | undefined;
  try {
    const { cookie } = await signIn(worker);
    const tab = editorTab(worker, cookie);
    const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id })).json();
    // 150 drafts of about 5 KB each (750 KB, past the old 400 KB budget),
    // listed by hash only; their texts go apart.
    const texts = Array.from({ length: 150 }, (_, index) => `/* ${index} */\n${`.rule-${index} { color: red; }\n`.repeat(200)}`);
    const hashes = await Promise.all(texts.map((text) => textHash(text)));
    const context = await siteContext();
    context.drafts = [
      ...texts.map((_, index) => ({ path: `styles/draft-${index}.css`, baseSha: null, updatedAt: Date.now(), hash: hashes[index] })),
      { path: "styles/huge.css", baseSha: null, updatedAt: Date.now(), size: 1536 * 1024 },
      { path: "images/logo.png", baseSha: null, updatedAt: Date.now(), binary: true },
    ];
    context.site!.changes = context.drafts.map((draft) => ({ kind: "A" as const, path: draft.path }));
    const shared = await tab.share(context);
    assert.equal(shared.status, 200);
    assert.deepEqual(new Set((await shared.json()).missing), new Set(hashes), "the Worker asks for every text it lacks");

    client = new Client({ name: "drafts-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: workerFetch(worker),
    }));
    const call = (name: string, args: Record<string, unknown> = {}) => client!.callTool({ name, arguments: args });
    const early = await call("read_file", { path: "styles/draft-0.css" });
    assert.equal(early.isError, true);
    assert.match(JSON.stringify(early), /still sharing/);

    // A text must match its hash; one the context does not name is not kept.
    assert.equal((await tab.post("/api/agent/drafts", { texts: [{ hash: hashes[1], content: "not it" }] })).status, 400);
    const stray = await tab.post("/api/agent/drafts", { texts: [{ hash: await textHash("stray"), content: "stray" }] });
    assert.equal((await stray.json()).stored, 0);
    for (let at = 0; at < texts.length; at += 50) {
      const batch = texts.slice(at, at + 50).map((content, index) => ({ hash: hashes[at + index], content }));
      const response = await tab.post("/api/agent/drafts", { texts: batch });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).stored, 50);
    }
    assert.deepEqual((await (await tab.share(context)).json()).missing, [], "nothing is sent twice");
    for (const [index, text] of texts.entries()) {
      const file = payload(await call("read_file", { path: `styles/draft-${index}.css` }));
      assert.equal(file.content, text, `draft ${index}`);
      assert.equal(file.hash, hashes[index]);
      assert.equal(file.source, "draft");
    }

    // Writes carry a whole file, kept apart from the hub and filled in for the tab.
    const edited = await call("edit_file", { path: "styles/draft-7.css", expectedHash: hashes[7], edits: [{ oldText: "/* 7 */", newText: "/* seven */" }], requestId: "big-1", waitSeconds: 0 });
    assert.equal(payload(edited).state, "pending");
    const large = `/* large */\n${"p { margin: 0; }\n".repeat(40_000)}`;
    assert.ok(large.length > 600 * 1024 && large.length < 1024 * 1024);
    assert.equal(payload(await call("write_file", { path: "styles/large.css", content: large, requestId: "big-2", waitSeconds: 0 })).state, "pending");
    const commands = (await tab.hub()).commands;
    assert.equal(commands.find((command: any) => command.id === "big-1").content, texts[7].replace("/* 7 */", "/* seven */"));
    assert.equal(commands.find((command: any) => command.id === "big-2").content, large);
    const tooLarge = await call("write_file", { path: "styles/too-large.css", content: "é".repeat(600_000), waitSeconds: 0 });
    assert.equal(tooLarge.isError, true);
    assert.match(JSON.stringify(tooLarge), /up to 1 MB/);

    // A draft past the limit, or a binary one, says which.
    const huge = await call("read_file", { path: "styles/huge.css" });
    assert.equal(huge.isError, true);
    assert.match(JSON.stringify(huge), /styles\/huge\.css's unsaved draft is 1536 KB, larger than the 1 MB agents can read or write/);
    const binary = await call("read_file", { path: "images/logo.png" });
    assert.equal(binary.isError, true);
    assert.match(JSON.stringify(binary), /is a binary file/);

    // Texts the context stops naming are dropped: named again, they are asked for again.
    const fewer = { ...context, drafts: context.drafts.slice(1) };
    assert.deepEqual((await (await tab.share(fewer)).json()).missing, []);
    assert.deepEqual((await (await tab.share(context)).json()).missing, [hashes[0]]);
  } finally {
    await client?.close();
    await worker.dispose();
  }
});

test("get_site applies variant drafts, reports unreadable files, skips missing imports, and reads nothing without a native site", async () => {
  const { worker, github } = await startWorker();
  let client: Client | undefined;
  try {
    const { cookie } = await signIn(worker);
    const tab = editorTab(worker, cookie);
    const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id })).json();
    client = new Client({ name: "variant-drafts-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: workerFetch(worker),
    }));
    const getSite = () => client!.callTool({ name: "get_site", arguments: {} });
    const reads = () => github.requests.filter((path) => path === "/graphql" || /\/git\/(blobs|trees|commits)\//.test(path)).length;
    assert.equal(payload(await getSite()).available, false);
    assert.equal(reads(), 0, "no file reads when no tab shares");

    const context = await siteContext();
    const nonNative = { ...context };
    delete nonNative.pages;
    assert.equal((await tab.share(nonNative)).status, 200);
    assert.equal(payload(await getSite()).native, false);
    assert.equal(reads(), 0, "no file reads for a non-native site");

    assert.equal((await tab.share(context)).status, 200);
    github.limited = true;
    const failed = await getSite();
    assert.notEqual(failed.isError, true);
    assert.match(payload(failed).note, /Variants could not be read/);
    assert.ok(payload(failed).components.every((component: any) => !("variants" in component)));
    github.limited = false;

    // Component CSS, imported CSS and scripts (a new one the loader imports, and one too large to read) all use the editor's draft texts.
    const css = "components/feature-block/feature-block.css";
    context.drafts.push(
      { path: css, baseSha: "0".repeat(40), updatedAt: Date.now(), content: ':host([data-layout="draft"]) {} :host([data-busy]) {} :host[data-broken] {}' },
      { path: "styles/tokens.css", baseSha: "0".repeat(40), updatedAt: Date.now(), content: '[data-color-scheme="light"] {}' },
      { path: "components/components.js", baseSha: "0".repeat(40), updatedAt: Date.now(), content: 'import "../scripts/draft.js";\nimport "../scripts/huge.js";\n' },
      { path: "scripts/draft.js", baseSha: null, updatedAt: Date.now(), content: 'el.dataset.busy = "yes";' },
      { path: "scripts/huge.js", baseSha: null, updatedAt: Date.now(), size: 2 * 1024 * 1024 },
    );
    assert.equal((await tab.share(context)).status, 200);
    const drafted = payload(await getSite());
    const feature = drafted.components[0];
    assert.deepEqual(feature.variants.map((variant: any) => [variant.attribute, variant.values.map((value: any) => value.value)]), [
      ["data-layout", ["draft"]], ["data-color-scheme", ["light"]], ["data-tone", ["dark"]],
    ]);
    assert.equal(feature.variantWarnings[0].kind, "host-without-parentheses");

    const draft = context.drafts.find((item) => item.path === css)!;
    delete draft.content;
    assert.equal((await tab.share(context)).status, 200);
    const missingDraft = await getSite();
    assert.notEqual(missingDraft.isError, true);
    assert.match(payload(missingDraft).note, /Variants could not be read/);
    assert.ok(payload(missingDraft).components.every((component: any) => !("variants" in component)));

    // A missing import is skipped, as the preview skips it; the rest still counts.
    draft.content = ':host {}';
    context.drafts.find((item) => item.path === "styles/tokens.css")!.content = '@import "missing.css";';
    assert.equal((await tab.share(context)).status, 200);
    const skipped = payload(await getSite());
    assert.doesNotMatch(skipped.note, /Variants could not be read/);
    assert.deepEqual(skipped.components[0].variants.map((variant: any) => variant.attribute), ["data-tone"]);
  } finally {
    await client?.close();
    await worker.dispose();
  }
});

test("export_site reads the whole site in one call with drafts and hashes, blobs are read from GitHub once, and a rate limit reads as one", async () => {
  const { worker, github } = await startWorker();
  let client: Client | undefined;
  try {
    const { cookie } = await signIn(worker);
    const tab = editorTab(worker, cookie);
    const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id })).json();
    const context = await siteContext();
    context.drafts.push({ path: "images/logo.png", baseSha: null, updatedAt: Date.now(), binary: true, size: 2048 });
    assert.equal((await tab.share(context)).status, 200);
    client = new Client({ name: "export-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: workerFetch(worker),
    }));
    const call = (name: string, args: Record<string, unknown> = {}) => client!.callTool({ name, arguments: args });
    const objectReads = () => github.requests.filter((path) => /\/git\/(blobs|trees|commits)\//.test(path));

    const site = payload(await call("export_site"));
    assert.equal(site.commit, context.commit);
    const about = context.drafts.find((draft) => draft.path === "about/index.html")!;
    const fresh = context.drafts.find((draft) => draft.path === "new/index.html")!;
    const expected = { ...files, "about/index.html": about.content!, "new/index.html": fresh.content! };
    assert.deepEqual(site.files.map((file: any) => file.path), Object.keys(expected).sort());
    for (const file of site.files) {
      assert.equal(file.content, expected[file.path], file.path);
      assert.equal(file.hash, await textHash(file.content), file.path);
    }
    assert.equal(site.files.find((file: any) => file.path === "about/index.html").draft, "M");
    assert.equal(site.files.find((file: any) => file.path === "new/index.html").draft, "A");
    assert.deepEqual(site.binaries, [{ path: "images/logo.png", sha: null, size: 2048, draft: "A" }]);
    const blobs = objectReads().filter((path) => path.includes("/git/blobs/"));
    assert.equal(github.requests.filter((path) => path === "/graphql").length, 1, "saved texts are read in one batched query");
    assert.equal(blobs.length, 1, "only the blob the batch gave truncated is read on its own");

    // Blobs and trees never change: nothing is read from GitHub again.
    const before = objectReads().length;
    assert.deepEqual(payload(await call("export_site", { folder: "components/" })).files.map((file: any) => file.path), [
      "components/components.js",
      "components/feature-block/feature-block.css",
      "components/feature-block/feature-block.html",
      "components/site-header/site-header.html",
    ]);
    const home = payload(await call("read_file", { path: "index.html" }));
    payload(await call("read_file", { path: "index.html" }));
    assert.equal(objectReads().length, before, "read again from the cache");

    // Its hashes are the ones edits need.
    const exported = site.files.find((file: any) => file.path === "index.html");
    assert.equal(exported.hash, home.hash);
    const edited = await call("edit_file", { path: "index.html", expectedHash: exported.hash, edits: [{ oldText: "Welcome", newText: "Hello" }], waitSeconds: 0 });
    assert.equal(payload(edited).state, "pending");

    // GitHub limiting the account is said plainly, never a bare 500.
    github.limited = true;
    const limited = await worker.dispatchFetch(origin + "/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(limited.status, 200, "a recent installation listing is reused");
    await tab.share({ ...context, commit: "b".repeat(40) });
    const unread = await call("export_site");
    assert.equal(unread.isError, true);
    assert.match(JSON.stringify(unread), /GitHub is limiting requests .* your drafts are kept/);
    const editorRead = await worker.dispatchFetch(`${origin}/api/file?repo=${repo.full_name}&sha=${"f".repeat(40)}`, { headers: { Cookie: cookie } });
    assert.equal(editorRead.status, 429);
    assert.match((await editorRead.json() as any).error, /GitHub is limiting requests/);
  } finally {
    await client?.close();
    await worker.dispose();
  }
});

test("inspect_preview asks the tab to measure the page it shows and hands its report to the agent as an object", async () => {
  const { worker } = await startWorker();
  let client: Client | undefined;
  try {
    const { cookie } = await signIn(worker);
    const tab = editorTab(worker, cookie);
    const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id })).json();
    assert.equal((await tab.share(await siteContext())).status, 200);
    client = new Client({ name: "inspect-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: workerFetch(worker),
    }));
    const call = (name: string, args: Record<string, unknown> = {}) => client!.callTool({ name, arguments: args });

    assert.equal((await call("inspect_preview", { element: "1.0", selector: "h1", waitSeconds: 0 })).isError, true);
    assert.equal((await call("inspect_preview", { element: "not an id", waitSeconds: 0 })).isError, true);

    // The page the editor shows, by default; the tab's report comes back parsed.
    const queued = payload(await call("inspect_preview", { selector: "main h1", limit: 2, requestId: "look-1", waitSeconds: 0 }));
    assert.equal(queued.state, "pending");
    const command = (await tab.hub()).commands.find((item: any) => item.id === "look-1");
    assert.equal(command.operation, "inspect_preview");
    assert.equal(command.path, "index.html");
    assert.deepEqual(command.args, { selector: "main h1", limit: 2 });
    const report = { route: "/", matched: 1, elements: [{ tag: "h1", contrast: { ratio: 14.77, AA: true } }], pad: "x".repeat(INSPECTION_LIMIT - 200) };
    await tab.claim("look-1", command.grantId);
    assert.equal((await tab.ack("look-1", command.grantId, "applied", { message: "Inspected 1 of 1 element on /.", result: { report: JSON.stringify(report) } })).status, 200);
    const done = payload(await call("get_command_status", { requestId: "look-1" }));
    assert.equal(done.state, "applied");
    assert.deepEqual(done.result, report);

    // Another page by URL; a report past the limit is not kept.
    payload(await call("inspect_preview", { page: "/about/", requestId: "look-2", waitSeconds: 0 }));
    const second = (await tab.hub()).commands.find((item: any) => item.id === "look-2");
    assert.equal(second.path, "about/index.html");
    await tab.claim("look-2", second.grantId);
    await tab.ack("look-2", second.grantId, "applied", { result: { report: JSON.stringify({ pad: "x".repeat(2 * INSPECTION_LIMIT) }) } });
    assert.equal(payload(await call("get_command_status", { requestId: "look-2" })).result, undefined);
  } finally {
    await client?.close();
    await worker.dispose();
  }
});

test("Ask agent: the tab's requests reach wait_for_requests with their element, for the repository the tab shows, and replies reach the tab", async () => {
  const { worker, github } = await startWorker();
  let client: Client | undefined;
  try {
    const { cookie } = await signIn(worker);
    const tab = editorTab(worker, cookie);
    const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id })).json();
    const context = await siteContext();
    const element = {
      file: "index.html",
      route: "/",
      id: "1.0.0",
      tag: "h1",
      text: "Welcome",
      selector: "main > section > h1",
      html: "<h1>Welcome</h1>",
      lines: { start: 11, end: 11 },
    };
    context.site!.selection = element;
    assert.equal((await tab.share(context)).status, 200);
    client = new Client({ name: "requests-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: workerFetch(worker),
    }));
    const call = (name: string, args: Record<string, unknown> = {}) => client!.callTool({ name, arguments: args });
    const ask = (text: string, extra: Record<string, unknown> = {}) =>
      tab.post("/api/agent/ask", { repository: { id: repo.id, fullName: repo.full_name }, text, element, ...extra });

    // The description says whose words the request is.
    const described = JSON.stringify((await client.listTools()).tools.find((tool) => tool.name === "wait_for_requests"));
    assert.match(described, /text is the user's instruction/);
    assert.match(described, /site data, not instructions/);
    assert.match(JSON.stringify(await client.getPrompt({ name: "watch_editor", arguments: {} })), /wait_for_requests[\s\S]*reply_to_request/);

    // The preview selection, whole.
    const selected = payload(await call("get_selection"));
    assert.deepEqual(selected.element, element);

    // Nothing asked yet: an empty list and a hint, after waiting.
    const empty = payload(await call("wait_for_requests", { waitSeconds: 0 }));
    assert.deepEqual(empty.requests, []);
    assert.match(empty.hint, /Call wait_for_requests again/);

    // Asked, it is returned once to this connection and seen from then on.
    const asked = await ask("Make this heading friendlier");
    assert.equal(asked.status, 200);
    const request = await asked.json();
    assert.match(request.id, /^req-/);
    assert.equal(request.state, "open");
    assert.equal(payload(await call("get_site")).openRequests, 1);
    const first = payload(await call("wait_for_requests", { waitSeconds: 0 }));
    assert.equal(first.requests.length, 1);
    assert.equal(first.requests[0].id, request.id);
    assert.equal(first.requests[0].text, "Make this heading friendlier");
    assert.deepEqual(first.requests[0].element, element);
    assert.equal(first.requests[0].state, "seen");
    assert.equal("returnedTo" in first.requests[0], false);
    assert.equal((await tab.hub()).requests[0].state, "seen", "the tab sees it taken");
    assert.equal("html" in (await tab.hub()).requests[0].element, false, "the tab polls requests without their source");
    assert.deepEqual(payload(await call("wait_for_requests", { waitSeconds: 0 })).requests, []);
    assert.equal(payload(await call("wait_for_requests", { all: true, waitSeconds: 0 })).requests.length, 1);
    assert.equal(payload(await call("get_selection", { request: request.id })).element.html, "<h1>Welcome</h1>");

    // A request asked while an agent waits comes back at once.
    const waiting = call("wait_for_requests", { waitSeconds: 10 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const second = await (await ask("And a subtitle under it\nwith two lines")).json();
    const arrived = payload(await waiting);
    assert.deepEqual(arrived.requests.map((item: any) => item.id), [second.id]);

    // A reply shows in the tab; a dismissed request takes none.
    const replied = payload(await call("reply_to_request", { request: request.id, status: "done", message: "Changed it to Hello there.", requestIds: ["edit-1"] }));
    assert.equal(replied.state, "done");
    const shown = (await tab.hub()).requests.find((item: any) => item.id === request.id);
    assert.equal(shown.state, "done");
    assert.deepEqual([shown.reply.status, shown.reply.message, shown.reply.requestIds], ["done", "Changed it to Hello there.", ["edit-1"]]);
    assert.equal(payload(await call("get_site")).openRequests, 1);
    assert.equal((await tab.post("/api/agent/dismiss", { id: second.id })).status, 200);
    assert.equal((await tab.hub()).requests.some((item: any) => item.id === second.id), false, "dismissed requests are not pinned");
    const refused = await call("reply_to_request", { request: second.id, status: "answered", message: "Too late." });
    assert.equal(refused.isError, true);
    assert.match(JSON.stringify(refused), /dismissed/);
    assert.equal((await call("reply_to_request", { request: "req-nothing", status: "done", message: "?" })).isError, true);
    assert.equal(payload(await call("get_site")).openRequests, 0);

    // A question waits for the user, who answers it from the pin: the
    // request waits for agents again and comes back, thread and all.
    const described2 = JSON.stringify((await client.listTools()).tools.find((tool) => tool.name === "reply_to_request"));
    assert.match(described2, /question when you need the user's input/);
    assert.match(JSON.stringify(await client.getPrompt({ name: "watch_editor", arguments: {} })), /question when you need my input/);
    const answer = (id: string, text: string) => tab.post("/api/agent/answer", { id, text });
    const asking = await (await ask("Make it bolder")).json();
    assert.deepEqual(asking.thread.map((item: any) => [item.from, item.text]), [["user", "Make it bolder"]]);
    assert.equal((await answer(asking.id, "Hurry")).status, 409, "only a reply takes an answer");
    assert.deepEqual(payload(await call("wait_for_requests", { waitSeconds: 0 })).requests.map((item: any) => item.id), [asking.id]);
    // A question shows in the pin: a few words, at most 60 characters (a
    // reply up to 200), refused past that with how to shorten it.
    assert.match(described2, /question shows in the pin itself, so ask it in a few words \(at most 60 characters\)/);
    assert.match(JSON.stringify(await client.getPrompt({ name: "watch_editor", arguments: {} })), /at most 60 characters/);
    const wordy = await call("reply_to_request", { request: asking.id, status: "question", message: `Should the heading only be bold, or ${"much ".repeat(5)}larger too?` });
    assert.equal(wordy.isError, true);
    assert.match(JSON.stringify(wordy), /at most 60 characters \(this one has \d+\)\. Shorten it/);
    assert.equal((await call("reply_to_request", { request: asking.id, status: "done", message: "x".repeat(201) })).isError, true);
    assert.equal((await tab.hub()).requests.find((item: any) => item.id === asking.id).state, "seen", "refused replies change nothing");
    const questioned = payload(await call("reply_to_request", { request: asking.id, status: "question", message: "Bold, or larger too?" }));
    assert.equal(questioned.state, "question");
    assert.match(questioned.message, /returns the request again/);
    let pinned = (await tab.hub()).requests.find((item: any) => item.id === asking.id);
    assert.equal(pinned.state, "question");
    assert.deepEqual(pinned.thread.map((item: any) => [item.from, item.status ?? null, item.text]), [
      ["user", null, "Make it bolder"],
      ["agent", "question", "Bold, or larger too?"],
    ]);
    assert.equal(payload(await call("get_site")).openRequests, 0, "a question waits for the user, not an agent");
    assert.deepEqual(payload(await call("wait_for_requests", { waitSeconds: 0 })).requests, []);
    // The answer, checked like a request's text.
    assert.equal((await answer(asking.id, "")).status, 400);
    assert.equal((await answer(asking.id, "x".repeat(2001))).status, 400);
    assert.equal((await answer("nope", "Larger too")).status, 400);
    assert.equal((await answer("req-nothing", "Larger too")).status, 404);
    const reopened = await answer(asking.id, "Larger too, please");
    assert.equal(reopened.status, 200);
    const answered = await reopened.json();
    assert.equal(answered.state, "open");
    assert.equal(answered.reply, undefined);
    assert.equal("html" in answered.element, false);
    assert.equal(payload(await call("get_site")).openRequests, 1);
    // Returned again to the connection that had it, with the question and the answer.
    const again = payload(await call("wait_for_requests", { waitSeconds: 0 })).requests;
    assert.deepEqual(again.map((item: any) => item.id), [asking.id]);
    assert.equal(again[0].state, "seen");
    assert.deepEqual(again[0].thread.map((item: any) => [item.from, item.text]), [
      ["user", "Make it bolder"],
      ["agent", "Bold, or larger too?"],
      ["user", "Larger too, please"],
    ]);
    assert.deepEqual(payload(await call("wait_for_requests", { waitSeconds: 0 })).requests, [], "once per answer");
    assert.equal(payload(await call("get_selection", { request: asking.id })).thread.length, 3);
    // The next round: replied to again.
    assert.equal(payload(await call("reply_to_request", { request: asking.id, status: "done", message: "Made it bold and larger.", requestIds: ["bold-1"] })).state, "done");
    pinned = (await tab.hub()).requests.find((item: any) => item.id === asking.id);
    assert.deepEqual([pinned.state, pinned.reply.status, pinned.thread.length, pinned.thread[3].requestIds], ["done", "done", 4, ["bold-1"]]);
    // The thread keeps the request's text and the latest messages, within its limits.
    for (let round = 0; round < 12; round++) {
      assert.equal((await answer(asking.id, `Answer ${round} ${"y".repeat(1500)}`)).status, 200);
      await call("wait_for_requests", { waitSeconds: 0 });
      await call("reply_to_request", { request: asking.id, status: "question", message: `Question ${round}?` });
    }
    const kept = payload(await call("get_selection", { request: asking.id })).thread;
    assert.ok(kept.length <= THREAD_LIMIT);
    assert.equal(kept[0].text, "Make it bolder");
    assert.equal(kept.at(-1).text, "Question 11?");
    assert.ok(kept.reduce((size: number, item: any) => size + item.text.length, 0) <= THREAD_TEXT_LIMIT);
    assert.equal((await tab.post("/api/agent/dismiss", { id: asking.id })).status, 200);
    assert.equal((await answer(asking.id, "Wait")).status, 409, "a dismissed request takes no answer");

    // A request belongs to its repository: another one's waits until the tab shows it.
    const otherRepo = { ...repo, id: 2, name: "other", full_name: "lex/other" };
    github.others.push(otherRepo);
    const elsewhere = await (await ask("Over there", { repository: { id: 2, fullName: "lex/other" } })).json();
    assert.deepEqual(payload(await call("wait_for_requests", { all: true, waitSeconds: 0 })).requests, []);
    assert.equal((await call("get_selection", { request: elsewhere.id })).isError, true);
    await tab.share({ ...context, repository: { id: 2, fullName: "lex/other" } });
    assert.deepEqual(payload(await call("wait_for_requests", { waitSeconds: 0 })).requests.map((item: any) => item.id), [elsewhere.id]);
    await tab.share(context);

    // Limits: text up to 2000 characters, source clipped at 4 KB, 50 waiting at once.
    assert.equal((await ask("")).status, 400);
    assert.equal((await ask("x".repeat(2001))).status, 400);
    assert.equal((await tab.post("/api/agent/ask", { repository: { id: repo.id, fullName: repo.full_name }, text: "No element" })).status, 400);
    const long = await (await ask("Long", { element: { ...element, html: "x".repeat(4100) } })).json();
    const clipped = payload(await call("get_selection", { request: long.id })).element;
    assert.equal(clipped.html.length, 4096);
    assert.equal(clipped.htmlClipped, true);
    const open = (await tab.hub()).requests.filter((item: any) => item.state === "open" || item.state === "seen").length;
    for (let count = open; count < 50; count++) assert.equal((await ask(`Request ${count}`)).status, 200);
    const full = await ask("One too many");
    assert.equal(full.status, 429);
    assert.match((await full.json()).error, /Dismiss some/);
  } finally {
    await client?.close();
    await worker.dispose();
  }
});

test("media tools ask the tab for family reports and picture previews and refuse PDFs before queueing", async () => {
  const { worker } = await startWorker();
  let client: Client | undefined;
  try {
    const { cookie } = await signIn(worker), tab = editorTab(worker, cookie);
    const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id })).json();
    await tab.share(await siteContext());
    client = new Client({ name: "media-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: workerFetch(worker),
    }));
    const call = (name: string, args: Record<string, unknown> = {}) => client!.callTool({ name, arguments: args });
    const tools = (await client.listTools()).tools;
    for (const name of ["list_media", "preview_media"]) assert.equal(tools.find(tool => tool.name === name)?.annotations?.readOnlyHint, true);
    const refused = await call("preview_media", { path: "files/menu.pdf", waitSeconds: 0 });
    assert.equal(refused.isError, true);
    assert.match(JSON.stringify(refused), /document \(PDF\)/);
    assert.equal((await tab.hub()).commands?.length ?? 0, 0);
    for (const path of ["movie.mp4", "song.mp3", ".github/image.png"]) assert.equal((await call("preview_media", { path, waitSeconds: 0 })).isError, true);
    assert.equal((await call("list_media", { offset: -1 })).isError, true);
    assert.equal((await call("list_media", { limit: 201 })).isError, true);
    const media = ["images/photo.webp", "images/photo-480w.webp", "media/originals/photo.jpg", "files/menu.pdf"];
    const report = mediaListReport({ items: media.map(path => ({ path, size: 10 })), paths: media, offset: 0, limit: 100,
      records: parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: { "images/photo.webp": { description: { text: "Soup", byAgent: true } }, "files/menu.pdf": { description: { text: "Menu".repeat(1000) } } } })),
      usage: mediaUsageRecords({ media, sources: { "index.html": undefined }, pages: ["index.html"] }),
    });
    assert.equal(payload(await call("list_media", { requestId: "media-list", waitSeconds: 0 })).state, "pending");
    const command = (await tab.hub()).commands.find((item: any) => item.id === "media-list");
    assert.equal(command.path, "");
    assert.deepEqual(command.args, { offset: 0, limit: 100 });
    await tab.claim(command.id, command.grantId);
    await tab.ack(command.id, command.grantId, "applied", { result: { report: JSON.stringify(report) } });
    const done = payload(await call("list_media", { requestId: command.id, waitSeconds: 0 }));
    assert.deepEqual(done, report);
    assert.deepEqual(done.media[1].family, { copies: [media[1]], originals: [media[2]] });
    assert.deepEqual(done.media[1].description, { text: "Soup", byAgent: true });
    assert.equal(done.media[1].uses.checked, false);
    assert.deepEqual(done.notChecked, ["index.html"]);
    assert.deepEqual(payload(await call("get_command_status", { requestId: command.id })).result, report);

    await call("preview_media", { path: media[0], requestId: "media-preview", waitSeconds: 0 });
    const preview = (await tab.hub()).commands.find((item: any) => item.id === "media-preview");
    await tab.claim(preview.id, preview.grantId);
    const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await tab.ack(preview.id, preview.grantId, "applied", { result: { data, mimeType: "image/png", width: 1, height: 1, originalWidth: 1, originalHeight: 1 } });
    const picture = await call("preview_media", { path: media[0], requestId: preview.id, waitSeconds: 0 });
    assert.deepEqual(picture.content, [{ type: "image", data, mimeType: "image/png" }, { type: "text", text: JSON.stringify({ path: media[0], width: 1, height: 1, originalWidth: 1, originalHeight: 1, bytes: Buffer.from(data, "base64").length }) }]);
    for (const [name, limit] of [["list_media", 2 * MEDIA_LIST_LIMIT + 2048], ["preview_media", MEDIA_PREVIEW_LIMIT + 2048]] as const) {
      await call(name, { ...(name === "preview_media" ? { path: media[0] } : {}), requestId: `oversize-${name}`, waitSeconds: 0 });
      const large = (await tab.hub()).commands.find((item: any) => item.id === `oversize-${name}`);
      await tab.claim(large.id, large.grantId);
      // The tab's acknowledgement is accepted; only the result past the limit is not kept.
      assert.equal((await tab.ack(large.id, large.grantId, "applied", { result: { data: "x".repeat(limit + 1) } })).status, 200);
      const stored = await call("get_command_status", { requestId: large.id });
      if (name === "list_media") assert.deepEqual([payload(stored).state, payload(stored).result], ["applied", undefined]);
      else assert.match(payload(stored), /too large to send/);
    }
    await call("preview_media", { path: media[0], requestId: "full-preview", waitSeconds: 0 });
    const full = (await tab.hub()).commands.find((item: any) => item.id === "full-preview");
    await tab.claim(full.id, full.grantId);
    const fullData = "A".repeat(MEDIA_PREVIEW_LIMIT);
    assert.equal((await tab.ack(full.id, full.grantId, "applied", { result: { data: fullData, mimeType: "image/webp", width: 512, height: 512, originalWidth: 4000, originalHeight: 4000 } })).status, 200);
    assert.equal(((await call("preview_media", { path: media[0], requestId: full.id, waitSeconds: 0 })).content as any[])[0].data, fullData);
    const dropped = await call("preview_media", { path: media[0], requestId: "oversize-preview_media", waitSeconds: 0 });
    assert.equal(dropped.isError, true);
    assert.match(JSON.stringify(dropped), /too large to send/);
  } finally { await client?.close(); await worker.dispose(); }
});

test("agent media editing tools validate before queueing and retain their command arguments", async () => {
  const { worker } = await startWorker();
  let client: Client | undefined;
  try {
    const { cookie } = await signIn(worker), tab = editorTab(worker, cookie);
    const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id })).json();
    await tab.share(await siteContext());
    client = new Client({ name: "media-edit-test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: workerFetch(worker),
    }));
    const call = (name: string, args: Record<string, unknown>) => client!.callTool({ name, arguments: { ...args, waitSeconds: 0 } });
    const tools = (await client.listTools()).tools;
    for (const name of ["place_media", "describe_media", "change_collection", "adding_settings", "frame_image", "remove_media", "keep_media", "restore_media", "replace_media"]) {
      assert.equal(tools.find(tool => tool.name === name)?.annotations?.readOnlyHint, false);
      assert.match(tools.find(tool => tool.name === name)!.description!, /Unsaved until the user saves.*Media chapter.*native-site:\/\/conventions/);
    }
    assert.equal(tools.find(tool => tool.name === "remove_media")?.annotations?.destructiveHint, true);
    assert.equal((await call("keep_media", { files: ["images/a.png"], keep: false })).isError, true);
    for (const name of ["remove_media", "keep_media", "restore_media"]) {
      for (const files of [[], Array(201).fill("images/a.png"), ["https://example.com/a.png"], [".github/a.png"], [".editor/media.json"]])
        assert.equal((await call(name, { files })).isError, true);
    }
    for (const chosen of ["https://example.com/a.png", "//example.com/a.png", "data:image/png,x", ".github/a.png", ".editor/media.json", "files/menu.pdf", "images/a.png"])
      assert.equal((await call("replace_media", { file: "images/a.png", with: chosen })).isError, true);
    for (const file of ["https://example.com/a.png", "http://example.com/a.png", "//example.com/a.png", "data:image/png;base64,x", "blob:x", "files/menu.pdf", ".github/a.png", ".editor/media.json"]) {
      const refused = await call("place_media", { path: "index.html", element: "1", file });
      assert.equal(refused.isError, true);
      if (/^(http|\/\/|data:|blob:)/.test(file)) assert.match(JSON.stringify(refused), /never upload, fetch or generate media/);
    }
    for (const args of [{ action: "rename", name: "Trip" }, { action: "add", name: "Trip" }, { action: "take-out", name: "Trip", files: [] }]) assert.equal((await call("change_collection", args)).isError, true);
    for (const args of [{ file: "images/a.png", text: "" }, { file: "images/a.png", text: "Words", decorative: true }, { file: "images/a.png" }]) assert.equal((await call("describe_media", args)).isError, true);
    assert.equal((await call("write_file", { path: "images/new.png", content: "bytes" })).isError, true);
    for (const args of [{ image: "speech" }, { video: "smallest" }, { audio: "smaller" }, { keepOriginal: "true" }, { reset: true, image: "smaller" }, { reset: true, keepOriginal: false }])
      assert.equal((await call("adding_settings", args)).isError, true);
    for (const args of [
      { path: "index.css", element: "1" }, { path: "index.html", element: "no" },
      { path: "index.html", element: "1", shape: "free" },
      { path: "index.html", element: "1", focus: { x: 101, y: 50 } },
      { path: "index.html", element: "1", trim: { x: -0.1 } },
      { path: "index.html", element: "1", trim: { x: 0.8, width: 0.5 } },
      { path: "index.html", element: "1", trim: {} },
      { path: "index.html", element: "1", trim: { zoom: 1, turn: 0, flipX: false } },
    ]) assert.equal((await call("frame_image", args)).isError, true);
    assert.equal((await tab.hub()).commands?.length ?? 0, 0);
    for (const name of ["describe_media", "change_collection", "adding_settings", "frame_image", "list_media", "read_file"]) assert.ok(MEDIA_RECORDS_REFUSED.includes(name));
    const queued: [string, Record<string, unknown>, string, Record<string, unknown>][] = [
      ["frame_image", { path: "index.html", element: "1.0" }, "index.html", { element: "1.0" }],
      ["frame_image", { path: "index.html", element: "1.0", shape: "component" }, "index.html", { element: "1.0", shape: "component" }],
      ["frame_image", { path: "index.html", element: "1.0", shape: "square", focus: { x: 25, y: 75 }, trim: { zoom: 2 } }, "index.html", { element: "1.0", shape: "square", focus: { x: 25, y: 75 }, trim: { zoom: 2 } }],
      ["remove_media", { files: ["images/a.png"] }, "", { files: ["images/a.png"] }],
      ["keep_media", { files: ["images/a.png"] }, "", { files: ["images/a.png"] }],
      ["restore_media", {}, "", {}],
      ["restore_media", { files: ["images/a.png"] }, "", { files: ["images/a.png"] }],
      ["replace_media", { file: "images/a.png", with: "images/b.png", keepOldUrl: false }, "", { file: "images/a.png", with: "images/b.png", keepOldUrl: false }],
      ["adding_settings", {}, "", {}],
      ["adding_settings", { image: "smaller", keepOriginal: true }, "", { image: "smaller", keepOriginal: true }],
      ["adding_settings", { reset: true }, "", { reset: true }],
      ["place_media", { path: "index.html", element: "1.0", file: "images/a.png" }, "index.html", { element: "1.0", file: "images/a.png" }],
      ["describe_media", { file: "images/a.png", text: "A garden" }, "images/a.png", { file: "images/a.png", text: "A garden" }],
      ["describe_media", { file: "images/a.png", page: "index.html", element: "1", decorative: false }, "index.html", { file: "images/a.png", page: "index.html", element: "1", decorative: false }],
      ...(["new", "add", "take-out", "rename", "delete"] as const).map(action => {
        const args = { action, name: "Trip", ...(action === "rename" ? { to: "Holiday" } : ["new", "add", "take-out"].includes(action) ? { files: ["images/a.png"] } : {}) };
        return ["change_collection", args, "", args] as [string, Record<string, unknown>, string, Record<string, unknown>];
      }),
    ];
    for (const [index, [name, args, path, expected]] of queued.entries()) {
      const id = `media-edit-${index}`;
      assert.equal(payload(await call(name, { ...args, requestId: id })).state, "pending");
      const command = (await tab.hub()).commands.find((item: any) => item.id === id);
      assert.equal(command.operation, name); assert.equal(command.path, path); assert.deepEqual(command.args, expected);
      await tab.claim(id, command.grantId);
      if (name === "adding_settings") {
        const settings = { image: expected.image ?? "balanced", video: "balanced", audio: "balanced", keepOriginal: expected.keepOriginal ?? false, isDefault: !expected.image, choices: MEDIA_ADDING_CHOICES };
        await tab.ack(id, command.grantId, "applied", { message: "Adding settings read.", result: { report: JSON.stringify(settings) } });
        assert.deepEqual(payload(await call(name, { ...args, requestId: id })).result, settings);
      } else if (name === "frame_image") {
        const report = { file: "images/a.png", shape: "original", focus: { x: 50, y: 50 }, trimmed: false };
        await tab.ack(id, command.grantId, "applied", { message: "Image place read.", result: { report: JSON.stringify(report) } });
        assert.deepEqual(payload(await call(name, { ...args, requestId: id })).result, report);
      } else await tab.ack(id, command.grantId, "applied");
    }
    assert.equal(payload(await call("write_file", { path: "images/new.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"/>', requestId: "svg-still-text" })).state, "pending");
  } finally { await client?.close(); await worker.dispose(); }
});

function agentMediaFixture(source = '<section><img src="/images/old.png" alt="Old"></section>', measured = false) {
  const file = "media/images/photo.webp";
  const text = new Map([
    ["index.html", source],
    ["components/photo-card/photo-card.html", '<figure><slot name="media"></slot></figure>'],
    ["components/photo-card/photo-card.css", "::slotted(img){aspect-ratio:4/3;object-fit:cover}"],
    [MEDIA_RECORDS_PATH, JSON.stringify({ version: 2, collections: [], files: { "images/old.png": { description: { text: "Old" } }, [file]: { description: { text: "Photo" } } } })],
  ]);
  const paths = [...text.keys(), "images/old.png", file, "media/images/photo-480.webp", "media/images/photo-960.webp", "media/originals/photo.jpg"];
  const scope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
  const bytes = new Map(paths.filter(path => /\.(png|webp|jpg)$/.test(path)).map(path => [path, new Blob(["picture"], { type: "image/webp" })]));
  const batches: MediaWorkspaceBatch[] = [], history: (() => void)[] = [], labels: string[] = [];
  let pick: MediaPickerOptions | undefined;
  const module = {
    openMediaPicker: async (options) => { pick = options; }, closeMediaPicker() {},
    mountMediaLibrary() { throw new Error("No gallery in this source test"); },
  } satisfies MediaModule;
  const ports = {
    workspace: () => ({ repo: scope.repo, scope, identity: "site", site: { routes: { "/": "index.html" }, components: {} }, nativePaths: paths,
      drafts: { list: () => [], get: () => undefined, save: () => true, remove: () => true } }),
    stamp: () => ({ holds: () => true, changed: () => undefined }), identity: () => "site", generation: () => 1,
    source: (path) => text.get(path), listPaths: async () => paths,
    findEntry: async (path) => paths.includes(path) ? { sha: path } : undefined,
    entry: (path) => paths.includes(path) ? { sha: path } : undefined,
    readText: async (_repo, sha) => text.get(sha) ?? "", rememberSource: (path, source) => { text.set(path, source); },
    uploadedBlob: async () => undefined, readBlob: async (_repo, _sha, path) => bytes.get(path)!,
    applyBatch: async (_scope, _stamp, batch) => {
      assert.ok(batch.live?.() ?? true);
      for (const [path, value] of batch.expectedSources) assert.equal(text.get(path), value);
      const before = new Map(text), beforeBytes = new Map(bytes), beforePaths = [...paths];
      batches.push(batch); labels.push(batch.label);
      for (const [path, value] of batch.edits) text.set(path, value);
      for (const { path, blob } of batch.uploads) { bytes.set(path, blob); if (!paths.includes(path)) paths.push(path); }
      for (const { path } of batch.restores) { bytes.set(path, beforeBytes.get(path) ?? new Blob(["restored"])); if (!paths.includes(path)) paths.push(path); }
      for (const path of batch.deletes) { bytes.delete(path); const index = paths.indexOf(path); if (index >= 0) paths.splice(index, 1); }
      history.push(() => {
        text.clear(); before.forEach((value, path) => text.set(path, value));
        bytes.clear(); beforeBytes.forEach((value, path) => bytes.set(path, value));
        paths.splice(0, paths.length, ...beforePaths);
      });
    },
    openPage: async () => {}, load: async () => module,
    openFile: () => "index.html", viewingVersion: () => false, restoreFile: async () => {},
    change: (path, source, edits, _node, message) => {
      const before = text.get(path);
      history.push(() => { if (before !== undefined) text.set(path, before); }); labels.push(message);
      for (const edit of [...edits].sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
      text.set(path, source); return true;
    },
    locateElement: (source, node) => { const tree = readSource(source), element = tree.at(node); return element && tree.range(element); },
    measureImage: async (_path, node) => ({ sizes: "(max-width: 600px) 100vw, 600px", firstScreen: measured, large: true, images: [{ node, firstScreen: measured, large: true }] }),
    galleryHost() { throw new Error("No DOM in this source test"); }, galleryVisible: () => false, mediaSelected: () => false, gallerySignature: () => "",
    refreshDescriptions() {}, announce() {}, error(error) { throw error; },
  } satisfies MediaControllerPorts;
  return { file, text, paths, bytes, ports, batches, history, labels, controller: createMediaController(ports), pick: () => pick };
}
function mediaCommand(operation: AgentCommand["operation"], args: AgentCommand["args"] = {}): AgentCommand {
  return { id: "media-test", operation, args, path: ["place_media", "frame_image"].includes(operation) ? "index.html" : "", branch: "main", commit: "head", content: "", state: "pending", createdAt: 0 };
}

test("an agent placement equals the editor's markup for the same place, including picture replacement", async () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class {
    src = ""; naturalWidth = 2400; naturalHeight = 1600; async decode() {}
  } });
  const workerBefore = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: CopiesWorker });
  try {
    for (const older of [false, true]) for (const picture of [false, true]) for (const firstScreen of [false, true]) for (const decorative of [false, true]) {
      const baseSource = picture ? '<section><picture><source srcset="/images/old.png"><img class="hero" src="/images/old.png" alt="Old"></picture></section>' : '<section><img src="/images/old.png" alt="Old"></section>';
      const source = decorative ? baseSource.replace('alt="Old"', 'alt=""') : baseSource;
      const editor = agentMediaFixture(source, firstScreen), agent = agentMediaFixture(source, firstScreen);
      if (older) for (const fixture of [editor, agent]) {
        fixture.paths.splice(fixture.paths.indexOf("media/images/photo-480.webp"), 3);
      }
      if (decorative) for (const fixture of [editor, agent]) {
        const records = parseMediaRecords(fixture.text.get(MEDIA_RECORDS_PATH));
        records.files["images/old.png"].places = { "index.html": { decorative: true } };
        fixture.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
      }
      const node = picture ? [0, 0, 1] : [0, 0];
      await editor.controller.chooseImage({ path: "index.html", node });
      await editor.pick()!.onPick!(mediaImageForPlacement(editor.file, { width: 2400, height: 1600 }, editor.paths), () => false);
      await applyAgentMedia(await agent.controller.workspaceContext(), mediaCommand("place_media", { file: agent.file, element: node.join(".") }), target => agent.controller.preparePlacement(target));
      assert.deepEqual(agent.text, editor.text);
      const placed = agent.text.get("index.html")!;
      assert.ok(placed.includes(`srcset="/media/images/photo-480.webp 480w, /media/images/photo-960.webp 960w, ${older ? "/media/images/photo-1600.webp 1600w, " : ""}/media/images/photo.webp 2400w"`));
      assert.ok(placed.includes(`sizes="${firstScreen ? "" : "auto, "}(max-width: 600px) 100vw, 600px"`));
      assert.match(placed, /width="2400"/); assert.match(placed, /height="1600"/); assert.match(placed, /decoding="async"/); assert.match(placed, decorative ? /alt=""/ : /alt="Photo"/);
      assert.equal(agent.batches.length, decorative || older ? 1 : 0);
      if (older) {
        assert.deepEqual(agent.batches[0].uploads.map(upload => upload.path), ["media/images/photo-480.webp", "media/images/photo-960.webp", "media/images/photo-1600.webp"]);
        assert.deepEqual(agent.batches[0].uploads, editor.batches[0].uploads);
        assert.equal(agent.history.length, 1);
      }
      if (decorative) assert.deepEqual({ ...parseMediaRecords(agent.text.get(MEDIA_RECORDS_PATH)).files[agent.file].places }, { "index.html": { decorative: true } });
      if (firstScreen) { assert.match(placed, /fetchpriority="high"/); assert.doesNotMatch(placed, /loading="lazy"/); }
      else { assert.match(placed, /loading="lazy"/); assert.doesNotMatch(placed, /fetchpriority/); }
      assert.doesNotMatch(placed, /<picture|<source|originals/);
    }
  } finally {
    if (before) Object.defineProperty(globalThis, "Image", before); else Reflect.deleteProperty(globalThis, "Image");
    if (workerBefore) Object.defineProperty(globalThis, "Worker", workerBefore); else Reflect.deleteProperty(globalThis, "Worker");
  }
});

test("the tab reads, changes and resets adding settings with agent labels and no empty Undo step", async () => {
  const f = agentMediaFixture(), ctx = await f.controller.workspaceContext();
  const apply = (args: AgentCommand["args"]) => applyAgentMedia(ctx, mediaCommand("adding_settings", args), target => f.controller.preparePlacement(target));
  const read = await apply({});
  assert.equal(read!.message, "Adding settings read.");
  assert.ok(Buffer.byteLength(JSON.stringify(read!.result)) <= agentResultLimit("adding_settings"));
  assert.deepEqual(JSON.parse(read!.result.report), { ...MEDIA_ADDING_DEFAULTS, isDefault: true, choices: MEDIA_ADDING_CHOICES });
  assert.equal(f.batches.length, 0);
  const changed = await apply({ image: "smaller", keepOriginal: true });
  assert.equal(changed!.message, "Adding settings changed, unsaved.");
  assert.equal(JSON.parse(changed!.result.report).image, "smaller");
  assert.equal(JSON.parse(changed!.result.report).isDefault, false);
  assert.deepEqual(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).adding, { image: "smaller", keepOriginal: true });
  assert.equal(f.batches.length, 1); assert.equal(f.batches[0].label, "Agent changed adding settings");
  assert.deepEqual([...f.batches[0].edits.keys()], [MEDIA_RECORDS_PATH]);
  await apply({ image: "smaller", keepOriginal: true }); assert.equal(f.batches.length, 1);
  const reset = await apply({ reset: true });
  assert.equal(reset!.message, "Adding settings reset, unsaved.");
  assert.equal(JSON.parse(reset!.result.report).isDefault, true);
  assert.equal(f.batches[1].label, "Agent reset adding settings");
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).adding, undefined);
  f.history.pop()!(); assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).adding?.image, "smaller");
  f.history.pop()!(); assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).adding, undefined);
  f.text.set(MEDIA_RECORDS_PATH, "{");
  const unreadable = JSON.parse((await apply({}))!.result.report);
  assert.equal(unreadable.isDefault, true); assert.match(unreadable.note, /unreadable/);
  await assert.rejects(apply({ image: "smaller" }), /media.json/);
  assert.equal(f.batches.length, 2);
});

class CopiesWorker {
  onmessage?: (event: { data: { result: import("../src/page-builder/media-optimise").MediaOptimiseResult } }) => void;
  postMessage(message: { copies: { widths: number[] } }) {
    queueMicrotask(() => this.onmessage?.({ data: { result: { before: 100, after: 30,
      outputs: message.copies.widths.map(width => ({ blob: new Blob(["copy"], { type: "image/webp" }), extension: "webp", variantWidth: width, width, height: width / 2 })) } } }));
  }
  terminate() {}
}

test("agent shape and focus use exactly the popup's framing and one page-only Undo step", async () => {
  const { framePlace } = await import("../src/page-builder/place-frame");
  for (const change of [
    { shape: "square" as const, focus: { x: 20, y: 80 } },
    { focus: { x: 75, y: 25 } }, { shape: "original" as const },
  ]) {
    const source = '<section><img src="/media/images/photo.webp" alt="Photo" width="2400" height="1600" srcset="/media/images/photo-480.webp 480w, /media/images/photo.webp 2400w" sizes="auto, 100vw" style="color:red; aspect-ratio:4/3;object-fit:cover;object-position:10% 40%"></section>';
    const popup = agentMediaFixture(source, true), agent = agentMediaFixture(source, true);
    const target = { path: "index.html", node: [0, 0] };
    const expected = source.slice(source.indexOf("<img"), source.indexOf(">", source.indexOf("<img")) + 1);
    const beforeRecords = agent.text.get(MEDIA_RECORDS_PATH);
    await framePlace(popup.ports, target, change, { stamp: popup.ports.stamp(), epoch: 1, source, expected });
    await applyAgentMedia(await agent.controller.workspaceContext(), mediaCommand("frame_image", { element: "0.0", ...change }),
      target => agent.controller.preparePlacement(target), target => agent.controller.prepareFrame(target));
    assert.equal(agent.text.get("index.html"), popup.text.get("index.html"));
    assert.equal(agent.text.get(MEDIA_RECORDS_PATH), beforeRecords);
    assert.equal(agent.batches.length, 0); assert.equal(agent.history.length, 1);
    assert.equal(agent.labels[0], change.shape !== undefined ? "Image shape changed" : "Focus point moved");
    agent.history.pop()!(); assert.equal(agent.text.get("index.html"), source);
  }
  const { componentPicture, componentFrame, componentPopupShape } = await import("../src/page-builder/component-shapes");
  const { frameChange } = await import("../src/page-builder/image-popup-rules");
  for (const change of [{ shape: "original" as const }, { shape: "component" as const },
    { shape: "square" as const }, { focus: { x: 75, y: 25 } }]) {
    const own = change.shape === "component" ? "aspect-ratio:1/1;object-fit:cover;" : "";
    const source = `<section><photo-card><img slot="media" src="/media/images/photo.webp" alt="Photo" style="color:red;${own}object-position:10% 40%"></photo-card></section>`;
    const popup = agentMediaFixture(source), agent = agentMediaFixture(source);
    const target = { path: "index.html", node: [0, 0, 0] };
    const expected = source.slice(source.indexOf("<img"), source.indexOf(">", source.indexOf("<img")) + 1);
    const component = componentPicture(source, target.node, path => popup.ports.source(path));
    assert.ok(component);
    const start = componentFrame(expected, undefined, target.path, component);
    const popupChange = frameChange(start, { component, shape: change.shape === "component" ? componentPopupShape("<img>", component)!
      : change.shape ?? start.shape, focus: change.focus ?? start.focus! });
    assert.ok(popupChange);
    await framePlace(popup.ports, target, popupChange, { stamp: popup.ports.stamp(), epoch: 1, source, expected });
    await applyAgentMedia(await agent.controller.workspaceContext(), mediaCommand("frame_image", { element: "0.0.0", ...change }),
      target => agent.controller.preparePlacement(target), target => agent.controller.prepareFrame(target));
    assert.equal(agent.text.get("index.html"), popup.text.get("index.html"));
    assert.deepEqual(agent.text, popup.text);
    assert.equal(agent.batches.length, 0); assert.equal(agent.history.length, 1);
    agent.history.pop()!(); assert.equal(agent.text.get("index.html"), source);
  }
});

test("agent reads the popup's component frame and reports available component shapes even with an own shape", async () => {
  const { componentPicture, componentFrame } = await import("../src/page-builder/component-shapes");
  for (const own of ["", ' style="aspect-ratio:1/1;object-fit:cover"']) {
    const tag = `<img slot="media" src="/media/images/photo.webp" alt="Photo"${own}>`;
    const source = `<section><photo-card>${tag}</photo-card></section>`, f = agentMediaFixture(source);
    const target = { path: "index.html", node: [0, 0, 0] };
    const component = componentPicture(source, target.node, path => f.ports.source(path));
    const apply = async (args: AgentCommand["args"] = {}) => applyAgentMedia(await f.controller.workspaceContext(),
      mediaCommand("frame_image", { element: "0.0.0", ...args }), target => f.controller.preparePlacement(target), target => f.controller.prepareFrame(target));
    const report = JSON.parse((await apply())!.result.report);
    assert.deepEqual(report, { ...componentFrame(tag, parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)), target.path, component),
      component: { name: "Photo card", shape: "4:3", value: "4 / 3" } });
    assert.equal(f.history.length, 0);
    await apply({ shape: "original" });
    assert.equal(JSON.parse((await apply())!.result.report).shape, "original");
    assert.match(f.text.get("index.html")!, /aspect-ratio: auto;\s*object-fit: contain/);
    assert.equal(f.history.length, 1);
    f.history.pop()!(); assert.equal(f.text.get("index.html"), source);
  }
});

test("component shape without a shaped component refuses frame and trim without writing", async () => {
  for (const source of ['<section><img src="/media/images/photo.webp"></section>',
    '<section><photo-card><img slot="media" src="/media/images/photo.webp"></photo-card></section>']) {
    const f = agentMediaFixture(source), node = source.includes("photo-card") ? [0, 0, 0] : [0, 0];
    f.text.set("components/photo-card/photo-card.css", "::slotted(img){object-fit:cover}");
    const before = new Map(f.text);
    for (const args of [{ shape: "component" as const }, { shape: "component" as const, trim: { zoom: 2 } }]) {
      await assert.rejects(applyAgentMedia(await f.controller.workspaceContext(), mediaCommand("frame_image", { element: node.join("."), ...args }),
        target => f.controller.preparePlacement(target), target => f.controller.prepareFrame(target)), /no component shape/);
      assert.deepEqual(f.text, before); assert.equal(f.history.length, 0); assert.equal(f.batches.length, 0);
    }
  }
});

/** Runs with a fake image worker that answers every trim with an 1800 px main and three copies. */
async function withTrimWorker(run: (requests: { file: File; trim: import("../shared/media-records").MediaTrim; options: { quality: number } }[]) => Promise<void>) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const requests: { file: File; trim: import("../shared/media-records").MediaTrim; options: { quality: number } }[] = [];
  class Worker {
    onmessage?: (event: { data: { result: import("../src/page-builder/media-optimise").MediaOptimiseResult } }) => void;
    postMessage(message: typeof requests[number]) {
      requests.push(message);
      queueMicrotask(() => this.onmessage?.({ data: { result: { before: 100, after: 30,
        outputs: [{ blob: new Blob(["trim"], { type: "image/webp" }), extension: "webp", width: 1800, height: 1200 },
          ...[480, 960, 1600].map(width => ({ blob: new Blob(["copy"], { type: "image/webp" }), extension: "webp", variantWidth: width, width, height: width * 2 / 3 }))] } } }));
    }
    terminate() {}
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: Worker });
  try { await run(requests); }
  finally { descriptor ? Object.defineProperty(globalThis, "Worker", descriptor) : Reflect.deleteProperty(globalThis, "Worker"); }
}

test("agent trims under a component keep the popup's Original, component and unchanged framing", () => withTrimWorker(async () => {
  const { componentPicture, componentFrame, componentPopupShape } = await import("../src/page-builder/component-shapes");
  const { frameChange } = await import("../src/page-builder/image-popup-rules");
  const { trimPlace } = await import("../src/page-builder/place-trim");
  for (const shape of ["original", "component", undefined] as const) {
    const tag = '<img slot="media" src="/media/images/photo.webp" alt="Photo" style="color:red;aspect-ratio:1/1;object-fit:cover;object-position:20% 70%">';
    const source = `<section><photo-card>${tag}</photo-card></section>`;
    const popup = agentMediaFixture(source), agent = agentMediaFixture(source), target = { path: "index.html", node: [0, 0, 0] };
    const component = componentPicture(source, target.node, path => popup.ports.source(path));
    const start = componentFrame(tag, undefined, target.path, component);
    const frame = shape === undefined ? undefined : frameChange(start, { component,
      shape: shape === "component" ? componentPopupShape("<img>", component)! : shape, focus: start.focus! });
    await trimPlace(popup.ports, () => popup.controller.workspaceContext(), target,
      { trim: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, frame }, { stamp: popup.ports.stamp(), epoch: 1, source, expected: tag });
    await applyAgentMedia(await agent.controller.workspaceContext(), mediaCommand("frame_image", { element: "0.0.0", shape, trim: { zoom: 2 } }),
      target => agent.controller.preparePlacement(target), target => agent.controller.prepareFrame(target));
    assert.deepEqual(agent.text, popup.text);
    const page = agent.text.get("index.html")!;
    if (shape === "original") assert.match(page, /aspect-ratio: auto;\s*object-fit: contain/);
    else if (shape === "component") { assert.doesNotMatch(page, /aspect-ratio|object-fit/); assert.match(page, /object-position:20% 70%/); }
    else assert.ok(page.includes('style="color:red;aspect-ratio:1/1;object-fit:cover;object-position:20% 70%"'));
    assert.equal(agent.history.length, 1); assert.equal(agent.batches.length, 1);
    agent.history.pop()!(); assert.equal(agent.text.get("index.html"), source); assert.ok(!agent.bytes.has("media/images/photo-crop.webp"));
  }
}));

test("a component's files changed while framing or trimming refuse the agent's change without writing", () => withTrimWorker(async () => {
  for (const [args, change] of [
    [{ shape: "component" as const }, "::slotted(img){object-fit:cover}"],
    [{ shape: "original" as const, trim: { zoom: 2 } }, "::slotted(img){aspect-ratio:16/9;object-fit:cover}"],
    [{ shape: "component" as const, trim: { zoom: 2 } }, undefined],
  ] as const) {
    const source = '<section><photo-card><img slot="media" src="/media/images/photo.webp" alt="Photo" style="aspect-ratio:1/1;object-fit:cover"></photo-card></section>';
    const f = agentMediaFixture(source), measure = f.ports.measureImage;
    // The last case adds a flat component file the reader did not use: it still joins the proof.
    f.ports.measureImage = async (...measured) => {
      if (change) f.text.set("components/photo-card/photo-card.css", change); else f.text.set("components/photo-card.css", "");
      return measure(...measured);
    };
    const before = f.text.get("index.html"), records = f.text.get(MEDIA_RECORDS_PATH);
    await assert.rejects(applyAgentMedia(await f.controller.workspaceContext(), mediaCommand("frame_image", { element: "0.0.0", ...args }),
      target => f.controller.preparePlacement(target), target => f.controller.prepareFrame(target)), /changed/);
    assert.equal(f.text.get("index.html"), before); assert.equal(f.text.get(MEDIA_RECORDS_PATH), records);
    assert.equal(f.history.length, 0); assert.equal(f.batches.length, 0);
  }
}));

test("agent trims and re-crops original bytes in one batch with copies, records and Undo; read reports provenance", () => withTrimWorker(async requests => {
  const source = '<section><picture><source srcset="/media/images/photo.webp"><img src="/media/images/photo.webp" alt="Photo" style="aspect-ratio:4/3;object-fit:cover;object-position:20% 70%"></picture><img src="/media/images/photo.webp" alt="Photo"></section>';
  const f = agentMediaFixture(source, true), original = f.bytes.get(f.file)!;
  const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)); records.adding = { image: "smaller" };
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
  const originalRecord = structuredClone(records.files[f.file]);
  const apply = async (element: string, args: AgentCommand["args"] = {}) =>
    applyAgentMedia(await f.controller.workspaceContext(), mediaCommand("frame_image", { element, ...args }),
      target => f.controller.preparePlacement(target), target => f.controller.prepareFrame(target));
  const initial = await apply("0.0.1");
  assert.deepEqual(JSON.parse(initial!.result.report), { file: f.file, shape: "4:3", focus: { x: 20, y: 70 }, trimmed: false });
  assert.equal(f.history.length, 0);
  const first = await apply("0.0.1", { trim: { zoom: 2 } });
  const crop = first!.result.path;
  assert.equal(crop, "media/images/photo-crop.webp"); assert.match(first!.message, /photo-crop.webp/);
  assert.equal(requests[0].file.name, "photo.webp"); assert.equal(requests[0].options.quality, 70);
  assert.equal(await requests[0].file.text(), await original.text());
  assert.equal(f.batches.length, 1); assert.equal(f.batches[0].label, "Picture trimmed"); assert.equal(f.history.length, 1);
  assert.deepEqual(f.batches[0].uploads.map(upload => upload.path), [crop, ...[480, 960, 1600].map(width => `media/images/photo-crop-${width}.webp`)]);
  const page = f.text.get("index.html")!;
  assert.doesNotMatch(page, /<picture|<source/);
  assert.match(page, /src="\/media\/images\/photo-crop.webp"/);
  assert.match(page, /srcset="\/media\/images\/photo-crop-480.webp 480w, \/media\/images\/photo-crop-960.webp 960w, \/media\/images\/photo-crop-1600.webp 1600w, \/media\/images\/photo-crop.webp 1800w"/);
  assert.match(page, /width="1800"/); assert.match(page, /height="1200"/); assert.match(page, /fetchpriority="high"/);
  assert.match(page, /style="aspect-ratio:4\/3;object-fit:cover;object-position:20% 70%"/);
  assert.match(page, /<img src="\/media\/images\/photo.webp" alt="Photo">/);
  const saved = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
  assert.deepEqual(saved.files[crop].trimmedFrom, { source: f.file, trim: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });
  assert.deepEqual(saved.files[f.file], originalRecord); assert.equal(f.bytes.get(f.file), original);
  const read = JSON.parse((await apply("0.0"))!.result.report);
  assert.deepEqual(read, { file: crop, shape: "4:3", focus: { x: 20, y: 70 }, trimmed: true, source: f.file, trim: saved.files[crop].trimmedFrom!.trim });
  const second = await apply("0.0", { trim: { zoom: 4, turn: 90 }, shape: "square", focus: { x: 30, y: 60 } });
  assert.equal(second!.result.path, "media/images/photo-crop-2.webp");
  assert.equal(requests[1].file.name, "photo.webp"); assert.equal(await requests[1].file.text(), await original.text());
  assert.deepEqual(requests[1].trim, { x: 0.375, y: 0.375, width: 0.25, height: 0.25, turn: 90 });
  assert.deepEqual(f.batches[1].deletes, [crop, ...[480, 960, 1600].map(width => `media/images/photo-crop-${width}.webp`)]);
  assert.match(f.text.get("index.html")!, /aspect-ratio: 1 \/ 1/); assert.match(f.text.get("index.html")!, /object-position: 30% 60%/);
  assert.equal(f.history.length, 2);
  f.history.pop()!(); assert.equal(f.text.get("index.html"), page); assert.ok(f.bytes.has(crop));
  f.history.pop()!(); assert.equal(f.text.get("index.html"), source); assert.equal(f.bytes.get(f.file), original); assert.ok(!f.bytes.has(crop));
}));

test("agent trims inside an art-directed picture say so, and carry the place's Decorative and own words to the copy", () => withTrimWorker(async () => {
  for (const mark of ["decorative", "agentText"] as const) {
    const alt = mark === "decorative" ? "" : "Close-up of the desk";
    const source = `<section><picture><source media="(max-width: 600px)" srcset="/media/images/photo-480.webp"><img src="/media/images/photo.webp" alt="${alt}"></picture></section>`;
    const f = agentMediaFixture(source, true);
    const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
    records.files[f.file].places = { "index.html": mark === "decorative" ? { decorative: true } : { agentText: alt } };
    f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
    const originalRecord = structuredClone(records.files[f.file]), recordsBefore = f.text.get(MEDIA_RECORDS_PATH);
    const done = await applyAgentMedia(await f.controller.workspaceContext(), mediaCommand("frame_image", { element: "0.0.1", trim: { zoom: 2 } }),
      target => f.controller.preparePlacement(target), target => f.controller.prepareFrame(target));
    const crop = done!.result.path;
    assert.equal(crop, "media/images/photo-crop.webp");
    assert.match(done!.message, /The new picture is now used on all screens\./);
    const page = f.text.get("index.html")!;
    assert.doesNotMatch(page, /<picture|<source/);
    assert.ok(page.includes(`src="/media/images/photo-crop.webp"`) && page.includes(`alt="${alt}"`), page);
    const saved = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
    assert.deepEqual({ ...saved.files[crop].places?.["index.html"] }, mark === "decorative" ? { decorative: true } : { agentText: alt });
    assert.equal(JSON.stringify(saved.files[f.file]), JSON.stringify(originalRecord));
    assert.equal(f.history.length, 1);
    f.history.pop()!();
    assert.equal(f.text.get("index.html"), source); assert.equal(f.text.get(MEDIA_RECORDS_PATH), recordsBefore); assert.ok(!f.bytes.has(crop));
  }
}));

test("trim place refuses stale proofs, records, originals, old versions and component templates without saving", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  let during: () => void = () => {}, error: string | undefined;
  class Worker {
    onmessage?: (event: { data: { error?: string; result?: import("../src/page-builder/media-optimise").MediaOptimiseResult } }) => void;
    postMessage() {
      queueMicrotask(() => {
        during();
        this.onmessage?.({ data: error ? { error } : { result: { before: 10, after: 4,
          outputs: [{ blob: new Blob(["trim"], { type: "image/webp" }), extension: "webp", width: 800, height: 600 }] } } });
      });
    }
    terminate() {}
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: Worker });
  try {
    const setup = () => agentMediaFixture('<section><img src="/media/images/photo.webp" alt="Photo"></section>');
    for (const race of ["read", "page", "records", "source", "version", "branch"] as const) {
      const f = setup(), prepared = f.controller.prepareFrame({ path: "index.html", node: [0, 0] });
      if (race === "read") {
        f.ports.readBlob = async (_repo, _sha, path) => { f.ports.entry = path => ({ sha: path + "-changed" }); return f.bytes.get(path)!; };
      }
      during = () => {
        if (race === "page") f.text.set("index.html", f.text.get("index.html")!.replace("Photo", "Changed"));
        if (race === "records") f.text.set(MEDIA_RECORDS_PATH, '{"version":2,"files":{},"collections":[]}');
        if (race === "source") f.ports.entry = path => ({ sha: path + "-changed" });
        if (race === "version") f.ports.viewingVersion = () => true;
        if (race === "branch") f.ports.stamp = () => ({ holds: () => false, changed: () => undefined });
      };
      // Captured stamps, not a freshly returned stamp, must be checked.
      if (race === "branch") {
        let live = true;
        f.ports.stamp = () => ({ holds: () => live, changed: () => undefined });
        const place = f.controller.prepareFrame({ path: "index.html", node: [0, 0] });
        during = () => { live = false; };
        await assert.rejects(place.trim({ trim: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }), /changed|Nothing was saved/);
      } else await assert.rejects(prepared.trim({ trim: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }), /changed|Nothing was saved/);
      assert.equal(f.batches.length, 0); assert.equal(f.history.length, 0);
    }
    during = () => {};
    for (const refusal of ["Animated pictures cannot be trimmed. Use a still picture.", "This picture cannot be trimmed. Use a still raster picture.", "A trimmed copy cannot keep the original bytes."]) {
      const f = setup(); error = refusal;
      await assert.rejects(f.controller.prepareFrame({ path: "index.html", node: [0, 0] }).trim({ trim: { x: 0, y: 0, width: 0.5, height: 1 } }), { message: refusal });
      assert.equal(f.batches.length, 0);
    }
    error = undefined;
    const f = setup();
    const place = f.controller.prepareFrame({ path: "index.html", node: [0, 0] });
    await assert.rejects(place.trim({ trim: { x: 0, y: 0, width: 1, height: 1 } }), /Nothing to trim/);
    f.text.set(MEDIA_RECORDS_PATH, "{");
    await assert.rejects(place.trim({ trim: { x: 0, y: 0, width: 0.5, height: 1 } }), /media.json/);
    f.text.set("components/card/card.html", f.text.get("index.html")!);
    await assert.rejects(f.controller.prepareFrame({ path: "components/card/card.html", node: [0, 0] }).trim({ trim: { x: 0, y: 0, width: 0.5, height: 1 } }), /component template/);
    assert.equal(f.batches.length, 0);
  } finally { descriptor ? Object.defineProperty(globalThis, "Worker", descriptor) : Reflect.deleteProperty(globalThis, "Worker"); }
});

function agentTidyActions(f: ReturnType<typeof agentMediaFixture>): AgentSiteActions {
  const memory = createMemoryWorkspace();
  const unused = async () => { throw new Error("Unexpected action"); };
  return {
    text: async path => f.text.get(path), isMounted: () => true, edits: createGuardedEdits(memory.workspace),
    writeDraft: unused, open: unused, createPage: unused, makeComponent: unused, setPageDetail: unused,
    sectionTags: () => new Set(), moveSection: () => { throw new Error("Unexpected move"); },
    moveFile: unused, deleteFile: unused, inspect: unused, listMedia: unused, previewMedia: unused, legacy: unused,
    media: async command => applyAgentMedia(await f.controller.workspaceContext(), command, target => f.controller.preparePlacement(target)),
  } satisfies AgentSiteActions;
}

test("agent remove and restore whole families through the tab dispatcher with one Undo each", async () => {
  const f = agentMediaFixture(), actions = agentTidyActions(f);
  const family = [f.file, ...f.paths.filter(path => /photo-(480|960)\.webp$|originals\/photo/.test(path))];
  const removed = await applySiteCommand(actions, mediaCommand("remove_media", { files: [family[1], f.file] }));
  assert.deepEqual(JSON.parse(String(removed.result!.report)).files, family);
  assert.equal(f.history.length, 1); assert.match(f.labels[0], /Agent removed 4 files/);
  const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)!);
  assert.equal(records.removed!.length, 1); assert.equal(records.removed![0].path, f.file);
  assert.equal(records.removed![0].family!.length, 3);
  for (const member of family) assert.ok(!f.paths.includes(member));
  const listed = await applySiteCommand(actions, mediaCommand("restore_media"));
  const entry = JSON.parse(String(listed.result!.report)).removed[0];
  assert.equal(entry.path, f.file); assert.equal(entry.daysLeft, 30);
  assert.equal(entry.browserOnly, false); assert.deepEqual(entry.family, family);
  assert.equal(f.history.length, 1, "reading adds no Undo");
  await applySiteCommand(actions, mediaCommand("restore_media", { files: [f.file, f.file] }));
  assert.equal(f.history.length, 2); assert.match(f.labels[1], /Agent restored/);
  for (const member of family) assert.ok(f.paths.includes(member));
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)!).files[f.file].description!.text, "Photo");
  f.history.pop()!();
  for (const member of family) assert.ok(!f.paths.includes(member));
  f.history.pop()!();
  for (const member of family) assert.ok(f.paths.includes(member));
});

test("agent keep is one tab Undo, refuses taking it off and repeated marks add no Undo", async () => {
  const f = agentMediaFixture(), actions = agentTidyActions(f), before = f.text.get(MEDIA_RECORDS_PATH);
  await applySiteCommand(actions, mediaCommand("keep_media", { files: [f.file] }));
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)!).files[f.file].alwaysKeep, true);
  assert.equal(f.history.length, 1); assert.match(f.labels[0], /Agent added Always keep/);
  await applySiteCommand(actions, mediaCommand("keep_media", { files: [f.file], keep: true }));
  assert.equal(f.history.length, 1);
  await assert.rejects(applySiteCommand(actions, mediaCommand("keep_media", { files: [f.file], keep: false })), /only|user/);
  await assert.rejects(applySiteCommand(actions, mediaCommand("remove_media", { files: [f.file] })), /Always keep/);
  assert.equal(f.history.length, 1);
  f.history.pop()!(); assert.equal(f.text.get(MEDIA_RECORDS_PATH), before);
});

test("agent removal refuses all changes for uses, kept members, outside files and unreadable site text", async () => {
  for (const used of ["index.html", "script.js", "notes.md"]) {
    const f = agentMediaFixture();
    f.text.set(used, `<img src="/${f.file}" alt="Photo">`);
    if (!f.paths.includes(used)) f.paths.push(used);
    await assert.rejects(applySiteCommand(agentTidyActions(f), mediaCommand("remove_media", { files: [f.file, "images/old.png"] })), error => {
      assert.match((error as Error).message, new RegExp(used.replace(".", "\\.")));
      return true;
    });
    assert.equal(f.history.length, 0); assert.ok(f.paths.includes(f.file));
  }
  for (const kept of ["media/images/photo.webp", "media/images/photo-480.webp", "media/originals/photo.jpg"]) {
    const f = agentMediaFixture();
    const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)!);
    records.files[kept] = { alwaysKeep: true }; f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
    await assert.rejects(applySiteCommand(agentTidyActions(f), mediaCommand("remove_media", { files: [f.file] })), /Always keep/);
    assert.equal(f.history.length, 0);
  }
  const f = agentMediaFixture();
  for (const operation of ["remove_media", "keep_media"] as const)
    await assert.rejects(applySiteCommand(agentTidyActions(f), mediaCommand(operation, { files: ["images/not-in-media.png"] })), /never upload, fetch or generate/);
  const ctx = await f.controller.workspaceContext(), read = ctx.read.bind(ctx);
  ctx.read = async path => path === "index.html" ? undefined : read(path);
  await assert.rejects(applyAgentMedia(ctx, mediaCommand("remove_media", { files: [f.file] }), target => f.controller.preparePlacement(target)), /usage is incomplete/);
  assert.equal(f.history.length, 0);
});

test("agent Replace everywhere uses Media preparation, marks mentions and undoes with removed records", () => withTrimWorker(async requests => {
  const f = agentMediaFixture(`<section><picture><source media="(max-width:600px)" srcset="/media/images/photo-480.webp"><img src="/media/images/photo.webp" alt="Photo" style="aspect-ratio:4/3;object-fit:cover;object-position:10% 20%"></picture></section>`);
  f.paths.splice(f.paths.indexOf("media/originals/photo.jpg"), 1);
  const source = f.text.get("index.html")!, actions = agentTidyActions(f);
  const outcome = await applySiteCommand(actions, mediaCommand("replace_media", { file: f.file, with: "images/old.png" }));
  assert.equal(outcome.result!.path, f.file);
  assert.match(String(outcome.result!.notices), /used on all screens/);
  assert.equal(requests.length, 1); assert.equal(requests[0].file.name, "old.png");
  assert.equal(f.history.length, 1); assert.match(f.labels[0], /Agent replaced/);
  assert.match(f.text.get("index.html")!, /photo.webp\?v=/);
  assert.match(f.text.get("index.html")!, /object-position:50% 50%/);
  assert.doesNotMatch(f.text.get("index.html")!, /<picture>/);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)!).removed![0].path, f.file);
  assert.ok(f.paths.includes("images/old.png"));
  f.history.pop()!(); assert.equal(f.text.get("index.html"), source);
}));

test("agent Replace everywhere refuses outside files, web addresses, its family, copies, originals, trims and SVG", async () => {
  const f = agentMediaFixture(), actions = agentTidyActions(f);
  for (const chosen of ["images/outside.png", "https://example.com/a.png", "data:image/png,x", f.file, "media/images/photo-480.webp", "media/originals/photo.jpg"]) {
    await assert.rejects(applySiteCommand(actions, mediaCommand("replace_media", { file: f.file, with: chosen })), /never upload|different one/);
  }
  for (const path of ["media/images/photo-480.webp", "media/originals/photo.jpg", "images/logo.svg"]) {
    if (!f.paths.includes(path)) { f.paths.push(path); f.bytes.set(path, new Blob(["<svg/>"])); }
    await assert.rejects(applySiteCommand(actions, mediaCommand("replace_media", { file: path, with: "images/old.png" })), /main|picture|original/);
  }
  const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)!);
  records.files[f.file].trimmedFrom = { source: "images/old.png", trim: { x: 0, y: 0, width: 1, height: 1 } };
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
  await assert.rejects(applySiteCommand(actions, mediaCommand("replace_media", { file: f.file, with: "images/old.png" })), /Trimmed copy/);
  assert.equal(f.history.length, 0);
});

test("agent move_file renames a media family through Files, rewrites every mention and protects delete_file", async () => {
  const branch = {
    "index.html": '<img src="/images/photo.webp" alt="Photo">',
    "images/photo.webp": "picture", "images/photo-480.webp": "copy", "media/originals/photo.jpg": "original",
    "script.js": 'const picture = "/images/photo.webp";',
    [MEDIA_RECORDS_PATH]: JSON.stringify({ version: 2, collections: [], files: { "media/originals/photo.jpg": { alwaysKeep: true } } }),
  };
  const parsed = resolveNativeProject(Object.keys(branch)); assert.ok(parsed.ok);
  const memory = createMemoryWorkspace({ branch, open: "index.html", site: parsed.site });
  const edits = createGuardedEdits(memory.workspace);
  const store = new DraftStore({ getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 });
  const ports = {
    edits, parentOf: path => path.slice(0, path.lastIndexOf("/")), draftScope: () => memory.scope,
    engaged: () => true, repository: () => ({ full_name: "lex/site" }),
    treeState: () => ({ changes: new Map(), deleted: new Map(), drafted: [] }),
    pathNow: path => memory.files().includes(path) ? "file" : memory.workspace.exists(path) ? "folder" : undefined,
    branchFilesUnder: async folder => Object.keys(branch).filter(path => path.startsWith(folder + "/")).map(path => ({ path, type: "blob" as const, mode: "100644", sha: path })),
    findEntry: async path => Object.hasOwn(branch, path) ? { path, type: "blob" as const, mode: "100644", sha: path } : undefined,
    draftStore: () => store, baseSource: path => edits.peek.source(path), readFiles: async () => ({}), readFile: async () => "",
    nativeFiles: () => memory.files(), readMediaText: async path => edits.peek.source(path),
    ensureNativeTextIndex: async () => undefined, branchPathProblem: async () => undefined,
    onBranchHere: path => Object.hasOwn(branch, path), withMovedPageUrls() {}, readNativeRedirects: async () => undefined,
    confirmDialog: () => { throw new Error("Agents must never open a dialog"); },
    undoFileChanges() {}, duplicateFile: () => true, afterFileChanges() {}, announce() {}, refuse() {}, errorMessage() {},
    requestAnimationFrame: callback => callback(), openFolder() {}, fileRow: () => undefined, renderFileTree() {}, filesTabOpen: () => true,
  } satisfies FileOperationsPorts;
  const controller = createFileOperationsController(ports), actions = agentTidyActions(agentMediaFixture());
  actions.text = async path => memory.workspace.source(path);
  actions.moveFile = (path, to, keep) => controller.moveFileTarget({ path, name: path.split("/").pop()!, folder: false }, to, "rename", { keepOldAddress: keep });
  actions.deleteFile = path => controller.deleteFileTarget({ path, name: path.split("/").pop()!, folder: path === "media/originals" }, undefined, true);
  for (const path of ["images/photo.webp", "media/originals"])
    await assert.rejects(applySiteCommand(actions, { ...mediaCommand("delete_file"), path }), /Always keep/);
  assert.equal(memory.steps().length, 0);
  const outcome = await applySiteCommand(actions, { ...mediaCommand("move_file", { to: "images/garden.webp" }), path: "images/photo.webp" });
  assert.equal(outcome.result!.path, "images/garden.webp");
  assert.match(memory.workspace.source("index.html")!, /images\/garden.webp/);
  assert.match(memory.workspace.source("script.js")!, /images\/garden.webp/);
  assert.ok(memory.workspace.exists("images/garden-480.webp"));
  assert.ok(memory.workspace.exists("media/originals/garden.jpg"));
  assert.match(memory.workspace.source("_redirects")!, /images\/photo.webp \/images\/garden.webp 301/);
  assert.equal(memory.steps().length, 1);
  memory.undo();
  assert.equal(memory.workspace.source("index.html"), branch["index.html"]);
  assert.ok(memory.workspace.exists("images/photo-480.webp"));
});

test("agent restore picks the newest entry and refuses taken addresses and missing browser copies atomically", async () => {
  const f = agentMediaFixture(), actions = agentTidyActions(f), records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)!);
  const date = new Date().toISOString().slice(0, 10);
  records.removed = [
    { path: "images/gone.webp", sha: "new", date },
    { path: "images/gone.webp", sha: "new", date, family: [{ path: "images/gone-480.webp", sha: "copy" }] },
  ];
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
  await applySiteCommand(actions, mediaCommand("restore_media", { files: ["images/gone.webp"] }));
  assert.deepEqual(f.batches[0].restores, [{ path: "images/gone.webp", sha: "new" }, { path: "images/gone-480.webp", sha: "copy" }]);
  f.history.pop()!();
  f.paths.push("images/gone-480.webp");
  await assert.rejects(applySiteCommand(actions, mediaCommand("restore_media", { files: ["images/gone.webp"] })), /already exists/);
  assert.equal(f.history.length, 0);
  const ctx = await f.controller.workspaceContext();
  ctx.removedCopies = { get: async () => undefined, put: async () => {}, delete: async () => {}, keys: async () => [] };
  records.removed = [{ path: "images/missing.webp", browserKey: `removed:${date}:missing`, date }];
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
  await assert.rejects(applyAgentMedia(ctx, mediaCommand("restore_media", { files: ["images/missing.webp"] }), target => f.controller.preparePlacement(target)), /browser only.*copy is gone/);
  assert.equal(f.history.length, 0);
});

test("agent replacement refuses stale source bytes and records before committing", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  let during = () => {};
  class Worker {
    onmessage?: (event: { data: { result: import("../src/page-builder/media-optimise").MediaOptimiseResult } }) => void;
    postMessage() {
      queueMicrotask(() => {
        during();
        this.onmessage?.({ data: { result: { before: 10, after: 4,
          outputs: [{ blob: new Blob(["new"], { type: "image/webp" }), extension: "webp", width: 800, height: 600 }] } } });
      });
    }
    terminate() {}
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: Worker });
  try {
    for (const race of ["source", "records"] as const) {
      const f = agentMediaFixture();
      during = () => {
        if (race === "source") f.ports.entry = path => ({ sha: path + "-changed" });
        else f.text.set(MEDIA_RECORDS_PATH, '{"version":2,"collections":[],"files":{}}');
      };
      await assert.rejects(applySiteCommand(agentTidyActions(f), mediaCommand("replace_media", { file: f.file, with: "images/old.png" })), /changed|revision/);
      assert.equal(f.history.length, 0); assert.equal(f.batches.length, 0);
    }
  } finally {
    descriptor ? Object.defineProperty(globalThis, "Worker", descriptor) : Reflect.deleteProperty(globalThis, "Worker");
  }
});

test("agent removal, keep and restore retain asset proofs across a held library read", async () => {
  for (const operation of ["remove_media", "keep_media", "restore_media"] as const) {
    const f = agentMediaFixture();
    const removedPath = "images/gone.webp";
    if (operation === "restore_media") {
      const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
      records.removed = [{ path: removedPath, sha: "gone-sha", date: new Date().toISOString().slice(0, 10) }];
      f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
    }
    const ctx = await f.controller.workspaceContext();
    let arrive!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => { arrive = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const read = ctx.read.bind(ctx);
    let waiting = true, version = ctx.assetVersion(f.file);
    const assetVersion = ctx.assetVersion.bind(ctx);
    ctx.assetVersion = path => path === f.file ? version : assetVersion(path);
    ctx.read = async path => {
      if (waiting && path === "index.html") { waiting = false; arrive(); await held; }
      return read(path);
    };
    const action = applyAgentMedia(ctx, mediaCommand(operation, { files: [operation === "restore_media" ? removedPath : f.file] }), target => f.controller.preparePlacement(target));
    await reached;
    const replacement = new Blob(["replacement"]);
    version = "replacement-v2"; f.bytes.set(f.file, replacement);
    const refused = assert.rejects(action, /changed|revision|stale/);
    release(); await refused;
    assert.equal(f.batches.length, 0); assert.equal(f.history.length, 0);
    assert.equal(f.bytes.get(f.file), replacement);
    assert.ok(f.paths.includes(f.file));
  }
});
