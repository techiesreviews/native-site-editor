// GitHub Actions workflows run with the repository's secrets: agents never
// reach them (by file or by folder, however the path is spelled), and
// /api/publish writes them only when the user confirmed (`allowWorkflows`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitProtectedEdits, touchesGithubConfig, touchesWorkflows } from "../shared/protected-paths.ts";
import { writablePathProblem } from "../worker/site-files.ts";
import { agentOperation } from "../worker/agent-operations.ts";
import { applySiteCommand, type AgentSiteActions } from "../src/agent-site.ts";
import { validatePublish } from "../worker/publish.ts";
import { HttpError } from "../worker/github.ts";
import type { AgentCommand } from "../shared/agent.ts";

const spellings = [
  ".github/workflows/deploy.yml",
  ".github/workflows",
  ".github/workflows/",
  ".github",
  ".github/",
  ".GitHub/Workflows/deploy.yml",
  "./.github/workflows/deploy.yml",
  ".github//workflows//deploy.yml",
  ".github/./workflows/deploy.yml",
  "staged/../.github/workflows/deploy.yml",
  ".github./workflows./deploy.yml",
  ".github /workflows/deploy.yml",
  ".github\\workflows\\deploy.yml",
];
// Elsewhere in .github is not a workflow, but an agent may not change it either: a composite action
// or CODEOWNERS changes what an existing workflow does.
const otherGithub = [".github/actions/deploy/action.yml", ".github/CODEOWNERS", ".github/ISSUE_TEMPLATE/bug.md", ".GitHub/./actions/x.yml", ".github./actions/x.yml"];
const fine = [
  "index.html",
  "github/workflows/x.yml",
  "docs/.github/workflows/x.yml",
  ".githubx/workflows/x.yml",
  "workflows/deploy.yml",
];

test("the workflows folder, what is in it, and the folder that holds it are protected however they are spelled", () => {
  for (const path of spellings) assert.equal(touchesWorkflows(path), true, path);
  for (const path of fine) assert.equal(touchesWorkflows(path), false, path);
  for (const path of otherGithub) assert.equal(touchesWorkflows(path), path.toLowerCase().includes("workflows"), path);
  for (const path of [...spellings, ...otherGithub]) assert.equal(touchesGithubConfig(path), true, path);
  for (const path of fine) assert.equal(touchesGithubConfig(path), false, path);
});

test("agents' writable paths refuse the workflows folder itself and every spelling", () => {
  for (const path of [...spellings, ...otherGithub].filter((path) => !/[\\]/.test(path)))
    assert.match(writablePathProblem(path) ?? "", /Workflows cannot be changed|Invalid path/, path);
  for (const path of fine) assert.equal(writablePathProblem(path), undefined, path);
});

const command = (extra: Partial<AgentCommand>): AgentCommand => ({
  id: "r1",
  operation: "move_file",
  path: "staged",
  branch: "main",
  commit: "c".repeat(40),
  content: "",
  grantId: "g",
  repoId: 1,
  state: "pending",
  createdAt: 1,
  ...extra,
});

test("the hub refuses a queued change that reaches the workflows as a path or a move's destination", () => {
  const hub = () => ({
    kind: "agent-hub" as const,
    login: "lex",
    expiresAt: Date.now() + 60_000,
    grants: [],
    tabId: "tab-test-0001",
    updatedAt: Date.now(),
    context: { repository: { id: 1 }, branch: "main", commit: "c".repeat(40) },
  });
  const queue = (value: AgentCommand) => agentOperation(hub() as never, { type: "queue", command: value });
  for (const path of [".github/workflows", ".github", ".github/actions/deploy"])
    assert.throws(() => queue(command({ args: { to: path } })), (error: HttpError) => error.status === 403, `to ${path}`);
  assert.throws(() => queue(command({ path: ".GitHub/workflows/x.yml", args: { to: "elsewhere" } })), HttpError);
  assert.throws(() => queue(command({ operation: "write_file", path: ".github/actions/deploy/action.yml", content: "x" })), HttpError);
  assert.throws(() => queue(command({ operation: "delete_file", path: ".github" })), HttpError);
  assert.doesNotThrow(() => queue(command({ args: { to: "company/about" } })));
});

