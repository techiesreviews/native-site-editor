import assert from "node:assert/strict";
import { test } from "node:test";
import { textBytes, textHash } from "../shared/agent";
import { PART_LIMIT, PartClash, partOf, prepareAgentEdit, spanNow, wordsMoved, type AgentEdit, type AgentEditArgsMap } from "../shared/agent-edit";
import { CATCH_UP_BYTES, CATCH_UP_FILES, catchUpOf, type AgentCatchUp, type AgentMark } from "../shared/agent-read";
import { SiteFiles, type SiteFileReader } from "../shared/site-files";
import type { EditorContext } from "../shared/types";
import { elementsNow, noteOwnChange, readText, rememberRead, rememberText, tellAgent } from "../src/agent-part";
import { AgentRelay } from "../worker/agent-relay";
import { installOutlineDocument } from "./support/outline-document";
import { files, repo, siteContext } from "./mcp-harness";

// Ticket 10: an agent's change targets the exact part it changes; only a true clash refuses, with the part
// as it is now; every reply tells what changed since the agent's last call.

const edit = (args: AgentEditArgsMap["edit_file"]): AgentEdit => ({ operation: "edit", tool: "edit_file", args, id: "e", grantId: "g", createdAt: 1 });
const noGithub = { commitTree: async () => [], file: async () => "", prefetchTexts: async () => {}, hasText: () => false } satisfies SiteFileReader;
/** The fake site with index.html's text now `home`, as a draft. */
async function withHome(home: string) {
  const context = await siteContext();
  context.drafts.push({ path: "index.html", baseSha: "1".repeat(40), updatedAt: 2, hash: await textHash(home), content: home });
  return { context, files: new SiteFiles(noGithub, repo, context) };
}
const read = files["index.html"];

test("an edit read before another change elsewhere on the page lands on the text now, both changes kept", async () => {
  const first = read.replace("<h1>Welcome</h1>", "<h1>Hello</h1>");
  const { context, files: site } = await withHome(first);
  // The second agent read the page before the first agent's change: its words are still there.
  const prepared = await prepareAgentEdit(edit({ path: "index.html", expectedHash: await textHash(read), edits: [{ oldText: ">Fast<", newText: ">Quick<" }] }), context, site);
  assert.ok("operation" in prepared);
  assert.equal(prepared.input.content, first.replace(">Fast<", ">Quick<"));
  assert.equal(prepared.input.expectedHash, await textHash(first));
});

test("the same words changed meanwhile are refused with the part as it is now, which a retry lands against", async () => {
  const now = read.replace("<h1>Welcome</h1>", "<h1>Hello there</h1>");
  const { context, files: site } = await withHome(now);
  const args = { path: "index.html", expectedHash: await textHash(read), edits: [{ oldText: "<h1>Welcome</h1>", newText: "<h1>Hi</h1>" }] };
  const clash = await prepareAgentEdit(edit(args), context, site, hash => hash === args.expectedHash ? read : undefined).then(() => assert.fail("must clash"), (error: unknown) => error);
  assert.ok(clash instanceof PartClash);
  assert.equal(clash.status, 409);
  assert.match(clash.message, /were changed meanwhile, by the user or another agent/);
  const part = clash.part!;
  assert.equal(part.path, "index.html");
  assert.equal(part.hash, await textHash(now));
  // Whole lines, between the lines around it that are still there: the heading line, as it is now.
  assert.equal(part.text, "    <h1>Hello there</h1>");
  assert.deepEqual(part.lines, { start: 12, end: 12 });
  // The agent retries against it at once, and lands.
  const again = await prepareAgentEdit(edit({ ...args, expectedHash: part.hash, edits: [{ oldText: "<h1>Hello there</h1>", newText: "<h1>Hi</h1>" }] }), context, site);
  assert.ok("operation" in again && again.input.content?.includes("<h1>Hi</h1>"));
  // Without the read the tab kept, the replaced words' own lines locate it when they are still there; else it is gone.
  const lines = await prepareAgentEdit(edit({ ...args, edits: [{ oldText: "<section class=\"hero\" data-key=\"hero\">\n    <h1>Welcome</h1>", newText: "x" }] }), context, site)
    .then(() => assert.fail("must clash"), (error: PartClash) => error);
  assert.match(lines.part!.text, /<section class="hero"/);
  const gone = await prepareAgentEdit(edit(args), context, site).then(() => assert.fail("must clash"), (error: PartClash) => error);
  assert.equal(gone.part, undefined);
  assert.match(gone.message, /are no longer there/);
  // Unchanged since its read, words that are not there are the agent's own mistake, as before.
  await assert.rejects(prepareAgentEdit(edit({ ...args, expectedHash: part.hash, edits: [{ oldText: "absent", newText: "x" }] }), context, site), /oldText was not found/);
});

