import { payloadIdentity, workspaceKey, type AgentReceipt, type AgentWorkspace, type JsonValue, type OperationId } from "../shared/agent-command.ts";
import { draftDatabaseName, draftKey, draftStores, openDraftDatabase, type SavedDraft } from "./drafts.ts";

interface WorkspaceRecord { revision: number; generation: number }
interface Conversation { id: string; content: JsonValue }
interface Commit {
  workspace: AgentWorkspace;
  generation: number;
  expectedRevision: number;
  /**
   * draftKey and the whole record the command was planned against, or null
   * when the draft must be absent; timestamps alone cannot tell two writes apart.
   */
  expectedDrafts: [string, SavedDraft | null][];
  drafts: [string, SavedDraft | null][];
  receipt: Omit<AgentReceipt, "generation" | "revision">;
}
interface CommitResult { receipt: AgentReceipt; duplicate: boolean }

export interface AgentRecords {
  commit: (command: Commit) => Promise<CommitResult>;
  receipt: (workspace: AgentWorkspace, operationId: OperationId) => Promise<AgentReceipt | undefined>;
  workspace: (workspace: AgentWorkspace) => Promise<WorkspaceRecord>;
  setGeneration: (workspace: AgentWorkspace, expected: number, next: number) => Promise<WorkspaceRecord>;
  putConversation: (workspace: AgentWorkspace, conversation: Conversation) => Promise<void>;
  conversations: (workspace: AgentWorkspace) => Promise<Conversation[]>;
}

export class AgentRecordsError extends Error {
  constructor(public readonly code: "unavailable" | "aborted" | "conflict" | "duplicate-id", message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "AgentRecordsError";
  }
}

export function unavailableAgentRecords(): AgentRecords {
  const refuse = () => Promise.reject(new AgentRecordsError("unavailable", "Agent storage is unavailable in this browser."));
  return { commit: refuse, receipt: refuse, workspace: refuse, setGeneration: refuse, putConversation: refuse, conversations: refuse };
}

