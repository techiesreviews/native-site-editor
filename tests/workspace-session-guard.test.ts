// Whether work still holds is the workspace session's question (src/workspace-session.ts):
// outside it, nothing compares a load counter, a scope key or two workspaces' fields by
// hand. Each exception below names its file, function, reason and count.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ts, parse, walk, strip, member, finding, sourceFiles, readSource, staleEntries, matches, type TS, type Finding, type AllowlistEntry, type Detector } from "./support/source-guard.ts";

type Rule = "load-compare" | "scope-compare" | "same-workspace";
const SESSION = "src/workspace-session.ts";
const EQUALITY = [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken];

// What an operand reads: an identifier, a member, or the callee of a call.
function operand(node: TS.Node): { name: string; call: boolean; member: boolean; receiver?: TS.Expression } | undefined {
  node = strip(node);
  if (ts.isCallExpression(node)) {
    // `a.account.toLowerCase()` reads `account`.
    const callee = member(strip(node.expression));
    if (callee && ["toLowerCase", "toUpperCase"].includes(callee.name)) return operand(callee.receiver);
    const read = operand(node.expression);
    return read && { ...read, call: true };
  }
  if (ts.isIdentifier(node)) return { name: node.text, call: false, member: false };
  const access = member(node);
  return access && { name: access.name, call: false, member: true, receiver: access.receiver };
}
// The session's load counter by any of its spellings: `generation`, `currentLoad`, a stamp's
// `load`, or a port read of it (`ports.epoch()`).
const loadRead = (read: ReturnType<typeof operand>) =>
  !!read && (/generation/i.test(read.name) || read.name === "currentLoad" || read.name === "load" && (read.member || read.call) || read.name === "epoch" && read.call);
// A scope or its keys spelled by hand: the old scope helpers, an agent workspace's key, or a port's `scope()` / `identity()`.
const SCOPE_NAMES = new Set(["setupScope", "draftScope", "mediaIdentity", "scopeKey", "setupKeyOf", "workspaceKey"]);
const scopeRead = (read: ReturnType<typeof operand>) => !!read && (SCOPE_NAMES.has(read.name) || read.call && read.member && ["scope", "identity"].includes(read.name));
// Two workspaces' own fields compared field by field (the session's `same` and `sameBranch` own that):
// the same field on both sides; a repository's id or name under its other spellings (`id` against
// `repoId`, `repo` against `fullName`); two ids outside a lookup (sameId below).
const WORKSPACE_FIELDS = new Set(["repoId", "branch", "account", "full_name", "fullName", "repo"]);
const REPOSITORY_NAMES = new Set(["repo", "fullName", "full_name"]);
function sameWorkspace(left: ReturnType<typeof operand>, right: ReturnType<typeof operand>) {
  if (!left || !right || left.call || right.call) return false;
  if (left.member && right.member && left.name === right.name) return WORKSPACE_FIELDS.has(left.name);
  if (left.member && right.member && REPOSITORY_NAMES.has(left.name) && REPOSITORY_NAMES.has(right.name)) return true;
  // A local copy of a field against a workspace's own: always for `repoId` and `account`; for `branch`
  // when the member reads a workspace, scope, link, guess or receipt (a local `branch` against a
  // snapshot's is the open branch read twice, not two workspaces).
  if (left.member !== right.member && left.name === right.name) {
    const field = left.member ? left : right;
    if (["repoId", "account"].includes(field.name)) return true;
    if (field.name === "branch") return /workspace|scope|link|guess|receipt/i.test(field.receiver?.getText() ?? "");
  }
  const ids = [left, right].map(read => read.name);
  return ids.includes("id") && ids.includes("repoId") && (left.name === "id" ? left : right).member;
}