test("a part is found between unchanged lines, else by the one stretch that changed, and kept short", () => {
  const before = "a\nb\nkeep\nold words\nmore\nz", after = "a\nB\nkeep\nnew words\nmore\nz";
  const at = before.indexOf("old words");
  assert.deepEqual(spanNow(before, at, at + 9, after), { start: after.indexOf("new words"), end: after.indexOf("new words") + 9 });
  // One line alone: nothing around it, so all of it.
  assert.deepEqual(spanNow("<p>one</p><p>two</p>", 10, 20, "<p>one</p><p>2</p>"), { start: 0, end: 18 });
  // Lines around it gone too: the one stretch that changed, with the words.
  assert.deepEqual(spanNow("x\n<p>one</p><p>two</p>\ny", 12, 22, "X\n<p>one</p><p>2</p>\nY"), { start: 0, end: 22 });
  // A line twice in the read (and once now) is no anchor: it could stand for either copy.
  const twiceRead = "x\n</s>\nold\n</s>\ny", onceNow = "x\nnew\n</s>\ny";
  const span = spanNow(twiceRead, twiceRead.indexOf("old"), twiceRead.indexOf("old") + 3, onceNow)!;
  assert.ok(span.start <= onceNow.indexOf("new") && span.end >= onceNow.indexOf("new") + 3, JSON.stringify(span));
  // Longer than PART_LIMIT: cut there and marked, its lines still the whole stretch's.
  const long = `head\n${Array.from({ length: 300 }, (_, i) => `line ${i} ${"x".repeat(20)}`).join("\n")}\ntail`;
  const cut = partOf("a.html", "h", long, 5, long.length - 5);
  assert.equal(cut.text.length, PART_LIMIT);
  assert.equal(cut.truncated, true);
  assert.deepEqual(cut.lines, { start: 2, end: 301 });
  assert.equal(partOf("a.html", "h", long, 0, 4).truncated, undefined);
});

test("without the read, a clash whose first replaced line is gone is found by its last line", async () => {
  const now = read.replace("<h1>Welcome</h1>", "<h1>Hello there</h1>");
  const { context, files: site } = await withHome(now);
  const clash = await prepareAgentEdit(edit({ path: "index.html", expectedHash: "0".repeat(64), edits: [{ oldText: "<h1>Welcome</h1>\n  </section>", newText: "x" }] }), context, site)
    .then(() => assert.fail("must clash"), (error: PartClash) => error);
  assert.equal(clash.part?.text, "  </section>");
  assert.deepEqual(clash.part?.lines, { start: 13, end: 13 });
});

