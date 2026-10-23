import { payloadIdentity, workspaceKey, type AgentOutcome, type AgentReceipt, type AgentWorkspace, type JsonValue, type OperationId } from "../shared/agent-command.ts";
import { draftDatabaseName, draftKey, draftStores, openDraftDatabase, type SavedDraft } from "./drafts.ts";
import { OPEN_REQUESTS_LIMIT, type AgentRequestState } from "../shared/agent.ts";

/**
 * `horizon`: the latest issue time (AgentReceipt.issuedAt) of an operation whose receipt or
 * retired marker this workspace dropped. A delivery without a live receipt issued at or before
 * it stays unknown and never applies as a fresh edit.
 */
/** `generation`: the stored name of the receiving tab's ownership fence. */
interface WorkspaceRecord { revision: number; generation: number; paused?: boolean; horizon?: number }
interface WorkspaceSnapshot extends WorkspaceRecord { drafts: [string, SavedDraft][] }
/**
 * An Ask agent request as this browser keeps it for one workspace. `unfinished` ones wait for an
 * agent or for the user's answer; `updatedAt` is when it last changed here, which a completed
 * one's seven days count from.
 */
export interface Conversation { id: string; content: JsonValue; unfinished: boolean; updatedAt: number }
export interface AgentCommit {
  workspace: AgentWorkspace;
  /** The receiving tab's ownership fence; receipts keep it as `generation`. */
  fence: number;
  expectedRevision: number;
  /**
   * draftKey and the whole record the command was planned against, or null
   * when the draft must be absent; timestamps alone cannot tell two writes apart.
   */
  expectedDrafts: [string, SavedDraft | null][];
  drafts: [string, SavedDraft | null][];
  receipt: Omit<AgentReceipt, "workspace" | "generation" | "revision">;
}
interface ConversationRecord { workspace: string; conversation: Conversation }
interface CommitResult { receipt: AgentReceipt; duplicate: boolean }
type CancellationResult = { status: "unknown" | "cancelled" } | { status: "applied"; receipt: AgentReceipt };

export interface AgentRecords {
  commit: (command: AgentCommit) => Promise<CommitResult>;
  /** Fences future delivery. Only an abort of a live in-flight delivery can prove cancellation. */
  cancel: (workspace: AgentWorkspace, operationId: OperationId, authorizationId: string, options?: { live: true }) => Promise<CancellationResult>;
  status: (workspace: AgentWorkspace, operationId: OperationId, authorizationId: string) => Promise<CancellationResult>;
  receipt: (workspace: AgentWorkspace, operationId: OperationId, authorizationId: string) => Promise<AgentReceipt | undefined>;
  /** With `owner`, the same transaction also proves that fence still owns the workspace unpaused. */
  reconcile: (workspace: AgentWorkspace, commands: AgentCommit[], owner?: number) => Promise<AgentOutcome[]>;
  workspace: (workspace: AgentWorkspace) => Promise<WorkspaceRecord>;
  setFence: (workspace: AgentWorkspace, expected: number, next: number, snapshot?: WorkspaceSnapshot) => Promise<WorkspaceRecord>;
  pause: (workspace: AgentWorkspace, fence: number) => Promise<void>;
  snapshot: (workspace: AgentWorkspace) => Promise<WorkspaceSnapshot>;
  revoke: (workspace: AgentWorkspace, authorizationId: string) => Promise<AgentReceipt[]>;
  evictReceipts: (workspace: AgentWorkspace, now?: number) => Promise<number>;
  /**
   * Stores one conversation, evicting expired and then oldest completed ones; refuses at capacity.
   * With `accept`, the same transaction first asks it about the stored one (none when absent) and
   * writes nothing, resolving false, when it says no. With `owner` (an agent's take or reply, ticket 18), the
   * same transaction also proves that fence still owns the workspace unpaused, else resolves false.
   */
  putConversation: (workspace: AgentWorkspace, conversation: Conversation, accept?: (stored: Conversation | undefined) => boolean, owner?: number) => Promise<boolean>;
  /** Whether putConversation would accept it now, without writing (before asking an agent). */
  checkConversation: (workspace: AgentWorkspace, conversation: Conversation) => Promise<void>;
  /** The workspace's unfinished conversations and its completed ones younger than seven days. */
  conversations: (workspace: AgentWorkspace) => Promise<Conversation[]>;
}

