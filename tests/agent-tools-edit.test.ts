import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { OUTSIDE_MEDIA_REFUSED, textHash, type AgentCommand } from "../shared/agent";
import { payloadIdentity, type JsonValue } from "../shared/agent-command";
import type { AgentEdit, AgentEditArgsMap, AgentEditTool } from "../shared/agent-edit";
import { editShapeProblem, prepareAgentEdit, type PreparedEdit } from "../shared/agent-edit";
import { agentTools, agentToolsOn } from "../shared/agent-tool-table";
import { GITHUB_CONFIG_REFUSED, MEDIA_RECORDS_REFUSED } from "../shared/protected-paths";
import { PAGE_ADDRESS_RULE } from "../shared/site-rules";
import { installOutlineDocument } from "./support/outline-document";
import type { AgentReadResult } from "../shared/agent-read";
import { SiteFiles } from "../shared/site-files";
import type { Snapshot, TreeEntry } from "../shared/types";
import { createAgentEditTools } from "../src/agent-tools-edit";
import { workingPart } from "../src/working-part";
import { agentCommandFiles } from "../src/agent-tools";
import { agentFileReader, type AgentReadPorts } from "../src/agent-tools-read";
import { AgentRecordsError, indexedDbAgentRecords, type AgentRecords } from "../src/agent-records";
import { applySiteCommand, atomicAgentCommand, prepareAgentText, type AgentSiteActions } from "../src/agent-site";
import { createGuardedEdits, type EditorWorkspace, type GuardedEdits, type Reads } from "../src/guarded-edit";
import type { AgentTextCommit } from "../src/editor-workspace";
import { DraftStore, draftDatabaseName, indexedDbDrafts, draftKey } from "../src/drafts";
import { relayObjectName, type RelaySocket } from "../worker/agent-relay";
import { countedSocket, startCountedWorker } from "./fakes/counted-agent";
import { createMemoryWorkspace, deferred } from "./fakes/memory-workspace";
import { forEachAwait } from "./support/await-race";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb";
import { commit, editorTab, files, origin, payload, repo, signIn, siteContext } from "./mcp-harness";

const workspace = { account: "lex", repoId: repo.id, branch: "main" };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
const request = <K extends AgentEditTool>(tool: K, args: AgentEditArgsMap[K], id = "edit-1"): AgentEdit =>
  ({ operation: "edit", tool, args, id, grantId: "grant", generation: 1, createdAt: Date.now() }) as AgentEdit;
function body(result: AgentReadResult) {
  assert.equal(result.ok, true, JSON.stringify(result));
  return payload({ content: [{ text: JSON.stringify(result.ok ? result.value : null) }] });
}
async function fixture(extra: Pick<AgentReadPorts, "source" | "pin"> = {}) {
  const context = await siteContext(), texts = new Map<string, string>();
  const contents = new Map<string, string>();
  const tree: TreeEntry[] = Object.entries(files).map(([path, content], i) => {
    const sha = String(i).padStart(40, "0"); contents.set(sha, content);
    return { path, sha, type: "blob", mode: "100644", size: content.length };
  });
  const snapshot: Snapshot = { branch: "main", commit, entries: tree, tree };
  let valid = true, contexts = 0, history = 0, reads = 0;
  const ports = {
    stamp: () => ({ holds: () => valid, changed: () => undefined }),
    context: async () => { contexts++; return { context, texts }; },
    files: () => ({ repo, snapshot, api: async <T>() => ({ entries: tree }) as T,
      read: async (_repo: string, sha: string) => { reads++; return contents.get(sha)!; },
      batch: async () => Object.fromEntries(contents), has: () => true }),
    ...extra,
  } satisfies AgentReadPorts;
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords("edit-tools", fake.factory);
  const scope = { ...workspace, repo: repo.full_name };
  const commands: AgentCommand[] = [];
  let hold: Promise<void> | undefined;
  const tools = createAgentEditTools({ workspace, records, ports, run: async command => {
    commands.push(command);
    if (hold) await hold;
    const state = await records.workspace(workspace);
    const outcome = { message: "Applied once.", result: { path: command.path, hash: await textHash(command.content) } };
    const draft = { ...scope, version: 1 as const, path: command.path, baseSha: null, content: command.content, original: "", updatedAt: Date.now() };
    const key = draftKey(scope, command.path);
    const result = await records.commit({ workspace, fence: command.ownerGeneration!, expectedRevision: state.revision,
      expectedDrafts: [[key, null]], drafts: [[key, draft]], receipt: { operationId: command.id, authorizationId: command.grantId!,
        payloadIdentity: command.requestIdentity!, outcome, createdAt: Date.now(), issuedAt: command.createdAt } });
    if (!result.duplicate) {
      history++;
      context.drafts.push({ path: command.path, baseSha: null, content: command.content, hash: await textHash(command.content), updatedAt: Date.now() });
    }
    return result.receipt.outcome as typeof outcome;
  } });
  const local = () => new SiteFiles(agentFileReader(ports.files(), context), repo, context, async hash => texts.get(hash));
  return { context, texts, snapshot, ports, records, fake, tools, commands, local, stale: () => { valid = false; },
    hold: (pending: Promise<void>) => { hold = pending; }, counts: () => ({ contexts, history, reads }),
    run: (input: AgentEdit) => tools.run(input, 0, () => true) };
}

test("every migrated tool prepares the existing command shape from the browser's drafts", async () => {
  const f = await fixture(), hash = f.context.site!.outlines[0].hash;
  const cases: [AgentEdit, object][] = [
    [request("edit_file", { path: "index.html", expectedHash: hash, edits: [{ oldText: "Welcome", newText: "Hello" }] }), { operation: "write_file", input: { path: "index.html", expectedHash: hash } }],
    [request("write_file", { path: "fresh.txt", content: "fresh" }), { operation: "write_file", input: { path: "fresh.txt", content: "fresh", expectedHash: null } }],
    [request("move_file", { path: "about", to: "company", keepOldUrl: false }), { operation: "move_file", input: { path: "about", args: { to: "company", keepOldUrl: false } } }],
    [request("delete_file", { path: "about" }), { operation: "delete_file", input: { path: "about" } }],
    [request("create_page", { title: "Work", parent: "about", slug: "work" }), { operation: "create_page", input: { path: "about", args: { parent: "/about/", title: "Work", slug: "work" } } }],
    [request("set_page_details", { page: "/about/", title: "Studio", description: "" }), { operation: "set_page_details", input: { path: "about/index.html", args: { title: "Studio", description: "" } } }],
    [request("open_page", { page: "/about/" }), { operation: "open_page", input: { path: "about/index.html" } }],
    [request("inspect_preview", { selector: "h1", limit: 2 }), { operation: "inspect_preview", input: { path: "index.html", args: { selector: "h1", limit: 2 } } }],
    [request("make_component", { page: "/", element: "1.0", tag: "hero-block", fixed: ["title"], expectedHash: hash }), { operation: "make_component", input: { path: "index.html", expectedHash: hash, args: { element: "1.0", tag: "hero-block", fixed: ["title"] } } }],
    [request("add_section", { page: "/", component: "feature-block", after: "1.0", expectedHash: hash }), { operation: "add_section", input: { path: "index.html", expectedHash: hash, args: { component: "feature-block", after: "1.0" } } }],
    [request("move_section", { page: "/", section: "1.0", after: "1.1", expectedHash: hash }), { operation: "move_section", input: { path: "index.html", expectedHash: hash, args: { section: "1.0", after: "1.1" } } }],
    [request("remove_section", { page: "/", section: "1.0", expectedHash: hash }), { operation: "remove_section", input: { path: "index.html", expectedHash: hash, args: { section: "1.0" } } }],
  ];
  for (const [input, expected] of cases) {
    const prepared = await prepareAgentEdit(input, f.context, f.local());
    assert.partialDeepStrictEqual(prepared, expected, input.tool);
    // The command each tool becomes is its table row's: edit_file's is write_file.
    assert.equal("operation" in prepared && prepared.operation, agentTools[input.tool].operation, input.tool);
  }
  const draft = f.context.drafts[0];
  const prepared = await prepareAgentEdit(request("edit_file", { path: draft.path, expectedHash: draft.hash!, edits: [{ oldText: "About the studio", newText: "Browser draft" }] }), f.context, f.local());
  assert.ok("operation" in prepared && prepared.input.content?.includes("Browser draft"));
});

