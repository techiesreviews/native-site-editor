import type { DraftFile, DraftPreviewRequest } from "../shared/draft-preview";
import type { Repository, TreeEntry } from "../shared/types";
import { previewOrigin } from "../fixtures/astro-starter/.astro-editor/preview-alias.mjs";
import { GitHub, HttpError } from "./github";

const encoder = new TextEncoder();
const validSha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const canonicalPreviewWorkflowSha256 = new Set([
  "4ea8b0f913934c4caec0e6b583292959f962b307e9b8a3c08013c809aadaec43",
  "fafd1181be22196f8f3e07f6bdb934bd2e96b7847f44fb5c401b2981cdca40e4",
]);
const previewConfigPath = ".astro-editor/preview.json";
const workflowPath = ".github/workflows/astro-editor-preview.yml";
const maxFiles = 20;
const maxFileBytes = 128 * 1024;
const maxTotalBytes = 1024 * 1024;
const maxSessionBranches = 20;
const maxTreeReads = 24;
const maxPathDepth = 16;

export interface DraftPreviewSupport {
  available: true;
  mode: "github-actions";
  previewOrigin: string;
  revisionPath: string;
}

interface PreviewConfig {
  provider: "cloudflare-workers-assets";
  worker: string;
  subdomain: string;
  revisionPath: string;
}

interface Baseline {
  head: string;
  tree: string;
  root: TreeEntry[];
  config: PreviewConfig;
  reader: ReturnType<typeof treeReader>;
}

function segment(value: string) {
  return encodeURIComponent(value);
}

function refBranchPath(branch: string) {
  return branch.split("/").map(segment).join("/");
}

function validRevisionPath(value: string) {
  return value === "/.astro-editor/revision.json";
}

function validDnsName(value: string, max = 63) {
  return (
    value.length >= 1 &&
    value.length <= max &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)
  );
}

function parsePreviewConfig(text: string): PreviewConfig | undefined {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (
      value.provider === "cloudflare-workers-assets" &&
      typeof value.worker === "string" &&
      typeof value.subdomain === "string" &&
      typeof value.revisionPath === "string" &&
      validDnsName(value.worker, 24) &&
      value.subdomain.endsWith(".workers.dev") &&
      value.subdomain.split(".").every((part) => validDnsName(part)) &&
      validRevisionPath(value.revisionPath)
    ) {
      previewOrigin({ worker: value.worker, subdomain: value.subdomain }, "main");
      return {
        provider: "cloudflare-workers-assets",
        worker: value.worker,
        subdomain: value.subdomain,
        revisionPath: value.revisionPath,
      };
    }
  } catch {
    /* handled by caller */
  }
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validatePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length <= 1024 &&
    path.startsWith("src/") &&
    !/[\\\u0000-\u001f\u007f]/.test(path) &&
    !path
      .split("/")
      .some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")
  );
}

function validateRequest(input: unknown): DraftPreviewRequest {
  const data = input as Partial<DraftPreviewRequest> | null;
  if (
    !data ||
    typeof data.sessionId !== "string" ||
    data.sessionId.length < 1 ||
    data.sessionId.length > 128 ||
    typeof data.repo !== "string" ||
    typeof data.branch !== "string" ||
    !data.branch ||
    data.branch.length > 255 ||
    !validSha(data.baseCommit) ||
    !Array.isArray(data.files) ||
    data.files.length > maxFiles
  )
    throw new HttpError(400, "Invalid draft preview request.");
  if (data.branch.startsWith("editor/draft-"))
    throw new HttpError(400, "Draft preview branches cannot be used as source branches.");
  const paths = new Set<string>();
  let total = 0;
  for (const file of data.files) {
    if (
      !file ||
      !validatePath(file.path) ||
      paths.has(file.path) ||
      typeof file.content !== "string" ||
      file.content.includes("\0")
    )
      throw new HttpError(400, "Invalid or duplicate draft preview file.");
    paths.add(file.path);
    const size = encoder.encode(file.content).length;
    total += size;
    if (size > maxFileBytes || total > maxTotalBytes)
      throw new HttpError(413, "Draft previews support 128 KB per file and 1 MB per build.");
  }
  return data as DraftPreviewRequest;
}