/**
 * Small fences kept beside a workspace's receipts (in the `workspaces` store): a retired marker for
 * a receipt evicted before its 24 hours ended (so an agent reusing that operation id meanwhile
 * stays unknown), a cancellation tombstone and an authorization revocation. Each is kept 24 hours.
 */
type Fence = { retired: true; workspace: string; operationId: OperationId; issuedAt: number; createdAt: number } |
  { cancelled: true; workspace: string; at: number; definite?: boolean; uncertain?: boolean } | { revoked: true; workspace: string; at: number };

/** Per account/repository/branch workspace: receipts are kept 24 hours, at most 1,000 of them. */
export const RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1000;
export const RECEIPT_LIMIT = 1000;
/** Receipts and fences of one workspace, serialized ([key, value] JSON). */
export const RECEIPT_BUDGET_BYTES = 1024 * 1024;
/**
 * A command issued longer ago than this is refused as unknown: the fences that would have
 * refused its late delivery may have aged out (24 hours less one for clock differences).
 */
export const COMMAND_MAX_AGE_MS = 23 * 60 * 60 * 1000;
/**
 * On a full storage, completed receipts older than this may go before their 24 hours: a lost
 * reply is asked again within the browser receipt retention period.
 */
export const QUOTA_RECEIPT_AGE_MS = 10 * 60 * 1000;
const recordBytes = (key: string, value: unknown) => new TextEncoder().encode(JSON.stringify([key, value])).byteLength;
const retiredKey = (workspace: string, operationId: OperationId) => JSON.stringify(["retired", workspace, operationId]);
const fenceTime = (fence: Fence) => "retired" in fence ? fence.createdAt : fence.at;

/**
 * What one workspace drops to keep its receipts within 24 hours, RECEIPT_LIMIT and
 * RECEIPT_BUDGET_BYTES, with `incoming` (a receipt about to be written, never dropped) counted.
 * Aged-out receipts and fences go first; then the oldest receipts, each leaving a retired marker
 * that keeps refusing its operation id (whatever issue time comes with it) until the receipt's 24
 * hours end. Markers, cancellations and revocations only age out (a fence is never dropped early);
 * if they and `incoming` cannot fit, `incoming` is refused before anything is written. `horizon`
 * is the latest issue time of any receipt or marker dropped: the workspace keeps refusing
 * deliveries issued at or before it.
 */
export function receiptRetention(receipts: [string, AgentReceipt][], fences: [string, Fence][], time: number, incoming?: [string, AgentReceipt]) {
  const cutoff = time - RECEIPT_RETENTION_MS;
  const remove: string[] = [];
  let horizon = 0, size = incoming ? recordBytes(...incoming) : 0;
  const raise = (issuedAt: unknown) => { if (typeof issuedAt === "number" && Number.isFinite(issuedAt)) horizon = Math.max(horizon, issuedAt); };
  if (size > RECEIPT_BUDGET_BYTES) throw new AgentRecordsError("capacity", "Required edit receipt exceeds the workspace budget.");
  for (const [key, fence] of fences) {
    // Old records without a time (before these caps) count as aged out.
    if (!(fenceTime(fence) > cutoff)) { remove.push(key); if ("retired" in fence) raise(fence.issuedAt); continue; }
    size += recordBytes(key, fence);
  }
  const live = receipts.filter(([key, receipt]) => {
    if (receipt.createdAt > cutoff) { size += recordBytes(key, receipt); return true; }
    remove.push(key); raise(receipt.issuedAt); return false;
  }).sort((a, b) => a[1].createdAt - b[1].createdAt || a[0].localeCompare(b[0]));
  let count = live.length + (incoming ? 1 : 0);
  const retire: [string, Fence][] = [];
  for (const [key, receipt] of live) {
    if (count <= RECEIPT_LIMIT && size <= RECEIPT_BUDGET_BYTES) break;
    remove.push(key); raise(receipt.issuedAt); count--; size -= recordBytes(key, receipt);
    const marker: [string, Extract<Fence, { retired: true }>] = [retiredKey(receipt.workspace, receipt.operationId),
      { retired: true, workspace: receipt.workspace, operationId: receipt.operationId, issuedAt: receipt.issuedAt, createdAt: receipt.createdAt }];
    retire.push(marker); size += recordBytes(...marker);
  }
  if (incoming && size > RECEIPT_BUDGET_BYTES)
    throw new AgentRecordsError("capacity", "This site's agent edit records are full in this browser; agent edits wait until older ones age out.");
  return { remove, retire, horizon };
}