// A list looked up by id (`list.find(item => item.id === id)`): the compare sits in a find, filter,
// some, every or findIndex callback and one operand reads that callback's parameter.
const LOOKUPS = new Set(["find", "findIndex", "findLast", "filter", "some", "every"]);
function lookup(node: TS.Node, reads: ReturnType<typeof operand>[]) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (!ts.isArrowFunction(parent) && !ts.isFunctionExpression(parent)) continue;
    const call = parent.parent;
    if (!ts.isCallExpression(call) || !LOOKUPS.has(member(strip(call.expression))?.name ?? "")) return false;
    const parameters = new Set(parent.parameters.map(parameter => parameter.name.getText()));
    return reads.some(read => { const receiver = read?.receiver && strip(read.receiver); return !!receiver && ts.isIdentifier(receiver) && parameters.has(receiver.text); });
  }
  return false;
}
// Two repositories' ids compared (a receiver names a repository or the pinned one), outside a lookup.
const sameId = (node: TS.Node, left: ReturnType<typeof operand>, right: ReturnType<typeof operand>) =>
  !!left?.member && !!right?.member && !left.call && !right.call && left.name === "id" && right.name === "id" &&
  [left, right].some(read => /repo|pinned/i.test(read.receiver?.getText() ?? "")) && !lookup(node, [left, right]);

const detect: Detector = (source, file) => {
  if (file === SESSION) return [];
  const tree = parse(source, file), hits: Finding[] = [];
  walk(tree, node => {
    if (!ts.isBinaryExpression(node) || !EQUALITY.includes(node.operatorToken.kind)) return;
    const left = operand(node.left), right = operand(node.right);
    const rule: Rule | undefined = loadRead(left) || loadRead(right) ? "load-compare"
      : scopeRead(left) || scopeRead(right) ? "scope-compare" : sameWorkspace(left, right) || sameId(node, left, right) ? "same-workspace" : undefined;
    if (rule) hits.push(finding(tree, node, rule));
  });
  return hits;
};