test("a page command's elements are found again where other sections moved them, and refused with the part when they changed", async t => {
  installOutlineDocument(t);
  const page = (body: string) => `<!doctype html><html><head></head><body><main>${body}</main></body></html>`;
  const was = page("<section>A</section><section>B</section>");
  // A section added before them moves both; their HTML is unchanged, so their ids follow.
  assert.deepEqual(elementsNow("index.html", { section: "0.1", after: "0.0" }, was, page("<section>X</section><section>A</section><section>B</section>"), "h"), { section: "0.2", after: "0.1" });
  assert.deepEqual(elementsNow("index.html", { section: "0.1" }, was, page("<section>A</section><section>B</section><section>C</section>"), "h"), { section: "0.1" });
  // The section itself changed: refused with it as it is now.
  const changed = page("<section>A</section><section>B, edited</section>");
  assert.throws(() => elementsNow("index.html", { section: "0.1" }, was, changed, "h2"), (error: PartClash) =>
    error instanceof PartClash && /was changed meanwhile/.test(error.message) && error.part?.hash === "h2" && error.part.text.includes("B, edited"));
  // Gone: refused, with no part.
  assert.throws(() => elementsNow("index.html", { section: "0.1" }, was, page("<section>A</section>"), "h3"), (error: PartClash) => error instanceof PartClash && !error.part && /no longer there/.test(error.message));
  // An anchor (before/after) the command does not change: edited in place by another agent, it stays where it is;
  // gone, it is refused. The section moved must be unchanged itself.
  assert.deepEqual(elementsNow("index.html", { section: "0.0", after: "0.1" }, was, page("<section>A</section><section>B, edited</section>"), "h"), { section: "0.0", after: "0.1" });
  assert.throws(() => elementsNow("index.html", { section: "0.0", after: "0.1" }, was, page("<section>A</section><div>B</div>"), "h"), (error: PartClash) => error instanceof PartClash && /0\.1 .* no longer there/.test(error.message));
  // make_component's element can be any container: a <div> moved by a section added before it is found too.
  const withDiv = page("<section>A</section><div class=\"note\"><p>Note</p></div>");
  assert.deepEqual(elementsNow("index.html", { element: "0.1" }, withDiv, page("<section>X</section><section>A</section><div class=\"note\"><p>Note</p></div>"), "h"), { element: "0.2" });
  // Changed, and another kind of element at its old place: no part, which would be that other element.
  assert.throws(() => elementsNow("index.html", { element: "0.1" }, withDiv, page("<section>A</section><section>B</section><div>Note, edited</div>"), "h4"),
    (error: PartClash) => error instanceof PartClash && !error.part && /no longer there/.test(error.message));
});

test("a catch-up lists what changed since the last call, the agent's own changes left out, within its size cap", () => {
  const before: AgentMark = { commit: "c1", files: {
    "index.html": { hash: "h1", at: 1 }, "about/index.html": { hash: "a1", at: 1 }, "gone.html": { hash: "g", at: 1 }, "mine.html": { hash: "m1", at: 1 }, "same.css": { hash: "s", at: 1 } } };
  const now: AgentMark = { commit: "c1", files: {
    "index.html": { hash: "h2", at: 2 }, "about/index.html": { hash: "a1", at: 1, deleted: true }, "new/index.html": { hash: "n", at: 2, added: true },
    "mine.html": { hash: "m2", at: 2 }, "same.css": { hash: "s", at: 3 } } };
  const told = catchUpOf(before, now, new Set(["mine.html"]), path => path === "index.html" ? ["1.0", "1.1"] : undefined);
  assert.deepEqual(told, { files: [
    { path: "index.html", change: "changed", hash: "h2", sections: ["1.0", "1.1"] },
    { path: "about/index.html", change: "removed" },
    { path: "gone.html", change: "discarded" },
    { path: "new/index.html", change: "added", hash: "n" },
  ], note: told!.note });
  assert.match(told!.note, /since your last call/);
  // Nothing changed: no catch-up. A save moves the revision: the drafts it took are saved.
  assert.equal(catchUpOf(now, now), undefined);
  assert.deepEqual(catchUpOf({ commit: "c1", files: { "a.html": { hash: "x", at: 1 } } }, { commit: "c2", files: {} }), { files: [{ path: "a.html", change: "saved" }], saved: "c2", note: told!.note });
  // Many changes: at most CATCH_UP_FILES, within CATCH_UP_BYTES, the rest counted.
  const many: AgentMark = { commit: "c1", files: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`pages/${"long-name-".repeat(3)}${i}/index.html`, { hash: "f".repeat(64), at: 2, added: true as const }])) };
  const capped = catchUpOf({ commit: "c1", files: {} }, many)!;
  assert.ok(capped.files.length <= CATCH_UP_FILES && capped.files.length > 0);
  assert.equal(capped.files.length + capped.more!, 60);
  assert.ok(new TextEncoder().encode(JSON.stringify(capped)).byteLength <= CATCH_UP_BYTES);
});