/** Why agent edits stopped in this browser, until the user chooses Try again (`resume`). */
export interface AgentStorageProblem { reason: "full" | "unavailable"; message: string }
const FULL_MESSAGE = "Agent storage transaction aborted: this browser's storage is full, so agent edits are stopped until the user frees space and chooses Try again in the project menu.";
const UNKNOWN_MESSAGE = "This browser's storage is full and could not confirm whether the change was kept; agent edits are stopped. Read the files again before trying it again.";
interface StorageStatus { problem?: AgentStorageProblem; stopped: boolean; listeners: Set<() => void> }
const statuses = new WeakMap<object, StorageStatus>();
const NO_STORAGE = {};
const browserFactory = (): IDBFactory | undefined => { try { return globalThis.indexedDB ?? undefined; } catch { return undefined; } };
function statusOf(factory: IDBFactory | undefined) {
  const key = factory ?? NO_STORAGE;
  let status = statuses.get(key);
  if (!status) statuses.set(key, status = { stopped: false, listeners: new Set() });
  return status;
}
function report(status: StorageStatus, problem: AgentStorageProblem, stop: boolean) {
  status.problem = problem;
  status.stopped ||= stop;
  for (const listener of [...status.listeners]) listener();
}
/**
 * This browser's agent storage: the problem that stopped or refused agent edits, if any. A full
 * storage stops every agent edit (each is refused before mutation) until `resume`, the user's Try again.
 */
export function agentStorageStatus(factory: IDBFactory | undefined = browserFactory()) {
  const status = statusOf(factory);
  return {
    get problem() { return status.problem; },
    subscribe(listener: () => void) { status.listeners.add(listener); return () => { status.listeners.delete(listener); }; },
    resume() {
      if (!status.problem) return;
      status.problem = undefined;
      status.stopped = false;
      for (const listener of [...status.listeners]) listener();
    },
  };
}
const quotaError = (error: unknown): boolean => {
  for (let at = error, depth = 0; at && depth < 5; at = (at as { cause?: unknown }).cause, depth++)
    if ((at as { name?: unknown }).name === "QuotaExceededError") return true;
  return false;
};

export class AgentRecordsError extends Error {
  /** `unknown`: whether the edit was kept could not be proven either way (never "nothing changed"). */
  constructor(public readonly code: "unavailable" | "aborted" | "conflict" | "duplicate-id" | "revoked" | "cancelled" | "not-owner" | "capacity" | "unknown", message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "AgentRecordsError";
  }
}

/**
 * This browser's copy of a workspace's Ask agent requests (the source the agent menu and pins
 * read): completed ones (done, answered, dismissed) are kept up to seven days, and all of them
 * within one serialized byte budget; unfinished ones (at most OPEN_REQUESTS_LIMIT) are never evicted.
 */
export const CONVERSATION_BUDGET_BYTES = 1024 * 1024;
export const CONVERSATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Waiting for an agent (open, seen) or for the user's answer (question). */
export const isUnfinishedRequest = (state: AgentRequestState) => state === "open" || state === "seen" || state === "question";
const conversationBytes = (conversation: Conversation) => new TextEncoder().encode(JSON.stringify(conversation)).byteLength;
export const conversationExpired = (conversation: Conversation, now: number) =>
  !conversation.unfinished && conversation.updatedAt <= now - CONVERSATION_RETENTION_MS;

/**
 * The conversations a workspace drops when `incoming` is stored (ids), or a capacity refusal.
 * Expired completed ones go first, then the oldest completed ones until all fit the byte budget.
 * Unfinished ones are never dropped: a new one (or one reopened) is refused when
 * OPEN_REQUESTS_LIMIT already wait, and any unfinished one, new or changed, when it cannot fit
 * once every completed one is gone (the stored one then stays as it was).
 */
export function conversationRetention(stored: Conversation[], incoming: Conversation | undefined, now: number): string[] {
  const existing = incoming && stored.find((item) => item.id === incoming.id);
  const admitted = Boolean(incoming?.unfinished && !existing?.unfinished);
  const rows = incoming ? [...stored.filter((item) => item.id !== incoming.id), incoming] : [...stored];
  if (admitted && rows.filter((item) => item.unfinished && item.id !== incoming!.id).length >= OPEN_REQUESTS_LIMIT)
    throw new AgentRecordsError("capacity", `${OPEN_REQUESTS_LIMIT} requests already wait for an agent or for your answer. Dismiss some first.`);
  const removed = new Set(rows.filter((item) => conversationExpired(item, now)).map((item) => item.id));
  let size = rows.reduce((sum, item) => sum + (removed.has(item.id) ? 0 : conversationBytes(item)), 0);
  const completed = rows.filter((item) => !item.unfinished && !removed.has(item.id))
    .sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id));
  for (const item of completed) {
    if (size <= CONVERSATION_BUDGET_BYTES) break;
    removed.add(item.id);
    size -= conversationBytes(item);
  }
  if (size > CONVERSATION_BUDGET_BYTES && incoming)
    throw new AgentRecordsError("capacity", "Requests to agents in this browser use all their space (1 MiB). Dismiss some first.");
  return [...removed];
}

