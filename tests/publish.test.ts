import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GitHub, HttpError } from "../worker/github.ts";
import { publish, blobSha, validatePublish } from "../worker/publish.ts";
import type { Repository } from "../shared/types.ts";
const repo: Repository = {
  id: 1,
  name: "starter",
  full_name: "lex/starter",
  owner: { login: "lex", type: "User" },
  private: true,
  default_branch: "main",
};
const baseSha = "a".repeat(40),
  head = "b".repeat(40),
  tree = "c".repeat(40),
  next = "d".repeat(40);
const files = [{ path: "src/index.astro", baseSha, content: "<h1>New</h1>" }];
function fixture(
  options: {
    conflict?: boolean;
    race?: boolean;
    mode?: string;
    deleted?: boolean;
    existing?: string;
  } = {},
) {
  const calls: { path: string; method: string; body?: any }[] = [];
  const github = new GitHub("private-token", async (input, init) => {
    const path = new URL(String(input)).pathname,
      method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method, body });
    if (method !== "GET") {
      if (method === "PATCH")
        return Response.json({}, { status: options.race ? 422 : 200 });
      return Response.json({ sha: path.endsWith("/trees") ? tree : next });
    }
    if (path.includes("/branches/"))
      return Response.json({ commit: { sha: head } });
    if (path.includes("/git/commits/"))
      return Response.json({ tree: { sha: tree } });
    if (path.endsWith(tree))
      return Response.json({
        tree: [
          { path: "src", type: "tree", sha: "e".repeat(40), mode: "040000" },
          {
            path: "agent.txt",
            type: "blob",
            sha: "f".repeat(40),
            mode: "100644",
          },
        ],
        truncated: false,
      });
    return Response.json({
      tree: options.deleted
        ? []
        : [
            {
              path: "index.astro",
              sha: options.existing ?? (options.conflict ? next : baseSha),
              type: "blob",
              mode: options.mode ?? "100644",
            },
          ],
      truncated: false,
    });
  });
  return { github, calls };
}
test("publishes only selected paths against the latest tree, preserves executable mode, and never forces", async () => {
  const { github, calls } = fixture({ mode: "100755" });
  const result = await publish(github, repo, {
    branch: "experiment/heading",
    files,
  });
  const writes = calls.filter((call) => call.method !== "GET");
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[0].body, {
    base_tree: tree,
    tree: [
      {
        path: files[0].path,
        mode: "100755",
        type: "blob",
        content: files[0].content,
      },
    ],
  });
  assert.deepEqual(writes[1].body.parents, [head]);
  assert.deepEqual(writes[2].body, { sha: next, force: false });
  assert.ok(writes[2].path.endsWith("experiment%2Fheading"));
  assert.equal(result.commit, next);
  assert.equal(result.files[0].sha, await blobSha(files[0].content));
});
test("overlapping edits, deleted files and symlinks fail before any GitHub write", async () => {
  for (const options of [
    { conflict: true },
    { deleted: true },
    { mode: "120000" },
    { mode: "160000" },
  ]) {
    const { github, calls } = fixture(options);
    await assert.rejects(
      () => publish(github, repo, { branch: "main", files }),
      (error: HttpError) =>
        error.status === 409 && error.conflicts?.[0] === files[0].path,
    );
    assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
  }
});
test("concurrent branch changes reject publication without force or a stale retry", async () => {
  const { github, calls } = fixture({ race: true });
  await assert.rejects(
    () => publish(github, repo, { branch: "main", files }),
    (error: HttpError) => error.status === 409,
  );
  assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
});
test("retry after a lost response recognizes already-published content without another commit", async () => {
  const { github, calls } = fixture({
    existing: await blobSha(files[0].content),
  });
  const result = await publish(github, repo, { branch: "main", files });
  assert.equal(result.unchanged, true);
  assert.equal(result.commit, head);
  assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
});
test("Git blob digest preserves Unicode and exact whitespace", async () => {
  const content = "\ufeff<h1>hé 🌍</h1>\r\n";
  const expected = createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest("hex");
  assert.equal(await blobSha(content), expected);
});
test("invalid paths, duplicate files, workflow changes and large content are rejected", () => {
  for (const path of [
    "../index.astro",
    "src//a",
    "/a",
    "a/./b",
    "a\\b",
    ".git/config",
    "a\0b",
    ".github/workflows/deploy.yml",
  ]) {
    assert.throws(
      () => validatePublish({ branch: "main", files: [{ ...files[0], path }] }),
      HttpError,
    );
  }
  for (const values of [
    [],
    [...files, ...files],
    [{ ...files[0], content: "é".repeat(128 * 1024) }],
    [{ ...files[0], baseSha: "oops" }],
  ]) {
    assert.throws(
      () => validatePublish({ branch: "main", files: values }),
      HttpError,
    );
  }
});

