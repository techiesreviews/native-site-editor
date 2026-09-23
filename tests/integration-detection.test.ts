import { test } from "node:test";
import assert from "node:assert/strict";
import type { Repository } from "../shared/types.ts";
import { detectEditorIntegration, updateEditorIntegration } from "../worker/integration.ts";
import { integrationFiles } from "../worker/integration-files.ts";
import { GitHub, HttpError } from "../worker/github.ts";

const head = "a".repeat(40);
const tree = "b".repeat(40);
const editorTree = "c".repeat(40);
const nextTree = "d".repeat(40);
const created = "e".repeat(40);
const githubTree = "6".repeat(40);
const workflowsTree = "7".repeat(40);
const oldOfficialHash = "d8841a6767041ee70a288499be88b82950f686f4975b79c500c8fee12bf08cd7";
const setupFiles = new Map([
  [".astro-editor/astro.preview.config.mjs", "export default {};"],
  [
    ".astro-editor/preview.json",
    JSON.stringify({
      provider: "cloudflare-workers-assets",
      worker: "starter",
      subdomain: "lexvd.workers.dev",
      revisionPath: "/.astro-editor/revision.json",
    }),
  ],
  [".astro-editor/stamp-build.mjs", "export {};"],
  [".astro-editor/wrangler.jsonc", "{}"],
  [".github/workflows/astro-editor-preview.yml", "name: Preview\n"],
]);
const repo: Repository = {
  id: 1,
  name: "starter",
  full_name: "lex/starter",
  private: true,
  default_branch: "main",
  owner: { login: "lex", type: "User" },
};

function blob(content: string) {
  return {
    content: btoa(content),
    encoding: "base64",
    size: new TextEncoder().encode(content).length,
  };
}

function bytesFromHex(hex: string) {
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16)).buffer;
}

function fakeSha(index: number) {
  return index.toString(16).padStart(40, "0").slice(-40);
}

function githubWithFiles(
  files: Map<string, string>,
  calls: { method: string; path: string; body?: any }[] = [],
  options: {
    existingUpdateBranch?: string | null;
    setup?: Map<string, string>;
  } = {},
) {
  const allFiles = new Map([...(options.setup ?? setupFiles), ...files]);
  const editorBlobs = [...allFiles.entries()]
    .filter(([name]) => name.startsWith(".astro-editor/"))
    .map(([name, value], index) => ({
      name,
      value,
      sha: fakeSha(index + 1),
    }));
  const workflowBlobs = [...allFiles.entries()]
    .filter(([name]) => name.startsWith(".github/workflows/"))
    .map(([name, value], index) => ({
      name,
      value,
      sha: fakeSha(index + 20),
    }));
  const blobs = [...editorBlobs, ...workflowBlobs];
  return new GitHub("secret", async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (path.endsWith("/branches/main")) return Response.json({ commit: { sha: head } });
    if (path.endsWith(`/git/commits/${head}`)) return Response.json({ tree: { sha: tree } });
    if (path.endsWith("/git/trees/" + tree))
      return Response.json({
        truncated: false,
        tree: [
          { path: ".astro-editor", type: "tree", mode: "040000", sha: editorTree },
          { path: ".github", type: "tree", mode: "040000", sha: githubTree },
        ],
      });
    if (path.endsWith("/git/trees/" + editorTree))
      return Response.json({
        truncated: false,
        tree: editorBlobs.map((blob) => ({
          path: blob.name.slice(".astro-editor/".length),
          type: "blob",
          mode: "100644",
          sha: blob.sha,
          size: blob.value.length,
        })),
      });
    if (path.endsWith("/git/trees/" + githubTree))
      return Response.json({
        truncated: false,
        tree: [{ path: "workflows", type: "tree", mode: "040000", sha: workflowsTree }],
      });
    if (path.endsWith("/git/trees/" + workflowsTree))
      return Response.json({
        truncated: false,
        tree: workflowBlobs.map((blob) => ({
            path: blob.name.slice(".github/workflows/".length),
            type: "blob",
            mode: "100644",
            sha: blob.sha,
            size: blob.value.length,
          })),
      });
    const found = blobs.find((row) => path.endsWith("/git/blobs/" + row.sha));
    if (found) return Response.json(blob(found.value));
    if (path.endsWith(`/git/ref/heads/astro-editor/update-integration-${head.slice(0, 12)}`))
      return options.existingUpdateBranch
        ? Response.json({ object: { sha: options.existingUpdateBranch } })
        : Response.json({}, { status: 404 });
    if (path.endsWith("/git/trees") && method === "POST")
      return Response.json({ sha: nextTree });
    if (path.endsWith("/git/commits") && method === "POST")
      return Response.json({ sha: created });
    if (path.endsWith("/git/refs") && method === "POST")
      return Response.json({ ref: body.ref, object: { sha: body.sha } });
    throw new Error(`Unexpected GitHub call: ${method} ${path}`);
  });
}

