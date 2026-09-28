import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { applyReplacements, textHash } from "../shared/agent.ts";
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
      "add_section", "create_page", "delete_file", "edit_file", "export_site", "get_command_status", "get_page", "get_site",
      "list_files", "move_file", "move_section", "open_page", "read_file", "remove_section", "set_page_details", "write_file",
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
    assert.deepEqual(site.components.find((item: any) => item.tag === "feature-block"), { tag: "feature-block", file: "components/feature-block/feature-block.html", section: true, slots: ["title"] });
    assert.deepEqual(site.stylesheets, [{ file: "styles/site.css", imports: ["styles/tokens.css"] }]);
    assert.deepEqual(site.editor.previewSelection, { file: "index.html", id: "1.0", tag: "section", text: "Welcome" });
    assert.deepEqual(site.changes.map((change: any) => change.kind), ["M", "A"]);
    assert.ok(!JSON.stringify(site).includes("github-private-token"));
    const conventions = JSON.stringify(await client.readResource({ uri: "native-site://conventions" }));
    assert.match(conventions, /components\/<tag>\/<tag>\.html/);
    assert.match(conventions, /A new component is just its files/);
    assert.doesNotMatch(conventions, /TAGS/);
    assert.match(conventions, /:not\(:defined\)/);
    assert.match(conventions, /slot name=\\"title\\"><h2/);
    assert.match(conventions, /_redirects/);
    assert.match(conventions, /\.editor\/config\.json/);
    assert.doesNotMatch(conventions, /src\/(?:pages|components|styles|public)|page comment|native\.json/);
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
    assert.equal(queued[0].content, '@import url("tokens.css");\nbody { margin: 1px; }\n');
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
    assert.equal(blobs.length, Object.keys(files).length - 1, "one read per saved file the drafts do not replace");
    assert.equal(new Set(blobs).size, blobs.length, "no blob is read twice");

    // Blobs and trees never change: nothing is read from GitHub again.
    const before = objectReads().length;
    assert.deepEqual(payload(await call("export_site", { folder: "components/" })).files.map((file: any) => file.path), [
      "components/components.js",
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