function treeReader(github: GitHub, repo: Repository, root: TreeEntry[]) {
  const cache = new Map<string, TreeEntry[]>();
  let reads = 0;
  async function readTree(sha: string) {
    const cached = cache.get(sha);
    if (cached) return cached;
    if (++reads > maxTreeReads)
      throw new HttpError(413, "Draft preview repository paths are too deep to inspect safely.");
    const entries = await github.tree(repo, sha);
    cache.set(sha, entries);
    return entries;
  }
  return { readPath };

  async function readPath(path: string) {
    let entries = root;
    const parts = path.split("/");
    if (parts.length > maxPathDepth)
      throw new HttpError(400, "Draft preview path is too deep.");
    for (let index = 0; index < parts.length; index++) {
      const entry = entries.find((item) => item.path === parts[index]);
      if (!entry) return undefined;
      if (index === parts.length - 1) return entry;
      if (entry.type !== "tree")
        throw new HttpError(409, `Cannot preview files beneath ${parts.slice(0, index + 1).join("/")}. Its parent is not a directory.`);
      entries = await readTree(entry.sha);
    }
  }
}

async function assertCanonicalSetup(
  github: GitHub,
  repo: Repository,
  reader: ReturnType<typeof treeReader>,
) {
  const preview = await reader.readPath(previewConfigPath);
  if (!preview || preview.type !== "blob" || preview.mode === "120000")
    return { ok: false as const, reason: "missing-preview-config" };
  const config = parsePreviewConfig(await github.file(repo, preview.sha));
  if (!config) return { ok: false as const, reason: "invalid-preview-config" };

  const workflow = await reader.readPath(workflowPath);
  if (!workflow || workflow.type !== "blob" || workflow.mode === "120000")
    return { ok: false as const, reason: "missing-preview-workflow" };
  const workflowHash = await sha256Hex(await github.file(repo, workflow.sha));
  if (!canonicalPreviewWorkflowSha256.has(workflowHash))
    return { ok: false as const, reason: "unsupported-preview-workflow" };
  return { ok: true as const, config };
}

async function baseline(
  github: GitHub,
  repo: Repository,
  branch: string,
  baseCommit: string,
): Promise<Baseline> {
  const base = github.base(repo);
  const ref = await github.get<{ commit: { sha: string } }>(
    `${base}/branches/${segment(branch)}`,
  );
  if (ref.commit.sha !== baseCommit)
    throw new HttpError(409, "Source branch changed. Refresh and retry.");
  const commit = await github.get<{ tree: { sha: string } }>(
    `${base}/git/commits/${baseCommit}`,
  );
  const root = await github.tree(repo, commit.tree.sha);
  const reader = treeReader(github, repo, root);
  const setup = await assertCanonicalSetup(github, repo, reader);
  if (!setup.ok)
    throw new HttpError(409, `Draft preview is unavailable: ${setup.reason}.`);
  return { head: ref.commit.sha, tree: commit.tree.sha, root, config: setup.config, reader };
}

export async function draftPreviewAvailability(
  github: GitHub,
  repo: Repository,
  branch: string,
  baseCommit: string,
): Promise<DraftPreviewSupport | { available: false; reason: string }> {
  if (!branch || !validSha(baseCommit))
    return { available: false, reason: "missing-context" };
  if (branch.startsWith("editor/draft-"))
    return { available: false, reason: "draft-source-branch" };
  try {
    const base = await baseline(github, repo, branch, baseCommit);
    return {
      available: true,
      mode: "github-actions",
      previewOrigin: previewOrigin(base.config, "editor/draft-probe"),
      revisionPath: base.config.revisionPath,
    };
  } catch (error) {
    if (error instanceof HttpError)
      return { available: false, reason: error.message };
    throw error;
  }
}

async function verifyOverlayEntries(
  reader: ReturnType<typeof treeReader>,
  files: DraftFile[],
) {
  const changes: { path: string; mode: string; type: "blob"; content: string }[] = [];
  const sources: Record<string, string> = {};
  for (const file of files) {
    const entry = await reader.readPath(file.path);
    if (entry && (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)))
      throw new HttpError(409, `Cannot preview ${file.path}. It is not an editable text file.`);
    changes.push({
      path: file.path,
      mode: entry?.mode === "100755" ? "100755" : "100644",
      type: "blob",
      content: file.content,
    });
    sources[file.path] = file.content;
  }
  return { changes, sources };
}