test("detects current, incomplete, and custom editor integrations", async () => {
  const currentFiles = new Map(integrationFiles.map((file) => [file.path, file.content]));
  assert.equal(
    (await detectEditorIntegration(githubWithFiles(currentFiles), repo, "main")).state,
    "current",
  );

  const incomplete = new Map([[integrationFiles[0].path, integrationFiles[0].content]]);
  const incompleteResult = await detectEditorIntegration(
    githubWithFiles(incomplete),
    repo,
    "main",
  );
  assert.equal(incompleteResult.state, "incomplete");
  assert.equal(incompleteResult.canUpdate, true);

  const custom = new Map([[integrationFiles[0].path, "export default function custom() {}"]]);
  const customResult = await detectEditorIntegration(githubWithFiles(custom), repo, "main");
  assert.equal(customResult.state, "custom");
  assert.equal(customResult.canUpdate, false);
});

test("setup files gate runtime helper updates", async () => {
  const runtime = new Map(integrationFiles.map((file) => [file.path, file.content]));
  const missingPreview = new Map(setupFiles);
  missingPreview.delete(".astro-editor/preview.json");
  const missingPreviewResult = await detectEditorIntegration(
    githubWithFiles(runtime, [], { setup: missingPreview }),
    repo,
    "main",
  );
  assert.equal(missingPreviewResult.state, "incomplete");
  assert.equal(missingPreviewResult.canUpdate, false);
  assert.match(missingPreviewResult.message, /docs\/repository-preview\.md/);

  const malformedPreview = new Map(setupFiles);
  malformedPreview.set(".astro-editor/preview.json", "{}");
  const malformedResult = await detectEditorIntegration(
    githubWithFiles(runtime, [], { setup: malformedPreview }),
    repo,
    "main",
  );
  assert.equal(malformedResult.state, "incomplete");
  assert.equal(malformedResult.canUpdate, false);
  assert.match(malformedResult.message, /invalid preview config/);

  const missingWorkflow = new Map(setupFiles);
  missingWorkflow.delete(".github/workflows/astro-editor-preview.yml");
  const missingWorkflowResult = await detectEditorIntegration(
    githubWithFiles(runtime, [], { setup: missingWorkflow }),
    repo,
    "main",
  );
  assert.equal(missingWorkflowResult.state, "incomplete");
  assert.equal(missingWorkflowResult.canUpdate, false);
  assert.match(missingWorkflowResult.message, /\.github\/workflows\/astro-editor-preview\.yml/);
});

test("known d884 official annotate hash is treated as updatable", async () => {
  const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
  const oldOfficialAnnotate = "official d884 annotate";
  Object.defineProperty(crypto.subtle, "digest", {
    configurable: true,
    value: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
      const text = new TextDecoder().decode(data);
      if (text === oldOfficialAnnotate) return bytesFromHex(oldOfficialHash);
      return originalDigest(algorithm, data);
    },
  });
  try {
    const result = await detectEditorIntegration(
      githubWithFiles(new Map([[integrationFiles[0].path, oldOfficialAnnotate]])),
      repo,
      "main",
    );
    assert.equal(result.state, "outdated");
    assert.equal(result.canUpdate, true);
  } finally {
    Object.defineProperty(crypto.subtle, "digest", {
      configurable: true,
      value: originalDigest,
    });
  }
});

