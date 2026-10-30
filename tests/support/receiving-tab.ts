// A receiving editor tab over the real runtime socket, for the MCP tests (tests/mcp-runtime.test.ts) and the
// helper's (tests/editor-helper.test.ts): the browser's read, edit, media and request tools answer the relay.
import { textHash, type AgentCommand, type AgentRequest } from "../../shared/agent";
import type { EditorContext, Snapshot } from "../../shared/types";
import { createRequestTools } from "../../src/agent-watch";
import { createAgentReadTools, type AgentReadPorts } from "../../src/agent-tools-read";
import { createAgentEditTools } from "../../src/agent-tools-edit";
import { createAgentMediaTools } from "../../src/agent-tools-media";
import { indexedDbAgentRecords } from "../../src/agent-records";
import { GitHub } from "../../worker/github";
import { fakeIndexedDB } from "./fake-agent-indexeddb";
import { editorTab, fakeGitHub, githubState, origin, repo, type startWorker } from "../mcp-harness";

/** A receiving tab over the real runtime socket. Content and receipts live in the test browser,
 * never in SessionStore. The host executor captures prepared commands for contract assertions. */
export async function receivingTab(worker: Awaited<ReturnType<typeof startWorker>>["worker"], cookie: string,
  state = githubState(), options: { pinsGoTo?: () => string } = {}) {
  const tab = editorTab(worker, cookie), workspace = { account: "lex", repoId: repo.id, branch: "main" };
  const scope = { workspace, tabId: tab.tabId, generation: 1 };
  const github = new GitHub("github-private-token", (input, init) => fakeGitHub(new Request(input, init), state));
  const records = indexedDbAgentRecords("runtime", fakeIndexedDB().factory);
  const owner = await records.setFence(workspace, 0, 1);
  const snapshot: Snapshot = { branch: "main", commit: "c".repeat(40), entries: [] };
  let context: EditorContext | undefined;
  const commands: AgentCommand[] = [];
  // Every command the relay delivers, reads included, as sent.
  const received: { operation: string; id?: string; tool?: string; agent?: string }[] = [];
  const results = new Map<string, AgentCommand["result"]>();
  const source = { repo, snapshot, api: async <T>() => ({ entries: [] }) as T,
    read: (_repo: string, sha: string) => github.file(repo, sha),
    batch: async (_repo: string, shas: string[]) => {
      await github.prefetchTexts(repo, shas);
      return Object.fromEntries(await Promise.all(shas.filter(sha => github.hasText(repo, sha)).map(async sha => [sha, await github.file(repo, sha)])));
    }, has: (_repo: string, sha: string) => github.hasText(repo, sha) };
  const ports = {
    stamp: () => ({ holds: () => true, changed: () => undefined }), files: () => source,
    context: async () => {
      if (!context) return undefined;
      if (context.pages) snapshot.tree ??= await github.commitTree(repo, context.commit);
      return { context, texts: new Map(context.drafts.flatMap(draft => draft.hash && draft.content !== undefined ? [[draft.hash, draft.content]] : [])) };
    },
  } satisfies AgentReadPorts;
  const run = async (command: AgentCommand) => {
    commands.push(command);
    const outcome = { message: "Changed.", result: results.get(command.id) ?? { hash: "f".repeat(64) } };
    const current = await records.workspace(workspace);
    await records.commit({ workspace, fence: owner.generation, expectedRevision: current.revision, expectedDrafts: [], drafts: [],
      receipt: { operationId: command.id, authorizationId: command.grantId!, payloadIdentity: command.requestIdentity!, outcome,
        issuedAt: command.createdAt, createdAt: Date.now() } });
    return outcome;
  };
  const reads = createAgentReadTools(ports), edits = createAgentEditTools({ workspace, ports, records, run });
  const media = createAgentMediaTools({ workspace, ports, records, run });
  const conversations = new Map<string, AgentRequest>();
  const requests = createRequestTools({ workspace, ...(options.pinsGoTo ? { pinsGoTo: options.pinsGoTo } : {}), list: async () => structuredClone([...conversations.values()]),
    save: async (request, accept) => { if (!accept(conversations.get(request.id))) return false; conversations.set(request.id, request); return true; } });
  let socket: Awaited<ReturnType<typeof worker.dispatchFetch>>["webSocket"];
  return {
    ...tab, commands, received, results, conversations,
    inspect: async () => ({ ...await (await worker.dispatchFetch(origin + "/api/agent/connections", { headers: { Cookie: cookie } })).json(), commands }),
    async show(next: EditorContext) {
      context = structuredClone(next);
      snapshot.commit = context.commit; snapshot.branch = context.branch;
      snapshot.tree = context.pages ? await github.commitTree(repo, context.commit).catch(() => undefined) : [];
      for (const draft of context.drafts) if (draft.content !== undefined) draft.hash ??= await textHash(draft.content);
      if (!socket) {
        const response = await worker.dispatchFetch(`${origin}/api/agent/relay?${new URLSearchParams({ repo: repo.full_name, branch: "main", tabId: tab.tabId, generation: "1" })}`, {
          headers: { Origin: origin, Cookie: cookie, Upgrade: "websocket" },
        });
        socket = response.webSocket!; socket.accept();
        const ready = new Promise<void>((resolve, reject) => socket!.addEventListener("message", event => {
          void (async () => {
          const value = JSON.parse(String(event.data));
          if (value.type === "ready") { resolve(); return; }
          if (value.type !== "command") return;
          const request = value.command;
          received.push(request);
          const result = context?.repository.id !== repo.id || context.branch !== "main"
            ? { ok: false, message: "The editor is not sharing this workspace." }
            : request.operation === "read" ? await reads.run(request.tool, request.args)
            : request.operation === "requests" ? await requests.run(request, () => true, Date.now() + 24_000)
            : request.operation === "media" ? await media.run(request, owner.generation, () => true)
            : await edits.run(request, owner.generation, () => true);
          socket!.send(JSON.stringify({ type: "result", id: value.id, ...scope, result }));
          })().catch(reject);
        }));
        socket.send(JSON.stringify({ type: "handshake", ...scope, owner: true }));
        await ready;
      }
      return { status: 200 };
    },
  };
}
