import { payloadIdentity, workspaceKey, type AgentOutcome, type AgentReceipt, type AgentWorkspace, type JsonValue, type OperationId } from "../shared/agent-command.ts";
import { draftDatabaseName, draftKey, draftStores, openDraftDatabase, type SavedDraft } from "./drafts.ts";

interface WorkspaceRecord { revision: number; generation: number; paused?: boolean }
interface WorkspaceSnapshot extends WorkspaceRecord { drafts: [string, SavedDraft][] }
interface Conversation { id: string; content: JsonValue }
export interface AgentCommit {
  workspace: AgentWorkspace;
  generation: number;
  expectedRevision: number;
  /**
   * draftKey and the whole record the command was planned against, or null
   * when the draft must be absent; timestamps alone cannot tell two writes apart.
   */
  expectedDrafts: [string, SavedDraft | null][];
  drafts: [string, SavedDraft | null][];
  receipt: Omit<AgentReceipt, "workspace" | "generation" | "revision">;
}
interface CommitResult { receipt: AgentReceipt; duplicate: boolean }
type CancellationResult = { status: "unknown" } | { status: "applied"; receipt: AgentReceipt };

export interface AgentRecords {
  commit: (command: AgentCommit) => Promise<CommitResult>;
  /** Fences future delivery; without a live receipt the past outcome remains unknown. */
  cancel: (workspace: AgentWorkspace, operationId: OperationId, authorizationId: string) => Promise<CancellationResult>;
  receipt: (workspace: AgentWorkspace, operationId: OperationId, authorizationId: string) => Promise<AgentReceipt | undefined>;
  /** With `owner`, the same transaction also proves that generation still owns the workspace unpaused. */
  reconcile: (workspace: AgentWorkspace, commands: AgentCommit[], owner?: number) => Promise<AgentOutcome[]>;
  workspace: (workspace: AgentWorkspace) => Promise<WorkspaceRecord>;
  setGeneration: (workspace: AgentWorkspace, expected: number, next: number, snapshot?: WorkspaceSnapshot) => Promise<WorkspaceRecord>;
  pause: (workspace: AgentWorkspace, generation: number) => Promise<void>;
  snapshot: (workspace: AgentWorkspace) => Promise<WorkspaceSnapshot>;
  revoke: (workspace: AgentWorkspace, authorizationId: string) => Promise<AgentReceipt[]>;
  evictReceipts: (workspace: AgentWorkspace, now?: number) => Promise<number>;
  putConversation: (workspace: AgentWorkspace, conversation: Conversation) => Promise<void>;
  conversations: (workspace: AgentWorkspace) => Promise<Conversation[]>;
}

export class AgentRecordsError extends Error {
  constructor(public readonly code: "unavailable" | "aborted" | "conflict" | "duplicate-id" | "revoked" | "cancelled" | "not-owner" | "capacity", message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "AgentRecordsError";
  }
}

export function unavailableAgentRecords(): AgentRecords {
  const refuse = () => Promise.reject(new AgentRecordsError("unavailable", "Agent storage is unavailable in this browser."));
  return { reconcile: refuse, pause: refuse, snapshot: refuse, revoke: refuse, cancel: refuse, evictReceipts: refuse, commit: refuse, receipt: refuse, workspace: refuse, setGeneration: refuse, putConversation: refuse, conversations: refuse };
}