export function unavailableAgentRecords(factory?: IDBFactory): AgentRecords {
  const message = "Agent storage is unavailable in this browser.";
  const status = statusOf(factory);
  const refuse = () => {
    report(status, { reason: "unavailable", message }, false);
    return Promise.reject(new AgentRecordsError("unavailable", message));
  };
  return { reconcile: refuse, pause: refuse, snapshot: refuse, revoke: refuse, cancel: refuse, evictReceipts: refuse, commit: refuse,
    status: refuse, receipt: refuse, workspace: refuse, setFence: refuse, putConversation: refuse, checkConversation: refuse, conversations: refuse };
}

const isFence = (value: unknown): value is Fence => typeof value === "object" && value !== null &&
  typeof (value as { workspace?: unknown }).workspace === "string" &&
  ((value as { retired?: unknown }).retired === true || (value as { cancelled?: unknown }).cancelled === true || (value as { revoked?: unknown }).revoked === true);
const receiptKeyOf = (receipt: AgentReceipt) => JSON.stringify([receipt.workspace, receipt.operationId]);
const group = <T>(rows: [string, T][], by: (value: T) => string) => {
  const groups = new Map<string, [string, T][]>();
  for (const row of rows) groups.set(by(row[1]), [...groups.get(by(row[1])) ?? [], row]);
  return groups;
};

/**
 * Agent writes never enter the manual editor's fallback or per-file retry path. A commit the
 * browser refuses for lack of space (QuotaExceededError) is settled from its receipt first, then,
 * once expired or older completed receipts and markers, completed conversations and
 * `evictCaches` freed something, tried once more; failing again, it stops agent edits
 * (agentStorageStatus) and unsaved drafts stay as they are.
 */