test("a new file uses a null baseline and never replaces an existing remote file", async () => {
  const { github, calls } = fixture({ deleted: true });
  const result = await publish(github, repo, {
    branch: "main",
    files: [{ path: "src/index.astro", baseSha: null, content: "new file" }],
  });
  assert.equal(result.commit, next);
  assert.equal(
    calls.find((call) => call.method === "POST" && call.path.endsWith("/trees"))
      ?.body.tree[0].mode,
    "100644",
  );
  const collision = fixture();
  await assert.rejects(
    () =>
      publish(collision.github, repo, {
        branch: "main",
        files: [
          { path: "src/index.astro", baseSha: null, content: "new file" },
        ],
      }),
    (error: HttpError) => error.status === 409,
  );
});

test("a deletion and a rename go into one commit: sha null for the removed paths, the renamed file as its blob", async () => {
  const { github, calls } = fixture();
  const moved = "9".repeat(40);
  const result = await publish(github, repo, {
    branch: "main",
    files: [
      { path: "src/index.astro", baseSha, content: "", delete: true },
      { path: "src/home.astro", baseSha: null, content: "", sha: moved, movedFrom: "src/index.astro" },
    ],
  });
  const writes = calls.filter((call) => call.method !== "GET");
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[0].body, {
    base_tree: tree,
    tree: [
      { path: "src/index.astro", mode: "100644", type: "blob", sha: null },
      { path: "src/home.astro", mode: "100644", type: "blob", sha: moved },
    ],
  });
  assert.equal(writes[1].body.message, "Rename src/index.astro to src/home.astro with Native Site Editor");
  assert.deepEqual(result.deleted, ["src/index.astro"]);
  assert.deepEqual(result.files, [{ path: "src/home.astro", sha: moved }]);
});

test("deleting a file that changed on GitHub since its base conflicts; one already gone is no change", async () => {
  const changed = fixture({ conflict: true });
  await assert.rejects(
    () => publish(changed.github, repo, { branch: "main", files: [{ path: "src/index.astro", baseSha, content: "", delete: true }] }),
    (error: HttpError) => error.status === 409 && error.conflicts?.[0] === "src/index.astro",
  );
  assert.equal(changed.calls.filter((call) => call.method !== "GET").length, 0);
  const gone = fixture({ deleted: true });
  const result = await publish(gone.github, repo, { branch: "main", files: [{ path: "src/index.astro", baseSha, content: "", delete: true }] });
  assert.equal(result.unchanged, true);
  assert.deepEqual(result.deleted, ["src/index.astro"]);
  // A rename whose target appeared on GitHub meanwhile conflicts.
  const taken = fixture();
  await assert.rejects(
    () => publish(taken.github, repo, { branch: "main", files: [{ path: "src/index.astro", baseSha: null, content: "", sha: "9".repeat(40) }] }),
    (error: HttpError) => error.status === 409,
  );
});

test("deletions and blob references are validated", () => {
  for (const file of [
    { path: "a", baseSha: null, content: "", delete: true },
    { path: "a", baseSha, content: "x", delete: true },
    { path: "a", baseSha, content: "", delete: true, sha: baseSha },
    { path: "a", baseSha, content: "", sha: baseSha },
    { path: "a", baseSha: null, content: "x", sha: baseSha },
    { path: "a", baseSha: null, content: "", sha: "nope" },
    { path: "a", baseSha: null, content: "", mode: "120000" },
    { path: "a", baseSha: null, content: "", movedFrom: "../b" },
  ])
    assert.throws(() => validatePublish({ branch: "main", files: [file] }), HttpError);
  assert.equal(validatePublish({ branch: "main", files: Array.from({ length: 100 }, (_, i) => ({ path: `f${i}`, baseSha, content: "", delete: true })) }).files.length, 100);
  assert.throws(() => validatePublish({ branch: "main", files: Array.from({ length: 101 }, (_, i) => ({ path: `f${i}`, baseSha, content: "", delete: true })) }), HttpError);
});

test("the commit message counts renames, updates and deletions", async () => {
  const { commitSummary } = await import("../worker/publish.ts");
  const requested = [
    { path: "b/one", baseSha: null, content: "", movedFrom: "a/one" },
    { path: "b/two", baseSha: null, content: "", movedFrom: "a/two" },
    { path: "a/one", baseSha, content: "", delete: true },
    { path: "a/two", baseSha, content: "", delete: true },
  ];
  const changes = [
    { path: "b/one", sha: "1" },
    { path: "b/two", sha: "2" },
    { path: "a/one", sha: null },
    { path: "a/two", sha: null },
  ];
  assert.equal(commitSummary(requested, changes), "Rename 2 files");
  assert.equal(commitSummary(requested, [...changes, { path: "c", sha: null }, { path: "d" }]), "Update 1 file, rename 2 and delete 1");
  assert.equal(commitSummary([], [{ path: "c", sha: null }]), "Delete c");
  assert.equal(commitSummary([], [{ path: "c" }, { path: "d" }]), "Update 2 files");
});