// Exact counts keep a new compare in the same function from inheriting an exception.
const OWN = "Not the workspace load:";
const FENCE = `${OWN} the receiving tab's ownership fence, kept as \`generation\` in IndexedDB, localStorage hints and the relay (worker/agent-relay.ts); renaming the stored name needs a data migration.`;
const FILE_SELECTION = `${OWN} \`fileGeneration\` counts file selections within one load.`;
const FRAME = `${OWN} the preview frame's own load count, carried on its messages.`;
const GUARDED = "The guarded edit's own stamp and commit re-prove the load and scope through EditorWorkspace, which reads the session (src/editor-workspace.ts).";
const FOLLOW_UP = "Follow-up (outside slice 22's files):";
const MEDIA = `${FOLLOW_UP} media caches are keyed by \`mediaIdentity\` (load and setup key); they should hold a stamp.`;
const allowlist: AllowlistEntry[] = [
  { file: "src/agent-owner.ts", match: { rule: "load-compare", function: "takeover" }, reason: FENCE },
  { file: "src/agent-records.ts", match: { rule: "load-compare", function: "attempt" }, reason: FENCE, count: 2 },
  { file: "src/agent-records.ts", match: { rule: "load-compare", function: "settle" }, reason: FENCE },
  { file: "src/agent-records.ts", match: { rule: "load-compare", function: "reconcile" }, reason: FENCE },
  { file: "src/agent-records.ts", match: { rule: "load-compare", function: "finish" }, reason: FENCE },
  { file: "src/agent-records.ts", match: { rule: "load-compare", function: "setFence" }, reason: FENCE, count: 2 },
  { file: "src/agent-records.ts", match: { rule: "load-compare", function: "pause" }, reason: FENCE },
  { file: "src/agent-records.ts", match: { rule: "load-compare", function: "putConversation" }, reason: FENCE },
  { file: "src/agent-site.ts", match: { rule: "load-compare", function: "check" }, reason: FENCE },
  { file: "src/agent-transport.ts", match: { rule: "load-compare", function: "clear" }, reason: FENCE },
  { file: "src/agent-transport.ts", match: { rule: "load-compare", function: "held" }, reason: FENCE },
  { file: "src/agent-transport.ts", match: { rule: "load-compare", function: "matches" }, reason: FENCE },
  { file: "src/agent-transport.ts", match: { rule: "load-compare", function: "prove" }, reason: FENCE },
  // Agent records are stored under the workspace's key string (IndexedDB): a record belongs to the key it was written under.
  { file: "src/agent-records.ts", match: { rule: "scope-compare", function: "attempt" }, reason: "A stored draft record belongs to the workspace key IndexedDB keeps it under." },
  { file: "src/agent-records.ts", match: { rule: "scope-compare", function: "settle" }, reason: "A stored receipt belongs to the workspace key IndexedDB keeps it under." },
  { file: "src/agent-records.ts", match: { rule: "scope-compare", function: "reconcile" }, reason: "A command's workspace against the store's key for this transaction (IndexedDB)." },
  // Repository lists looked up by a remembered id: a lookup, not two workspaces compared.
  { file: "src/controllers/boot-controller.ts", match: { rule: "same-workspace", function: "planRepositoryOpen" }, reason: "Looks the linked or remembered repository up in the listing by its id.", count: 2 },
  { file: "src/boot-memory.ts", match: { rule: "same-workspace", function: "memoryMatches" }, reason: `${FOLLOW_UP} boot memory also requires the remembered repository name (slice 21 kept that rule beside \`same\`).` },
  { file: "src/agent-recovery.ts", match: { rule: "load-compare", function: "current" }, reason: `${OWN} the agent recovery's own reconnect counter.` },
  { file: "src/agent-recovery.ts", match: { rule: "load-compare", function: "attemptAlone" }, reason: `${OWN} the agent recovery's own reconnect counter.`, count: 2 },
  { file: "src/main.ts", match: { rule: "load-compare", function: "showDirectory" }, reason: FILE_SELECTION },
  { file: "src/controllers/source-pane-controller.ts", match: { rule: "load-compare", function: "openEntry" }, reason: FILE_SELECTION, count: 3 },
  { file: "src/controllers/source-pane-controller.ts", match: { rule: "load-compare", function: "mountSource" }, reason: FILE_SELECTION, count: 2 },
  { file: "src/workspace-boot.ts", match: { rule: "load-compare", function: "restoreFile" }, reason: FILE_SELECTION, count: 4 },
  { file: "src/workspace-boot.ts", match: { rule: "load-compare", function: "loadSnapshot" }, reason: FILE_SELECTION },
  { file: "src/components/preview-link.ts", match: { rule: "load-compare", function: "receive" }, reason: FRAME, count: 2 },
  { file: "src/components/preview-protocol.ts", match: { rule: "load-compare", function: "readFrameMessage" }, reason: FRAME },
  { file: "src/guarded-edit.ts", match: { rule: "load-compare", function: "changed" }, reason: GUARDED },
  { file: "src/guarded-edit.ts", match: { rule: "scope-compare", function: "changed" }, reason: GUARDED },
  { file: "src/guarded-edit/commit.ts", match: { rule: "load-compare", function: "stale" }, reason: GUARDED },
  { file: "src/guarded-edit/commit.ts", match: { rule: "scope-compare", function: "stale" }, reason: GUARDED },
  { file: "src/guarded-edit/commit.ts", match: { rule: "load-compare", function: "live" }, reason: GUARDED },
  { file: "src/guarded-edit/commit.ts", match: { rule: "scope-compare", function: "live" }, reason: GUARDED },
  { file: "src/main.ts", match: { rule: "load-compare", function: "stampOf" }, reason: `${FOLLOW_UP} the bridge from a load number to a stamp, while preview selection, the files tree, settings, page structure and media proofs still hold load numbers.` },
  { file: "src/controllers/files-tree-controller.ts", match: { rule: "load-compare", function: "renderEntries" }, reason: `${FOLLOW_UP} the files tree compares its load number (\`ports.epoch()\`); it should hold a stamp.`, count: 5 },
  { file: "src/controllers/preview-selection-controller.ts", match: { rule: "load-compare", function: "editableTemplatePath" }, reason: `${FOLLOW_UP} preview selection intents compare their load number and setup key; they should hold a stamp.` },
  { file: "src/controllers/preview-selection-controller.ts", match: { rule: "scope-compare", function: "editableTemplatePath" }, reason: `${FOLLOW_UP} preview selection intents compare their load number and setup key; they should hold a stamp.` },
  { file: "src/controllers/preview-selection-controller.ts", match: { rule: "load-compare", function: "select" }, reason: `${FOLLOW_UP} preview selection intents compare their load number and setup key; they should hold a stamp.`, count: 2 },
  { file: "src/controllers/preview-selection-controller.ts", match: { rule: "scope-compare", function: "select" }, reason: `${FOLLOW_UP} preview selection intents compare their load number and setup key; they should hold a stamp.` },
  { file: "src/controllers/preview-selection-controller.ts", match: { rule: "load-compare", function: "replayPending" }, reason: `${FOLLOW_UP} preview selection intents compare their load number and setup key; they should hold a stamp.` },
  { file: "src/controllers/setup-checklist-controller.ts", match: { rule: "scope-compare", function: "saveName" }, reason: `${FOLLOW_UP} the setup checklist compares its setup key by hand; it should hold a stamp.` },
  { file: "src/controllers/setup-checklist-controller.ts", match: { rule: "scope-compare", function: "refreshSetup" }, reason: `${FOLLOW_UP} the setup checklist compares its setup key by hand; it should hold a stamp.`, count: 2 },
  { file: "src/controllers/media-actions.ts", match: { rule: "scope-compare", function: "warmDescriptions" }, reason: MEDIA, count: 2 },
  { file: "src/controllers/media-actions.ts", match: { rule: "scope-compare", function: "placeState" }, reason: MEDIA },
  { file: "src/controllers/media-actions.ts", match: { rule: "scope-compare", function: "records" }, reason: MEDIA },
  { file: "src/controllers/media-actions.ts", match: { rule: "scope-compare", function: "ensureGallery" }, reason: MEDIA },
  { file: "src/controllers/media-actions.ts", match: { rule: "scope-compare", function: "holds" }, reason: MEDIA },
  { file: "src/controllers/media-actions.ts", match: { rule: "scope-compare", function: "requestGalleryRefresh" }, reason: MEDIA },
  { file: "src/controllers/media-actions.ts", match: { rule: "scope-compare", function: "flushGalleryRefresh" }, reason: MEDIA },
  { file: "src/drafts.ts", match: { rule: "same-workspace", function: "list" }, reason: `${FOLLOW_UP} the draft store lists a scope's drafts field by field; it should ask \`holdsDraftScope\`.`, count: 3 },
  { file: "src/components/publish-menu.ts", match: { rule: "same-workspace", function: "createPublishMenu" }, reason: `${FOLLOW_UP} the publish status compares its repository by name; it should ask \`sameBranch\`.` },
  { file: "src/main.ts", match: { rule: "same-workspace", function: "applyAgentCommand" }, reason: `${FOLLOW_UP} an agent command's branch against the open one; it should ask \`sameBranch\`.` },
  { file: "src/main.ts", match: { rule: "same-workspace", function: "openNewDraft" }, reason: `${FOLLOW_UP} a draft's repository and branch against the open one; it should ask \`holdsDraftScope\`.`, count: 2 },
  { file: "src/workspace-boot.ts", match: { rule: "same-workspace", function: "takeBootGuess" }, reason: `${FOLLOW_UP} the link's repository and branch, and the guessed snapshot's branch, against the one opening; it should ask \`same\`.`, count: 3 },
  { file: "src/setup-actions.ts", match: { rule: "same-workspace", function: "createSite" }, reason: "Not two workspaces: whether choosing the created repository opened it, by its id (the session's repository rule; no branch is chosen yet)." },
  { file: "src/setup-host.ts", match: { rule: "same-workspace", function: "offerFinishStarter" }, reason: `${FOLLOW_UP} the finish banner's repository against the open one beside its stamp; the stamp alone should decide.` },
  { file: "src/boot-memory.ts", match: { rule: "same-workspace", function: "readBootMemory" }, reason: `${FOLLOW_UP} reads the remembered workspace back by its repository id; it should ask \`same\`.` },
  { file: "shared/agent-read.ts", match: { rule: "same-workspace", function: "openRequests" }, reason: `${FOLLOW_UP} shared with the Worker, which does not load the session module yet.` },
  { file: "src/controllers/agent-controller.ts", match: { rule: "same-workspace", function: "ensure" }, reason: "Not two workspaces: a lazy menu load is joined only for the same signed-in login and host it began for." },
  { file: "src/workspace-boot.ts", match: { rule: "same-workspace", function: "startBootGuess" }, reason: `${FOLLOW_UP} the remembered workspace's branch against the link's; it should ask \`same\`.` },
  { file: "shared/agent-requests.ts", match: { rule: "same-workspace", function: "inWorkspace" }, reason: `${FOLLOW_UP} shared with the Worker, which does not load the session module yet.`, count: 2 },
];

