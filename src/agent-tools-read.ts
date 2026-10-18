import type { AgentRead, AgentReadResult } from "../shared/agent-read";
import { HttpError } from "../shared/http-error";
import { executeAgentRead } from "../shared/agent-read";
import { SiteFiles, type SiteFileReader } from "../shared/site-files";
import type { Repository, Snapshot, EditorContext } from "../shared/types";
import type { RepositoryApi } from "./repository-loading";
import type { SharedContext } from "./agent-site";
import type { Stamp } from "./guarded-edit";
import { createAgentTools, type AgentToolExecutor } from "./agent-tools";

export interface AgentReadFiles {
  repo: Repository;
  snapshot: Snapshot;
  api: RepositoryApi;
  read(repo: string, sha: string): Promise<string>;
  batch(repo: string, shas: string[]): Promise<Record<string, string>>;
  has(repo: string, sha: string): boolean;
}
export interface AgentReadPorts {
  stamp(): Stamp;
  context(): Promise<SharedContext | undefined>;
  files(): AgentReadFiles | undefined;
  /** The live source a page edit starts from (media place/frame/loop proofs). */
  source?(path: string): string | undefined;
}

/** The browser's existing tree/blob readers and clean cache, pinned before any await. */
export function agentFileReader(ports: AgentReadFiles, context: EditorContext, signal?: AbortSignal): SiteFileReader {
  const { repo, snapshot, api } = ports;
  if (repo.id !== context.repository.id || snapshot.branch !== context.branch || snapshot.commit !== context.commit)
    throw new Error("The editor changed branch or revision. Read the site again.");
  return {
    async commitTree() {
      signal?.throwIfAborted();
      if (snapshot.tree) return snapshot.tree;
      // Walk every saved root, including folders the editor normally hides, and retain folders/submodules.
      const roots = snapshot.entries;
      const nested = await Promise.all(roots.filter(entry => entry.type === "tree").map(async entry => {
        signal?.throwIfAborted();
        const directory = await api<import("../shared/types").Directory>("tree", { repo: repo.full_name, sha: entry.sha, recursive: "1" });
        signal?.throwIfAborted();
        return directory.entries.map(item => ({ ...item, path: `${entry.path}/${item.path}` }));
      }));
      return [...roots, ...nested.flat()];
    },
    file: async (_repo, sha) => {
      try { signal?.throwIfAborted(); const text = await ports.read(repo.full_name, sha); signal?.throwIfAborted(); return text; }
      catch (error) { throw readError(error); }
    },
    prefetchTexts: async (_repo, shas) => {
      try { signal?.throwIfAborted(); await ports.batch(repo.full_name, shas); signal?.throwIfAborted(); }
      catch (error) {
        const failure = readError(error);
        // The browser batch reader omits missing/unreadable blobs. SiteFiles reads those singly,
        // within its existing budget, so one bad file is listed in unreadable, as on the Worker.
        if (failure instanceof HttpError && [404, 413, 415].includes(failure.status) ||
            failure instanceof Error && failure.message === "Could not read this file.") return;
        throw failure;
      }
    },
    hasText: (_repo, sha) => ports.has(repo.full_name, sha),
  };
}

function readError(error: unknown) {
  return error instanceof Error && "status" in error && typeof error.status === "number"
    ? new HttpError(error.status, error.message) : error;
}

export function createAgentReadTools(ports: AgentReadPorts) {
  const executor = (tool: AgentRead["tool"]): AgentToolExecutor => async (args, signal) => {
    const stamp = ports.stamp(), source = ports.files();
    const repoId = source?.repo.id, branch = source?.snapshot.branch, commit = source?.snapshot.commit;
    const stale = () => {
      signal?.throwIfAborted();
      const now = ports.files();
      if (!stamp.holds() || now?.repo.id !== repoId || now?.snapshot.branch !== branch || now?.snapshot.commit !== commit)
        throw new Error("The editor changed branch or revision. Read the site again.");
    };
    try {
      stale();
      if (!source) throw new Error("The editor is unavailable. Open the connected site and branch, then read the site again.");
      const shared = await ports.context();
      stale();
      if (!shared) throw new Error("The editor is unavailable. Open the connected site and branch, then read the site again.");
      const files = new SiteFiles(agentFileReader(source, shared.context, signal), source.repo, shared.context, async hash => shared.texts.get(hash));
      const result = await executeAgentRead({ operation: "read", tool, args }, shared.context, files);
      stale();
      // Leave space for the relay's correlation/scope envelope, including JSON escaping and UTF-8.
      if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 8 * 1024 * 1024 - 4096)
        return { ok: false, message: "The result is too large. Export a folder with export_site instead." };
      return result;
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "The browser read failed." } satisfies AgentReadResult;
    }
  };
  return createAgentTools({ get_site: executor("get_site"), list_files: executor("list_files"), read_file: executor("read_file"),
    export_site: executor("export_site"), get_page: executor("get_page"), get_selection: executor("get_selection") });
}