/** Agent writes never enter the manual editor's fallback or per-file retry path. */
export function indexedDbAgentRecords(name = draftDatabaseName, factory: IDBFactory | undefined = globalThis.indexedDB): AgentRecords {
  if (!factory) return unavailableAgentRecords();
  const connection = openDraftDatabase(name, factory);
  const recordKey = (workspace: AgentWorkspace, id: string) => JSON.stringify([workspaceKey(workspace), id]);
  const initial = (): WorkspaceRecord => ({ revision: 0, generation: 0 });
  type Read = <T>(request: IDBRequest<T>, use: (value: T) => void) => void;
  const run = async <T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, read: Read, done: (result: T) => void) => void): Promise<T> => {
    let db: IDBDatabase;
    try { db = await connection.open(); }
    catch (cause) { throw new AgentRecordsError("unavailable", "Agent storage could not be opened.", cause); }
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction(stores, mode); }
      catch (cause) { reject(new AgentRecordsError("aborted", "Agent storage transaction could not start.", cause)); return; }
      let result: T;
      let failure: AgentRecordsError | undefined;
      const abort = (cause: unknown) => {
        failure = cause instanceof AgentRecordsError ? cause : new AgentRecordsError("aborted", "Agent storage transaction failed.", cause);
        tx.abort();
      };
      // Request success is not proof of persistence. Only complete resolves a write.
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? new AgentRecordsError("aborted", "Agent storage transaction aborted.", tx.error));
      const read: Read = (request, use) => {
        request.onsuccess = () => { try { use(request.result); } catch (cause) { abort(cause); } };
      };
      try { work(tx, read, (value) => { result = value; }); } catch (cause) { abort(cause); }
    });
  };
  const conflict = () => { throw new AgentRecordsError("conflict", "Agent workspace or draft changed."); };
  return {
    async commit(command) {
      // Snapshot all proofs and writes before opening; callers may change during that await.
      const { workspace, generation, expectedRevision, expectedDrafts, drafts, receipt } = structuredClone(command);
      const key = workspaceKey(workspace), receiptKey = recordKey(workspace, receipt.operationId);
      return run<CommitResult>([draftStores.drafts, draftStores.receipts, draftStores.workspaces], "readwrite", (tx, read, done) => {
        const receipts = tx.objectStore(draftStores.receipts), workspaces = tx.objectStore(draftStores.workspaces), files = tx.objectStore(draftStores.drafts);
        read(receipts.get(receiptKey), (recorded: AgentReceipt | undefined) => {
          if (recorded) {
            if (recorded.payloadIdentity !== receipt.payloadIdentity) throw new AgentRecordsError("duplicate-id", "Operation identifier was reused for different work.");
            done({ receipt: recorded, duplicate: true });
            return;
          }
          read(workspaces.get(key), (stored: WorkspaceRecord | undefined) => {
            const current = stored ?? initial();
            if (current.generation !== generation || current.revision !== expectedRevision) conflict();
            // Removing the empty path's JSON suffix leaves the workspace's draft-key prefix.
            const from = draftKey({ ...workspace, repo: "" }, "").slice(0, -3);
            const expected = new Map(expectedDrafts);
            for (const [draft, value] of drafts) {
              if (!draft.startsWith(from) || !expected.has(draft) || (value &&
                (workspaceKey(value) !== key || draftKey(value, value.path) !== draft))) conflict();
            }
            const apply = () => {
              const committed: AgentReceipt = { ...receipt, generation, revision: current.revision + 1 };
              for (const [draft, value] of drafts) value ? files.put(value, draft) : files.delete(draft);
              receipts.put(committed, receiptKey);
              workspaces.put({ ...current, revision: committed.revision }, key);
              done({ receipt: committed, duplicate: false });
            };
            let remaining = expectedDrafts.length;
            if (!remaining) apply();
            // A JSON round trip drops undefined fields, so a record and its stored copy compare equal.
            const same = (value: SavedDraft | null | undefined) => value ? payloadIdentity(JSON.parse(JSON.stringify(value)) as JsonValue) : null;
            for (const [draft, wanted] of expectedDrafts) {
              if (!draft.startsWith(from)) conflict();
              read(files.get(draft), (saved: SavedDraft | undefined) => {
                if (same(saved) !== same(wanted)) conflict();
                if (--remaining === 0) apply();
              });
            }
          });
        });
      });
    },
    receipt(workspace, operationId) {
      const key = recordKey(workspace, operationId);
      return run([draftStores.receipts], "readonly", (tx, read, done) => read(tx.objectStore(draftStores.receipts).get(key), done));
    },
    workspace(workspace) {
      const key = workspaceKey(workspace);
      return run([draftStores.workspaces], "readonly", (tx, read, done) => read(tx.objectStore(draftStores.workspaces).get(key), (value: WorkspaceRecord | undefined) => done(value ?? initial())));
    },
    setGeneration(workspace, expected, next) {
      const key = workspaceKey(workspace);
      return run([draftStores.workspaces], "readwrite", (tx, read, done) => {
        const store = tx.objectStore(draftStores.workspaces);
        read(store.get(key), (value: WorkspaceRecord | undefined) => {
          const current = value ?? initial();
          // Generations only increase, so a fence once passed can never be reused.
          if (current.generation !== expected || !Number.isSafeInteger(next) || next <= current.generation) conflict();
          const changed = { ...current, generation: next };
          store.put(changed, key);
          done(changed);
        });
      });
    },
    putConversation(workspace, conversation) {
      const key = recordKey(workspace, conversation.id), record = { workspace: workspaceKey(workspace), conversation: structuredClone(conversation) };
      return run([draftStores.conversations], "readwrite", (tx, _read, done) => { tx.objectStore(draftStores.conversations).put(record, key); done(undefined); });
    },
    conversations(workspace) {
      const key = workspaceKey(workspace);
      return run([draftStores.conversations], "readonly", (tx, read, done) => {
        read(tx.objectStore(draftStores.conversations).getAll(), (records: { workspace: string; conversation: Conversation }[]) => done(records.filter((record) => record.workspace === key).map((record) => record.conversation)));
      });
    },
  };
}