/** Agent writes never enter the manual editor's fallback or per-file retry path. */
export function indexedDbAgentRecords(name = draftDatabaseName, factory: IDBFactory | undefined = globalThis.indexedDB, now = Date.now): AgentRecords {
  if (!factory) return unavailableAgentRecords();
  const connection = openDraftDatabase(name, factory);
  const recordKey = (workspace: AgentWorkspace, id: string) => JSON.stringify([workspaceKey(workspace), id]);
  const initial = (): WorkspaceRecord => ({ revision: 0, generation: 0 });
  const revocationKey = (workspace: AgentWorkspace, authorizationId: string) => JSON.stringify(["revoked", workspaceKey(workspace), authorizationId]);
  const cancellationKey = (workspace: AgentWorkspace, operationId: OperationId, authorizationId: string) => JSON.stringify(["cancelled", workspaceKey(workspace), authorizationId, operationId]);
  const expired = (receipt: AgentReceipt, time = now()) => receipt.createdAt <= time - 24 * 60 * 60 * 1000;
  const same = (value: SavedDraft | null | undefined) => value ? payloadIdentity(JSON.parse(JSON.stringify(value)) as JsonValue) : null;
  const belongs = (key: string, workspace: AgentWorkspace) => key.startsWith(draftKey({ ...workspace, repo: "" }, "").slice(0, -3));
  const bytes = (key: string, receipt: AgentReceipt) => new TextEncoder().encode(JSON.stringify([key, receipt])).byteLength;
  // All receipts are completed: pending work is never stored in this store.
  const retention = (rows: [string, AgentReceipt][], time: number, incoming?: [string, AgentReceipt]) => {
    const limit = 1024 * 1024;
    if (incoming && bytes(...incoming) > limit) throw new AgentRecordsError("capacity", "Required edit receipt exceeds the workspace budget.");
    rows.sort((a, b) => a[1].createdAt - b[1].createdAt || a[0].localeCompare(b[0]));
    let size = rows.reduce((sum, row) => sum + bytes(...row), 0) + (incoming ? bytes(...incoming) : 0);
    let count = rows.length + (incoming ? 1 : 0);
    const removed: string[] = [];
    for (const [key, receipt] of rows) {
      if (!expired(receipt, time) && count <= 1000 && size <= limit) break;
      removed.push(key); count--; size -= bytes(key, receipt);
    }
    return removed;
  };
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
        read(workspaces.get(revocationKey(workspace, receipt.authorizationId)), (revoked: unknown) => {
          if (revoked) throw new AgentRecordsError("revoked", "Agent authorization has been revoked.");
          read(receipts.getAll(), (all: AgentReceipt[]) => {
            // A live operation id cannot be rebound to another workspace or authorization.
            const recorded = all.find((value) => value.operationId === receipt.operationId);
            if (recorded) {
              if (recorded.workspace !== key || recorded.authorizationId !== receipt.authorizationId ||
                recorded.generation !== generation || recorded.payloadIdentity !== receipt.payloadIdentity)
                throw new AgentRecordsError("duplicate-id", "Operation identifier was reused for different work.");
              // Keep refusing this identifier even if a caller supplies fresh revision proofs.
              if (expired(recorded)) conflict();
              done({ receipt: recorded, duplicate: true });
              return;
            }
            read(workspaces.get(cancellationKey(workspace, receipt.operationId, receipt.authorizationId)), (cancelled: unknown) => {
              if (cancelled) throw new AgentRecordsError("cancelled", "Agent operation has been cancelled.");
              read(workspaces.get(key), (stored: WorkspaceRecord | undefined) => {
                const current = stored ?? initial();
                if (!receipt.authorizationId || !Number.isSafeInteger(generation) || !Number.isSafeInteger(expectedRevision) ||
                  current.paused || current.generation !== generation || current.revision !== expectedRevision) conflict();
                const expected = new Map(expectedDrafts);
                if (expected.size !== expectedDrafts.length || new Set(drafts.map(([key]) => key)).size !== drafts.length) conflict();
                for (const [draft, value] of drafts) {
                  if (!belongs(draft, workspace) || !expected.has(draft) || (value &&
                    (workspaceKey(value) !== key || draftKey(value, value.path) !== draft))) conflict();
                }
                const apply = () => {
                  const committed: AgentReceipt = { ...receipt, workspace: key, generation, revision: current.revision + 1, createdAt: now() };
                  const rows: [string, AgentReceipt][] = all.filter((value) => value.workspace === key).map((value) => [recordKey(workspace, value.operationId), value]);
                  for (const expired of retention(rows, committed.createdAt, [receiptKey, committed])) receipts.delete(expired);
                  for (const [draft, value] of drafts) value ? files.put(value, draft) : files.delete(draft);
                  receipts.put(committed, receiptKey);
                  workspaces.put({ ...current, revision: committed.revision }, key);
                  done({ receipt: committed, duplicate: false });
                };
                let remaining = expectedDrafts.length;
                if (!remaining) apply();
                for (const [draft, wanted] of expectedDrafts) {
                  if (!belongs(draft, workspace)) conflict();
                  read(files.get(draft), (saved: SavedDraft | undefined) => {
                    if (same(saved) !== same(wanted)) conflict();
                    if (--remaining === 0) apply();
                  });
                }
              });
            });
          });
        });
      });
    },
    cancel(workspace, operationId, authorizationId) {
      const key = recordKey(workspace, operationId), cancelledKey = cancellationKey(workspace, operationId, authorizationId);
      const revokedKey = revocationKey(workspace, authorizationId);
      return run([draftStores.workspaces, draftStores.receipts], "readwrite", (tx, read, done) => {
        const workspaces = tx.objectStore(draftStores.workspaces), receipts = tx.objectStore(draftStores.receipts);
        read(workspaces.get(revokedKey), (revoked: unknown) => {
          if (revoked) throw new AgentRecordsError("revoked", "Agent authorization has been revoked.");
          read(receipts.get(key), (receipt: AgentReceipt | undefined) => {
            if (receipt && !expired(receipt)) {
              if (receipt.authorizationId !== authorizationId) throw new AgentRecordsError("duplicate-id", "Operation authorization differs.");
              done({ status: "applied", receipt });
              return;
            }
            if (receipt) receipts.delete(key);
            // This tombstone prevents future application, but cannot prove whether an
            // unknown operation applied before its receipt expired or was evicted.
            workspaces.put({ cancelled: true }, cancelledKey);
            done({ status: "unknown" });
          });
        });
      });
    },
    receipt(workspace, operationId, authorizationId) {
      const key = recordKey(workspace, operationId), revokedKey = revocationKey(workspace, authorizationId);
      return run([draftStores.receipts, draftStores.workspaces], "readonly", (tx, read, done) => {
        read(tx.objectStore(draftStores.workspaces).get(revokedKey), (revoked: unknown) => {
          if (revoked) throw new AgentRecordsError("revoked", "Agent authorization has been revoked.");
          read(tx.objectStore(draftStores.receipts).get(key), (receipt: AgentReceipt | undefined) => {
            if (receipt && expired(receipt)) { done(undefined); return; }
            if (receipt && receipt.authorizationId !== authorizationId) throw new AgentRecordsError("duplicate-id", "Operation authorization differs.");
            done(receipt);
          });
        });
      });
    },
    reconcile(workspace, commands, owner) {
      const scope = structuredClone(workspace), key = workspaceKey(scope), pending = structuredClone(commands);
      return run([draftStores.workspaces, draftStores.receipts], "readonly", (tx, read, done) => {
        const outcomes: AgentOutcome[] = [];
        let remaining = pending.length;
        if (owner !== undefined) read(tx.objectStore(draftStores.workspaces).get(key), (stored: WorkspaceRecord | undefined) => {
          const current = stored ?? initial();
          if (current.generation !== owner || current.paused) throw new AgentRecordsError("not-owner", "Agent ownership was superseded during takeover.");
        });
        if (!remaining) { done(outcomes); return; }
        for (const [index, command] of pending.entries()) {
          if (workspaceKey(command.workspace) !== key) conflict();
          const { operationId, authorizationId, payloadIdentity } = command.receipt;
          const finish = (receipt?: AgentReceipt) => {
            if (receipt && expired(receipt)) receipt = undefined;
            if (receipt && (receipt.authorizationId !== authorizationId || receipt.generation !== command.generation || receipt.payloadIdentity !== payloadIdentity))
              throw new AgentRecordsError("duplicate-id", "Outstanding command identity differs from its receipt.");
            outcomes[index] = receipt ? { operationId, status: "applied", receipt } : { operationId, status: "unknown" };
            if (--remaining === 0) done(outcomes);
          };
          read(tx.objectStore(draftStores.workspaces).get(revocationKey(scope, authorizationId)), (revoked: unknown) => {
            if (revoked) { finish(); return; }
            read(tx.objectStore(draftStores.receipts).get(recordKey(scope, operationId)), finish);
          });
        }
      });
    },
    workspace(workspace) {
      const key = workspaceKey(workspace);
      return run([draftStores.workspaces], "readonly", (tx, read, done) => read(tx.objectStore(draftStores.workspaces).get(key), (value: WorkspaceRecord | undefined) => done(value ?? initial())));
    },
    setGeneration(workspace, expected, next, snapshot) {
      const proof = snapshot && structuredClone(snapshot);
      const scope = structuredClone(workspace);
      const key = workspaceKey(workspace);
      return run([draftStores.workspaces, draftStores.drafts], "readwrite", (tx, read, done) => {
        const store = tx.objectStore(draftStores.workspaces);
        read(store.get(key), (value: WorkspaceRecord | undefined) => {
          const current = value ?? initial();
          // Generations only increase, so a fence once passed can never be reused.
          if (current.generation !== expected || !Number.isSafeInteger(next) || next <= current.generation) conflict();
          const change = () => {
            const changed: WorkspaceRecord = { revision: current.revision, generation: next };
            store.put(changed, key);
            done(changed);
          };
          if (!proof) { change(); return; }
          if (proof.revision !== current.revision || proof.generation !== expected) conflict();
          read(tx.objectStore(draftStores.drafts).getAllKeys(), (keys) => {
            read(tx.objectStore(draftStores.drafts).getAll(), (values: SavedDraft[]) => {
              const expected = new Map(proof.drafts);
              const actual = keys.map((key, i) => [String(key), values[i]] as const).filter(([key]) => belongs(key, scope));
              if (actual.length !== expected.size || actual.some(([key, value]) => same(value) !== same(expected.get(key)))) conflict();
              change();
            });
          });
        });
      });
    },
    pause(workspace, generation) {
      const key = workspaceKey(workspace);
      return run([draftStores.workspaces], "readwrite", (tx, read, done) => {
        const store = tx.objectStore(draftStores.workspaces);
        read(store.get(key), (stored: WorkspaceRecord | undefined) => {
          const current = stored ?? initial();
          if (current.generation !== generation) conflict();
          store.put({ ...current, paused: true }, key);
          done(undefined);
        });
      });
    },
    snapshot(workspace) {
      const scope = structuredClone(workspace), key = workspaceKey(scope);
      return run([draftStores.workspaces, draftStores.drafts], "readonly", (tx, read, done) => {
        read(tx.objectStore(draftStores.workspaces).get(key), (stored: WorkspaceRecord | undefined) => {
          const store = tx.objectStore(draftStores.drafts);
          read(store.getAllKeys(), (keys) => read(store.getAll(), (values: SavedDraft[]) => {
            const drafts: [string, SavedDraft][] = keys.map((key, i) => [String(key), values[i]]);
            done({ ...(stored ?? initial()), drafts: drafts.filter(([key]) => belongs(key, scope)) });
          }));
        });
      });
    },
    revoke(workspace, authorizationId) {
      const scope = structuredClone(workspace), key = workspaceKey(scope), revokedKey = revocationKey(scope, authorizationId);
      return run([draftStores.workspaces, draftStores.receipts], "readwrite", (tx, read, done) => {
        tx.objectStore(draftStores.workspaces).put({ revoked: true }, revokedKey);
        read(tx.objectStore(draftStores.receipts).getAll(), (receipts: AgentReceipt[]) => {
          // Report work that won before revocation; never undo committed drafts.
          const live: AgentReceipt[] = [];
          for (const receipt of receipts) {
            if (receipt.workspace !== key) continue;
            if (expired(receipt)) tx.objectStore(draftStores.receipts).delete(recordKey(scope, receipt.operationId));
            else if (receipt.authorizationId === authorizationId) live.push(receipt);
          }
          done(live);
        });
      });
    },
    evictReceipts(workspace, time = now()) {
      const key = workspaceKey(workspace), scope = structuredClone(workspace);
      return run([draftStores.receipts], "readwrite", (tx, read, done) => {
        const store = tx.objectStore(draftStores.receipts);
        read(store.getAll(), (receipts: AgentReceipt[]) => {
          const rows: [string, AgentReceipt][] = receipts.filter((receipt) => receipt.workspace === key).map((receipt) => [recordKey(scope, receipt.operationId), receipt]);
          const removed = retention(rows, time);
          for (const key of removed) store.delete(key);
          done(removed.length);
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
