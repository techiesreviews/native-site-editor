import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVALS_PATH, DEFAULT_TARGET, approvalTarget, parseApprovals, readApprovals, saveApproval, serialiseApprovals, withApproval, type Approvals,
} from "../src/catalogue/approvals.ts";

// Approve on the catalogue board writes src/catalogue/approvals.json through the editor's Save to GitHub
// (/api/publish), atomic catalogue ticket 05. A fake of the editor's API stands in for the Worker here; the browser
// spec (tests/native-save/native-catalogue-board.spec.ts) runs the real one over the fake GitHub.

const target = { repo: "owner/site", branch: "dev" };
const COMMIT = "a".repeat(40), BLOB = "b".repeat(40);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Fake { file?: string; signedIn?: boolean; publish?: Array<(body: any) => Response>; tree?: boolean }
function fakeApi(fake: Fake) {
  const calls: { path: string; params: URLSearchParams; body?: any }[] = [];
  let file = fake.file;
  const publishes = [...(fake.publish ?? [])];
  const fetcher = async (input: string, init?: RequestInit) => {
    const url = new URL(input, "https://editor.example");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: url.pathname, params: url.searchParams, body });
    if (url.pathname === "/api/session") return json(200, { user: fake.signedIn === false ? null : { login: "lex" } });
    if (fake.signedIn === false) return json(401, { error: "Connect GitHub." });
    if (url.pathname === "/api/snapshot") {
      const entries = file === undefined ? [] : [{ path: APPROVALS_PATH, type: "blob", mode: "100644", sha: BLOB }];
      return json(200, fake.tree === false
        ? { commit: COMMIT, branch: "dev", entries: [{ path: "src", type: "tree", mode: "040000", sha: "c".repeat(40) }] }
        : { commit: COMMIT, branch: "dev", entries: [], tree: entries });
    }
    if (url.pathname === "/api/tree") {
      const sha = url.searchParams.get("sha");
      if (sha === "c".repeat(40)) return json(200, { entries: [{ path: "catalogue", type: "tree", mode: "040000", sha: "d".repeat(40) }] });
      return json(200, { entries: file === undefined ? [] : [{ path: "approvals.json", type: "blob", mode: "100644", sha: BLOB }] });
    }
    if (url.pathname === "/api/file") return json(200, { content: file });
    if (url.pathname === "/api/publish") {
      const answer = publishes.shift()?.(body) ?? json(200, { commit: "e".repeat(40), branch: "dev", url: "", files: [], unchanged: false });
      if (answer.ok) file = body.files[0].content;
      return answer;
    }
    return json(404, { error: "Endpoint not found." });
  };
  return { fetcher, calls, file: () => file };
}
const on = new Date("2026-11-10T12:00:00Z");

test("approvals read from the file; a blank, broken or odd file reads as none", () => {
  assert.deepEqual(parseApprovals('{"approved":{"button":{"on":"2026-11-09","by":"lex"}}}'), { approved: { button: { on: "2026-11-09", by: "lex" } } });
  assert.deepEqual(parseApprovals(""), { approved: {} });
  assert.deepEqual(parseApprovals("{"), { approved: {} });
  assert.deepEqual(parseApprovals('{"approved":{"a":{"on":1},"b":null,"c":{"on":"2026-11-09","by":"x"}}}'), { approved: { c: { on: "2026-11-09", by: "x" } } });
});

test("approving adds the day and who; an earlier approval stays as it was", () => {
  const first = withApproval({ approved: {} }, "icon", "lex", on);
  assert.deepEqual(first, { approved: { icon: { on: "2026-11-10", by: "lex" } } });
  assert.equal(withApproval(first, "icon", "someone", new Date("2027-01-01")), first);
});

test("the file lists parts in name order, ending in a newline, and reads back the same", () => {
  const approvals: Approvals = { approved: { menu: { on: "2026-11-10", by: "lex" }, button: { on: "2026-11-09", by: "lex" } } };
  const text = serialiseApprovals(approvals);
  assert.equal(text, '{\n  "approved": {\n    "button": {\n      "on": "2026-11-09",\n      "by": "lex"\n    },\n    "menu": {\n      "on": "2026-11-10",\n      "by": "lex"\n    }\n  }\n}\n');
  assert.deepEqual(parseApprovals(text), approvals);
  assert.equal(serialiseApprovals({ approved: {} }), '{\n  "approved": {}\n}\n');
});