export function indexedDbAgentRecords(name = draftDatabaseName, factory: IDBFactory | undefined = browserFactory(), now = Date.now,
  options: { evictCaches?: () => Promise<number> } = {}): AgentRecords {
  if (!factory) return unavailableAgentRecords();
  const status = statusOf(factory);
  const connection = openDraftDatabase(name, factory);
  const recordKey = (workspace: AgentWorkspace, id: string) => JSON.stringify([workspaceKey(workspace), id]);
  const initial = (): WorkspaceRecord => ({ revision: 0, generation: 0 });
  const revocationKey = (workspace: AgentWorkspace, authorizationId: string) => JSON.stringify(["revoked", workspaceKey(workspace), authorizationId]);
  const cancellationKey = (workspace: AgentWorkspace, operationId: OperationId, authorizationId: string) => JSON.stringify(["cancelled", workspaceKey(workspace), authorizationId, operationId]);
  // Markers written before the caps (one per operation id, any workspace) are no longer made, and still refuse.
  const legacyRetiredKey = (operationId: OperationId) => JSON.stringify(["retired", operationId]);
  const expired = (receipt: AgentReceipt, time = now()) => receipt.createdAt <= time - RECEIPT_RETENTION_MS;
  const same = (value: SavedDraft | null | undefined) => value ? payloadIdentity(JSON.parse(JSON.stringify(value)) as JsonValue) : null;
  const belongs = (key: string, workspace: AgentWorkspace) => key.startsWith(draftKey({ ...workspace, repo: "" }, "").slice(0, -3));
  type Read = <T>(request: IDBRequest<T>, use: (value: T) => void) => void;
  const run = async <T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, read: Read, done: (result: T) => void) => void): Promise<T> => {
    let db: IDBDatabase;
    try { db = await connection.open(); }
    catch (cause) {
      const error = new AgentRecordsError("unavailable", "Agent storage could not be opened.", cause);
      report(status, { reason: "unavailable", message: error.message }, false);
      throw error;
    }
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
  /** Every fence and workspace record of the workspaces store, in one read. */
  const readFences = (store: IDBObjectStore, read: Read, use: (fences: [string, Fence][], records: Map<string, WorkspaceRecord>) => void) =>
    read(store.getAllKeys(), (keys) => read(store.getAll(), (values: unknown[]) => {
      const fences: [string, Fence][] = [], records = new Map<string, WorkspaceRecord>();
      keys.forEach((key, index) => {
        const value = values[index];
        if (isFence(value)) fences.push([String(key), value]);
        else if (typeof (value as WorkspaceRecord | undefined)?.revision === "number") records.set(String(key), value as WorkspaceRecord);
      });
      use(fences, records);
    }));
  /** Writes what receiptRetention decided; resolves to the workspace's horizon after it. */
  const retain = (receipts: IDBObjectStore, workspaces: IDBObjectStore, decided: ReturnType<typeof receiptRetention>, receiptKeys: Set<string>, horizon = 0) => {
    for (const key of decided.remove) (receiptKeys.has(key) ? receipts : workspaces).delete(key);
    for (const [key, fence] of decided.retire) workspaces.put(fence, key);
    return Math.max(horizon, decided.horizon);
  };
  const withHorizon = (record: WorkspaceRecord, horizon: number): WorkspaceRecord => horizon > 0 ? { ...record, horizon } : record;
  async function attempt(command: AgentCommit) {
    const { workspace, fence, expectedRevision, expectedDrafts, drafts, receipt } = structuredClone(command);
    const key = workspaceKey(workspace), receiptKey = recordKey(workspace, receipt.operationId);
    return run<CommitResult>([draftStores.drafts, draftStores.receipts, draftStores.workspaces], "readwrite", (tx, read, done) => {
      const receipts = tx.objectStore(draftStores.receipts), workspaces = tx.objectStore(draftStores.workspaces), files = tx.objectStore(draftStores.drafts);
      read(workspaces.get(revocationKey(workspace, receipt.authorizationId)), (revoked: unknown) => {
        if (revoked) throw new AgentRecordsError("revoked", "Agent authorization has been revoked.");
        // A tombstone exists only where no live receipt did when cancel won.
        read(workspaces.get(cancellationKey(workspace, receipt.operationId, receipt.authorizationId)), (cancelled: unknown) => {
          if (cancelled) throw new AgentRecordsError("cancelled", "Agent operation has been cancelled.");
          read(receipts.getAll(), (all: AgentReceipt[]) => {
            // A live operation id cannot be rebound to another workspace or authorization.
            const recorded = all.find((value) => value.operationId === receipt.operationId);
            if (recorded) {
              if (recorded.workspace !== key || recorded.authorizationId !== receipt.authorizationId ||
                recorded.generation !== fence || recorded.payloadIdentity !== receipt.payloadIdentity)
                throw new AgentRecordsError("duplicate-id", "Operation identifier was reused for different work.");
              // Keep refusing this identifier even if a caller supplies fresh revision proofs.
              if (expired(recorded)) conflict();
              done({ receipt: recorded, duplicate: true });
              return;
            }
            read(workspaces.get(retiredKey(key, receipt.operationId)), (retired: unknown) => {
              read(workspaces.get(legacyRetiredKey(receipt.operationId)), (legacy: unknown) => {
                // Like an expired receipt: unknown, never applied afresh whatever proofs come with it.
                if (retired || legacy) conflict();
                read(workspaces.get(key), (stored: WorkspaceRecord | undefined) => {
                  const current = stored ?? initial(), time = now();
                  if (!receipt.authorizationId || !Number.isSafeInteger(fence) || !Number.isSafeInteger(expectedRevision) ||
                    current.paused || current.generation !== fence || current.revision !== expectedRevision) conflict();
                  // Issued at or before a dropped receipt, or so long ago its fences may be gone: unknown.
                  if (!Number.isFinite(receipt.issuedAt) || receipt.issuedAt <= (current.horizon ?? 0) || receipt.issuedAt <= time - COMMAND_MAX_AGE_MS) conflict();
                  const expected = new Map(expectedDrafts);
                  if (expected.size !== expectedDrafts.length || new Set(drafts.map(([key]) => key)).size !== drafts.length) conflict();
                  for (const [draft, value] of drafts) {
                    if (!belongs(draft, workspace) || !expected.has(draft) || (value &&
                      (workspaceKey(value) !== key || draftKey(value, value.path) !== draft))) conflict();
                  }
                  const apply = () => readFences(workspaces, read, (fences) => {
                    const committed: AgentReceipt = { ...receipt, workspace: key, generation: fence, revision: current.revision + 1, createdAt: time };
                    const rows: [string, AgentReceipt][] = all.filter((value) => value.workspace === key).map((value) => [receiptKeyOf(value), value]);
                    const decided = receiptRetention(rows, fences.filter(([, fence]) => fence.workspace === key), time, [receiptKey, committed]);
                    const horizon = retain(receipts, workspaces, decided, new Set(rows.map(([key]) => key)), current.horizon);
                    for (const [draft, value] of drafts) value ? files.put(value, draft) : files.delete(draft);
                    receipts.put(committed, receiptKey);
                    workspaces.put(withHorizon({ ...current, revision: committed.revision }, horizon), key);
                    done({ receipt: committed, duplicate: false });
                  });
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
      });
    });
  }
  /** After a failed commit: its receipt, when the transaction landed after all (revocation rechecked first). */
  const settle = (command: AgentCommit) => run<CommitResult | undefined>([draftStores.receipts, draftStores.workspaces], "readonly", (tx, read, done) => {
    const { workspace, receipt: wanted } = command;
    read(tx.objectStore(draftStores.workspaces).get(revocationKey(workspace, wanted.authorizationId)), (revoked: unknown) => {
      if (revoked) throw new AgentRecordsError("revoked", "Agent authorization has been revoked.");
      read(tx.objectStore(draftStores.receipts).get(recordKey(workspace, wanted.operationId)), (receipt: AgentReceipt | undefined) => {
        const ours = receipt && !expired(receipt) && receipt.workspace === workspaceKey(workspace) && receipt.authorizationId === wanted.authorizationId &&
          receipt.generation === command.fence && receipt.payloadIdentity === wanted.payloadIdentity;
        // Landed on the revision it was planned against: this commit's own, still to be published.
        done(ours ? { receipt, duplicate: receipt.revision !== command.expectedRevision + 1 } : undefined);
      });
    });
  });
  /**
   * Browser storage is full: drops, in every workspace, aged-out records and completed
   * conversations, and turns receipts older than QUOTA_RECEIPT_AGE_MS of edits issued before
   * `command` into small retired markers (their ids stay refused, their deliveries unknown under
   * the horizon). Unsaved drafts, unfinished conversations and fences stay. Resolves to how many
   * records went.
   */
  const relieve = (command: AgentCommit) => run<number>([draftStores.receipts, draftStores.workspaces, draftStores.conversations], "readwrite", (tx, read, done) => {
    const receipts = tx.objectStore(draftStores.receipts), workspaces = tx.objectStore(draftStores.workspaces), conversations = tx.objectStore(draftStores.conversations);
    const time = now(), before = command.receipt.issuedAt;
    read(receipts.getAll(), (all: AgentReceipt[]) => readFences(workspaces, read, (fences, records) => {
      let freed = 0;
      const byWorkspace = group(all.map((receipt): [string, AgentReceipt] => [receiptKeyOf(receipt), receipt]), (receipt) => receipt.workspace);
      const fencesBy = group(fences, (fence) => fence.workspace);
      for (const key of new Set([...byWorkspace.keys(), ...fencesBy.keys()])) {
        const rows = byWorkspace.get(key) ?? [], marks = fencesBy.get(key) ?? [];
        const decided = receiptRetention(rows, marks, time);
        const gone = new Set(decided.remove);
        for (const [rowKey, receipt] of rows) {
          if (gone.has(rowKey) || !(receipt.issuedAt < before) || !(receipt.createdAt <= time - QUOTA_RECEIPT_AGE_MS)) continue;
          // A small marker replaces the receipt: its id stays refused until the 24 hours end.
          gone.add(rowKey);
          decided.retire.push([retiredKey(key, receipt.operationId),
            { retired: true, workspace: key, operationId: receipt.operationId, issuedAt: receipt.issuedAt, createdAt: receipt.createdAt }]);
          decided.horizon = Math.max(decided.horizon, receipt.issuedAt);
        }
        decided.remove = [...gone];
        const current = records.get(key) ?? initial();
        const horizon = retain(receipts, workspaces, decided, new Set(rows.map(([rowKey]) => rowKey)), current.horizon);
        if (horizon > (current.horizon ?? 0)) workspaces.put(withHorizon(current, horizon), key);
        freed += decided.remove.length;
      }
      read(conversations.getAllKeys(), (keys) => read(conversations.getAll(), (values: ConversationRecord[]) => {
        keys.forEach((key, index) => { if (!values[index].conversation.unfinished) { conversations.delete(key); freed++; } });
        done(freed);
      }));
    }));
  });
  return {
    async commit(command) {
      // Snapshot all proofs and writes before opening; callers may change during that await.
      const captured = structuredClone(command);
      if (status.stopped) throw new AgentRecordsError("unavailable", FULL_MESSAGE);
      try { return await attempt(captured); }
      catch (error) {
        if (!quotaError(error)) throw error;
        let failure = error;
        // An aborted transaction applied nothing, yet a receipt settles one that landed regardless;
        // a receipt that cannot be read leaves the outcome unknown, never "nothing changed".
        const reconcile = () => settle(captured).then((landed) => ({ landed, unreadable: false }), (problem: unknown) => {
          if (problem instanceof AgentRecordsError && problem.code === "revoked") throw problem;
          return { landed: undefined, unreadable: true };
        });
        let settled = await reconcile();
        if (settled.landed) return settled.landed;
        const freed = await relieve(captured).catch(() => 0) + await (options.evictCaches?.() ?? Promise.resolve(0)).catch(() => 0);
        if (freed > 0) {
          try { return await attempt(captured); }
          catch (again) {
            if (!quotaError(again)) throw again;
            failure = again;
          }
          settled = await reconcile();
          if (settled.landed) return settled.landed;
        }
        report(status, { reason: "full", message: FULL_MESSAGE }, true);
        if (settled.unreadable) throw new AgentRecordsError("unknown", UNKNOWN_MESSAGE, failure);
        throw new AgentRecordsError("aborted", FULL_MESSAGE, failure);
      }
    },
    cancel(workspace, operationId, authorizationId, options) {
      const key = recordKey(workspace, operationId), cancelledKey = cancellationKey(workspace, operationId, authorizationId);
      const revokedKey = revocationKey(workspace, authorizationId), scope = workspaceKey(workspace);
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
            // Preserve evidence of a past application even after retention removes the old receipt/marker.
            read(workspaces.get(cancelledKey), (prior: Fence | undefined) => {
              read(workspaces.get(retiredKey(scope, operationId)), (retired: unknown) => {
                read(workspaces.get(legacyRetiredKey(operationId)), (legacy: unknown) => {
                  const uncertain = Boolean(receipt || retired || legacy || prior && "cancelled" in prior && prior.uncertain);
                  workspaces.put({ cancelled: true, workspace: scope, at: now(), ...(options?.live && !uncertain ? { definite: true } : {}), ...(uncertain ? { uncertain: true } : {}) } satisfies Fence, cancelledKey);
                  done({ status: "unknown" });
                });
              });
            });
          });
        });
      });
    },
    status(workspace, operationId, authorizationId) {
      const scope = workspaceKey(workspace);
      return run<CancellationResult>([draftStores.receipts, draftStores.workspaces], "readonly", (tx, read, done) => {
        const workspaces = tx.objectStore(draftStores.workspaces);
        read(workspaces.get(revocationKey(workspace, authorizationId)), (revoked: unknown) => {
          if (revoked) throw new AgentRecordsError("revoked", "Agent authorization has been revoked.");
          read(tx.objectStore(draftStores.receipts).get(recordKey(workspace, operationId)), (receipt: AgentReceipt | undefined) => {
            if (receipt) {
              if (receipt.authorizationId !== authorizationId) throw new AgentRecordsError("duplicate-id", "Operation authorization differs.");
              done(expired(receipt) ? { status: "unknown" } : { status: "applied", receipt });
              return;
            }
            read(workspaces.get(retiredKey(scope, operationId)), (retired: unknown) => {
              read(workspaces.get(legacyRetiredKey(operationId)), (legacy: unknown) => {
                read(workspaces.get(cancellationKey(workspace, operationId, authorizationId)), (cancelled: Fence | undefined) => {
                  done({ status: !retired && !legacy && cancelled && "cancelled" in cancelled && cancelled.definite && !cancelled.uncertain && fenceTime(cancelled) > now() - RECEIPT_RETENTION_MS ? "cancelled" : "unknown" });
                });
              });
            });
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
            if (receipt && (receipt.authorizationId !== authorizationId || receipt.generation !== command.fence || receipt.payloadIdentity !== payloadIdentity))
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
    setFence(workspace, expected, next, snapshot) {
      const proof = snapshot && structuredClone(snapshot);
      const scope = structuredClone(workspace);
      const key = workspaceKey(workspace);
      return run([draftStores.workspaces, draftStores.drafts], "readwrite", (tx, read, done) => {
        const store = tx.objectStore(draftStores.workspaces);
        read(store.get(key), (value: WorkspaceRecord | undefined) => {
          const current = value ?? initial();
          // Fences only increase, so a fence once passed can never be reused.
          if (current.generation !== expected || !Number.isSafeInteger(next) || next <= current.generation) conflict();
          const change = () => {
            const changed = withHorizon({ revision: current.revision, generation: next }, current.horizon ?? 0);
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
    pause(workspace, fence) {
      const key = workspaceKey(workspace);
      return run([draftStores.workspaces], "readwrite", (tx, read, done) => {
        const store = tx.objectStore(draftStores.workspaces);
        read(store.get(key), (stored: WorkspaceRecord | undefined) => {
          const current = stored ?? initial();
          if (current.generation !== fence) conflict();
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
        tx.objectStore(draftStores.workspaces).put({ revoked: true, workspace: key, at: now() } satisfies Fence, revokedKey);
        read(tx.objectStore(draftStores.receipts).getAll(), (receipts: AgentReceipt[]) => {
          // Report work that won before revocation; never undo committed drafts.
          done(receipts.filter((receipt) => receipt.workspace === key && !expired(receipt) && receipt.authorizationId === authorizationId));
        });
      });
    },
    evictReceipts(workspace, time = now()) {
      const key = workspaceKey(workspace);
      return run([draftStores.receipts, draftStores.workspaces], "readwrite", (tx, read, done) => {
        const receipts = tx.objectStore(draftStores.receipts), workspaces = tx.objectStore(draftStores.workspaces);
        read(receipts.getAll(), (all: AgentReceipt[]) => readFences(workspaces, read, (fences, records) => {
          const rows: [string, AgentReceipt][] = all.filter((receipt) => receipt.workspace === key).map((receipt) => [receiptKeyOf(receipt), receipt]);
          const receiptKeys = new Set(rows.map(([rowKey]) => rowKey));
          const decided = receiptRetention(rows, fences.filter(([, fence]) => fence.workspace === key), time);
          const current = records.get(key) ?? initial();
          const horizon = retain(receipts, workspaces, decided, receiptKeys, current.horizon);
          if (horizon > (current.horizon ?? 0)) workspaces.put(withHorizon(current, horizon), key);
          done(decided.remove.filter((rowKey) => receiptKeys.has(rowKey)).length);
        }));
      });
    },
    putConversation(workspace, conversation, accept, owner) {
      const scope = structuredClone(workspace), incoming = structuredClone(conversation), key = workspaceKey(scope);
      const stores = owner === undefined ? [draftStores.conversations] : [draftStores.conversations, draftStores.workspaces];
      return run<boolean>(stores, "readwrite", (tx, read, done) => {
        const store = tx.objectStore(draftStores.conversations);
        const write = () => read(store.getAll(), (records: ConversationRecord[]) => {
          const stored = records.filter((record) => record.workspace === key).map((record) => record.conversation);
          if (accept && !accept(stored.find((item) => item.id === incoming.id && !conversationExpired(item, now())))) { done(false); return; }
          const removed = conversationRetention(stored, incoming, now());
          for (const id of removed) store.delete(recordKey(scope, id));
          if (!removed.includes(incoming.id)) store.put({ workspace: key, conversation: incoming }, recordKey(scope, incoming.id));
          done(true);
        });
        if (owner === undefined) { write(); return; }
        read(tx.objectStore(draftStores.workspaces).get(key), (value: WorkspaceRecord | undefined) => {
          const current = value ?? initial();
          if (current.generation !== owner || current.paused) { done(false); return; }
          write();
        });
      });
    },
    checkConversation(workspace, conversation) {
      const key = workspaceKey(workspace), incoming = structuredClone(conversation);
      return run([draftStores.conversations], "readonly", (tx, read, done) => {
        read(tx.objectStore(draftStores.conversations).getAll(), (records: ConversationRecord[]) => {
          conversationRetention(records.filter((record) => record.workspace === key).map((record) => record.conversation), incoming, now());
          done(undefined);
        });
      });
    },
    conversations(workspace) {
      const key = workspaceKey(workspace), time = now();
      return run([draftStores.conversations], "readonly", (tx, read, done) => {
        read(tx.objectStore(draftStores.conversations).getAll(), (records: ConversationRecord[]) => done(records
          .filter((record) => record.workspace === key && !conversationExpired(record.conversation, time))
          .map((record) => record.conversation)));
      });
    },
  };
}