test("every reply to an agent carries what changed since its last call in the workspace shown, its own edit left out", async t => {
  installOutlineDocument(t);
  const context: EditorContext = await siteContext(), texts = new Map<string, string>();
  const shared = () => ({ context: structuredClone(context), texts });
  const workspace = { repoId: repo.id, branch: "main" };
  const reply = { ok: true as const, value: { state: "applied" } };
  // Its first call: nothing to tell yet.
  assert.deepEqual(tellAgent(shared(), workspace, "agent-a", reply), reply);
  assert.deepEqual(tellAgent(shared(), workspace, "agent-b", reply), reply);
  // Agent B's edit of the home page lands: B is not told its own change; A is.
  const home = files["index.html"].replace("Fast", "Quick"), hash = await textHash(home);
  rememberText(await textHash(files["index.html"]), files["index.html"]);
  context.drafts.push({ path: "index.html", baseSha: "1".repeat(40), updatedAt: 3, hash });
  texts.set(hash, home);
  const edited = { ok: true as const, value: { state: "applied", result: { hash } } };
  noteOwnChange(workspace, "agent-b", new Map([["index.html", hash]]));
  assert.deepEqual(tellAgent(shared(), workspace, "agent-b", edited), edited);
  const told = tellAgent(shared(), workspace, "agent-a", reply);
  assert.ok(told.ok);
  assert.partialDeepStrictEqual(told.value, { state: "applied", changesSinceLastRead: { files: [{ path: "index.html", change: "changed", hash }] } });
  // Told once: the next call has nothing new. Another workspace shown tells nothing.
  assert.deepEqual(tellAgent(shared(), workspace, "agent-a", reply), reply);
  assert.deepEqual(tellAgent(shared(), { ...workspace, branch: "feature" }, "agent-a", reply), reply);
});

test("the tab keeps the texts agents read, by hash, within its limits", async () => {
  rememberRead({ path: "a.txt", hash: "ha", content: "A" });
  rememberRead({ hash: "hp", html: "<p>page</p>" });
  rememberRead({ files: [{ path: "b.txt", hash: "hb", content: "B" }] });
  assert.deepEqual([readText("ha"), readText("hp"), readText("hb"), readText("none")], ["A", "<p>page</p>", "B", undefined]);
  for (let i = 0; i < 250; i++) rememberText(`h${i}`, String(i));
  assert.equal(readText("ha"), undefined, "the oldest go first");
  assert.equal(readText("h249"), "249");
});

test("a reply that is no answer keeps the agent's mark: its next reply still tells what changed", async () => {
  const context: EditorContext = await siteContext(), texts = new Map<string, string>();
  const shared = () => ({ context: structuredClone(context), texts });
  const workspace = { repoId: repo.id, branch: "main" }, reply = { ok: true as const, value: { state: "applied" } };
  tellAgent(shared(), workspace, "agent-refused", reply);
  context.drafts.push({ path: "index.html", baseSha: "1".repeat(40), updatedAt: 4, hash: "h-other" });
  const refused = { ok: false as const, message: "This change's id is already running with different work or authorization." };
  assert.deepEqual(tellAgent(shared(), workspace, "agent-refused", refused), refused);
  const told = tellAgent(shared(), workspace, "agent-refused", reply);
  assert.ok(told.ok);
  assert.partialDeepStrictEqual(told.value, { changesSinceLastRead: { files: [{ path: "index.html", change: "changed", hash: "h-other" }] } });
});

