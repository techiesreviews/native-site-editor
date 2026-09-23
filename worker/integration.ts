import type {
  EditorIntegration,
  EditorIntegrationUpdateResult,
  Repository,
  TreeEntry,
} from "../shared/types";
import { GitHub, HttpError } from "./github";
import {
  integrationFiles,
  knownOfficialAnnotateHashes,
} from "./integration-files";

const segment = encodeURIComponent;
const integrationDir = ".astro-editor";
const annotatePath = ".astro-editor/annotate.mjs";
const shaPattern = /^[a-f0-9]{40}$/;
const setupFiles = [
  ".astro-editor/astro.preview.config.mjs",
  ".astro-editor/preview.json",
  ".astro-editor/stamp-build.mjs",
  ".astro-editor/wrangler.jsonc",
  ".github/workflows/astro-editor-preview.yml",
] as const;

function compareRef(ref: string) {
  return encodeURIComponent(ref).replace(/%2F/g, "/");
}

function branchRefPath(branch: string) {
  return branch.split("/").map(segment).join("/");
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function integrationEntries(
  github: GitHub,
  repo: Repository,
  root: TreeEntry[],
): Promise<TreeEntry[]> {
  const directory = root.find(
    (entry) => entry.path === integrationDir && entry.type === "tree",
  );
  return directory ? github.tree(repo, directory.sha) : [];
}

async function workflowEntries(
  github: GitHub,
  repo: Repository,
  root: TreeEntry[],
): Promise<TreeEntry[]> {
  const githubDirectory = root.find(
    (entry) => entry.path === ".github" && entry.type === "tree",
  );
  if (!githubDirectory) return [];
  const githubEntries = await github.tree(repo, githubDirectory.sha);
  const workflows = githubEntries.find(
    (entry) => entry.path === "workflows" && entry.type === "tree",
  );
  return workflows ? github.tree(repo, workflows.sha) : [];
}

async function readIntegrationFile(
  github: GitHub,
  repo: Repository,
  entries: TreeEntry[],
  path: string,
) {
  const name = path.slice(integrationDir.length + 1);
  const entry = entries.find(
    (item) => item.path === name && item.type === "blob" && item.mode !== "120000",
  );
  if (!entry) return undefined;
  const content = await github.file(repo, entry.sha);
  return { entry, content, sha256: await sha256(content) };
}

function parsePreviewConfig(text: string) {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return (
      value.provider === "cloudflare-workers-assets" &&
      typeof value.worker === "string" &&
      typeof value.subdomain === "string" &&
      typeof value.revisionPath === "string" &&
      /^[a-z0-9-]+$/.test(value.worker) &&
      /^[a-z0-9-]+\.workers\.dev$/.test(value.subdomain) &&
      value.revisionPath.startsWith("/")
    );
  } catch {
    return false;
  }
}

async function inspectSetupFiles(
  github: GitHub,
  repo: Repository,
  editorEntries: TreeEntry[],
  workflows: TreeEntry[],
) {
  const files: EditorIntegration["files"] = [];
  const missing: string[] = [];
  for (const path of setupFiles) {
    const name = path.startsWith(".astro-editor/")
      ? path.slice(".astro-editor/".length)
      : "astro-editor-preview.yml";
    const entries = path.startsWith(".astro-editor/") ? editorEntries : workflows;
    const entry = entries.find(
      (item) => item.path === name && item.type === "blob" && item.mode !== "120000",
    );
    if (!entry) {
      missing.push(path);
      files.push({ path, status: "missing" });
      continue;
    }
    if (path === ".astro-editor/preview.json") {
      const content = await github.file(repo, entry.sha);
      if (!parsePreviewConfig(content)) {
        missing.push(`${path} (invalid preview config)`);
        files.push({ path, status: "malformed", sha: entry.sha });
        continue;
      }
    }
    files.push({ path, status: "current", sha: entry.sha });
  }
  return { files, missing };
}