const realHits = [...sourceFiles("src"), ...sourceFiles("shared")].flatMap(file => detect(readSource(file), file));
const FAKE = "src/controllers/fake.ts";
function fires(source: string, rule: Rule) {
  const hits = detect(source, FAKE);
  assert.ok(hits.length > 0 && hits.every(hit => hit.rule === rule && hit.file === FAKE && hit.line >= 1 && hit.text.length > 0), `${rule}: ${source}`);
}

test("a load counter compared by hand fires, in every spelling", () => {
  for (const source of ["const live = () => epoch === ports.generation();", "if (generation !== epoch) return;", "at.load === currentLoad()", "stamp.load !== epoch",
    "if (epoch !== ports.epoch()) return;", "(ports.generation as () => number)() === was", "fileGeneration === selection"]) fires(source, "load-compare");
  for (const source of ['outcome.changed === "generation"', "mount === mounts", "epoch !== at", "load !== reads", "if (!at.holds()) return;"])
    assert.deepEqual(detect(source, FAKE), [], source);
});

test("a scope or its key compared by hand fires", () => {
  for (const source of ["workspaceKey(now) !== key", "workspaceKey(a) === workspaceKey(b)", "key !== setupScope()", "draftScope() === scope", "identity !== ports.identity()", "scopeKey === ws.scope()", "setupKeyOf(a) === setupKeyOf(b)", "const current = () => scopeKey() === key;"])
    fires(source, "scope-compare");
  for (const source of ["selectionIdentity(a) === b", "running.identity === identity", "scope === undefined", "key === ports.key()"])
    assert.deepEqual(detect(source, FAKE), [], source);
});