test("an agent's own change is not told back on whichever reply comes next; changed again since, or landed on another text than it read, it is", async () => {
  const context: EditorContext = await siteContext(), texts = new Map<string, string>();
  const shared = () => ({ context: structuredClone(context), texts });
  const workspace = { repoId: repo.id, branch: "main" }, reply = { ok: true as const, value: { state: "applied" } };
  const draft = (hash: string) => {
    context.drafts = context.drafts.filter(item => item.path !== "index.html");
    context.drafts.push({ path: "index.html", baseSha: "1".repeat(40), updatedAt: Date.now(), hash });
  };
  tellAgent(shared(), workspace, "agent-own", reply);
  // A waited edit landed after its "waiting" reply: the status lookup that says applied leaves it out.
  draft("h-mine");
  noteOwnChange(workspace, "agent-own", new Map([["index.html", "h-mine"]]));
  const status = { ok: true as const, value: { requestId: "waited", state: "applied", result: { path: "index.html" } } };
  assert.deepEqual(tellAgent(shared(), workspace, "agent-own", status), status);
  // Its change, then the user's on top before its next call: told.
  noteOwnChange(workspace, "agent-own", new Map([["index.html", "h-mine-2"]]));
  draft("h-user");
  assert.ok(JSON.stringify(tellAgent(shared(), workspace, "agent-own", reply)).includes("h-user"));
  // Landed on another text than it read (src/agent-tools-edit.ts ownFiles leaves its file out): told.
  draft("h-merged");
  noteOwnChange(workspace, "agent-own", new Map());
  const told = tellAgent(shared(), workspace, "agent-own", reply);
  assert.ok(told.ok);
  assert.partialDeepStrictEqual(told.value, { changesSinceLastRead: { files: [{ path: "index.html", change: "changed", hash: "h-merged" }] } });
});

test("an edit read in another text clashes when its words are no longer where that read had them, `all` included", async () => {
  const twice = read.replace("<h1>Welcome</h1>", "<h1>Welcome</h1>\n    <p>Welcome</p>");
  const args = { path: "index.html", expectedHash: await textHash(read), edits: [{ oldText: "Welcome", newText: "Hi", all: true }] };
  // Another added one more copy since the read: the copy it never read is not replaced.
  const { context, files: site } = await withHome(twice);
  const clash = await prepareAgentEdit(edit(args), context, site, hash => hash === args.expectedHash ? read : undefined).then(() => assert.fail("must clash"), (error: unknown) => error);
  assert.ok(clash instanceof PartClash);
  // Changed in place and written again elsewhere: as many, but not where it read them.
  const elsewhere = read.replace("<h1>Welcome</h1>", "<h1>Hello</h1>").replace(">Fast<", ">Welcome<");
  assert.deepEqual(wordsMoved(read, elsewhere, [{ oldText: "Welcome", newText: "Hi" }]), { index: 0, at: read.indexOf("Welcome") });
  // Still where it read them, beside other changes: none moved, and it lands.
  const beside = read.replace(">Fast<", ">Quick<");
  assert.equal(wordsMoved(read, beside, [{ oldText: "Welcome", newText: "Hi" }]), undefined);
  const ok = await withHome(beside);
  const prepared = await prepareAgentEdit(edit(args), ok.context, ok.files, hash => hash === args.expectedHash ? read : undefined);
  assert.ok("operation" in prepared && prepared.input.content === beside.replace("Welcome", "Hi"));
  // Words the read never had: a copy added since clashes; made by an earlier replacement, or nowhere, they pass.
  const added = read.replace(">Fast<", ">Fresh words<");
  assert.deepEqual(wordsMoved(read, added, [{ oldText: "Fresh words", newText: "x" }]), { index: 0, at: -1 });
  const alsoAdded = read.replace("<h1>Welcome</h1>", "<h1>Welcome</h1><p>Fresh words</p>");
  assert.equal(wordsMoved(read, alsoAdded, [{ oldText: ">Fast<", newText: ">Fresh words<" }, { oldText: "Fresh words", newText: "x" }]), undefined);
  assert.equal(wordsMoved(read, beside, [{ oldText: "Nowhere", newText: "x" }]), undefined);
  const fresh = await withHome(added);
  const stale = await prepareAgentEdit(edit({ ...args, edits: [{ oldText: "Fresh words", newText: "x" }] }), fresh.context, fresh.files, hash => hash === args.expectedHash ? read : undefined)
    .then(() => assert.fail("must clash"), (error: unknown) => error);
  assert.ok(stale instanceof PartClash && stale.part?.text.includes("Fresh words"));
});

