import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GitHub, HttpError } from "../worker/github.ts";
import { publish, blobSha, treeSteps, validatePublish } from "../worker/publish.ts";
import { requestJson } from "../worker/http.ts";
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
    compare?: string;
    /** The `.github` folder's tree SHA in a commit's root tree, by commit (absent: no .github there). */
    folders?: Record<string, string>;
    /** GitHub does not list the branch yet (404), as right after a first save. */
    branchMissing?: boolean;
    /** What GET /git/ref/heads/{branch} answers, one entry per read (the last one repeats): a commit, or `undefined` for 404. Default: the branch head. */
    refs?: (string | undefined)[];
    /** The branches GitHub lists (default: main); `[]` is a repository with no commits. */
    branchList?: string[];
    /** The root tree of a commit lists these entries instead (by commit). */
    rootEntries?: Record<string, { path: string; type: string; mode: string; sha: string }[]>;
    /** Reading the supplied head's commit or tree fails. */
    readFails?: string;
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
      return options.branchMissing ? Response.json({ message: "Branch not found" }, { status: 404 }) : Response.json({ commit: { sha: head } });
    if (path.endsWith("/branches"))
      return Response.json((options.branchList ?? ["main"]).map((name) => ({ name })));
    if (path.includes("/git/ref/heads/")) {
      const refs = options.refs ?? [options.branchMissing ? undefined : head];
      const sha = refs.length > 1 ? refs.shift() : refs[0];
      return sha ? Response.json({ object: { sha } }) : Response.json({ message: "Not Found" }, { status: 404 });
    }
    if (path.includes("/compare/"))
      return Response.json({ status: options.compare ?? "behind" });
    // A commit's root tree: the branch head's `tree`, or one named after the commit.
    const commitOf = (treeSha: string) => (treeSha === tree ? head : treeSha.replace(/^5/, "9"));
    const treeOf = (commit: string) => (commit === head ? tree : commit.replace(/^9/, "5"));
    const supplied = /\/git\/commits\/([a-f0-9]{40})$/.exec(path)?.[1];
    if (supplied && options.readFails === supplied) return Response.json({ message: "Server Error" }, { status: 500 });
    if (supplied) return Response.json({ tree: { sha: treeOf(supplied) } });
    const named = /\/git\/trees\/(5[a-f0-9]{39}|c{40})$/.exec(path)?.[1];
    if (named) {
      const folder = options.folders?.[commitOf(named)];
      return Response.json({
        tree: [
          ...(options.rootEntries?.[commitOf(named)] ?? []),
          ...(folder ? [{ path: ".github", type: "tree", sha: folder, mode: "040000" }] : []),
          { path: "src", type: "tree", sha: "e".repeat(40), mode: "040000" },
          { path: "agent.txt", type: "blob", sha: "f".repeat(40), mode: "100644" },
        ],
        truncated: false,
      });
    }
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
test("the head the editor saw is the parent when GitHub's read of the branch lags behind it", async () => {
  const saved = "9".repeat(40);
  const { github, calls } = fixture({ compare: "ahead" });
  await publish(github, repo, { branch: "main", head: saved, files });
  assert.ok(calls.some((call) => call.path.endsWith(`/compare/${head}...${saved}`)));
  assert.ok(calls.some((call) => call.path.endsWith(`/git/commits/${saved}`)));
  assert.deepEqual(calls.find((call) => call.method === "POST" && call.path.endsWith("/git/commits"))?.body.parents, [saved]);
  // Behind GitHub's head (a merge since): GitHub's head.
  const merged = fixture({ compare: "behind" });
  await publish(merged.github, repo, { branch: "main", head: saved, files });
  assert.deepEqual(merged.calls.find((call) => call.method === "POST" && call.path.endsWith("/git/commits"))?.body.parents, [head]);
  assert.throws(() => validatePublish({ branch: "main", head: "HEAD", files }), (error: HttpError) => error.status === 400);
});
test("a supplied head that brings in a different .github folder than the branch's head needs the user's confirmation", async () => {
  const saved = "9".repeat(40);
  const writes = (calls: { method: string }[]) => calls.filter((call) => call.method !== "GET").length;
  for (const folders of [
    { [saved]: "1".repeat(40) }, // .github appears
    { [head]: "1".repeat(40), [saved]: "2".repeat(40) }, // .github/actions/pwn changes the folder's SHA
    { [head]: "1".repeat(40) }, // .github is removed
  ]) {
    const { github, calls } = fixture({ compare: "ahead", folders });
    await assert.rejects(
      publish(github, repo, { branch: "main", head: saved, files }),
      (error: HttpError) => error.status === 403 && /\.github/.test(error.message) && /confirmation/.test(error.message),
    );
    assert.equal(writes(calls), 0, "nothing is written");
    for (const flag of ["allowGithubConfig", "allowWorkflows"]) {
      const confirmed = fixture({ compare: "ahead", folders });
      await publish(confirmed.github, repo, { branch: "main", head: saved, files, [flag]: true });
      assert.equal(confirmed.calls.filter((call) => call.method === "PATCH").length, 1);
    }
  }
  // The same .github folder on both sides (or none) is no change, however many other files differ.
  for (const folders of [{}, { [head]: "1".repeat(40), [saved]: "1".repeat(40) }]) {
    const same = fixture({ compare: "ahead", folders });
    await publish(same.github, repo, { branch: "main", head: saved, files });
    assert.equal(same.calls.filter((call) => call.method === "PATCH").length, 1);
    assert.ok(!same.calls.some((call) => call.path.includes("/compare/") && call.path.includes("per_page=100")), "no file list is read");
  }
  // 250 ordinary changed files are no reason to refuse: the file list is never read.
  const ordinary = fixture({ compare: "ahead" });
  await publish(ordinary.github, repo, { branch: "main", head: saved, files });
  assert.equal(ordinary.calls.filter((call) => call.method === "PATCH").length, 1);
});
test("when GitHub does not list the branch yet, the supplied head's .github is checked against the ref; only a genuinely empty repository counts as having none", async () => {
  const saved = "9".repeat(40);
  const writes = (calls: { method: string }[]) => calls.filter((call) => call.method !== "GET").length;
  const patched = (calls: { method: string }[]) => calls.filter((call) => call.method === "PATCH").length;
  const one = "1".repeat(40), two = "2".repeat(40);
  // The branch is not listed and its ref cannot be read, but GitHub lists branches: the base is unknown, never "absent".
  // Otherwise a supplied descendant that deletes an existing .github, or adds one, would pass.
  for (const folders of [{ [head]: one }, { [saved]: one }, {}]) {
    const unknown = fixture({ branchMissing: true, folders });
    await assert.rejects(
      publish(unknown.github, repo, { branch: "main", head: saved, files }),
      (error: HttpError) => error.status === 503 && /Try again/.test(error.message),
    );
    assert.equal(writes(unknown.calls), 0);
    // Confirmation does not make an unknown base known.
    const confirmedUnknown = fixture({ branchMissing: true, folders });
    await assert.rejects(publish(confirmedUnknown.github, repo, { branch: "main", head: saved, files, allowGithubConfig: true }), (error: HttpError) => error.status === 503);
  }
  // A genuinely empty repository (no branches): the base has no .github, so one in the supplied head needs the flag.
  const empty = fixture({ branchMissing: true, branchList: [], folders: { [saved]: one } });
  await assert.rejects(publish(empty.github, repo, { branch: "main", head: saved, files }), (error: HttpError) => error.status === 403 && /\.github/.test(error.message));
  assert.equal(writes(empty.calls), 0);
  const emptyConfirmed = fixture({ branchMissing: true, branchList: [], folders: { [saved]: one } });
  await publish(emptyConfirmed.github, repo, { branch: "main", head: saved, files, allowGithubConfig: true });
  assert.equal(patched(emptyConfirmed.calls), 1);
  // No .github in the supplied head: the ordinary follow-up of a first save goes through.
  const plain = fixture({ branchMissing: true, branchList: [] });
  await publish(plain.github, repo, { branch: "main", head: saved, files });
  assert.equal(patched(plain.calls), 1);
  assert.ok(plain.calls.some((call) => call.path.includes("/git/ref/heads/main")), "the ref is read directly");
  // The ref names a commit: it is the base, and an unchanged .github passes, a changed one does not.
  const viaRef = fixture({ branchMissing: true, refs: [head], folders: { [head]: one, [saved]: one } });
  await publish(viaRef.github, repo, { branch: "main", head: saved, files });
  assert.equal(patched(viaRef.calls), 1);
  const changedViaRef = fixture({ branchMissing: true, refs: [head], folders: { [head]: one, [saved]: two } });
  await assert.rejects(publish(changedViaRef.github, repo, { branch: "main", head: saved, files }), (error: HttpError) => error.status === 403);
  // The base came from the ref but the ref is unreadable right before the update: it may have moved, so 503, not trusted.
  const lostRef = fixture({ branchMissing: true, refs: [head, undefined], folders: { [head]: one, [saved]: one } });
  await assert.rejects(publish(lostRef.github, repo, { branch: "main", head: saved, files }), (error: HttpError) => error.status === 503);
  assert.equal(patched(lostRef.calls), 0);
});
test("every root entry that counts as .github is compared by exact name, type, mode and SHA, in any case", async () => {
  const saved = "9".repeat(40);
  const entry = (path: string, sha = "1".repeat(40), type = "tree", mode = "040000") => ({ path, type, mode, sha });
  for (const [before, after] of [
    [[], [entry(".GitHub")]], // a case variant added
    [[entry(".GitHub")], []], // removed
    [[entry(".GitHub", "1".repeat(40))], [entry(".GitHub", "2".repeat(40))]], // changed
    [[entry(".github")], [entry(".Github")]], // renamed by case
    [[entry(".github", "1".repeat(40), "tree", "040000")], [entry(".github", "1".repeat(40), "blob", "120000")]], // a folder becomes a symlink
    [[entry(".github")], [entry(".github"), entry(".github.")]], // trailing-dot variant added
  ] as const) {
    const { github, calls } = fixture({ compare: "ahead", rootEntries: { [head]: [...before], [saved]: [...after] } });
    await assert.rejects(
      publish(github, repo, { branch: "main", head: saved, files }),
      (error: HttpError) => error.status === 403 && /\.github/i.test(error.message),
      JSON.stringify([before, after]),
    );
    assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
  }
  // The same entries on both sides pass; other root entries do not matter.
  const same = fixture({ compare: "ahead", rootEntries: { [head]: [entry(".GitHub")], [saved]: [entry(".GitHub")] } });
  await publish(same.github, repo, { branch: "main", head: saved, files });
  assert.equal(same.calls.filter((call) => call.method === "PATCH").length, 1);
});
test("if the branch moves between the check and the ref update, a change under .github or a save that is no longer a fast-forward is refused", async () => {
  const moved = "9" + "7".repeat(39);
  const one = "1".repeat(40), two = "2".repeat(40);
  const patched = (calls: { method: string }[]) => calls.filter((call) => call.method === "PATCH").length;
  // B changed .github since the validated base A (head): refused, nothing moved.
  const changedGithub = fixture({ refs: [moved], folders: { [head]: one, [moved]: two } });
  await assert.rejects(
    publish(changedGithub.github, repo, { branch: "main", files }),
    (error: HttpError) => error.status === 409 && /changed on GitHub while saving/.test(error.message),
  );
  assert.equal(patched(changedGithub.calls), 0);
  // The branch moved but .github is the same, and the new commit is ahead of it: saved.
  const harmless = fixture({ refs: [moved], compare: "ahead", folders: { [head]: one, [moved]: one } });
  await publish(harmless.github, repo, { branch: "main", files });
  assert.equal(patched(harmless.calls), 1);
  assert.ok(harmless.calls.some((call) => call.path.endsWith(`/compare/${moved}...${next}`)));
  // Not a fast-forward of the moved branch: refused with the same 409.
  const diverged = fixture({ refs: [moved], compare: "diverged", folders: { [head]: one, [moved]: one } });
  await assert.rejects(publish(diverged.github, repo, { branch: "main", files }), (error: HttpError) => error.status === 409);
  assert.equal(patched(diverged.calls), 0);
  // An unreadable ref right before the update is retryable, not trusted.
  const unreadable = fixture({ refs: [undefined] });
  await assert.rejects(publish(unreadable.github, repo, { branch: "main", files }), (error: HttpError) => error.status === 503);
  assert.equal(patched(unreadable.calls), 0);
  // The ref where it was validated: saved without further reads.
  const still = fixture();
  await publish(still.github, repo, { branch: "main", files });
  assert.equal(patched(still.calls), 1);
  assert.ok(!still.calls.some((call) => call.path.includes("/compare/")));
  // A validated ahead head that is still the branch's named head moves nothing else.
  const ahead = fixture({ compare: "ahead", refs: [head] });
  await publish(ahead.github, repo, { branch: "main", head: "9".repeat(40), files });
  assert.equal(patched(ahead.calls), 1);
});
test("a save that cannot read the trees to check .github is refused as retryable, not let through", async () => {
  const saved = "9".repeat(40);
  const { github, calls } = fixture({ compare: "ahead", readFails: saved });
  await assert.rejects(
    publish(github, repo, { branch: "main", head: saved, files }),
    (error: HttpError) => error.status === 503 && /Try again/.test(error.message),
  );
  assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
  const missing = fixture({ branchMissing: true, branchList: [], readFails: saved, folders: {} });
  await assert.rejects(publish(missing.github, repo, { branch: "main", head: saved, files }), (error: HttpError) => error.status === 503);
});
test("a draft whose text is GitHub's new version is no conflict", async () => {
  const { github, calls } = fixture({ existing: await blobSha(files[0].content) });
  const result = await publish(github, repo, { branch: "main", files });
  assert.equal(result.unchanged, true);
  assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
});
test("an edit of a file GitHub deleted is refused as deleted, not changed", async () => {
  const { github } = fixture({ deleted: true });
  await assert.rejects(
    () => publish(github, repo, { branch: "main", files }),
    (error: HttpError) =>
      error.status === 409 &&
      error.conflicts?.[0] === files[0].path &&
      error.gone?.[0] === files[0].path &&
      error.message.includes(`GitHub deleted these files since your drafts began: ${files[0].path}.`) &&
      error.message.includes("Discard those drafts or keep them as new files") &&
      !error.message.includes("GitHub changed these files"),
  );
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
test("invalid paths, duplicate files and large content are rejected; workflow files need the user's confirmation", () => {
  for (const path of [
    "../index.astro",
    "src//a",
    "/a",
    "a/./b",
    "a\\b",
    ".git/config",
    "a\0b",
  ]) {
    assert.throws(
      () => validatePublish({ branch: "main", files: [{ ...files[0], path }] }),
      HttpError,
    );
  }
  for (const values of [
    [],
    [...files, ...files],
    [{ ...files[0], content: "é".repeat(2 * 1024 * 1024 + 1) }],
    [{ ...files[0], baseSha: "oops" }],
  ]) {
    assert.throws(
      () => validatePublish({ branch: "main", files: values }),
      HttpError,
    );
  }
  const workflow = { branch: "main", files: [{ ...files[0], baseSha: null, path: ".github/workflows/deploy.yml" }] };
  assert.throws(() => validatePublish(workflow), (error: HttpError) => error.status === 403);
  assert.doesNotThrow(() => validatePublish({ ...workflow, allowWorkflows: true }));
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
  assert.equal(validatePublish({ branch: "main", files: Array.from({ length: 2000 }, (_, i) => ({ path: `f${i}`, baseSha, content: "", delete: true })) }).files.length, 2000);
  assert.throws(() => validatePublish({ branch: "main", files: Array.from({ length: 2001 }, (_, i) => ({ path: `f${i}`, baseSha, content: "", delete: true })) }), HttpError);
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

test("a commit of hundreds of pages is accepted, and its tree is built in steps", () => {
  const many = Array.from({ length: 450 }, (_, index) => ({ path: `pages/${index}.html`, baseSha, content: "<p>x</p>\n".repeat(4000) }));
  assert.equal(validatePublish({ branch: "main", files: many }).files.length, 450);
  const steps = treeSteps(many.map(({ path, content }) => ({ path, mode: "100644", type: "blob" as const, content })));
  assert.ok(steps.length > 1);
  assert.equal(steps.flat().length, 450);
  for (const step of steps) assert.ok(step.length <= 200);
  assert.deepEqual(treeSteps([{ path: "a", sha: null }]), [[{ path: "a", sha: null }]]);
});

test("a gzipped JSON request is unpacked, and the limit holds for what it unpacks to", async () => {
  const gzipped = (text: string) =>
    new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  const request = async (text: string, limit?: number) =>
    requestJson(new Request("https://editor.test/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
      body: await gzipped(text),
    }), limit);
  assert.deepEqual(await request(JSON.stringify({ branch: "main" })), { branch: "main" });
  const big = JSON.stringify({ text: "a".repeat(100_000) });
  await assert.rejects(request(big, 50_000), (error: HttpError) => error.status === 413);
  await assert.rejects(
    requestJson(new Request("https://editor.test/", {
      method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" }, body: "not gzip",
    })),
    (error: HttpError) => error.status === 400,
  );
});
test("a commit touching hundreds of folders reads the tree once, so it stays within the Worker's subrequests", async () => {
  const folders = Array.from({ length: 300 }, (_, index) => `src/pages/p${index}`);
  const listing = [
    { path: "src", type: "tree", sha: "e".repeat(40), mode: "040000" },
    { path: "src/pages", type: "tree", sha: "e".repeat(40), mode: "040000" },
    { path: "agent.txt", type: "blob", sha: "f".repeat(40), mode: "100644" },
    ...folders.flatMap((folder) => [
      { path: folder, type: "tree", sha: "e".repeat(40), mode: "040000" },
      { path: `${folder}/index.html`, type: "blob", sha: baseSha, mode: "100644" },
    ]),
  ];
  const calls: { path: string; method: string; search: string }[] = [];
  const github = new GitHub("private-token", async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? "GET";
    calls.push({ path: url.pathname, method, search: url.search });
    if (method === "PATCH") return Response.json({});
    if (method !== "GET") return Response.json({ sha: url.pathname.endsWith("/trees") ? tree : next });
    if (url.pathname.includes("/branches/")) return Response.json({ commit: { sha: head } });
    if (url.pathname.includes("/git/ref/heads/")) return Response.json({ object: { sha: head } });
    if (url.pathname.includes("/git/commits/")) return Response.json({ tree: { sha: tree } });
    if (url.searchParams.get("recursive") === "1") return Response.json({ tree: listing, truncated: false });
    throw new Error(`unexpected read of ${url.pathname}`);
  });
  const result = await publish(github, repo, {
    branch: "main",
    files: [
      ...folders.map((folder) => ({ path: `${folder}/index.html`, baseSha, content: `<h1>${folder}</h1>` })),
      { path: "src/pages/new/index.html", baseSha: null, content: "<h1>New</h1>" },
    ],
  });
  assert.equal(calls.filter((call) => call.method === "GET" && call.path.includes("/git/trees/")).length, 1);
  assert.equal(result.files.length, 301);
  assert.ok(calls.length < 20);
  await assert.rejects(
    () => publish(github, repo, { branch: "main", files: [{ path: "agent.txt/x.html", baseSha: null, content: "x" }] }),
    (error: HttpError) => error.status === 409 && /agent\.txt\. Its parent is not a directory/.test(error.message),
  );
});