test("approvals go to the editor's repository on dev, unless the address names another", () => {
  assert.deepEqual(approvalTarget(""), DEFAULT_TARGET);
  assert.deepEqual(DEFAULT_TARGET, { repo: "techiesreviews/native-site-editor", branch: "dev" });
  assert.deepEqual(approvalTarget("?repo=me/site&branch=main"), { repo: "me/site", branch: "main" });
  assert.deepEqual(approvalTarget("?repo=me/site"), { repo: "me/site", branch: "dev" });
  assert.deepEqual(approvalTarget("?repo=not a repo"), DEFAULT_TARGET);
});

test("the first approval creates the file in one commit on the branch's head", async () => {
  const api = fakeApi({});
  assert.deepEqual(await saveApproval("button", target, api.fetcher, on), { kind: "saved", approvals: { approved: { button: { on: "2026-11-10", by: "lex" } } } });
  const publish = api.calls.find((call) => call.path === "/api/publish")!;
  assert.equal(publish.params.get("repo"), "owner/site");
  assert.deepEqual(publish.body, { branch: "dev", head: COMMIT, files: [{ path: APPROVALS_PATH, baseSha: null, content: serialiseApprovals({ approved: { button: { on: "2026-11-10", by: "lex" } } }) }] });
});

test("a later approval adds to the file GitHub has, on top of its blob", async () => {
  const api = fakeApi({ file: serialiseApprovals({ approved: { icon: { on: "2026-11-01", by: "lex" } } }) });
  const outcome = await saveApproval("button", target, api.fetcher, on);
  assert.equal(outcome.kind, "saved");
  const publish = api.calls.find((call) => call.path === "/api/publish")!;
  assert.equal(publish.body.files[0].baseSha, BLOB);
  assert.deepEqual(Object.keys(parseApprovals(api.file()!).approved), ["button", "icon"]);
});

test("without the whole tree, the file is found folder by folder", async () => {
  const api = fakeApi({ file: serialiseApprovals({ approved: {} }), tree: false });
  assert.equal((await saveApproval("button", target, api.fetcher, on)).kind, "saved");
  assert.equal(api.calls.find((call) => call.path === "/api/publish")!.body.files[0].baseSha, BLOB);
});

test("a save refused because the file changed meanwhile reads it again and retries once", async () => {
  const api = fakeApi({ publish: [() => json(409, { error: "Changed on GitHub.", conflicts: [APPROVALS_PATH], gone: [] })] });
  assert.equal((await saveApproval("button", target, api.fetcher, on)).kind, "saved");
  assert.equal(api.calls.filter((call) => call.path === "/api/publish").length, 2);
  assert.equal(api.calls.filter((call) => call.path === "/api/snapshot").length, 2);
});

test("signed out, refused or offline: nothing is marked and the reason comes back", async () => {
  assert.deepEqual(await saveApproval("button", target, fakeApi({ signedIn: false }).fetcher, on), { kind: "signed-out" });
  assert.deepEqual(await saveApproval("button", target, fakeApi({ publish: [() => json(401, {})] }).fetcher, on), { kind: "signed-out" });
  assert.deepEqual(await saveApproval("button", target, fakeApi({ publish: [() => json(403, { error: "No access to this repository." })] }).fetcher, on),
    { kind: "failed", message: "No access to this repository." });
  const conflict = () => json(409, { error: "Changed.", conflicts: [APPROVALS_PATH] });
  assert.equal((await saveApproval("button", target, fakeApi({ publish: [conflict, conflict] }).fetcher, on)).kind, "failed");
  assert.deepEqual(await saveApproval("button", target, async () => { throw new TypeError("Failed to fetch"); }, on), { kind: "failed", message: "No connection." });
});

test("a part someone else approved already is saved without a new commit", async () => {
  const api = fakeApi({ file: serialiseApprovals({ approved: { button: { on: "2026-11-01", by: "sam" } } }) });
  assert.deepEqual(await saveApproval("button", target, api.fetcher, on), { kind: "saved", approvals: { approved: { button: { on: "2026-11-01", by: "sam" } } } });
  assert.equal(api.calls.some((call) => call.path === "/api/publish"), false);
});

test("the board reads the branch's approvals only when signed in", async () => {
  assert.equal(await readApprovals(target, fakeApi({ signedIn: false }).fetcher), undefined);
  assert.deepEqual(await readApprovals(target, fakeApi({ file: '{"approved":{"icon":{"on":"2026-11-01","by":"lex"}}}' }).fetcher), { approved: { icon: { on: "2026-11-01", by: "lex" } } });
  assert.deepEqual(await readApprovals(target, fakeApi({}).fetcher), { approved: {} });
});