test("two workspaces compared field by field fire", () => {
  for (const source of ["repo.id !== pinned.id || repo.branch !== pinned.branch", "grant.repoId === repo.repoId", "now?.repo !== scope.repo", "a.account.toLowerCase() === b.account",
    "seen.branch !== scope.branch", "repository.full_name === other.full_name", "approval.fullName === repo.fullName",
    "grant.repoId === repo.id", "repo?.fullName === approval.repo", "now?.repo.id !== repoId", "incoming.repoId !== workspace.repoId", "status.repo === repo.full_name",
    "repoId !== workspace.repoId", "branch !== workspace.branch", "link.branch !== branch", "receipt.value.branch !== branch", "value.repoId === repoId", "account === scope.account",
    "options.repository()?.id !== repo.id", "now?.id !== pinned.id", "repos.find(item => item.id === id) && repo.id === pinned.id"])
    fires(source, "same-workspace");
  for (const source of ["grant.id === command.grantId", "now.branch === branch", "snapshot.commit !== commit", "item.repo === name", "list.filter(known => known.id !== repo.id)", "list.find(item => item.id === id)", "list.find(function (item) { return item.id === other.id; })", "a.id === b.id", "data.id !== msg.id", "id === repoId"])
    assert.deepEqual(detect(source, FAKE), [], source);
});

test("only the workspace session itself compares them", () => {
  assert.deepEqual(detect("const same = (a, b) => a.repoId === b.repoId && a.branch === b.branch && load === began;", SESSION), []);
  assert.equal(detect("const same = (a, b) => a.repoId === b.repoId;", "src/elsewhere.ts").length, 1);
});

test("the real source tree leaves workspace checks to the session", () => {
  const hits = realHits.filter(hit => !allowlist.some(entry => matches(hit, entry)));
  assert.equal(hits.length, 0, hits.map(hit => `${hit.file}:${hit.line} ${hit.rule} ${hit.function}: ${hit.text}`).join("\n"));
});

test("every allowlist entry still matches exactly its count and gives a reason", () => {
  assert.deepEqual(staleEntries(realHits, allowlist), []);
  for (const entry of allowlist) assert.ok(typeof entry.match !== "string" && entry.match.function && entry.match.rule, entry.file);
  // A second compare in an allowlisted function is not covered by its entry; nor is a gone one.
  const entry: AllowlistEntry = { file: FAKE, match: { rule: "load-compare", function: "live" }, reason: "A fixture's own counter." };
  const hit = detect("const live = () => epoch === ports.generation();", FAKE);
  assert.deepEqual(staleEntries(hit, [entry]), []);
  for (const hits of [[], [...hit, ...hit]]) assert.deepEqual(staleEntries(hits, [entry]), [entry]);
  assert.deepEqual(staleEntries(hit, [{ ...entry, reason: " " }]), [{ ...entry, reason: " " }]);
});