test("hash, unchanged, folders and parent files retain their contracts", async () => {
  const f = await fixture(), hash = f.context.site!.outlines[0].hash;
  const prepare = (input: AgentEdit) => prepareAgentEdit(input, f.context, f.local());
  for (const input of [request("edit_file", { path: "index.html", expectedHash: "0".repeat(64), edits: [{ oldText: "Welcome", newText: "Hello" }] }),
    request("write_file", { path: "index.html", content: "text", expectedHash: "0".repeat(64) })])
    await assert.rejects(prepare(input), /changed in the editor since it was read/);
  assert.partialDeepStrictEqual(await prepare(request("edit_file", { path: "index.html", expectedHash: hash, edits: [{ oldText: "Welcome", newText: "Welcome" }] })), { unchanged: { state: "unchanged", message: "The edits change nothing." } });
  assert.partialDeepStrictEqual(await prepare(request("write_file", { path: "index.html", content: files["index.html"], expectedHash: hash })), { unchanged: { message: "The file already has this text." } });
  // Protected paths, media as text and the size limit are the Worker's (the refusals below).
  for (const path of [".github/workflows/ci.yml", ".editor/media.json", "../secret"])
    for (const tool of ["write_file", "edit_file", "move_file", "delete_file"] as const) {
      const args = tool === "write_file" ? { path, content: "x" } : tool === "edit_file" ? { path, expectedHash: hash, edits: [{ oldText: "x", newText: "y" }] }
        : tool === "move_file" ? { path, to: "ok.txt" } : { path };
      // `args` is chosen by `tool` just above; TypeScript cannot pair the two across the loop.
      assert.match(editShapeProblem(tool, args as never) ?? "", /GitHub|media|path|repository/i, `${tool} ${path}`);
    }
  await assert.rejects(prepare(request("write_file", { path: "index.html/child.txt", content: "x" })), /index.html is a file/);
  f.snapshot.tree!.push({ path: "folder", type: "tree", mode: "040000", sha: "f".repeat(40) });
  await assert.rejects(prepare(request("write_file", { path: "folder", content: "x" })), /folder/);
  await assert.rejects(prepare(request("write_file", { path: "index.html", content: "x" })), /exists.*expectedHash/);
  await assert.rejects(prepare(request("write_file", { path: "missing.txt", content: "x", expectedHash: hash })), /does not exist/);
  await assert.rejects(prepare(request("edit_file", { path: "missing.txt", expectedHash: hash, edits: [{ oldText: "x", newText: "y" }] })), /does not exist/);
  await assert.rejects(prepare(request("edit_file", { path: "index.html", expectedHash: hash, edits: [{ oldText: "absent", newText: "y" }] })), /not found|does not appear/i);
});

test("write_file under a file is refused at each depth with the one wording; a missing folder is no file", async () => {
  const f = await fixture();
  const prepare = (input: AgentEdit) => prepareAgentEdit(input, f.context, f.local());
  for (const path of ["index.html/a.html", "index.html/deep/a.html"])
    await assert.rejects(prepare(request("write_file", { path, content: "x" })), { status: 400, message: "index.html is a file, so nothing can go in it." });
  assert.partialDeepStrictEqual(await prepare(request("write_file", { path: "a/b.html", content: "x" })), { operation: "write_file", input: { path: "a/b.html", content: "x", expectedHash: null } });
});

// ---- Every refusal an agent edit can get, decided once (ticket 51) ----

/**
 * Where a refusal is decided: the Worker, from the edit's shape (shared/agent-edit.ts editShapeProblem); the tab's
 * preparation (prepareAgentEdit); the live page as the command runs (src/agent-site.ts applySiteCommand); or an
 * editor control the command runs through (Make component, New page, Block move), whose own tests hold its rules.
 */
type Layer = "Worker" | "preparation" | "live page" | "editor";
type Fixture = Awaited<ReturnType<typeof fixture>>;
/** The page texts the editor shows now, which the live page reads; they start as the fixture's. */
type Live = Record<string, string>;
interface Refusal {
  tool: AgentEditTool;
  layer: Layer;
  /** What the agent is told, as the deciding file spells it (the whole wording, or its fixed part). */
  says: string;
  file: string;
  args(f: Fixture, live: Live): Promise<object> | object;
  setup?(f: Fixture, live: Live): void;
  /** The live page's ports that answer otherwise for it (a page that will not open). */
  ports?: Partial<LivePorts>;
  /** A preparation refusal's: the command preparation would have made without that check, which the live page must not refuse alike. */
  bypass?(f: Fixture): Extract<PreparedEdit, { operation: unknown }>;
}
const refusal = <K extends AgentEditTool>(tool: K, layer: Layer, says: string, file: string,
  args: (f: Fixture, live: Live) => Promise<AgentEditArgsMap[K]> | AgentEditArgsMap[K], setup?: Refusal["setup"], ports?: Refusal["ports"]): Refusal => ({ tool, layer, says, file, args, setup, ports });