test("a revision change and a discarded draft at once: every draft gone is told as saved", () => {
  const before: AgentMark = { commit: "c1", files: { "kept.html": { hash: "k", at: 1 }, "dropped.html": { hash: "d", at: 1 } } };
  const told = catchUpOf(before, { commit: "c2", files: {} })!;
  assert.deepEqual(told.files, [{ path: "kept.html", change: "saved" }, { path: "dropped.html", change: "saved" }]);
  assert.equal(told.saved, "c2");
});

test("with all and no kept read, a stale edit is refused; a typo read in the kept text is the agent's own mistake; a clash shows the copy that moved", async () => {
  const twice = read.replace("<h1>Welcome</h1>", "<h1>Welcome</h1>\n    <p>Welcome</p>");
  const { context, files: site } = await withHome(twice);
  const stale = await textHash(read);
  // The tab reloaded or let the read go: it cannot tell the copies it read.
  const forgotten = await prepareAgentEdit(edit({ path: "index.html", expectedHash: stale, edits: [{ oldText: "Welcome", newText: "Hi", all: true }] }), context, site, () => undefined)
    .then(() => assert.fail("must refuse"), (error: unknown) => error);
  assert.ok(forgotten instanceof PartClash && /no longer keeps that read/.test(forgotten.message));
  // Words it never read: refused plainly, not blamed on anyone else.
  await assert.rejects(prepareAgentEdit(edit({ path: "index.html", expectedHash: stale, edits: [{ oldText: "Welcom e", newText: "Hi" }] }), context, site, () => read), /oldText was not found/);
  // The second of two copies moved: the part is where that one is now, not the first.
  const two = "a\n<p>Welcome one</p>\nb\n<p>Welcome two</p>\nc", moved = "a\n<p>Welcome one</p>\nb\n<p>changed</p>\nc\n<p>Welcome two</p>";
  const at = await withHome(moved);
  const clash = await prepareAgentEdit(edit({ path: "index.html", expectedHash: await textHash(two), edits: [{ oldText: "Welcome", newText: "Hi", all: true }] }), at.context, at.files, () => two)
    .then(() => assert.fail("must clash"), (error: PartClash) => error);
  assert.equal(clash.part?.text, "<p>changed</p>");
});

test("after a reload the tab keeps no reads or marks: no catch-up on the first reply, and an edit read before follows the no-read path", async () => {
  const fresh = await import(`../src/agent-part.ts?reload=${Date.now()}`) as typeof import("../src/agent-part");
  rememberText("before-reload", "text");
  assert.equal(fresh.readText("before-reload"), undefined);
  const context: EditorContext = await siteContext(), shared = { context, texts: new Map<string, string>() };
  const workspace = { repoId: repo.id, branch: "main" }, reply = { ok: true as const, value: { state: "applied" } };
  tellAgent(shared, workspace, "agent-reload", reply);
  context.drafts.push({ path: "index.html", baseSha: "1".repeat(40), updatedAt: 9, hash: "h-new" });
  // The reloaded tab's first reply to that agent tells nothing; its next one does.
  assert.deepEqual(fresh.tellAgent({ context: structuredClone(context), texts: new Map() }, workspace, "agent-reload", reply), reply);
  context.drafts.push({ path: "about.css", baseSha: null, updatedAt: 10, hash: "h-css" });
  assert.ok(JSON.stringify(fresh.tellAgent({ context: structuredClone(context), texts: new Map() }, workspace, "agent-reload", reply)).includes("about.css"));
  // An edit read before the reload: its words still there land (no `all`).
  const now = read.replace(">Fast<", ">Quick<"), home = await withHome(now);
  const prepared = await prepareAgentEdit(edit({ path: "index.html", expectedHash: await textHash(read), edits: [{ oldText: "Welcome", newText: "Hi" }] }), home.context, home.files, fresh.readText);
  assert.ok("operation" in prepared && prepared.input.content === now.replace("Welcome", "Hi"));
});