async function deterministicHash(repo: Repository, request: DraftPreviewRequest) {
  const files = request.files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => [file.path, file.content]);
  return (await sha256Hex(JSON.stringify([
    repo.owner.login,
    repo.id,
    request.sessionId,
    request.branch,
    request.baseCommit,
    files,
  ]))).slice(0, 16);
}

async function sessionHash(repo: Repository, request: DraftPreviewRequest) {
  return (await sha256Hex(JSON.stringify([
    repo.owner.login,
    repo.id,
    request.sessionId,
    request.branch,
    request.baseCommit,
  ]))).slice(0, 8);
}

async function getExistingRef(github: GitHub, repo: Repository, branch: string) {
  try {
    return await github.get<{ object: { sha: string } }>(
      `${github.base(repo)}/git/ref/heads/${refBranchPath(branch)}`,
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return undefined;
    throw error;
  }
}

export async function createDraftPreview(
  github: GitHub,
  repo: Repository,
  input: unknown,
) {
  const request = validateRequest(input);
  if (request.repo !== repo.full_name)
    throw new HttpError(403, "Draft preview repository mismatch.");
  const base = await baseline(github, repo, request.branch, request.baseCommit);
  const { changes, sources } = await verifyOverlayEntries(
    base.reader,
    request.files,
  );
  const tree = await github.write<{ sha: string }>(
    `${github.base(repo)}/git/trees`,
    "POST",
    { base_tree: base.tree, tree: changes },
  );
  const bucket = await sessionHash(repo, request);
  const hash = await deterministicHash(repo, request);
  const draftBranch = `editor/draft-${bucket}-${hash}`;
  const marker = `Astro Site Editor draft preview\n\nsource=${request.branch}\nbase=${base.head}\nsession=${bucket}\nhash=${hash}`;
  const existing = await getExistingRef(github, repo, draftBranch);
  let revision: string;
  if (existing) {
    const commit = await github.get<{
      tree: { sha: string };
      parents: { sha: string }[];
      message: string;
    }>(`${github.base(repo)}/git/commits/${existing.object.sha}`);
    if (
      commit.tree.sha !== tree.sha ||
      commit.parents.length !== 1 ||
      commit.parents[0].sha !== base.head ||
      commit.message !== marker
    )
      throw new HttpError(409, "Draft preview branch already exists with different content.");
    revision = existing.object.sha;
  } else {
    const refs = await github.get<{ ref: string }[]>(
      `${github.base(repo)}/git/matching-refs/heads/editor/draft-${bucket}-`,
    );
    if (refs.length >= maxSessionBranches)
      throw new HttpError(429, "This draft preview session has too many builds. Open a new editor tab and try again.");
    const current = await github.get<{ commit: { sha: string } }>(
      `${github.base(repo)}/branches/${segment(request.branch)}`,
    );
    if (current.commit.sha !== base.head)
      throw new HttpError(409, "Source branch changed. Refresh and retry.");
    const commit = await github.write<{ sha: string }>(
      `${github.base(repo)}/git/commits`,
      "POST",
      { message: marker, tree: tree.sha, parents: [base.head] },
    );
    revision = commit.sha;
    try {
      await github.write(`${github.base(repo)}/git/refs`, "POST", {
        ref: `refs/heads/${draftBranch}`,
        sha: commit.sha,
    });
  } catch (error) {
      if (!(error instanceof HttpError) || ![409, 422].includes(error.status))
        throw error;
      const raced = await getExistingRef(github, repo, draftBranch);
      if (!raced) throw error;
      const existingCommit = await github.get<{
        tree: { sha: string };
        parents: { sha: string }[];
        message: string;
      }>(`${github.base(repo)}/git/commits/${raced.object.sha}`);
      if (
        existingCommit.tree.sha !== tree.sha ||
        existingCommit.parents.length !== 1 ||
        existingCommit.parents[0].sha !== base.head ||
        existingCommit.message !== marker
      )
        throw error;
      revision = raced.object.sha;
    }
  }
  const origin = previewOrigin(base.config, draftBranch);
  return {
    status: "building" as const,
    revision,
    previewUrl: `${origin}/`,
    sources,
    revisionUrl: origin + base.config.revisionPath,
  };
}