const unless = (r: Refusal, bypass: NonNullable<Refusal["bypass"]>): Refusal => ({ ...r, bypass });
const written = (path: string, content: string, expectedHash: string | null) => ({ operation: "write_file" as const, input: { path, content, expectedHash } });
const gone = (path: string) => (_f: Fixture, live: Live) => { delete live[path]; };
const home = (live: Live) => textHash(live["index.html"]);
const homeHash = (f: Fixture) => f.context.site!.outlines[0].hash;
const page = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`;

const refusals: Refusal[] = [
  refusal("edit_file", "Worker", GITHUB_CONFIG_REFUSED, "shared/protected-paths.ts", f => ({ path: ".github/workflows/ci.yml", expectedHash: homeHash(f), edits: [{ oldText: "x", newText: "y" }] })),
  refusal("edit_file", "Worker", "Invalid path. Use a repository path such as about/index.html.", "shared/site-rules.ts", f => ({ path: "../secret", expectedHash: homeHash(f), edits: [{ oldText: "x", newText: "y" }] })),
  refusal("edit_file", "preparation", " does not exist. Use write_file to create it.", "shared/agent-edit.ts", f => ({ path: "missing.txt", expectedHash: homeHash(f), edits: [{ oldText: "x", newText: "y" }] })),
  unless(refusal("edit_file", "preparation", " changed in the editor since it was read. Read it again.", "shared/agent-edit.ts", () => ({ path: "index.html", expectedHash: "0".repeat(64), edits: [{ oldText: "Welcome", newText: "Hello" }] })), f => written("index.html", files["index.html"].replace("Welcome", "Hello"), homeHash(f))),
  refusal("edit_file", "preparation", "oldText was not found", "shared/agent-replacements.ts", f => ({ path: "index.html", expectedHash: homeHash(f), edits: [{ oldText: "absent", newText: "y" }] })),
  unless(refusal("edit_file", "preparation", "Drafts hold text files up to ", "shared/agent-edit.ts", f => ({ path: "index.html", expectedHash: homeHash(f), edits: [{ oldText: "Welcome", newText: "\0" }] })), f => written("index.html", files["index.html"].replace("Welcome", "\0"), homeHash(f))),
  // Typed in the editor after the tab read it: the guarded write's own proof.
  refusal("edit_file", "live page", " changed in the editor since it was read. Read it again.", "shared/agent-edit.ts", f => ({ path: "index.html", expectedHash: homeHash(f), edits: [{ oldText: "Welcome", newText: "Hello" }] }),
    (_f, live) => { live["index.html"] += "<!-- typed -->"; }),
  refusal("edit_file", "live page", " is not there any more.", "src/agent-site.ts", f => ({ path: "index.html", expectedHash: homeHash(f), edits: [{ oldText: "Welcome", newText: "Hello" }] }), gone("index.html")),
  refusal("write_file", "Worker", MEDIA_RECORDS_REFUSED, "shared/protected-paths.ts", () => ({ path: ".editor/media.json", content: "{}" })),
  refusal("write_file", "Worker", OUTSIDE_MEDIA_REFUSED, "shared/agent.ts", () => ({ path: "media/x.png", content: "x" })),
  refusal("write_file", "Worker", "Drafts hold text files up to ", "shared/agent-edit.ts", () => ({ path: "fresh.txt", content: "\0" })),
  unless(refusal("write_file", "preparation", " exists (hash ", "shared/agent-edit.ts", () => ({ path: "index.html", content: "x" })), f => written("index.html", "x", homeHash(f))),
  unless(refusal("write_file", "preparation", " does not exist; omit expectedHash to create it.", "shared/agent-edit.ts", f => ({ path: "missing.txt", content: "x", expectedHash: homeHash(f) })), () => written("missing.txt", "x", null)),
  unless(refusal("write_file", "preparation", " is a file, so nothing can go in it.", "shared/site-rules.ts", () => ({ path: "index.html/child.txt", content: "x" })), () => written("index.html/child.txt", "x", null)),
  refusal("write_file", "live page", " exists now. Read it and edit it instead.", "src/agent-site.ts", () => ({ path: "fresh.txt", content: "x" }), (_f, live) => { live["fresh.txt"] = "made meanwhile"; }),
  refusal("move_file", "Worker", GITHUB_CONFIG_REFUSED, "shared/protected-paths.ts", () => ({ path: "about", to: ".github/about" })),
  refusal("move_file", "Worker", "The new path is the same.", "shared/agent-edit.ts", () => ({ path: "about", to: "about" })),
  // The Files tab's port the command runs through (agentStructuralActions), not checked before.
  refusal("move_file", "editor", "No file or folder at ", "src/agent-site.ts", () => ({ path: "absent", to: "elsewhere" })),
  refusal("delete_file", "editor", "No file or folder at ", "src/agent-site.ts", () => ({ path: "absent" })),
  refusal("delete_file", "Worker", MEDIA_RECORDS_REFUSED, "shared/protected-paths.ts", () => ({ path: ".editor/media.json" })),
  refusal("create_page", "Worker", PAGE_ADDRESS_RULE, "shared/site-rules.ts", () => ({ title: "About us", slug: "About_Us" })),
  unless(refusal("create_page", "preparation", "No page at ", "shared/agent-edit.ts", () => ({ title: "Team", parent: "/absent/" })), () => ({ operation: "create_page", input: { path: "absent", args: { parent: "/absent/", title: "Team" } } })),
  refusal("create_page", "editor", " is taken by ", "src/native-pages.ts", () => ({ title: "Team", parent: "/about/", slug: "team" })),
  refusal("set_page_details", "Worker", "Give a title, a description, or both.", "shared/agent-edit.ts", () => ({ page: "/" })),
  refusal("set_page_details", "preparation", ". get_site lists the pages.", "shared/agent-edit.ts", () => ({ page: "/absent/", title: "x" })),
  refusal("set_page_details", "editor", "This page has no URL in the site.", "src/agent-site.ts", () => ({ page: "/", title: "x" })),
  refusal("open_page", "preparation", GITHUB_CONFIG_REFUSED, "shared/protected-paths.ts", () => ({ page: ".github/workflows/ci.yml" })),
  refusal("open_page", "live page", " could not be opened.", "src/agent-site.ts", () => ({ page: "/about/" }), undefined, { open: async () => false }),
  refusal("inspect_preview", "Worker", "Give element or selector, not both.", "shared/agent-edit.ts", () => ({ element: "1.0", selector: "h1" })),
  refusal("inspect_preview", "Worker", " is not an element id; get_page lists them.", "shared/agent-edit.ts", () => ({ element: "bad.id" })),
  refusal("inspect_preview", "preparation", "The editor shows no page now. Give page.", "shared/agent-edit.ts", () => ({ selector: "h1" }), f => { f.context.site!.openRoute = null; }),
  refusal("inspect_preview", "live page", " could not be shown in the preview.", "src/agent-site.ts", () => ({ selector: "h1" }), undefined, { open: async () => false }),
  refusal("inspect_preview", "live page", "The preview could not be inspected.", "src/agent-site.ts", () => ({ selector: "h1" }), undefined, { inspect: async () => null }),
  refusal("make_component", "Worker", " is not an element id; get_page lists them.", "shared/agent-edit.ts", f => ({ page: "/", element: "", tag: "section-intro", expectedHash: homeHash(f) })),
  refusal("make_component", "Worker", "A component's name has a dash in it", "shared/site-rules.ts", f => ({ page: "/", element: "1.0", tag: "section", expectedHash: homeHash(f) })),
  refusal("make_component", "preparation", ". get_site lists the pages.", "shared/agent-edit.ts", f => ({ page: "/absent/", element: "1.0", tag: "section-intro", expectedHash: homeHash(f) })),
  refusal("make_component", "live page", " changed in the editor since it was read. Read it again.", "shared/agent-edit.ts", () => ({ page: "/", element: "1.0", tag: "section-intro", expectedHash: "0".repeat(64) })),
  refusal("make_component", "live page", " is not there any more.", "src/agent-site.ts", f => ({ page: "/", element: "1.0", tag: "section-intro", expectedHash: homeHash(f) }), gone("index.html")),
  refusal("make_component", "editor", " cannot be a component.", "shared/site-rules.ts", async (_f, live) => ({ page: "/", element: "1", tag: "section-intro", expectedHash: await home(live) })),
  refusal("make_component", "editor", "There is a component <", "shared/site-rules.ts", async (_f, live) => ({ page: "/", element: "1.0", tag: "feature-block", expectedHash: await home(live) })),
  refusal("add_section", "Worker", "Give before or after, not both.", "shared/agent-edit.ts", f => ({ page: "/", component: "feature-block", before: "1.0", after: "1.1", expectedHash: homeHash(f) })),
  refusal("add_section", "live page", "No component <", "src/agent-site.ts", async (_f, live) => ({ page: "/", component: "absent-block", after: "1.0", expectedHash: await home(live) })),
  refusal("add_section", "live page", " is not a section component (its template is not one <section>)", "src/agent-site.ts", async (_f, live) => ({ page: "/", component: "site-header", after: "1.0", expectedHash: await home(live) })),
  refusal("add_section", "live page", " on this page. get_page lists them.", "src/agent-site.ts", async (_f, live) => ({ page: "/", component: "feature-block", after: "9.9", expectedHash: await home(live) })),
  refusal("add_section", "live page", "This page has several places for sections.", "src/agent-site.ts", async (_f, live) => ({ page: "/", component: "feature-block", expectedHash: await home(live) }),
    (_f, live) => { live["index.html"] = page("<main><section>A</section></main><aside><section>B</section></aside>"); }),
  refusal("add_section", "live page", "This page has no place for sections", "src/agent-site.ts", async (_f, live) => ({ page: "/", component: "feature-block", expectedHash: await home(live) }),
    (_f, live) => { live["index.html"] = page("<div>Nothing for sections</div>"); }),
  refusal("add_section", "live page", " could not be opened in the editor.", "src/agent-site.ts", async (_f, live) => ({ page: "/", component: "feature-block", expectedHash: await home(live) }),
    undefined, { open: async () => false }),
  refusal("add_section", "live page", " changed in the editor since it was read. Read it again.", "shared/agent-edit.ts", () => ({ page: "/", component: "feature-block", expectedHash: "0".repeat(64) })),
  refusal("move_section", "Worker", "Say before or after which section it goes.", "shared/agent-edit.ts", f => ({ page: "/", section: "1.0", expectedHash: homeHash(f) })),
  refusal("move_section", "Worker", "Give before or after, not both.", "shared/agent-edit.ts", f => ({ page: "/", section: "1.0", before: "1.0", after: "1.1", expectedHash: homeHash(f) })),
  refusal("move_section", "live page", " on this page. get_page lists them.", "src/agent-site.ts", async (_f, live) => ({ page: "/", section: "1.9", before: "1.0", expectedHash: await home(live) })),
  refusal("move_section", "editor", "A section moves among its own siblings only.", "src/page-builder/block-move.ts", async (_f, live) => ({ page: "/", section: "0.1", before: "0.0.0", expectedHash: await home(live) }),
    (_f, live) => { live["index.html"] = page("<main><section>A<section>Inner</section></section><section>B</section></main>"); }),
  refusal("remove_section", "live page", " on this page. get_page lists them.", "src/agent-site.ts", async (_f, live) => ({ page: "/", section: "1.9", expectedHash: await home(live) })),
  refusal("remove_section", "live page", " changed in the editor since it was read. Read it again.", "shared/agent-edit.ts", () => ({ page: "/", section: "1.0", expectedHash: "0".repeat(64) })),
];

/** The ports applySiteCommand uses for the edit tools. */
type LivePorts = Pick<AgentSiteActions, "text" | "isMounted" | "open" | "sectionTags" | "edits" | "writeDraft" | "moveSection" | "makeComponent"
  | "createPage" | "setPageDetails" | "moveFile" | "deleteFile" | "inspect">;
/** The live page as applySiteCommand reads it: texts now, the fixture's components; every editor control succeeds. */
function liveActions(live: Live, override: Partial<LivePorts> = {}): AgentSiteActions {
  const components: Record<string, string> = { "feature-block": "components/feature-block/feature-block.html", "site-header": "components/site-header/site-header.html" };
  const reads: Reads = { source: path => live[path], exists: path => path in live, site: () => ({ routes: { "/": "index.html", "/about/": "about/index.html" }, components }),
    template: tag => components[tag] ? { path: components[tag], source: live[components[tag]] } : undefined };
  const run: GuardedEdits["run"] = async plan => {
    const planned = await plan(reads);
    return "refuse" in planned ? { ok: false, reason: "refused", message: planned.refuse } : { ok: true, status: "applied" };
  };
  // Deliberate: applySiteCommand runs plans only; any other guarded-edit call fails as a TypeError, which firstRefusal rethrows.
  const edits = { run, peek: reads } satisfies Pick<GuardedEdits, "run" | "peek"> as GuardedEdits;
  const ports = { text: async (path: string) => live[path], isMounted: () => true, open: async () => true, sectionTags: () => new Set(["feature-block"]), edits,
    writeDraft: async () => undefined, moveSection: (_at, gap) => ({ status: "moved", node: [...gap.parent, gap.index] }),
    makeComponent: async request => ({ tag: request.tag, files: [], slots: [], cards: [], notes: [] }),
    createPage: async () => ({ file: "about/team/index.html", route: "/about/team/" }), setPageDetails: async () => undefined,
    moveFile: async () => undefined, deleteFile: async () => undefined, inspect: async () => ({ elements: [], matched: 0 }),
    ...override,
  } satisfies LivePorts;
  // Deliberate: the edit tools use only these ports; a call to another fails as a TypeError, never as a refusal.
  return ports as AgentSiteActions;
}

/** The tab's last-line guards (src/agent-site.ts refuseProtected), which the Worker's path refusals meet on the live page too. */
const guards = [GITHUB_CONFIG_REFUSED, MEDIA_RECORDS_REFUSED, OUTSIDE_MEDIA_REFUSED];
const commandOf = (input: AgentEdit, prepared: Extract<PreparedEdit, { operation: unknown }>): AgentCommand => ({ id: input.id, operation: prepared.operation,
  content: prepared.input.content ?? "", branch: "main", commit, ...prepared.input, state: "pending", createdAt: input.createdAt });
/** The first layer that refuses the edit, and its words. */
async function firstRefusal(r: Refusal): Promise<{ layer: Layer; message: string } | undefined> {
  const f = await fixture(), live: Live = { ...files, "about/index.html": f.context.drafts[0].content! };
  r.setup?.(f, live);
  // `refusal()` typed each entry's arguments by its tool; the list holds them all, so the pairing is restated here.
  const input = request(r.tool, await r.args(f, live) as never);
  const shape = editShapeProblem(r.tool, input.args as never);
  if (shape) {
    // The tab never decides it again: its preparation, asked alone, does not say it,
    const alone = await prepareAgentEdit(input, f.context, f.local()).then(prepared => prepared, (error: Error) => error.message);
    assert.ok(typeof alone !== "string" || !alone.includes(r.says), `${r.tool}: the tab's preparation decides "${r.says}" too`);
    // nor the live page, given the command it prepared (only the declared guards, refuseProtected's, meet these paths there).
    if (typeof alone !== "string" && !("unchanged" in alone) && !guards.includes(r.says)) {
      const message = await applySiteCommand(liveActions(live, r.ports), commandOf(input, alone)).then(() => "", (error: Error) => error.message);
      assert.ok(!message.includes(r.says), `${r.tool}: the live page decides "${r.says}" too`);
    }
    return { layer: "Worker", message: shape };
  }
  let prepared: PreparedEdit;
  try { prepared = await prepareAgentEdit(input, f.context, f.local()); }
  catch (error) {
    // The live page does not decide it again: given the command preparation would have made without its check, it does not say it.
    if (r.bypass) {
      const message = await applySiteCommand(liveActions(live, r.ports), commandOf(input, r.bypass(f))).then(() => "", (error: Error) => error.message);
      assert.ok(!message.includes(r.says), `${r.tool}: the live page decides "${r.says}" too`);
    }
    return { layer: "preparation", message: (error as Error).message };
  }
  if ("unchanged" in prepared) return undefined;
  try { await applySiteCommand(liveActions(live, r.ports), commandOf(input, prepared)); }
  catch (error) {
    // A port the fake lacks is the test's fault, not a refusal.
    if (error instanceof TypeError) throw error;
    return { layer: "live page", message: (error as Error).message };
  }
  return undefined;
}