// Ticket 40: the second look at ticket 10.

test("a copy added elsewhere since the read is refused with no part, so a retry with all never takes that copy", async () => {
  // Read with "Welcome" once; another agent wrote it again in the feature's title since.
  const { context, files: site } = await withHome(read.replace(">Fast<", ">Welcome<"));
  const expectedHash = await textHash(read);
  for (const all of [false, true]) {
    const clash = await prepareAgentEdit(edit({ path: "index.html", expectedHash, edits: [{ oldText: "Welcome", newText: "Hi", all }] }), context, site, hash => hash === expectedHash ? read : undefined)
      .then(() => assert.fail("must clash"), (error: unknown) => error);
    assert.ok(clash instanceof PartClash);
    // Not the heading, unchanged, offered as it is now: the agent reads again and sees both copies.
    assert.equal(clash.part, undefined, String(all));
    assert.match(clash.message, /a different number of times .* Read the file again\.$/);
  }
});

test("a copy removed since the read is refused with no part too: the first copy read may be the one left unchanged", async () => {
  const twice = read.replace("<h1>Welcome</h1>", "<h1>Welcome</h1>\n    <p>Welcome</p>");
  const { context, files: site } = await withHome(read);
  const expectedHash = await textHash(twice);
  const clash = await prepareAgentEdit(edit({ path: "index.html", expectedHash, edits: [{ oldText: "Welcome", newText: "Hi", all: true }] }), context, site, hash => hash === expectedHash ? twice : undefined)
    .then(() => assert.fail("must clash"), (error: unknown) => error);
  assert.ok(clash instanceof PartClash);
  assert.equal(clash.part, undefined);
  assert.match(clash.message, /a different number of times .* Read the file again\.$/);
});

test("a changed part longer than PART_LIMIT is refused with read again, never a retry from its cut text", async () => {
  const block = Array.from({ length: 200 }, (_, i) => `    <p>Line ${i} ${"x".repeat(20)}</p>`).join("\n");
  const long = read.replace("    <h1>Welcome</h1>", `    <h1>Welcome</h1>\n${block}`), now = long.replace("Line 100 ", "Line one hundred ");
  assert.ok(block.length > PART_LIMIT);
  const { context, files: site } = await withHome(now);
  const expectedHash = await textHash(long);
  const clash = await prepareAgentEdit(edit({ path: "index.html", expectedHash, edits: [{ oldText: block, newText: "x" }] }), context, site, hash => hash === expectedHash ? long : undefined)
    .then(() => assert.fail("must clash"), (error: unknown) => error);
  assert.ok(clash instanceof PartClash);
  assert.equal(clash.part?.truncated, true);
  assert.match(clash.message, /read the file again/);
  assert.doesNotMatch(clash.message, /oldText from part\.text/);
});

test("a catch-up works out sections only for the files it can show", () => {
  const marked = (hash: string) => Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`pages/${i}/index.html`, { hash: `${hash}${i}`, at: 1 }]));
  let calls = 0;
  const told = catchUpOf({ commit: "c1", files: marked("a") }, { commit: "c1", files: marked("b") }, new Set(), () => { calls++; return ["1.0"]; })!;
  assert.ok(calls <= CATCH_UP_FILES && calls >= told.files.length, String(calls));
  assert.equal(told.files.length + told.more!, 60);
  assert.ok(told.files.every(file => file.sections?.[0] === "1.0"));
  assert.ok(textBytes(JSON.stringify(told)) <= CATCH_UP_BYTES);
});