test("the editor tab refuses the same changes before touching a draft", async () => {
  const touched: string[] = [];
  const actions = new Proxy({} as AgentSiteActions, {
    get: (_, name) => async (...args: unknown[]) => {
      touched.push(String(name));
      return args[0] && typeof args[0] === "string" ? undefined : undefined;
    },
  });
  for (const [path, to] of [["staged", ".github/workflows"], ["staged", ".github"], [".github", "x"], [".github/workflows", "x"], ["staged", "./.GitHub//Workflows"]])
    await assert.rejects(applySiteCommand(actions, command({ path, args: { to } })), /Workflows cannot be changed/, `${path} -> ${to}`);
  await assert.rejects(applySiteCommand(actions, command({ operation: "delete_file", path: ".github" })), /Workflows cannot be changed/);
  await assert.rejects(applySiteCommand(actions, command({ operation: "write_file", path: ".github/workflows/pwn.yml", content: "x" })), /Workflows cannot be changed/);
  assert.deepEqual(touched, []);
});

const file = (path: string, extra: object = {}) => ({ path, baseSha: null, content: "name: x\n", ...extra });

test("/api/publish writes workflow files only when the user confirmed, naming them in the refusal", () => {
  const request = (files: object[], extra: object = {}) => ({ branch: "main", files, ...extra });
  const refused = (value: unknown) => {
    try {
      validatePublish(value);
    } catch (error) {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 403);
      return error.message;
    }
    assert.fail("accepted");
  };
  assert.match(refused(request([file("index.html"), file(".github/workflows/deploy.yml")])), /\.github\/workflows\/deploy\.yml/);
  assert.match(refused(request([file(".GitHub/workflows/a.yml")], { allowWorkflows: false })), /confirmation/);
  assert.match(refused(request([file("ci.yml", { baseSha: "a".repeat(40), movedFrom: ".github/workflows/ci.yml" })])), /ci\.yml/);
  assert.match(refused(request([file(".github/workflows/x.yml", { baseSha: "a".repeat(40), delete: true, content: "" })])), /x\.yml/);
  assert.throws(() => validatePublish(request([file(".github/workflows/deploy.yml")], { allowWorkflows: "yes" })), (error: HttpError) => error.status === 400);
  assert.match(refused(request([file(".github/actions/deploy/action.yml")])), /\.github\/actions\/deploy\/action\.yml/);
  assert.match(refused(request([file(".github/CODEOWNERS")])), /CODEOWNERS/);
  assert.doesNotThrow(() => validatePublish(request([file(".github/actions/deploy/action.yml")], { allowGithubConfig: true })));
  assert.doesNotThrow(() => validatePublish(request([file(".github/CODEOWNERS")], { allowWorkflows: true })));
  assert.doesNotThrow(() => validatePublish(request([file(".github/workflows/deploy.yml"), file("index.html")], { allowWorkflows: true })));
});

test("link rewrites a page move would make in .github files are left out of an agent's operation", () => {
  const edits = new Map([
    ["about/index.html", "<a href=/company/>"],
    [".github/pages/readme.html", "<a href=/company/>"],
    [".GitHub/actions/x/page.css", "a{}"],
    ["_redirects", "/about/ /company/ 301"],
  ]);
  const { kept, left } = splitProtectedEdits(edits);
  assert.deepEqual([...kept.keys()], ["about/index.html", "_redirects"]);
  assert.deepEqual(left, [".github/pages/readme.html", ".GitHub/actions/x/page.css"]);
  const plain = new Map([["a.html", "x"]]);
  assert.equal(splitProtectedEdits(plain).kept, plain);
});
