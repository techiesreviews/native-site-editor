import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { INSPECTION_LIMIT, THREAD_LIMIT, THREAD_TEXT_LIMIT, applyReplacements, textHash } from "../shared/agent.ts";
import { requestOperation } from "../worker/agent-requests.ts";
import { componentsChapter } from "../worker/site-conventions.ts";
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
      "add_section", "create_page", "delete_file", "edit_file", "export_site", "get_command_status", "get_page", "get_selection", "get_site",
      "inspect_preview", "list_files", "move_file", "move_section", "open_page", "read_file", "remove_section", "reply_to_request", "set_page_details",
      "wait_for_requests", "write_file",
    ]);
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
        { attribute: "data-wide", label: "Wide", kind: "yes-no", values: [], conditions: [] },
        { attribute: "data-color-scheme", label: "Color scheme", kind: "choice", values: [{ value: "dark", label: "Dark", conditions: ["@media (min-width: 40rem)"] }], conditions: ["@media (min-width: 40rem)"] },
        { attribute: "data-tone", label: "Tone", kind: "choice", values: [{ value: "dark", label: "Dark", conditions: [] }], conditions: [] },
      ],
    });
    const header = site.components.find((item: any) => item.tag === "site-header");
    assert.deepEqual(header.variants, [feature.variants[2]]);
    assert.equal("variantWarnings" in header, false);
    assert.equal(github.requests.filter((path) => path === "/graphql").length, 1, "saved variant files are batched");
    assert.equal(github.requests.filter((path) => path.includes("/git/blobs/")).length, 1, "only the truncated import needs an individual read");
    assert.deepEqual(site.stylesheets, [{ file: "styles/site.css", imports: ["styles/tokens.css"] }]);
    assert.deepEqual(site.editor.previewSelection, { file: "index.html", id: "1.0", tag: "section", text: "Welcome" });
    assert.deepEqual(site.changes.map((change: any) => change.kind), ["M", "A"]);
    assert.ok(!JSON.stringify(site).includes("github-private-token"));
    const conventions = JSON.stringify(await client.readResource({ uri: "native-site://conventions" }));
    assert.match(conventions, /components\/<tag>\/<tag>\.html/);
    assert.match(conventions, /A new component is just its files/);
    assert.ok(conventions.includes(JSON.stringify("The header and footer are components with no slots: their nav links live in the template, so changing the nav is one edit. Each page puts the skip link, `<a class=\"skip\" href=\"#main\">Skip to content</a>`, before `<site-header>` as a plain link, so it works without JavaScript; its style lives in the shared CSS, not the header's.").slice(1, -1)));
    assert.match(conventions, /write the template \(and its CSS, if it has any\), then place it with add_section/);
    assert.doesNotMatch(conventions, /add the tag to the loader/);
    assert.doesNotMatch(conventions, /TAGS/);
    assert.match(conventions, /:not\(:defined\)/);
    assert.match(conventions, /slot name=\\"title\\"><h2/);
    assert.match(conventions, /_redirects/);
    assert.match(conventions, /\.editor\/config\.json/);
    assert.doesNotMatch(conventions, /src\/(?:pages|components|styles|public)|page comment|native\.json/);
    // The Components chapter, from its heading to the next `## `, is the one
    // source of how components are made; the starter's AGENTS.md copies it.
    const chapter = componentsChapter(((await client.readResource({ uri: "native-site://conventions" })).contents[0] as { text: string }).text)!;
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
      /\*\*items slot\*\*: the unnamed slot, or a slot whose fallback is `card-…` instances/,
      /<slot><card-project><\/card-project><\/slot>/,
      /Add card adds a fresh instance of the items slot's card component/,
      /A named slot is an items slot only when its fallback is `card-…` instances/,
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
      /written bare on the instance: `<section-split data-reverse>`/,
      /`data-layout` \(`content-left`, `image-left`, `centered`\)/,
      // Tones on page bands only, where the site defines them.
      /Tones work this way where the site's CSS defines them/,
      /Tone rules should keep text readable \(WCAG AA\)/,
      /`data-tone` colours a page band: a section component, a plain `<section>`, the header or the footer/,
      /`light` \(the default: no attribute\), `dark`, `brand` and `accent`/,
      /plain `\[data-tone="…"\]` rules \(never in a component's CSS\)/,
      /`contrast-color\(\)` of the surface under `@supports`/,
      // The header, footer and skip link.
      /The header and footer are components with no slots/,
      // What add_section copies (src/native-insert.ts, slotMarkup).
      /add_section writes the tag with a copy of each named slot's fallback that is one element holding only text and inline markup/,
      /is copied inside a `<span slot="…">`\. It copies nothing for the unnamed slot or for any other fallback/,
    ]) assert.match(chapter, rule);
    assert.match(chapter, /<section-work>[\s\S]*<card-project>\s*<h3 slot="title">[^\n]*<\/h3>\s*<p slot="body" class="body">A one-page site/, "the card-project example uses its real body slot and fallback class");
    assert.match(chapter, /a component rule beats a shared rule on the template's own elements\. On an element a page slots in, the page's CSS beats the component's `::slotted\(\)` rules whatever the layers[^\n]*`:not\(\[slot\]\)`/, "shadow-root layers do not override document styles on slotted elements");
    // The tool descriptions and the server's instructions point to the
    // chapter and state no component rules of their own.
    const described = (name: string) => listing.find((tool) => tool.name === name)!.description!;
    for (const text of [client.getInstructions()!, described("write_file"), described("add_section"), described("get_site")])
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
    assert.equal(payload(await call("write_file", { path: "styles/extra.css", content: "p {}\n", requestId: "new-css", waitSeconds: 0 })).state, "pending");
    assert.equal((await call("write_file", { path: "styles/extra.css", content: "a {}\n", waitSeconds: 0 })).isError, true, "one waiting change per file");

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

    // New CSS, imported CSS and scripts all use the editor's draft texts.
    const css = "components/feature-block/draft.css";
    context.site!.components[0].css = css;
    context.drafts.push(
      { path: css, baseSha: null, updatedAt: Date.now(), content: ':host([data-layout="draft"]) {} :host([data-busy]) {} :host[data-broken] {}' },
      { path: "styles/tokens.css", baseSha: "0".repeat(40), updatedAt: Date.now(), content: '[data-color-scheme="light"] {}' },
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