test("a catch-up cut to its files without sections is cut again once their sections are added", () => {
  const marked = (hash: string) => Object.fromEntries(Array.from({ length: CATCH_UP_FILES }, (_, i) => [`pages/${"p".repeat(30)}${String(i).padStart(2, "0")}/index.html`, { hash: `${hash}${i}`, at: 1 }]));
  const before: AgentMark = { commit: "c1", files: marked("a") }, now: AgentMark = { commit: "c1", files: marked("b") };
  // Without sections, every file fits, with little room left.
  const bare = catchUpOf(before, now)!;
  assert.equal(bare.files.length, CATCH_UP_FILES);
  assert.ok(textBytes(JSON.stringify(bare)) > CATCH_UP_BYTES - 200, String(textBytes(JSON.stringify(bare))));
  const told = catchUpOf(before, now, new Set(), () => Array.from({ length: 10 }, (_, i) => `${i}.${"9".repeat(8)}`))!;
  assert.ok(told.files.length < bare.files.length && told.files.length > 0, String(told.files.length));
  assert.equal(told.files.length + told.more!, CATCH_UP_FILES);
  assert.ok(told.files.every(file => file.sections?.length === 10));
  assert.ok(textBytes(JSON.stringify(told)) <= CATCH_UP_BYTES);
});

test("a draft named __proto__ is told in the catch-up like any other file", async () => {
  const context: EditorContext = await siteContext(), shared = () => ({ context: structuredClone(context), texts: new Map<string, string>() });
  const workspace = { repoId: repo.id, branch: "main" }, reply = { ok: true as const, value: { state: "applied" } };
  tellAgent(shared(), workspace, "agent-proto", reply);
  context.drafts.push({ path: "__proto__", baseSha: null, updatedAt: 5, hash: "h-proto" });
  const told = tellAgent(shared(), workspace, "agent-proto", reply);
  assert.ok(told.ok);
  assert.partialDeepStrictEqual(told.value, { changesSinceLastRead: { files: [{ path: "__proto__", change: "added", hash: "h-proto" }] } });
});

test("a read reply just under the relay's limit still fits with a full catch-up: the read tool's margin holds it", async () => {
  const context: EditorContext = await siteContext(), shared = () => ({ context: structuredClone(context), texts: new Map<string, string>() });
  const workspace = { repoId: repo.id, branch: "main" };
  tellAgent(shared(), workspace, "agent-big", { ok: true, value: {} });
  for (let i = 0; i < CATCH_UP_FILES * 2; i++)
    context.drafts.push({ path: `pages/${"a-long-page-name-".repeat(5)}${i}/index.html`, baseSha: null, updatedAt: 6, hash: "f".repeat(64) });
  // src/agent-tools-read.ts refuses a reply past the relay's limit less 4096 bytes: one exactly at it.
  const limit = AgentRelay.maxBytes - 4096, base = { ok: true as const, value: { path: "big.txt", hash: "h", content: "" } };
  const big = { ok: true as const, value: { ...base.value, content: "x".repeat(limit - textBytes(JSON.stringify(base))) } };
  assert.equal(textBytes(JSON.stringify(big)), limit);
  const told = tellAgent(shared(), workspace, "agent-big", big);
  assert.ok(told.ok && told.value && typeof told.value === "object" && !Array.isArray(told.value));
  const catchUp: AgentCatchUp = JSON.parse(JSON.stringify(told.value.changesSinceLastRead));
  assert.equal(catchUp.files.length + catchUp.more!, CATCH_UP_FILES * 2);
  assert.ok(textBytes(JSON.stringify(catchUp)) > CATCH_UP_BYTES - 256, "a full catch-up");
  // The transport's envelope at its largest (src/agent-transport.ts readCommand; worker/agent-relay.ts readScope's bounds).
  const message = JSON.stringify({ type: "result", id: "i".repeat(128), workspace: { account: "a".repeat(39), repoId: Number.MAX_SAFE_INTEGER, branch: "語".repeat(255) },
    tabId: "t".repeat(128), generation: Number.MAX_SAFE_INTEGER, result: told });
  assert.ok(textBytes(message) <= AgentRelay.maxBytes, String(textBytes(message) - AgentRelay.maxBytes));
});