test("integration update creates a dedicated branch and never changes the source branch", async () => {
  const calls: { method: string; path: string; body?: any }[] = [];
  const result = await updateEditorIntegration(
    githubWithFiles(new Map([[integrationFiles[0].path, integrationFiles[0].content]]), calls),
    repo,
    { branch: "main", expectedHead: head },
  );

  assert.equal(result.branch, `astro-editor/update-integration-${head.slice(0, 12)}`);
  assert.equal(result.commit, created);
  assert.equal(result.compareUrl, `https://github.com/lex/starter/compare/main...${result.branch}`);
  const refWrites = calls.filter((call) => call.path.endsWith("/git/refs"));
  assert.deepEqual(refWrites.map((call) => call.body), [
    { ref: `refs/heads/${result.branch}`, sha: created },
  ]);
  const treeWrite = calls.find((call) => call.path.endsWith("/git/trees") && call.method === "POST")!;
  assert.deepEqual(
    treeWrite.body.tree.map((entry: { path: string }) => entry.path),
    integrationFiles.map((file) => file.path),
  );
});

test("integration update reuses an existing branch only when it points to the same commit", async () => {
  const sameCalls: { method: string; path: string; body?: any }[] = [];
  const result = await updateEditorIntegration(
    githubWithFiles(
      new Map([[integrationFiles[0].path, integrationFiles[0].content]]),
      sameCalls,
      { existingUpdateBranch: created },
    ),
    repo,
    { branch: "main", expectedHead: head },
  );
  assert.equal(result.branch, `astro-editor/update-integration-${head.slice(0, 12)}`);
  assert.equal(result.commit, created);
  assert.equal(
    sameCalls.some((call) => call.path.endsWith("/git/refs") && call.method === "POST"),
    false,
  );

  await assert.rejects(
    () =>
      updateEditorIntegration(
        githubWithFiles(
          new Map([[integrationFiles[0].path, integrationFiles[0].content]]),
          [],
          { existingUpdateBranch: "9".repeat(40) },
        ),
        repo,
        { branch: "main", expectedHead: head },
      ),
    (error: HttpError) =>
      error.status === 409 &&
      error.message.includes("already exists with different content"),
  );
});

test("integration update refuses manual setup gaps before any git object write", async () => {
  const setup = new Map(setupFiles);
  setup.delete(".github/workflows/astro-editor-preview.yml");
  const calls: { method: string; path: string; body?: any }[] = [];
  await assert.rejects(
    () =>
      updateEditorIntegration(
        githubWithFiles(new Map([[integrationFiles[0].path, integrationFiles[0].content]]), calls, { setup }),
        repo,
        { branch: "main", expectedHead: head },
      ),
    (error: HttpError) =>
      error.status === 409 &&
      error.message.includes(".github/workflows/astro-editor-preview.yml"),
  );
  assert.equal(
    calls.some((call) => call.method === "POST" && /\/git\/(trees|commits|refs)$/.test(call.path)),
    false,
  );
});

test("integration update requires exact branch head and blocks custom annotate", async () => {
  await assert.rejects(
    () =>
      updateEditorIntegration(githubWithFiles(new Map()), repo, {
        branch: "main",
        expectedHead: "f".repeat(40),
      }),
    (error: HttpError) => error.status === 409,
  );

  await assert.rejects(
    () =>
      updateEditorIntegration(
        githubWithFiles(new Map([[integrationFiles[0].path, "export default {}"]])),
        repo,
        { branch: "main", expectedHead: head },
      ),
    (error: HttpError) => error.status === 409,
  );
});