test("each refusal listed for an agent edit is decided in one layer, by one file of the command's path", async t => {
  const agentPath = ["worker/mcp.ts", "shared/agent-edit.ts", "shared/site-files.ts", "src/agent-tools-edit.ts", "src/agent-site.ts"];
  const sources = new Map<string, string>();
  // The code only: a comment may quote a refusal. Only whole comment lines and blocks go, so no string is cut short.
  const code = (text: string) => text.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
  const read = (file: string) => { if (!sources.has(file)) sources.set(file, code(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))); return sources.get(file)!; };
  const count = (text: string, part: string) => text.split(part).length - 1;
  // Every edit tool has its refusals listed.
  assert.deepEqual([...new Set(refusals.map(r => r.tool))].sort(), [...agentToolsOn("edit")].sort());
  installOutlineDocument(t);
  for (const r of refusals) {
    const name = `${r.tool} (${r.layer}): ${r.says}`;
    // Spelled once in the file deciding it, and nowhere else on the command's path.
    assert.equal(count(read(r.file), r.says), 1, `${name}: in ${r.file}`);
    for (const file of agentPath.filter(file => file !== r.file)) assert.equal(count(read(file), r.says), 0, `${name}: also in ${file}`);
    const refused = await firstRefusal(r);
    if (r.layer === "editor") {
      // Neither the Worker nor the tab's preparation nor the command's own checks decide an editor control's rule.
      assert.equal(refused, undefined, `${name}: ${JSON.stringify(refused)}`);
      continue;
    }
    assert.equal(refused?.layer, r.layer, `${name}: ${JSON.stringify(refused)}`);
    assert.ok(refused.message.includes(r.says), `${name}: ${refused.message}`);
  }
});

test("a section goes before or after the section named, on the live page", async t => {
  installOutlineDocument(t);
  const live: Live = { ...files };
  // Deliberate: only where it goes is asked; the insert itself (which needs a fuller DOM) is the page builder's tests'.
  const edits = { ...liveActions(live).edits, run: async () => ({ ok: true, status: "applied" }) } satisfies Pick<GuardedEdits, "run" | "peek"> as GuardedEdits;
  const add = async (anchor: { before?: string; after?: string }) => applySiteCommand(liveActions(live, { edits }), { id: "add", operation: "add_section", path: "index.html",
    content: "", branch: "main", commit, expectedHash: await home(live), args: { component: "feature-block", ...anchor }, state: "pending", createdAt: 1 });
  // Named: before it, or after it. Unnamed: at the end of the page's one place (its <main>, two sections in).
  for (const [anchor, section] of [[{ before: "1.0" }, "1.0"], [{ after: "1.0" }, "1.1"], [{ before: "1.1" }, "1.1"], [{}, "1.2"]] as const)
    assert.equal((await add(anchor)).result?.section, section, JSON.stringify(anchor));
  // A wrong component and a wrong place: the component is told first.
  await assert.rejects(applySiteCommand(liveActions(live), { id: "add", operation: "add_section", path: "index.html", content: "", branch: "main", commit,
    expectedHash: await home(live), args: { component: "site-header", after: "9.9" }, state: "pending", createdAt: 1 }), /<site-header> is not a section component/);
  // Sections straight in <body>: the page itself is the place (container id "").
  live["index.html"] = page("<section>A</section><section>B</section>");
  assert.equal((await add({})).result?.section, "2");
});

test("a page change refused by the page's text never opens the page", async t => {
  installOutlineDocument(t);
  const f = await fixture(), live: Live = { ...files };
  let opened = 0;
  const open = async () => { opened++; return true; };
  for (const [tool, args] of [
    ["remove_section", { page: "/", section: "1.9", expectedHash: await home(live) }],
    ["remove_section", { page: "/", section: "1.0", expectedHash: "0".repeat(64) }],
    ["move_section", { page: "/", section: "1.0", after: "9.9", expectedHash: await home(live) }],
    ["add_section", { page: "/", component: "site-header", expectedHash: await home(live) }],
    ["make_component", { page: "/", element: "1.0", tag: "section-intro", expectedHash: "0".repeat(64) }],
  ] as const) {
    // Each tool's arguments are written beside it; TypeScript cannot pair them across the list.
    const input = request(tool, args as never), prepared = await prepareAgentEdit(input, f.context, f.local());
    assert.ok("operation" in prepared);
    const before = opened;
    await assert.rejects(applySiteCommand(liveActions(live, { open }), commandOf(input, prepared)), Error, tool);
    assert.equal(opened, before, `${tool} ${JSON.stringify(args)}`);
  }
  assert.equal(opened, 0);
  // Admitted, it opens the page as before.
  const input = request("move_section", { page: "/", section: "1.0", after: "1.1", expectedHash: await home(live) }), prepared = await prepareAgentEdit(input, f.context, f.local());
  assert.ok("operation" in prepared);
  await applySiteCommand(liveActions(live, { open }), commandOf(input, prepared));
  assert.equal(opened, 1);
});