export async function detectEditorIntegration(
  github: GitHub,
  repo: Repository,
  branch: string,
): Promise<EditorIntegration> {
  if (!branch || branch.length > 255)
    throw new HttpError(400, "Choose a branch.");
  const base = github.base(repo);
  const head = (
    await github.get<{ commit: { sha: string } }>(
      `${base}/branches/${segment(branch)}`,
    )
  ).commit.sha;
  const commit = await github.get<{ tree: { sha: string } }>(
    `${base}/git/commits/${head}`,
  );
  const root = await github.tree(repo, commit.tree.sha);
  const [entries, workflows] = await Promise.all([
    integrationEntries(github, repo, root),
    workflowEntries(github, repo, root),
  ]);
  const setup = await inspectSetupFiles(github, repo, entries, workflows);
  const files: EditorIntegration["files"] = [...setup.files];
  let missing = 0;
  let outdated = 0;
  let custom = false;

  for (const expected of integrationFiles) {
    const actual = await readIntegrationFile(github, repo, entries, expected.path);
    if (!actual) {
      missing++;
      files.push({ path: expected.path, status: "missing" as const });
      continue;
    }
    if (actual.sha256 === expected.sha256) {
      files.push({
        path: expected.path,
        status: "current" as const,
        sha: actual.entry.sha,
      });
      continue;
    }
    if (
      expected.path === annotatePath &&
      !knownOfficialAnnotateHashes.has(actual.sha256)
    ) {
      custom = true;
      files.push({
        path: expected.path,
        status: "custom" as const,
        sha: actual.entry.sha,
      });
      continue;
    }
    outdated++;
    files.push({
      path: expected.path,
      status: "outdated" as const,
      sha: actual.entry.sha,
    });
  }

  if (setup.missing.length)
    return {
      state: "incomplete",
      message: `Preview setup needs manual setup before runtime helpers can be updated: ${setup.missing.join(", ")}. See docs/repository-preview.md.`,
      files,
      canUpdate: false,
    };
  if (custom)
    return {
      state: "custom",
      message:
        "Custom .astro-editor/annotate.mjs detected. The editor will not overwrite it automatically.",
      files,
      canUpdate: false,
    };
  if (!missing && !outdated)
    return {
      state: "current",
      message: "Visual editing integration is current.",
      files,
      canUpdate: false,
    };
  if (outdated)
    return {
      state: "outdated",
      message:
        "Visual editing integration can be updated on a separate branch.",
      files,
      canUpdate: true,
    };
  return {
    state: "incomplete",
    message:
      "Visual editing integration is missing editor-owned helper files.",
    files,
    canUpdate: true,
  };
}

export async function updateEditorIntegration(
  github: GitHub,
  repo: Repository,
  input: { branch?: unknown; expectedHead?: unknown },
): Promise<EditorIntegrationUpdateResult> {
  if (typeof input.branch !== "string" || !input.branch || input.branch.length > 255)
    throw new HttpError(400, "Choose a branch.");
  if (typeof input.expectedHead !== "string" || !shaPattern.test(input.expectedHead))
    throw new HttpError(400, "Refresh the repository before updating integration.");

  const base = github.base(repo);
  const head = (
    await github.get<{ commit: { sha: string } }>(
      `${base}/branches/${segment(input.branch)}`,
    )
  ).commit.sha;
  if (head !== input.expectedHead)
    throw new HttpError(
      409,
      "The branch changed. Refresh before updating integration.",
    );

  const current = await detectEditorIntegration(github, repo, input.branch);
  if (current.state === "current") {
    return {
      branch: input.branch,
      commit: head,
      compareUrl: `https://github.com/${repo.full_name}/compare/${compareRef(input.branch)}...${compareRef(input.branch)}`,
      unchanged: true,
    };
  }
  if (!current.canUpdate) throw new HttpError(409, current.message);

  const parent = await github.get<{ tree: { sha: string } }>(
    `${base}/git/commits/${head}`,
  );
  const tree = await github.write<{ sha: string }>(`${base}/git/trees`, "POST", {
    base_tree: parent.tree.sha,
    tree: integrationFiles.map((file) => ({
      path: file.path,
      mode: "100644",
      type: "blob",
      content: file.content,
    })),
  });
  const created = await github.write<{ sha: string }>(`${base}/git/commits`, "POST", {
    message: "Update Astro Site Editor integration",
    tree: tree.sha,
    parents: [head],
  });
  const updateBranch = `astro-editor/update-integration-${head.slice(0, 12)}`;
  const compareUrl = `https://github.com/${repo.full_name}/compare/${compareRef(input.branch)}...${compareRef(updateBranch)}`;
  try {
    const existing = await github.get<{ object: { sha: string } }>(
      `${base}/git/ref/heads/${branchRefPath(updateBranch)}`,
    );
    if (existing.object.sha === created.sha)
      return {
        branch: updateBranch,
        commit: created.sha,
        compareUrl,
        unchanged: false,
      };
    throw new HttpError(
      409,
      `The update branch ${updateBranch} already exists with different content. Delete it on GitHub or rename it before retrying.`,
    );
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }
  await github.write(`${base}/git/refs`, "POST", {
    ref: `refs/heads/${updateBranch}`,
    sha: created.sha,
  });
  return {
    branch: updateBranch,
    commit: created.sha,
    compareUrl,
    unchanged: false,
  };
}
