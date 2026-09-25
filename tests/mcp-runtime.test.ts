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
    const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
    assert.deepEqual(tools, [
      "add_section", "create_page", "delete_file", "edit_file", "get_command_status", "get_page", "get_site",
      "list_files", "move_file", "move_section", "open_page", "read_file", "remove_section", "set_page_details", "write_file",
    ]);
    const call = (name: string, args: Record<string, unknown> = {}) => client!.callTool({ name, arguments: args });

    // The site: pages as a tree, components, the preview selection, drafts.
    const site = payload(await call("get_site"));
    assert.equal(site.repository, "lex/starter");
    assert.equal(site.stale, false);
    assert.deepEqual(site.pages.map((page: any) => [page.route, page.new ?? false]), [["/", false], ["/about/", false], ["/new/", true]]);
    assert.deepEqual(site.pages[1].subpages, [{ route: "/about/team/", file: "src/pages/about/team.html", title: "Team" }]);
    assert.equal(site.components.find((item: any) => item.tag === "feature-block").section, true);
    assert.deepEqual(site.editor.previewSelection, { file: "src/pages/index.html", id: "1.0", tag: "section", text: "Welcome" });
    assert.deepEqual(site.changes.map((change: any) => change.kind), ["M", "A"]);
    assert.ok(!JSON.stringify(site).includes("github-private-token"));
    const conventions = await client.readResource({ uri: "native-site://conventions" });
    assert.match(JSON.stringify(conventions), /src\/components\/<tag>\/<tag>\.html/);
    const prompt = await client.getPrompt({ name: "edit_site", arguments: { goal: "Add a team page" } });
    assert.match(JSON.stringify(prompt), /Add a team page/);

    // Files: drafts win over GitHub, and every read carries its hash.
    const listed = payload(await call("list_files", { folder: "src/pages" }));
    assert.deepEqual(listed.files, ["src/pages/about.html (M)", "src/pages/index.html", "src/pages/new.html (A)"]);
    const about = payload(await call("read_file", { path: "src/pages/about.html" }));
    assert.equal(about.source, "draft");
    assert.match(about.content, /About the studio/);
    const css = payload(await call("read_file", { path: "src/styles/site.css" }));
    assert.equal(css.source, "github");
    assert.equal(css.hash, await textHash(files["src/styles/site.css"]));
    assert.equal((await call("read_file", { path: "src/missing.html" })).isError, true);
    const page = payload(await call("get_page", { page: "/" }));
    assert.equal(page.file, "src/pages/index.html");
    assert.deepEqual(page.sections.map((section: any) => section.id), ["1.0", "1.1"]);
    assert.match(page.html, /<h1>Welcome<\/h1>/);

    // edit_file needs the hash just read, and a unique old text.
    const stale = await call("edit_file", { path: "src/styles/site.css", expectedHash: "0".repeat(64), edits: [{ oldText: "margin: 0", newText: "margin: 1px" }], waitSeconds: 0 });
    assert.equal(stale.isError, true);
    assert.match(JSON.stringify(stale), /changed since you read it/);
    const edit = { path: "src/styles/site.css", expectedHash: css.hash, edits: [{ oldText: "margin: 0", newText: "margin: 1px" }], requestId: "css-1", waitSeconds: 0 };
    assert.equal(payload(await call("edit_file", edit)).state, "pending");
    assert.equal(payload(await call("edit_file", edit)).state, "pending", "a retry with the same requestId is the same change");
    const queued = (await tab.hub()).commands;
    assert.equal(queued.length, 1);
    assert.equal(queued[0].operation, "write_file");
    assert.equal(queued[0].content, "body { margin: 1px; }\n");
    assert.equal(queued[0].expectedHash, css.hash);
    // A second tab cannot take a change the first one claimed.
    assert.equal((await tab.claim("css-1", queued[0].grantId)).status, 200);
    const other = editorTab(worker, cookie, "tab-test-0002");
    assert.equal((await other.claim("css-1", queued[0].grantId)).status, 409);
    assert.equal((await tab.ack("css-1", queued[0].grantId, "applied", { message: "Changed.", result: { path: "src/styles/site.css", hash: "f".repeat(64) } })).status, 200);
    const done = payload(await call("get_command_status", { requestId: "css-1" }));
    assert.equal(done.state, "applied");
    assert.equal(done.result.hash, "f".repeat(64));

    // write_file: replacing needs the hash, creating needs a free path.
    assert.equal((await call("write_file", { path: "src/styles/site.css", content: "x", waitSeconds: 0 })).isError, true);
    assert.equal((await call("write_file", { path: "src/pages", content: "x", waitSeconds: 0 })).isError, true);
    assert.equal((await call("write_file", { path: ".git/config", content: "x", waitSeconds: 0 })).isError, true);
    assert.equal(payload(await call("write_file", { path: "src/styles/extra.css", content: "p {}\n", requestId: "new-css", waitSeconds: 0 })).state, "pending");
    assert.equal((await call("write_file", { path: "src/styles/extra.css", content: "a {}\n", waitSeconds: 0 })).isError, true, "one waiting change per file");

    // Sections: section components only, at a place the outline has, on the page hash read.
    const homeHash = page.hash;
    assert.equal((await call("add_section", { page: "/", component: "site-header", expectedHash: homeHash, waitSeconds: 0 })).isError, true);
    assert.equal((await call("add_section", { page: "/", component: "feature-block", expectedHash: "0".repeat(64), waitSeconds: 0 })).isError, true);
    assert.equal((await call("add_section", { page: "/", component: "feature-block", expectedHash: homeHash, after: "9.9", waitSeconds: 0 })).isError, true);
    const added = await call("add_section", { page: "/", component: "feature-block", expectedHash: homeHash, after: "1.0", requestId: "add-1", waitSeconds: 0 });
    assert.equal(payload(added).state, "pending", JSON.stringify(added));
    const addCommand = (await tab.hub()).commands.find((item: any) => item.id === "add-1");
    assert.deepEqual(addCommand.args, { component: "feature-block", container: "1", index: 1 });
    assert.equal(addCommand.path, "src/pages/index.html");

    // Waiting: a change the tab applies meanwhile comes back applied.
    const waiting = call("create_page", { title: "Our team", parent: "/about/", requestId: "page-1", waitSeconds: 5 });
    let pageCommand: any;
    for (let tries = 0; !pageCommand && tries < 50; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      pageCommand = (await tab.hub()).commands.find((item: any) => item.id === "page-1");
    }
    assert.deepEqual(pageCommand.args, { parent: "/about/", title: "Our team" });
    await tab.claim("page-1", pageCommand.grantId);
    await tab.ack("page-1", pageCommand.grantId, "applied", { result: { file: "src/pages/about/our-team.html", route: "/about/our-team/" } });
    const created = payload(await waiting);
    assert.equal(created.state, "applied");
    assert.equal(created.result.route, "/about/our-team/");
    assert.equal((await call("create_page", { title: "Orphan", parent: "/nowhere/", waitSeconds: 0 })).isError, true);

    // A conflict the tab reports is an error result.
    const details = await call("set_page_details", { page: "src/pages/about.html", description: "Who we are", requestId: "details-1", waitSeconds: 0 });
    assert.equal(payload(details).state, "pending");
    const detailsCommand = (await tab.hub()).commands.find((item: any) => item.id === "details-1");
    await tab.claim("details-1", detailsCommand.grantId);
    await tab.ack("details-1", detailsCommand.grantId, "conflict", { message: "The page changed." });
    const conflicted = await call("get_command_status", { requestId: "details-1" });
    assert.equal(conflicted.isError, true);
    assert.equal(payload(conflicted).state, "conflict");

    // Sharing another repository pauses reads for this connection.
    await tab.share({ ...context, repository: { id: 2, fullName: "lex/other" } });
    assert.equal(payload(await call("get_site")).available, false);
    assert.equal((await call("read_file", { path: "src/styles/site.css" })).isError, true);
    await tab.share(context);
    assert.equal(github.writes, 0, "MCP must not write to GitHub");

    // Installation removed, revoked, logged out: the connection stops working.
    github.allowed = false;
    await assert.rejects(() => client!.listTools());
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