test("duplicate edit_file joins in flight and returns the receipt before re-reading a changed hash", async () => {
  const f = await fixture(), hold = deferred<void>();
  f.hold(hold.promise);
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] });
  const first = f.run(input), second = f.run(input);
  hold.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(body(a).state, "applied"); assert.deepEqual(a, b);
  const counts = f.counts();
  assert.deepEqual(await f.run({ ...input, createdAt: Date.now() + 1 }), a);
  assert.deepEqual(f.counts(), counts, "receipt lookup must precede context and file reads");
  assert.equal(f.commands.length, 1); assert.equal(f.counts().history, 1);
  assert.equal(f.fake.stores.get("drafts")!.size, 1);
  const reuse = await f.run(request("write_file", { path: "index.html", content: "different" }, input.id));
  assert.equal(reuse.ok, false);
  assert.match(!reuse.ok ? reuse.message : "", /different work/);
  const receipt = await f.records.receipt(workspace, input.id, input.grantId);
  assert.equal(receipt?.payloadIdentity, await textHash(payloadIdentity(json({ tool: input.tool, args: input.args, branch: "main" }))));
  assert.ok(!JSON.stringify(receipt).includes("<!doctype"), "receipts never duplicate file contents");
  assert.deepEqual(await f.tools.run({ operation: "status", id: input.id, grantId: input.grantId }, 0, () => true), a);
  assert.equal(body(await f.tools.run({ operation: "status", id: "missing", grantId: input.grantId }, 0, () => true)).state, "unknown");
  await f.records.revoke(workspace, input.grantId);
  assert.match(body(await f.tools.run({ operation: "status", id: input.id, grantId: input.grantId }, 0, () => true)).message, /revoked/);
});

test("unchanged edits record a fenced receipt that reserves their id; stale preparation and unknown persistence never run again", async () => {
  const f = await fixture();
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Welcome" }] });
  const first = await f.run(input);
  assert.equal(body(first).state, "unchanged");
  assert.deepEqual(await f.run(input), first);
  assert.equal(f.commands.length, 0);
  assert.ok(await f.records.receipt(workspace, input.id, input.grantId));
  assert.equal(f.fake.stores.get("drafts")?.size ?? 0, 0);
  // The id stays reserved: different work, another grant, or a new tools instance over the same records is refused.
  const reuse = request("delete_file", { path: "index.html" }, input.id);
  assert.match(String(JSON.stringify(await f.run(reuse))), /already used for different work/);
  assert.match(String(JSON.stringify(await f.run({ ...input, grantId: "other-grant" }))), /authorization differs/i);
  const again = createAgentEditTools({ workspace, ports: f.ports, records: f.records, run: async () => assert.fail("must not run") });
  assert.match(String(JSON.stringify(await again.run(reuse, 0, () => true))), /already used for different work/);
  assert.deepEqual(await again.run(input, 0, () => true), first);
  assert.equal(f.commands.length, 0);
  // The revision proof comes from before preparation: an agent commit landing meanwhile refuses the unchanged receipt.
  const g = await fixture();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const inContext = new Promise<void>(resolve => { entered = resolve; });
  const held = createAgentEditTools({ workspace, records: g.records, run: async () => assert.fail("must not run"),
    ports: { ...g.ports, context: async () => { entered(); await gate; return g.ports.context(); } } });
  const pending = held.run(request("edit_file", input.args, "held-unchanged"), 0, () => true);
  // Preparation has read its revision proof and waits in context(): the agent commit lands after the proof.
  await inContext;
  assert.equal(body(await g.run(request("write_file", { path: "meanwhile.txt", content: "agent" }, "meanwhile"))).state, "applied");
  release();
  assert.notEqual(body(await pending).state, "unchanged");
  assert.equal(await g.records.receipt(workspace, "held-unchanged", "grant"), undefined);
  f.stale();
  assert.equal(body(await f.run(request("delete_file", { path: "index.html" }, "stale"))).state, "conflict");
  const fresh = await fixture();
  const unknown = createAgentEditTools({ workspace, ports: fresh.ports,
    records: { ...fresh.records, receipt: async () => { throw new AgentRecordsError("unknown", "The outcome is unknown."); } }, run: async () => assert.fail("must not run") });
  const result = body(await unknown.run(input, 0, () => true));
  assert.equal(result.state, "unknown"); assert.match(result.message, /get_command_status/);
});

async function connected() {
  const h = await startCountedWorker(), { cookie } = await signIn(h.worker), tab = editorTab(h.worker, cookie);
  const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json() as { token: string };
  const rpc = async (name: string, args: object, method = "tools/call") => {
    const response = await h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`,
      "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "tools/call" ? { name, arguments: args } : args }) });
    const responseText = await response.text();
    const value = JSON.parse(responseText.startsWith("event:") ? responseText.split("data: ")[1].split("\n")[0] : responseText) as { result: unknown; error?: unknown };
    assert.equal(value.error, undefined); return value.result;
  };
  // Mark the grant used so the measured edit has only the three retained authentication calls.
  await rpc("", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "edit-test", version: "1" } }, "initialize");
  return { ...h, tab, rpc };
}

test("already-authorized edit and duplicate: 3 auth + 1 real relay dispatch, 0 result polls, 0 server draft fetches", async t => {
  const h = await connected(), browser = await fixture();
  await browser.records.setFence(workspace, 0, 1);
  const scope = { workspace, tabId: "owner-tab", generation: 1 }, name = await relayObjectName(workspace);
  const traffic = countedSocket();
  let attachment: unknown = { ...scope, role: "editor", owner: { tabId: scope.tabId, generation: 1 } };
  const editor = {
    readyState: 1, close() {}, serializeAttachment(value: unknown) { attachment = value; }, deserializeAttachment: () => attachment,
    send(message: string) {
      traffic.send(message);
      const value = JSON.parse(message);
      if (value.type !== "command") return;
      void browser.tools.run(value.command, 1, () => true).then(result => {
        const reply = JSON.stringify({ type: "result", id: value.id, ...scope, result });
        traffic.receive(reply); h.message(name, editor, reply);
      });
    },
  } satisfies RelaySocket;
  try {
    h.attach(name, editor, JSON.stringify({ type: "handshake", ...scope, owner: true }));
    await h.settle(name);
    const args = { path: "index.html", expectedHash: browser.context.site!.outlines[0].hash,
      edits: [{ oldText: "Welcome", newText: "Hello over relay" }], requestId: "measured-edit", waitSeconds: 0 };
    let first: unknown;
    for (const [tool, argsForTool] of [["edit_file", args], ["edit_file", args], ["get_command_status", { requestId: args.requestId }]] as const) {
      h.counters.reset(); h.github.requests.length = 0;
      const result = await h.rpc(tool, argsForTool);
      assert.equal(body({ ok: true, value: json(payload(result)) }).state, "applied", JSON.stringify(result));
      if (!first) first = result; else assert.deepEqual(result, first);
      assert.equal(h.counters.byCategory.auth.calls, 3);
      assert.equal(h.counters.byCategory.control.calls, 1);
      assert.equal(h.counters.byCategory.data.calls, 0);
      assert.equal(h.counters.log.length, 4);
      assert.equal(h.counters.waitedMs, 0);
      assert.equal(h.counters.readKeys.some(key => key.startsWith("draft:")), false);
      assert.equal(h.github.requests.length, 0);
    }
    assert.equal(browser.commands.length, 1); assert.equal(browser.counts().history, 1);
    assert.equal(browser.fake.stores.get("drafts")!.size, 1);
    t.diagnostic("call counts: auth=3 dispatch=1 resultPolls=0 serverDraftFetches=0; duplicates: draft=1 history=1");
  } finally { await h.worker.dispose(); }
});

test("no legacy edit fallback, even with matching context; timeout/lost never retries", async () => {
  const h = await connected(), get = h.namespace.get;
  try {
    h.counters.reset();
    assert.match(JSON.stringify(payload(await h.rpc("write_file", { path: "new.txt", content: "x" }))), /The editor isn't open/);
    assert.equal(h.counters.log.length, 4); assert.equal(h.counters.waitedMs, 0);
    const context = await siteContext();
    context.branch = "other";
    await h.storage(h.counters.log.find(row => row.name.startsWith("agent-hub:"))!.name).put("context", context);
    h.counters.reset();
    assert.match(JSON.stringify(payload(await h.rpc("write_file", { path: "new.txt", content: "x" }))), /The editor isn't open/);
    assert.equal(h.counters.log.length, 4); assert.equal(h.counters.waitedMs, 0);
    context.branch = "main";
    await h.storage(h.counters.log.find(row => row.name.startsWith("agent-hub:"))!.name).put("context", context);
    const legacy = payload(await h.rpc("write_file", { path: "new.txt", content: "x", waitSeconds: 0 }));
    assert.match(JSON.stringify(legacy), /The editor isn't open/);
    assert.match(JSON.stringify(payload(await h.rpc("get_command_status", { requestId: "legacy" }))), /The editor isn't open/);
    let dispatches = 0;
    for (const code of ["timeout", "unknown-outcome", "busy", "too-large", "cancelled", "lost"]) {
      h.namespace.get = name => String(name).startsWith("agent-relay:") ? { fetch: async () => {
        dispatches++; if (code === "lost") throw new Error("lost socket");
        return Response.json({ ok: false, code });
      } } : get(name);
      h.counters.reset();
      const before = dispatches;
      const result = payload(await h.rpc("write_file", { path: "new.txt", content: "x", requestId: "unknown" }));
      assert.equal(result.state, "unknown"); assert.match(result.message, /get_command_status.*do not replay/);
      assert.equal(dispatches - before, 1); assert.equal(h.counters.byCategory.data.calls, 0); assert.equal(h.counters.waitedMs, 0);
    }
    // A command the relay proves it never sent (busy, too large, expired before delivery) is no unknown outcome.
    for (const code of ["busy", "too-large", "timeout"]) {
      h.namespace.get = name => String(name).startsWith("agent-relay:") ? { fetch: async () => {
        dispatches++; return Response.json({ ok: false, code, outcome: "not-sent" });
      } } : get(name);
      const before = dispatches;
      const result = payload(await h.rpc("write_file", { path: "new.txt", content: "x", requestId: "unsent" }));
      assert.equal(result.state, "failed"); assert.match(result.message, /did not receive.*Nothing was changed/);
      assert.equal(dispatches - before, 1);
    }
  } finally { h.namespace.get = get; await h.worker.dispose(); }
});

for (const operation of ["update_active_draft", "create_file_draft"] as const) test(`${operation} commits drafts and receipt together; duplicates never add an Undo step`, async t => {
  const fake = fakeIndexedDB();
  for (const [name, value] of Object.entries({ indexedDB: fake.factory, IDBKeyRange: { bound: (lower: string, upper: string) => ({ lower, upper }) } })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
  const scope = { account: operation, repoId: 1, repo: "lex/site", branch: "main" };
  const store = new DraftStore({ getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }, indexedDbDrafts(draftDatabaseName, fake.factory));
  await store.load(scope.account);
  const memory = createMemoryWorkspace({ branch: { "index.html": "before" }, open: "index.html" });
  const source = (path: string) => store.get(scope, path)?.content ?? memory.workspace.source(path);
  let context: AgentTextCommit | undefined;
  const workspace: EditorWorkspace = { ...memory.workspace, store, draftScope: () => scope, source,
    mountedSource: source, agentText: () => context, agentActing: () => true,
    branchText: async path => path === "index.html" ? { text: "before", sha: "a".repeat(40) } : undefined };
  const edits = createGuardedEdits(workspace);
  const command: AgentCommand = { id: "alias", operation, path: operation === "update_active_draft" ? "index.html" : "fresh.txt",
    content: "after", expectedHash: operation === "update_active_draft" ? await textHash("before") : null,
    branch: "main", commit, grantId: "grant", state: "pending", createdAt: Date.now() };
  assert.equal(atomicAgentCommand(command), true);
  const run = async () => {
    const prepared = await prepareAgentText(command, scope, store, () => true, () => {});
    if (prepared.duplicate) return prepared.duplicate;
    context = prepared.context;
    // Only the text ports are used: legacy() must never receive these aliases.
    const actions = { text: async (path: string) => source(path), isMounted: (path: string) => path === "index.html",
      atomicText: () => true, legacy: async () => assert.fail("receiptless legacy path"),
      writeDraft: async (path: string, content: string, create: boolean) => {
        const result = await edits.run(r => { r.source(path); return create ? { creates: [{ path, content }], done: "Created", undone: "Undid" }
          : { edits: new Map([[path, content]]), done: "Changed", undone: "Undid", select: { historyOnly: true } }; });
        return result.ok ? undefined : result.message;
      },
    } satisfies Pick<AgentSiteActions, "text" | "isMounted" | "atomicText" | "legacy" | "writeDraft">;
    await applySiteCommand(actions as AgentSiteActions, command);
    await prepared.finish!(() => true);
    return prepared.outcome;
  };
  const first = await run();
  assert.deepEqual(await run(), first);
  assert.equal(source(command.path), "after");
  assert.equal(fake.stores.get("drafts")!.size, 1); assert.equal(fake.stores.get("receipts")!.size, 1);
  assert.equal(memory.steps().length, 1); assert.equal(memory.undo(), true); assert.equal(memory.undo(), false);
  t.after(() => store.flush());
});

test("in-flight identity includes authorization and refuses different work before preparation", async () => {
  const f = await fixture(), hold = deferred<void>(), entered = deferred<void>();
  f.hold(hold.promise);
  const context = f.ports.context;
  f.ports.context = async () => { const result = await context(); entered.resolve(); return result; };
  const input = request("write_file", { path: "fresh.txt", content: "first" });
  const first = f.run(input);
  await entered.promise;
  for (const different of [request("write_file", { path: "fresh.txt", content: "other" }), { ...input, grantId: "other-grant" }]) {
    const response = await f.run(different);
    assert.equal(response.ok, false); assert.match(!response.ok ? response.message : "", /different work or authorization/);
  }
  hold.resolve();
  assert.equal(body(await first).state, "applied"); assert.equal(f.counts().history, 1);
});

test("a changed revision at every preparation await never reaches the guarded executor", async () => {
  const points = await forEachAwait(race => {
    const state = { disturb: () => {}, writes: 0, done: Promise.resolve() };
    state.done = (async () => {
      const f = await fixture();
      state.disturb = () => { f.snapshot.commit = "different revision"; };
      const source = f.ports.files();
      const ports: AgentReadPorts = { ...f.ports, context: race.port("context", () => f.ports.context()),
        files: () => ({ ...source, read: race.port("file", (repo, sha) => source.read(repo, sha)) }) };
      const tools = createAgentEditTools({ workspace, ports,
        records: { ...f.records, receipt: race.port("receipt", (...args) => f.records.receipt(...args)) },
        run: async () => { state.writes++; return { message: "Applied." }; } });
      await tools.run(request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] }), 0, () => true);
    })();
    return state;
  }, state => state.disturb(), state => assert.equal(state.writes, 0));
  assert.ok(points >= 3);
});

// The tools trust the guarded edit's repository stamp for the repository and branch (src/workspace-session.ts):
// a real one stops holding on a branch switch even when the commit stays the same.
test("a branch switch while an agent edit prepares stops the real repository stamp; nothing runs or is kept", async () => {
  const f = await fixture(), memory = createMemoryWorkspace({ branch: { "index.html": "before" } }), edits = createGuardedEdits(memory.workspace);
  const opened = deferred<void>(), gate = deferred<void>();
  const ports: AgentReadPorts = { ...f.ports, stamp: () => edits.stamp("repository"), context: async () => { opened.resolve(); await gate.promise; return f.ports.context(); } };
  let writes = 0;
  const tools = createAgentEditTools({ workspace, ports, records: f.records, run: async () => { writes++; return { message: "Applied." }; } });
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] });
  const reply = tools.run(input, 0, () => true);
  await opened.promise;
  memory.setScope("lex/site@dev");
  gate.resolve();
  assert.deepEqual(await reply, { ok: true, value: { requestId: input.id, state: "conflict", message: "The editor changed branch or revision. Read the site again." } });
  assert.equal(f.snapshot.commit, commit, "the commit stayed the same");
  assert.equal(writes, 0);
  assert.equal(await f.records.receipt(workspace, input.id, input.grantId), undefined);
});

// Ticket 23: with the host's pin (src/agent-site-host.ts), a switch while the edit prepares stops
// nothing: it is prepared from the workspace it arrived in and handed to the editor with those files.
test("a branch switch while a pinned agent edit prepares finishes it on the branch it arrived on", async () => {
  const f = await fixture(), memory = createMemoryWorkspace({ branch: { "index.html": "before" } }), edits = createGuardedEdits(memory.workspace);
  const opened = deferred<void>(), gate = deferred<void>(), shownContext = { ...f.context, branch: "dev" };
  let shown = f.context;
  const ports: AgentReadPorts = { ...f.ports, stamp: () => edits.stamp("repository"),
    // As the host's (src/agent-site-host.ts): the context shown, or none once a switch interrupted it.
    context: async () => { const at = edits.stamp("repository"); opened.resolve(); await gate.promise; return at.holds() ? { context: shown, texts: f.texts } : undefined; },
    pin: () => {
      const at = edits.stamp("repository"), own = f.context, away = () => at.changed() === "scope";
      return { away, context: async () => (away() ? undefined : await ports.context()) ?? (away() ? { context: own, texts: f.texts } : undefined) };
    } };
  const ran: AgentCommand[] = [];
  const tools = createAgentEditTools({ workspace, ports, records: f.records, run: async command => { ran.push(command); return { message: "Applied there." }; } });
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] });
  const reply = tools.run(input, 0, () => true);
  await opened.promise;
  memory.setScope("lex/site@dev"); shown = shownContext;
  gate.resolve();
  assert.equal(body(await reply).state, "applied");
  assert.equal(ran.length, 1);
  assert.equal(ran[0].branch, "main", "the branch it arrived on, not the one shown");
  assert.equal(agentCommandFiles.get(ran[0])?.snapshot, f.snapshot, "with the files it was read from");
});

test("a pinned agent edit whose branch is shown again (away and back) before it runs still applies", async () => {
  const f = await fixture(), memory = createMemoryWorkspace({ branch: { "index.html": "before" } }), edits = createGuardedEdits(memory.workspace);
  const opened = deferred<void>(), gate = deferred<void>();
  const ports: AgentReadPorts = { ...f.ports, stamp: () => edits.stamp("repository"),
    context: async () => { const at = edits.stamp("repository"); opened.resolve(); await gate.promise; return at.holds() ? { context: f.context, texts: f.texts } : undefined; },
    // As the host's (src/agent-site-host.ts): the one shown, read again when it was left and shown again.
    pin: () => {
      const at = edits.stamp("repository"), away = () => at.changed() === "scope";
      return { away, context: async () => (away() ? undefined : await ports.context()) ?? (away() ? { context: f.context, texts: f.texts } : ports.context()) };
    } };
  const ran: AgentCommand[] = [];
  const tools = createAgentEditTools({ workspace, ports, records: f.records, run: async command => { ran.push(command); return { message: "Applied here." }; } });
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] });
  // The current() src/components/agent-menu.ts hands over: a new load of its branch is no move; its revision holds.
  const arrived = edits.stamp("repository"), commit = f.ports.files().snapshot.commit;
  const reply = tools.run(input, 0, () => arrived.changed() === "scope" || f.ports.files().snapshot.commit === commit);
  await opened.promise;
  memory.setScope("lex/site@dev"); memory.setScope("lex/site@main"); memory.bumpGeneration();
  gate.resolve();
  assert.equal(body(await reply).state, "applied");
  assert.equal(ran.length, 1);
  assert.equal(ran[0].branch, "main");
});

// No pin could be taken as it arrived (nothing open then): it cannot finish elsewhere, so the stamp
// it arrived with must hold, even on a branch at the same commit (a branch just made from main).
test("an agent edit with no pin switched to a branch at the same commit while it prepares refuses", async () => {
  const f = await fixture(), memory = createMemoryWorkspace({ branch: { "index.html": "before" } }), edits = createGuardedEdits(memory.workspace);
  const opened = deferred<void>(), gate = deferred<void>();
  const ports: AgentReadPorts = { ...f.ports, stamp: () => edits.stamp("repository"), pin: () => undefined,
    context: async () => { opened.resolve(); await gate.promise; return { context: f.context, texts: f.texts }; } };
  let writes = 0;
  const tools = createAgentEditTools({ workspace, ports, records: f.records, run: async () => { writes++; return { message: "Applied." }; } });
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] });
  const reply = tools.run(input, 0, () => true);
  await opened.promise;
  memory.setScope("lex/site@dev");
  gate.resolve();
  assert.deepEqual(await reply, { ok: true, value: { requestId: input.id, state: "conflict", message: "The editor changed branch or revision. Read the site again." } });
  assert.equal(f.snapshot.commit, commit, "the same commit");
  assert.equal(writes, 0);
});

test("a revision change after the executor committed still reports applied, never conflict", async () => {
  const f = await fixture();
  let live = true;
  const tools = createAgentEditTools({ workspace, ports: f.ports, records: f.records, run: async command => {
    const outcome = { message: "Applied once.", result: { path: command.path } };
    // The commit landed; the editor then moves to another revision (or the socket drops) before the reply.
    f.stale(); live = false;
    return outcome;
  } });
  const result = body(await tools.run(request("delete_file", { path: "index.html" }, "post-commit"), 0, () => live));
  assert.equal(result.state, "applied"); assert.equal(result.message, "Applied once.");
});

test("get_command_status never turns an undelivered lookup into a failed change", async () => {
  const h = await connected(), get = h.namespace.get;
  try {
    for (const outcome of ["not-sent", "unknown"]) {
      h.namespace.get = name => String(name).startsWith("agent-relay:")
        ? { fetch: async () => Response.json({ ok: false, code: "busy", outcome }) } : get(name);
      const result = payload(await h.rpc("get_command_status", { requestId: "lost-reply" }));
      assert.equal(result.state, "unknown"); assert.match(result.message, /do not replay/);
    }
  } finally { h.namespace.get = get; await h.worker.dispose(); }
});

// ---- Ticket 52: a change to the part the user types in waits ----

const settle = () => new Promise(resolve => setImmediate(resolve));
// index.html's <h1>: body > main (1) > section (0) > h1 (0).
const heading = { path: "index.html", node: [1, 0, 0] } as const;
/** Edit tools over a live text; `wrap` swaps records or ports (an await race's). A change lands only once its receipt is committed. */
async function waitsFixture(wrap: { records?: (records: AgentRecords) => AgentRecords; ports?: (ports: AgentReadPorts) => AgentReadPorts } = {}) {
  const live: Record<string, string> = { ...files };
  let away = false;
  const f = await fixture({ source: path => live[path] });
  const plain = { ...f.ports, source: (path: string) => live[path], pin: () => ({ away: () => away, context: f.ports.context }) } satisfies AgentReadPorts;
  const make = (records: AgentRecords, ports: AgentReadPorts) => createAgentEditTools({ workspace, records, ports, run: async command => {
    const state = await f.records.workspace(workspace);
    const outcome = { message: "Applied once.", result: { path: command.path } };
    const result = await f.records.commit({ workspace, fence: command.ownerGeneration!, expectedRevision: state.revision, expectedDrafts: [], drafts: [],
      receipt: { operationId: command.id, authorizationId: command.grantId!, payloadIdentity: command.requestIdentity!, outcome, createdAt: Date.now(), issuedAt: command.createdAt } });
    if (!result.duplicate) { f.commands.push(command); live[command.path] = command.content; }
    return result.receipt.outcome as typeof outcome;
  } });
  const tools = make(wrap.records?.(f.records) ?? f.records, wrap.ports?.(plain) ?? plain);
  // Another connection's tools in the same tab (a reconnect), on the records as they are.
  const again = () => make(f.records, plain);
  const status = async (id: string, grantId = "grant", by = tools) => body(await by.run({ operation: "status", id, grantId }, 0, () => true));
  return { ...f, live, tools, again, status, run: (input: AgentEdit) => tools.run(input, 0, () => true), leave: () => { away = true; } };
}
const editHeading = async (f: { live: Record<string, string> }, id: string, newText = "Hello") =>
  request("edit_file", { path: "index.html", expectedHash: await textHash(f.live["index.html"]), edits: [{ oldText: "Welcome", newText }] }, id);

test("an edit of the element the user types in waits, a duplicate joins it, and it lands once on their typing when they leave it", async t => {
  t.after(() => workingPart.left());
  const f = await waitsFixture();
  workingPart.typed(heading);
  const edit = await editHeading(f, "wait-1");
  const first = body(await f.run(edit));
  assert.equal(first.state, "waiting");
  assert.match(first.message, /editing this part; the change lands when they click away/);
  assert.equal(f.commands.length, 0);
  // A duplicate joins it and the status says so, through this connection's tools or a reconnected one's; neither runs it.
  assert.equal(body(await f.run(edit)).state, "waiting");
  assert.equal((await f.status("wait-1")).state, "waiting");
  assert.equal(body(await f.again().run(edit, 0, () => true)).state, "waiting");
  // Another grant is told nothing of it.
  assert.equal((await f.status("wait-1", "other")).state, "unknown");
  // The same id for other work is refused.
  assert.match(JSON.stringify(await f.run({ ...edit, args: { ...edit.args, edits: [{ oldText: "Welcome", newText: "Other" }] } } as AgentEdit)), /already running with different work/);
  // An edit elsewhere on the page lands at once.
  const elsewhere = request("edit_file", { path: "index.html", expectedHash: await textHash(files["index.html"]), edits: [{ oldText: ">Fast<", newText: ">Quick<" }] }, "elsewhere");
  assert.equal(body(await f.run(elsewhere)).state, "applied");
  assert.equal(f.commands.length, 1);
  // The user's typing is written as they leave; the replacement is made again on it.
  f.live["index.html"] = f.live["index.html"].replace("<h1>Welcome</h1>", "<h1>Welcome back</h1>");
  workingPart.left(heading);
  await settle();
  const applied = await f.status("wait-1");
  assert.equal(applied.state, "applied", applied.message);
  assert.equal(f.commands.length, 2);
  const typed = files["index.html"].replace(">Fast<", ">Quick<").replace("<h1>Welcome</h1>", "<h1>Welcome back</h1>");
  assert.equal(f.live["index.html"], typed.replace("Welcome back", "Hello back"));
  assert.equal(f.commands[1].expectedHash, await textHash(typed));
  // Sent again: its receipt answers, nothing runs twice.
  assert.equal(body(await f.run(edit)).state, "applied");
  assert.equal(f.commands.length, 2);
});

test("a waiting edit is made again on the text it lands on even when that text changed before it began to wait", async t => {
  t.after(() => workingPart.left());
  // The text changes between the edit's preparation (against the agent's read) and its wait.
  let typedBefore = false;
  const f = await waitsFixture({ records: records => ({ ...records, wait: async (...args) => {
    if (!typedBefore) { typedBefore = true; f.live["index.html"] = f.live["index.html"].replace("<h1>Welcome</h1>", "<h1>Welcome all</h1>"); }
    return records.wait(...args);
  } }) });
  workingPart.typed(heading);
  assert.equal(body(await f.run(await editHeading(f, "wait-before"))).state, "waiting");
  workingPart.left(heading);
  await settle();
  assert.equal((await f.status("wait-before")).state, "applied");
  assert.match(f.live["index.html"], /<h1>Hello all<\/h1>/);
});

test("a waiting edit whose text the user changed is refused once let go, and stays refused, after a reload too", async t => {
  t.after(() => workingPart.left());
  const f = await waitsFixture();
  workingPart.typed(heading);
  const edit = await editHeading(f, "wait-2");
  assert.equal(body(await f.run(edit)).state, "waiting");
  f.live["index.html"] = f.live["index.html"].replace("<h1>Welcome</h1>", "<h1>Hi there</h1>");
  workingPart.left(heading);
  await settle();
  const refused = await f.status("wait-2");
  assert.equal(refused.state, "conflict");
  assert.match(refused.message, /The user changed index.html where this change goes while it waited/);
  assert.equal(body(await f.run(edit)).state, "conflict");
  // Kept beside its receipt: another connection's tools (or a reloaded tab's) tell the same.
  assert.deepEqual(await f.status("wait-2", "grant", f.again()), refused);
  assert.equal(f.commands.length, 0);
  // A whole write of a file the user changed while it waited is refused too.
  workingPart.typed({ path: "index.html", lines: { start: 1, end: 3 } });
  f.live["index.html"] = files["index.html"];
  const write = request("write_file", { path: "index.html", content: "<!doctype html>\n<p>New</p>\n", expectedHash: await textHash(files["index.html"]) }, "wait-3");
  const written = body(await f.run(write));
  assert.equal(written.state, "waiting", written.message);
  f.live["index.html"] += "\n";
  workingPart.left();
  await settle();
  assert.equal((await f.status("wait-3")).state, "conflict");
  assert.equal(f.commands.length, 0);
});

test("a change that was waiting in a tab since reloaded or closed is refused, never prepared again", async () => {
  const f = await waitsFixture();
  const edit = await editHeading(f, "wait-lost");
  // What the gone tab left: its waiting record, and no receipt.
  await f.records.wait(workspace, edit.id, edit.grantId, await textHash(payloadIdentity(json({ tool: edit.tool, args: edit.args, branch: "main" }))));
  const lost = await f.status("wait-lost");
  assert.equal(lost.state, "conflict");
  assert.match(lost.message, /reloaded or closed while this change waited/);
  assert.deepEqual(body(await f.run(edit)), lost);
  assert.match(JSON.stringify(await f.run({ ...edit, args: { ...edit.args, edits: [{ oldText: "Welcome", newText: "Other" }] } } as AgentEdit)), /already used for different work/);
  assert.equal((await f.status("wait-lost", "other")).state, "unknown");
  assert.equal(f.commands.length, 0);
});

test("a waiting edit whose connection is disconnected never lands, and its status and duplicates say so", async t => {
  t.after(() => workingPart.left());
  const f = await waitsFixture();
  workingPart.typed(heading);
  const edit = await editHeading(f, "wait-revoked");
  assert.equal(body(await f.run(edit)).state, "waiting");
  await f.records.revoke(workspace, "grant");
  // Its status is not told to the revoked grant while it waits.
  assert.match((await f.status("wait-revoked")).message, /revoked/);
  workingPart.left(heading);
  await settle();
  assert.match((await f.status("wait-revoked")).message, /revoked/);
  assert.match(body(await f.run(edit)).message, /revoked/);
  assert.equal(f.commands.length, 0);
  assert.equal(f.live["index.html"], files["index.html"]);
});

test("a waiting edit lands as it is once its workspace is no longer shown", async t => {
  t.after(() => workingPart.left());
  const f = await waitsFixture();
  workingPart.typed(heading);
  assert.equal(body(await f.run(await editHeading(f, "wait-4"))).state, "waiting");
  // Another site shown: the next change of the part lets it go there, unchanged.
  f.leave();
  workingPart.typed({ path: "index.html", node: [1, 0] });
  await settle();
  assert.equal((await f.status("wait-4")).state, "applied");
  assert.equal(f.commands.length, 1);
});

test("at every await of a waiting edit, a disconnect, a revision move or another site shown leaves it landed at most once, and never against its proofs", async () => {
  let id = 0;
  for (const disturbance of ["revoke", "revision", "switch"] as const) {
    const points = await forEachAwait(race => {
      const state = { disturb: () => {}, landed: -1, applied: false, text: "", done: Promise.resolve() };
      state.done = (async () => {
        const f = await waitsFixture({
          records: records => ({ ...records, receipt: race.port("receipt", records.receipt), status: race.port("status", records.status),
            waiting: race.port("waiting", records.waiting), wait: race.port("wait", records.wait) }),
          ports: ports => ({ ...ports, context: race.port("context", () => ports.context()) }),
        });
        state.disturb = disturbance === "revoke" ? () => { void f.records.revoke(workspace, "grant"); }
          : disturbance === "revision" ? () => { f.snapshot.commit = "another revision"; } : () => f.leave();
        workingPart.typed(heading);
        const edit = await editHeading(f, `race-wait-${++id}`);
        await f.run(edit);
        workingPart.left(heading);
        // The status of a change that waited answers once it settled.
        state.applied = (await f.status(edit.id, "grant", f.again())).state === "applied";
        state.landed = f.commands.length;
        state.text = f.live["index.html"];
      })().finally(() => workingPart.left());
      return state;
    }, state => state.disturb(), state => {
      assert.ok(state.landed <= 1, `${disturbance}: landed ${state.landed} times`);
      if (disturbance === "switch") assert.equal(state.landed, 1, "a switch stops nothing");
      if (disturbance === "revision") assert.equal(state.landed, 0, "a revision move refuses it");
      if (state.landed) assert.match(state.text, /<h1>Hello<\/h1>/);
      assert.equal(state.applied, state.landed === 1, `${disturbance}: its status says what landed`);
      if (disturbance === "revoke") assert.equal(state.landed, 0, "a revoked grant lands nothing");
    });
    assert.ok(points >= 4, `${disturbance}: ${points} awaits`);
  }
});

test("the code pane's lines are left by a pause in typing; an element only by leaving it, once what was typed there is written", async t => {
  t.after(() => { t.mock.timers.reset(); workingPart.left(); });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let changes = 0;
  const stop = workingPart.subscribe(() => changes++);
  t.after(stop);
  // Typed in the code pane: the lines of the change, in the text it made.
  workingPart.typedLines("index.html", "a\nb\nc!\nd\n", { start: 5, text: "!" });
  assert.deepEqual(workingPart.now(), { path: "index.html", lines: { start: 3, end: 3 } });
  t.mock.timers.tick(4999);
  workingPart.typedLines("index.html", "a\nb\nc!!\nd\n", { start: 6, text: "!" });
  t.mock.timers.tick(4999);
  // Typing on in the same lines keeps them, told once.
  assert.equal(changes, 1);
  t.mock.timers.tick(1);
  assert.equal(workingPart.now(), undefined);
  // An element stays through any pause.
  workingPart.typed(heading);
  t.mock.timers.tick(60_000);
  assert.deepEqual(workingPart.now(), heading);
  // Leaving another element, or the code pane's lines of its file (the pane closing), leaves it.
  workingPart.left({ path: "index.html", node: [1, 0] });
  workingPart.left({ path: "index.html" });
  await settle();
  assert.deepEqual(workingPart.now(), heading);
  // Left: once its text edit is written.
  let written!: () => void;
  workingPart.left(heading, new Promise<void>(resolve => { written = resolve; }));
  await settle();
  assert.deepEqual(workingPart.now(), heading);
  written();
  await settle();
  assert.equal(workingPart.now(), undefined);
  // The pane closing leaves its lines.
  workingPart.typedLines("index.html", "a\n", { start: 0, text: "a" });
  workingPart.left({ path: "index.html" });
  await settle();
  assert.equal(workingPart.now(), undefined);
});
