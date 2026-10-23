import { connectionPrompt } from "../agent-prompts";
import { recordFailure, recoveryHolds } from "../agent-recovery";
import { AgentFailureError, classifyAgentFailure } from "../../shared/agent-failure";
import { button, node } from "../ui/dom";
import { REQUEST_HTML_LIMIT, REQUEST_TEXT_LIMIT, type AgentCommand, type AgentElement, type AgentRequest } from "../../shared/agent";
import { answerRequest, createRequestTools } from "../agent-watch";
import { workspaceKey, type AgentWorkspace, type JsonValue } from "../../shared/agent-command";
import { AgentRecordsError, agentStorageStatus, indexedDbAgentRecords, isUnfinishedRequest, type AgentRecords } from "../agent-records";
import type { createLiveTransport } from "../agent-transport";
import type { AgentReadPorts } from "../agent-tools-read";
import type { SharedContext } from "../agent-site";
import type { PinRequest } from "./agent-pins";
import { agentHistoryKey } from "../controllers/agent-controller";
import { resumeAgents, revokeUnused, serialReads, siteFull } from "../agent-resume";
import { mountFlyout } from "./flyout";
import { githubScope, same, sameBranch } from "../workspace-session";
import "./agent-menu.css";

// Remote agents are opt-in per site, remembered in this browser until turned off (a reload or
// a new tab on the same site comes back with them on). Commands and requests travel over one live
// relay socket; drafts and conversations stay in this browser. The Worker stores
// grant metadata only. Returning to a copied token's tab checks connections once;
// there is no timer polling, context heartbeat, or content upload.

/** How long one agent API call (headers and body) may take before it counts as a network failure. */
const API_DEADLINE = 15_000;
/** Set while remote agents are on for a site (account, repository and branch) in this browser, until
 * the user turns them off: a reload or a new tab on that site comes back with them on. */
const agentsOnKey = (workspace: AgentWorkspace) => `native-site-editor:agents-on:${workspaceKey(workspace)}`;
const agentsOn = (workspace: AgentWorkspace) => {
  try { return localStorage.getItem(agentsOnKey(workspace)) !== null; } catch { return false; }
};
/** Startup mounts the menu while a workspace keeps requests or has agents on (src/controllers/agent-controller.ts). */
function markStartup(workspace: AgentWorkspace, needed: boolean) {
  try {
    if (needed) localStorage.setItem(agentHistoryKey(workspace), "1");
    else localStorage.removeItem(agentHistoryKey(workspace));
  } catch { /* Storage full or blocked: the menu shows them once opened. */ }
}

export interface AgentCommandOutcome {
  message?: string;
  result?: AgentCommand["result"];
}
interface HubGrant {
  id: string;
  repoId: number;
  repo: string;
  branch: string;
  approval?: string;
  via: "token" | "oauth";
  client?: string;
  createdAt: number;
  usedAt?: number;
}
interface HubState {
  grants: HubGrant[];
}

export interface AgentApproval {
  at: number;
  repo: string;
  branch: string;
  approval: string;
}

/** An agent API refusal, with its HTTP status (a full site is told apart from other refusals). */
class RefusedError extends AgentFailureError {
  constructor(failure: ConstructorParameters<typeof AgentFailureError>[0], message: string | undefined, readonly status: number) { super(failure, message); }
}
export const AGENT_CONNECTED_KEY = "native-site-editor:agent-connected";
/** An unused token younger than this may be another tab's fresh prompt: kept. */
const FRESH_TOKEN_MS = 2 * 60_000;
/** How long the button's own label confirms a copy. */
const CONFIRM_MS = 2000;

export function createAgentMenu(options: {
  account: string;
  /** The open repository, for the panel; nothing before one is open. */
  repository: () => { id: number; fullName: string; branch: string } | undefined;
  /** Local context port retained for the host's read tools; never uploaded. */
  context: () => Promise<SharedContext | undefined>;
  tools?: AgentReadPorts;
  onCommand: (command: AgentCommand) => Promise<AgentCommandOutcome | void>;
  /** Whether an agent is connected changed. */
  onConnection?: (connected: boolean) => void;
  /** The open repository's requests to agents, each time they may have changed. */
  onRequests?: (requests: PinRequest[]) => void;
  /** How many of them are agents' questions waiting for the user, when it changed. */
  onQuestions?: (count: number) => void;
  /** Show a request's pin with its card open (closing the menus). */
  onShowRequest?: (id: string) => void;
  /** This browser's agent records (tests inject one). */
  records?: AgentRecords;
  reload?: (snapshot: Awaited<ReturnType<AgentRecords["snapshot"]>>) => Promise<void>;
}) {
  const tabId = `tab-${crypto.randomUUID()}`;
  let hub: HubState = { grants: [] };
  /** The token this tab made and copied; the hub's grants tell whether an agent used it. */
  let token: string | undefined, tokenId: string | undefined;
  /** The site whose last press failed with nothing to show for it: the dot shows it until the
   * next press, a turn on or off, another site shown, or an agent using a connection. */
  let failedOn: ReturnType<typeof options.repository>;
  let disposed = false,
    changing = false,
    remote = false,
    // Each Connect and Turn off starts a new activation; work begun in an older one writes nothing.
    activation = 0;
  let lastRead = 0;
  let consentChecks: ReturnType<typeof setTimeout>[] = [];
  let ownerPaused = false;
  let transport: ReturnType<typeof createLiveTransport> | undefined;
  let transportMode: "pending" | "socket" = "pending";
  let pinned: ReturnType<typeof options.repository>;
  // A repository and branch of this menu's account against another (the open one, the pinned one, a
  // grant's or an approval's): the workspace session's one rule (src/workspace-session.ts).
  const branchOf = (repo: ReturnType<typeof options.repository>) => repo && { repoId: repo.id, repo: repo.fullName, branch: repo.branch };
  const sameRepository = (a: ReturnType<typeof options.repository>, b: ReturnType<typeof options.repository>) => sameBranch(branchOf(a), branchOf(b));
  let workspaceChanged = false;
  let transportState: ReturnType<ReturnType<typeof createLiveTransport>["state"]> | undefined;
  let requestTools: ReturnType<typeof createRequestTools> | undefined;
  // Other tabs of this browser hear of a request asked or answered here (the receiving tab may be another).
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("native-site-editor:agent-requests") : undefined;
  channel?.addEventListener("message", event => {
    if (disposed || event.data !== historyKey) return;
    void loadHistory();
    requestTools?.notify();
  });
  /** A request was kept here: a held wait looks again, at once and without polling. */
  function requestsChanged(key: string) {
    requestTools?.notify();
    broadcast(key);
  }
  /** Other tabs show the pins anew (an agent took or replied to a request here). */
  function broadcast(key: string) {
    try { channel?.postMessage(key); } catch { /* Closed channel: they read again when seen. */ }
  }
  async function activateSocket() {
    if (!remote || disposed || ownerPaused || workspaceChanged || transportMode !== "pending" || !pinned) return;
    const at = activation, repo = pinned;
    const { createLiveTransport } = await import("../agent-transport");
    if (!live(at) || transportMode !== "pending") return;
    transportMode = "socket";
    const run = async (command: AgentCommand) => {
      const outcome = await options.onCommand(command);
      const grant = hub.grants.find(each => each.id === command.grantId);
      if (grant && !grant.usedAt && live(at)) { grant.usedAt = Date.now(); paint(); }
      return outcome;
    };
    const workspace = { account: options.account, repoId: repo.id, branch: repo.branch };
    requestTools = createRequestTools({
      workspace,
      list: async () => (await records.conversations(workspace)).map(item => item.content as unknown as AgentRequest),
      save: (request, accept, owner) => keep(workspace, request as StoredRequest, current => accept(current?.content as unknown as AgentRequest | undefined), owner),
    });
    let editTools: Promise<ReturnType<typeof import("../agent-tools-edit")["createAgentEditTools"]>> | undefined;
    let mediaTools: Promise<ReturnType<typeof import("../agent-tools-media")["createAgentMediaTools"]>> | undefined;
    transport = createLiveTransport({
      workspace: { account: options.account, repoId: repo.id, branch: repo.branch }, repo: repo.fullName, tabId,
      current: scope, records, reload: snapshot => options.reload?.(snapshot) ?? Promise.resolve(),
      source: path => options.tools?.source?.(path),
      media: async (request, fence, current, deadline, seen, signal) => {
        const ports = options.tools, stamp = ports?.stamp(), source = ports?.files(), commit = source?.snapshot.commit;
        if (!ports || !stamp) return { ok: false, message: "Browser media tools are unavailable. Refresh the editor." };
        // As an edit (below): held before its tools load, a Media change finishes in its own workspace
        // when another is shown meanwhile (ticket 27), in that workspace's background page.
        const pin = ports.pin?.(), held = { source, stamp, pin: pin ?? { away: () => false, context: () => ports.context() }, pinned: Boolean(pin) };
        mediaTools ??= import("../agent-tools-media").then(({ createAgentMediaTools }) => createAgentMediaTools({
          workspace: { account: options.account, repoId: repo.id, branch: repo.branch }, ports, records, run,
        }));
        const shown = () => ports.files()?.snapshot.commit === commit;
        return (await mediaTools).run(request, fence, () => current() && (pin ? stamp.changed() === "scope" || shown() : stamp.holds() && shown()), deadline, seen, signal, held);
      },
      edit: async (request, fence, current, signal) => {
        const ports = options.tools, stamp = ports?.stamp();
        const source = ports?.files(), commit = source?.snapshot.commit;
        if (!ports || !stamp) return { ok: false, message: "Browser edit tools are unavailable. Refresh the editor." };
        // The workspace the edit arrived in, held before its tools load: another site or branch shown
        // meanwhile stops nothing, and the edit finishes in its own (ticket 23).
        const pin = ports.pin?.(), held = { source, stamp, pin: pin ?? { away: () => false, context: () => ports.context() }, pinned: Boolean(pin) };
        editTools ??= import("../agent-tools-edit").then(({ createAgentEditTools }) => createAgentEditTools({
          workspace: { account: options.account, repoId: repo.id, branch: repo.branch }, ports, records,
          run,
        }));
        // Pinned, its branch shown again (a new load of it) is no move either; on show its revision must
        // hold. With no pin, the stamp it arrived with must hold.
        const shown = () => ports.files()?.snapshot.commit === commit;
        return (await editTools).run(request, fence, () => current() && (pin ? stamp.changed() === "scope" || shown() : stamp.holds() && shown()), signal, held);
      },
      read: async (read, signal) => {
        const ports = options.tools, stamp = ports?.stamp();
        if (!ports || !stamp) return { ok: false, message: "Browser read tools are unavailable. Refresh the editor." };
        const { createAgentReadTools } = await import("../agent-tools-read");
        const result = await createAgentReadTools({ ...ports, stamp: () => stamp }).run(read.tool, read.args, signal);
        // The requests agents wait on live here now: count this browser's, not the hub's.
        if (read.tool === "get_site" && result.ok && result.value && typeof result.value === "object" && !Array.isArray(result.value)) {
          const kept = await records.conversations(workspace).catch(() => []);
          result.value.openRequests = kept.filter(item => ["open", "seen"].includes((item.content as unknown as StoredRequest).state)).length;
        }
        return result;
      },
      requests: async (request, fence, current, deadline, signal) => {
        const tools = requestTools;
        if (!tools) return { ok: false, message: "Browser request tools are unavailable. Refresh the editor." };
        // An agent asking for requests is connected, as one sending a change is.
        const grant = hub.grants.find(each => each.id === request.grantId);
        if (grant && !grant.usedAt) { grant.usedAt = Date.now(); paint(); }
        try { return await tools.run(request, current, deadline, fence, signal); }
        finally {
          if (request.tool !== "get_request") broadcast(workspaceKey(workspace));
          if (live(at)) paint();
        }
      },
      run,
      listen: next => {
        // Same activation, even while a refresh briefly removes the repository: quota, pause and
        // takeover updates must not be lost (a real move sets workspaceChanged and a new activation).
        if (disposed || !remote || activation !== at || workspaceChanged) return;
        transportState = next;
        ownerPaused = next.mode === "paused" && Boolean(next.message);
        paint();
      },
    });
    // A start that fails leaves the transport's state on the dot; Connect to MCP tries again.
    await transport.start().catch(() => { if (live(at)) paint(); });
  }
  // Grants this tab saw before it turned off: a later approval elsewhere never turns them back on.
  const declined = new Set<string>();

  // One button and its dot (Lex, 2026-10-23): "Connect to MCP" makes a token and copies a prompt
  // that tells an agent how to connect, its label confirming the copy; "Wait for MCP" copies it
  // again until an agent first uses the connection; then "Disconnect MCP" revokes the
  // repository's connections (OAuth ones included). No hints, toasts or other controls: the dot
  // shows in-between states and problems, which return the button to Connect to MCP.
  const root = node("div", "agent-menu");
  const action = button("", () => void act(), "text-button agent-menu__action");
  const actionLabel = node("span", "agent-menu__label", "Connect to MCP");
  // The questions waiting for the user, as on the project selector's tile.
  const count = node("span", "agent-menu__count");
  count.setAttribute("aria-hidden", "true");
  count.hidden = true;
  action.append(actionLabel, count);
  // The one exception (keeps work safe): this browser cannot keep agent edits, so the menu offers
  // a copy of the open workspace's unsaved changes.
  const storage = agentStorageStatus();
  let exporting = false;
  const download = button("Download unsaved changes", () => void exportWork(), "text-button agent-menu__download");
  download.hidden = true;
  // The requests of the open workspace, beside Disconnect MCP, only while there are some.
  const waitingOn = node("div", "agent-menu__waiting");
  waitingOn.id = "agent-waiting";
  waitingOn.setAttribute("role", "menu");
  root.append(action, download, waitingOn);
  const flyout = mountFlyout({
    panel: waitingOn,
    label: "Requests",
    render: drawWaiting,
    enabled: () => offer() === "disconnect" && pending().length > 0,
    openOnFocus: true,
  });
  flyout.attach(action);
  /** Until when, and in which offer, the button's label confirms the last copy. */
  let confirmed: { label: string; until: number; offer: string } | undefined;
  /** The retry time a repaint is set for. */
  let repaintAt = 0;
  let repaintTimer: ReturnType<typeof setTimeout> | undefined, confirmTimer: ReturnType<typeof setTimeout> | undefined;

  /** `at` fences a request to the activation that started it. */
  async function api(action: string, body?: unknown, at?: number) {
    const sent = body === undefined ? undefined : JSON.stringify(body);
    if (at !== undefined && !live(at)) throw new Error("Remote agents were turned off.");
    if (action !== "revoke" && transportMode === "socket" && !workspaceChanged && ["quota", "paused", "reconnecting"].includes(transportState?.mode ?? "")) throw new AgentFailureError({ kind: "other" }, "Remote agents are paused.");
    // A failure counts only for the workspace that sent the request: not one opened since.
    const source = transport, sentFrom = { remote, activation, pinned };
    const report = (error: AgentFailureError) => {
      if (transport === source && (at === undefined || live(at))) failed(error);
      return error;
    };
    let response: Response | undefined, text: string;
    // A connection lost while the answer's body arrives is a network failure too. Settle matrix:
    // answered → its result; refused → its failure; lost, or no answer (headers and body) within
    // API_DEADLINE → a network failure, so the menu never stays connecting with no way forward (a
    // resume read that times out counts as unanswered: agents stay on, as for a 503).
    try {
      response = await fetch(`/api/agent/${action}`, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: sent,
        signal: AbortSignal.timeout(API_DEADLINE),
      });
      text = await response.text();
    } catch {
      // Headers that did arrive still carry their Retry-After.
      throw report(new AgentFailureError(classifyAgentFailure({ networkError: true, status: response?.status, retryAfter: response?.headers.get("Retry-After"), now: Date.now() })));
    }
    let result;
    try { result = JSON.parse(text); } catch { /* Cloudflare's 1027 answer is HTML. */ }
    if (!response.ok) {
      if (result?.code === "agents-paused") {
        // Only the activation that sent it may pause: a reply from before Turn on, or from an
        // earlier activation or workspace, never stops a newer connection.
        if (sentFrom.remote && remote && activation === sentFrom.activation && pinned === sentFrom.pinned && (at === undefined || live(at))) {
          stopAutomatic();
          transport?.stop(); transport = undefined;
          ownerPaused = true;
          transportMode = "socket";
          transportState = { mode: "paused", message: result.error };
          paint();
        }
        throw new AgentFailureError({ kind: "other" }, result.error);
      }
      throw report(new RefusedError(classifyAgentFailure({ status: response.status, body: result, text, retryAfter: response.headers.get("Retry-After"), now: Date.now() }), result?.error, response.status));
    }
    return result ?? {};
  }
  function stopAutomatic() {
    for (const check of consentChecks) clearTimeout(check);
    consentChecks = [];
  }
  function failed(error: AgentFailureError) {
    // Sign-in ended: back to Connect to MCP.
    if (error.failure.kind === "auth") turnOff(true);
    else if (transportMode === "socket") transport?.report(error.failure);
    else if (pinned) {
      try { recordFailure(localStorage, { account: options.account.toLowerCase(), repoId: pinned.id }, error.failure, Date.now()); } catch { /* Activation still reports the failure below. */ }
    }
  }
  function recoverWorkspace() {
    const repo = options.repository();
    if (!remote) return;
    // Only another open repository or branch is a move: none while a refresh reloads it.
    if (!workspaceChanged && pinned && repo && !sameRepository(repo, pinned)) {
      workspaceChanged = true;
      activation++;
      stopAutomatic();
      transport?.changed();
      transportState = { mode: "workspace-changed" };
    }
  }
  // Only connections pinned to this tab's repository and branch count.
  const liveGrants = () => {
    const repo = options.repository();
    return repo ? hub.grants.filter((grant) => sameBranch(grant, branchOf(repo))) : [];
  };
  const usedGrants = () => liveGrants().filter((grant) => grant.via === "oauth" || grant.usedAt);
  /** A token no agent has used yet: this tab's, or one another tab of this browser just copied. */
  const unused = (grant: HubGrant) => grant.via === "token" && !grant.usedAt;
  const waiting = () => liveGrants().some(unused);
  /** The tab's connection state, on the dot (`data-state`). */
  function state() {
    if (!options.repository()) return "closed";
    if (failedOn && sameRepository(failedOn, options.repository()) && !usedGrants().length) return "failed";
    if (!remote) return "off";
    if (workspaceChanged) return "workspace-changed";
    if (transportMode === "pending") return "connecting";
    if (transportMode === "socket" && transportState && transportState.mode !== "live") return transportState.mode;
    if (usedGrants().length) return "connected";
    return waiting() ? "waiting" : "idle";
  }
  let lastState = "";
  let lastRequests = "";
  let lastQuestions = 0;
  // The open repository's requests, oldest first as their pins are numbered.
  let requests: PinRequest[] = [];
  // This browser's requests of the open workspace (`historyKey`), dismissed ones included.
  const records = options.records ?? indexedDbAgentRecords();
  let history = new Map<string, StoredRequest>();
  // `historyKey` is the loaded workspace's key as other tabs hear it (BroadcastChannel); `loading` is a read under way.
  let historyKey = "", historyScope: AgentWorkspace | undefined, loading: { scope: AgentWorkspace | undefined } | undefined, historyReads = 0;
  const scope = (): AgentWorkspace | undefined => {
    const repo = options.repository();
    return repo ? { account: options.account, repoId: repo.id, branch: repo.branch } : undefined;
  };
  // Two of this menu's workspaces under the workspace session's one rule (src/workspace-session.ts);
  // none and none count as the same.
  const sameScope = (a: AgentWorkspace | undefined, b: AgentWorkspace | undefined) => a && b ? same(githubScope(a), githubScope(b)) : !a && !b;
  // Whether `was` is still the open workspace.
  const stillOpen = (was: AgentWorkspace | undefined) => sameScope(was, scope());
  /** Reads the workspace's requests: on opening it, and when the tab is seen again. */
  async function loadHistory() {
    const current = scope(), key = current ? workspaceKey(current) : "", read = ++historyReads;
    loading = { scope: current };
    let list: StoredRequest[] = [];
    try {
      if (current) list = (await records.conversations(current)).map((item) => item.content as unknown as StoredRequest);
    } catch { /* Browser storage unavailable: no history; Ask agent says so. */ }
    if (disposed || read !== historyReads || !stillOpen(current)) return;
    loading = undefined;
    history = new Map(list.map((item) => [item.id, item]));
    historyKey = key; historyScope = current;
    tellRequests();
  }
  function followHistory() {
    const now = scope();
    if (!sameScope(now, historyScope) && !(loading && sameScope(now, loading.scope))) void loadHistory();
  }
  /** Keeps a browser request, optionally fenced against concurrent changes. */
  async function keep(workspace: AgentWorkspace, request: StoredRequest, accept?: (current?: { content: JsonValue }) => boolean, owner?: number) {
    const content = stored(request);
    const kept = await records.putConversation(workspace, { id: content.id, content: content as unknown as JsonValue, unfinished: isUnfinishedRequest(content.state), updatedAt: Date.now() }, accept, owner);
    if (disposed) return kept;
    // Shown at once; then read again, as the write may have evicted others and a read begun
    // before it may miss it.
    historyReads++;
    loading = undefined;
    if (kept && sameScope(workspace, historyScope)) {
      history.set(content.id, content);
      tellRequests();
    }
    void loadHistory();
    return kept;
  }
  // Another tab of this browser may have changed them: read them again when this one is seen.
  const reread = () => { if (document.visibilityState === "visible" && historyKey) void loadHistory(); };
  document.addEventListener("visibilitychange", reread);
  // The open workspace's requests, told only when they changed.
  function tellRequests() {
    const next = historyKey && stillOpen(historyScope) ? [...history.values()].filter((item) => item.state !== "dismissed") : [];
    const key = JSON.stringify(next);
    if (key === lastRequests) return;
    lastRequests = key;
    const workspace = scope();
    if (workspace && sameScope(historyScope, workspace)) {
      markStartup(workspace, next.length > 0 || agentsOn(workspace));
    }
    requests = [...next].sort((a, b) => a.createdAt - b.createdAt);
    options.onRequests?.(requests);
    flyout.refresh();
    const questions = requests.filter((item) => item.state === "question").length;
    if (questions === lastQuestions) return;
    lastQuestions = questions;
    options.onQuestions?.(questions);
    paint();
  }
  // Another tab of this browser receives for the site: this one offers what it would.
  const elsewhere = (current: string) => ["other-owner", "taken-over", "taking-over"].includes(current);
  /** What the one button offers in `current`: problems and in-between states offer Connect to MCP. */
  function offer(current = state()): "connect" | "wait" | "disconnect" {
    if (current === "connected" || elsewhere(current) && usedGrants().length) return "disconnect";
    if (current === "waiting" || elsewhere(current) && waiting()) return "wait";
    return "connect";
  }
  // Requests still waiting for an agent or for the user, in pin order.
  const pending = () => requests.filter((request) => isUnfinishedRequest(request.state));
  function paint() {
    const current = state();
    if (current !== lastState) {
      const was = lastState;
      lastState = current;
      if (was === "connected" || current === "connected") options.onConnection?.(current === "connected");
      if (current === "connected") flyout.refresh();
      else flyout.close();
    }
    followHistory();
    tellRequests();
    const offered = offer(current);
    root.dataset.state = current;
    root.dataset.offer = offered;
    // A press is refused only while a change is under way, before a site is open, while the
    // connection is first made, or until a recorded retry time.
    const retryAt = transportState?.retryAt ?? 0;
    action.disabled = changing || current === "closed" || current === "connecting" || current === "taking-over" || retryAt > Date.now();
    // Pressable again once the retry time passes.
    if (retryAt > Date.now() && retryAt !== repaintAt) {
      repaintAt = retryAt;
      clearTimeout(repaintTimer);
      repaintTimer = setTimeout(() => { if (!disposed) paint(); }, retryAt - Date.now());
    }
    // Until the moment passes or the state moves on (an agent connected meanwhile).
    const shown = confirmed && confirmed.until > Date.now() && confirmed.offer === offered ? confirmed.label : undefined;
    actionLabel.textContent = shown ?? (offered === "disconnect" ? "Disconnect MCP" : offered === "wait" ? "Wait for MCP" : "Connect to MCP");
    const asked = offered === "disconnect" ? lastQuestions : 0;
    root.classList.toggle("is-asking", asked > 0);
    count.hidden = !asked;
    count.textContent = asked ? String(asked) : "";
    download.hidden = !storage.problem || current === "closed";
    download.disabled = exporting;
    root.dataset.storage = storage.problem?.reason ?? "";
  }
  /** The button's label reads `label` for a moment, then its state again. */
  function confirmOnButton(label: string) {
    const shown = (confirmed = { label, until: Date.now() + CONFIRM_MS, offer: offer() });
    paint();
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      if (confirmed !== shown || disposed) return;
      confirmed = undefined;
      paint();
    }, CONFIRM_MS);
  }
  const unsubscribeStorage = storage.subscribe(() => paint());
  /** Downloads the open workspace's unsaved drafts (README.txt in it lists what is missing); after
   * a full storage, agents may edit again: a browser still full stops them before any write. */
  async function exportWork() {
    const repo = options.repository(), workspace = scope();
    if (!repo || exporting) return;
    // The workspace whose drafts are read; another one opened, or the menu gone, downloads nothing.
    const current = () => !disposed && stillOpen(workspace);
    exporting = true;
    paint();
    try {
      const { downloadUnsavedWork } = await import("../agent-recovery-export");
      if (!current()) return;
      const done = await downloadUnsavedWork({ account: options.account, repository: repo }, current);
      if (!done || !current()) return;
      // Full: agents may try again (still full stops them before any write). Blocked storage stays
      // blocked for this tab, and so does the button.
      if (storage.problem?.reason === "full") storage.resume();
    } catch { /* The button stays: the unsaved changes are still in this tab. */ } finally {
      exporting = false;
      if (!disposed) paint();
    }
  }
  // The flyout: the requests waiting for an agent or for the user, each showing its pin; an
  // agent's question shows instead of the request's text.
  function drawWaiting() {
    const parts = pending().map((request) => {
      const number = requests.indexOf(request) + 1;
      const asking = request.state === "question";
      const line = (asking && request.reply?.message.trim()) || request.text;
      const item = node("button", `flyout__item agent-menu__question${asking ? " is-asking" : ""}`);
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.dataset.key = request.id;
      const where = request.element.route ?? request.element.file;
      const text = node("span", "agent-menu__question-text");
      text.append(
        node("span", "agent-menu__question-line", clip(line, 60)),
        node("span", "agent-menu__question-where", `<${request.element.tag}> · ${where}`),
      );
      item.append(node("span", "agent-menu__question-number", String(number)), text);
      item.setAttribute("aria-label", `Request ${number}: ${line}, on <${request.element.tag}> of ${where}`);
      item.addEventListener("click", () => options.onShowRequest?.(request.id));
      return item;
    });
    waitingOn.replaceChildren(...parts);
  }
  async function act() {
    // The press does what its label said when it was pressed.
    const offered = (root.dataset.offer as ReturnType<typeof offer> | undefined) || offer();
    failedOn = undefined;
    const current = state();
    if (offered === "disconnect") await revoke();
    // Wait for MCP copies this tab's prompt again while its token still waits; a tab without
    // it (another tab copied it, a reload, or it was revoked) copies a prompt of its own.
    else if (offered === "wait") await copyAgain();
    // Idle, or another tab receives with nothing connected: a new prompt from here.
    else if (current === "idle" || elsewhere(current)) await start();
    else {
      // Off, or a problem (paused, lost, another site shown): turn on again for the open site.
      turnOff();
      await turnOn();
    }
  }
  // Connect to MCP while remote agents are off: an agent connected before
  // is used again (it may need resuming); otherwise a new prompt is made.
  async function turnOn(task?: string) {
    if (!options.repository() || changing) return;
    startRemote();
    await readConnections();
    if (ownerPaused) return;
    await activateSocket();
    if (state() === "idle") await start(task);
  }
  const live = (at: number) => !disposed && remote && !workspaceChanged && activation === at && sameRepository(options.repository(), pinned);
  const site = (repo: { id: number; branch: string }): AgentWorkspace => ({ account: options.account, repoId: repo.id, branch: repo.branch });
  /** Remembers remote agents on, or forgets them, for the pinned site in this browser. Requests
   * this menu has not read for that site keep the startup mark; reading them settles it. */
  function remember(on: boolean) {
    if (!pinned) return;
    const workspace = site(pinned);
    try {
      if (on) localStorage.setItem(agentsOnKey(workspace), "1");
      else localStorage.removeItem(agentsOnKey(workspace));
    } catch { /* Storage full or blocked: this tab keeps them on; a reload starts with them off. */ }
    if (on || sameScope(historyScope, workspace)) markStartup(workspace, on || requests.length > 0);
  }
  function startRemote() {
    if (remote || disposed) return;
    remote = true;
    ownerPaused = false;
    failedOn = undefined;
    activation++;
    pinned = options.repository();
    remember(true);
    workspaceChanged = false;
    transportMode = "pending";
    transportState = undefined;
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    paint();
  }
  /** Stops this tab's live connection and pending consent checks; `forget` also turns remote
   * agents off for the site in this browser's other and later tabs. */
  function turnOff(forget = false) {
    if (!remote) return;
    failedOn = undefined;
    if (forget) remember(false);
    remote = false;
    ownerPaused = false;
    activation++;
    stopAutomatic();
    transport?.stop(); transport = undefined;
    transportState = undefined;
    requestTools?.notify(); requestTools = undefined;
    workspaceChanged = false;
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("focus", wake);
    for (const grant of hub.grants) declined.add(grant.id);
    hub = { grants: [] };
    paint();
  }
  // A task the copied prompt asks for first (Start your site's Build it with an agent).
  let goal: string | undefined;
  async function start(task?: string) {
    const repo = options.repository(), at = activation;
    if (!repo || changing) return;
    goal = task;
    changing = true;
    paint();
    try {
      // Unused tokens older than a moment are revoked, so they never fill the site's five
      // connections; a newer one may be the prompt another tab of this browser just copied.
      // Every check holds the site this prompt is for, read before the first await.
      const current = () => live(at) && sameRepository(options.repository(), repo);
      const own = () => hub.grants.filter((grant) => sameBranch(grant, branchOf(repo)));
      const drop = (before: number) => revokeUnused({ grants: own(), before, live: current, revoke: (id) => api("revoke", { id }) });
      await drop(Date.now() - FRESH_TOKEN_MS);
      if (!current()) return;
      const made = () => api("connect", { repo: repo.fullName, repoId: repo.id, branch: repo.branch });
      let result;
      try { result = await made(); } catch (error) {
        if (!current()) return;
        // Refused because the site's connections are full: every unused token of the site goes,
        // then one more try. Any other failure revokes nothing (a fresh token may be another tab's).
        if (!(error instanceof RefusedError && siteFull(error.status, error.message)) || !own().some(unused)) throw error;
        await drop(Infinity);
        if (!current()) return;
        result = await made();
      }
      if (disposed) return;
      // The tab moved to another repository or branch meanwhile: that token is pinned to the old one.
      const now = options.repository();
      if (!live(at) || !sameRepository(now, repo)) {
        await api("revoke", { id: result.id }).catch(() => undefined);
        return;
      }
      token = result.token;
      tokenId = result.id;
      changing = false;
      await readConnections();
      if (!live(at)) return;
      await copyPrompt();
    } catch {
      changing = false;
      // With no connection of the site at all, remote agents go off; another tab's waiting
      // token, or a connected agent, keeps them on. The press made no prompt: the dot shows it
      // (`failedOn`) until the next press.
      if (!liveGrants().length && !["paused", "quota", "reconnecting"].includes(transportState?.mode ?? "")) turnOff(true);
      failedOn = repo;
    } finally {
      changing = false;
      paint();
    }
  }
  async function revoke() {
    if (changing) return;
    changing = true;
    paint();
    try {
      // Every agent on this site's connections, the shared token's and ones this tab has not
      // read yet included (the server lists them).
      const at = activation, shown = pinned ?? options.repository();
      if (shown) await api("revoke", { all: true, repoId: shown.id, branch: shown.branch });
      token = tokenId = undefined;
      changing = false;
      // Turned off or another site shown meanwhile: that site's own state stays as it is.
      if (live(at)) turnOff(true);
    } catch { /* Still connected: the button stays Disconnect MCP. */ } finally {
      changing = false;
      paint();
    }
  }
  /** Wait for MCP: this tab's prompt again while its token still waits (read fresh: another tab
   * may have revoked it as unused), otherwise a prompt of its own. */
  async function copyAgain(task = goal) {
    const at = activation, repo = options.repository();
    // Unread (failed or fenced out), the old list cannot prove the token still waits: a new prompt.
    const read = await readConnections(true);
    if (!live(at) || !sameRepository(options.repository(), repo)) return;
    const ours = read && token && liveGrants().some((grant) => grant.id === tokenId && unused(grant));
    if (ours) { goal = task; await copyPrompt(); } else await start(task);
  }
  async function copyPrompt() {
    const repo = options.repository();
    if (!token || !repo) return;
    try {
      await navigator.clipboard.writeText(connectionPrompt(`${location.origin}/mcp`, token, repo.fullName, goal));
      confirmOnButton("Copied");
    } catch { /* Clipboard refused: the label does not confirm; pressing again tries again. */ }
  }

  // One connections read at a time (src/agent-resume.ts).
  const reads = serialReads(async () => {
    if (disposed || !remote || workspaceChanged) return false;
    const at = activation;
    try {
      const next: HubState = await api("connections", undefined, at);
      if (!live(at)) return false;
      hub = next;
      lastRead = Date.now();
      paint();
      return true;
    } catch { return false; }
  });
  /** Explicit metadata refresh; never loads or uploads site content. True when this read answered
   * and set the connections for the current activation. A read already in flight skips this one,
   * unless `wait`: then this one waits for it and reads for itself (src/agent-resume.ts). */
  function readConnections(wait = false) { return reads.run(wait); }
  /** Remote agents remembered on for the open site come back on (src/agent-resume.ts). */
  async function resume() {
    const repo = options.repository();
    if (remote || disposed || changing || !repo || !agentsOn(site(repo))) return;
    await resumeAgents({
      start: () => { startRemote(); return activation; },
      live: at => live(at) && !ownerPaused,
      // A check already in flight belongs to another activation: wait for it, then read for this one.
      read: () => readConnections(true),
      granted: () => liveGrants().length > 0,
      forget: () => turnOff(true),
      open: activateSocket,
    });
  }
  function wake() {
    // Waiting for an agent, or after a failed press with remote agents still on (another tab's
    // token waits): returning to the tab looks once whether an agent connected meanwhile.
    if (!workspaceChanged && document.visibilityState === "visible" && ["waiting", "failed"].includes(state()) && Date.now() - lastRead >= 2000)
      void readConnections();
  }
  // A connection approved in this browser turns remote agents on only for
  // the exact approval, repository and branch named by the consent page.
  // The grant arrives after the consent page's announcement, so check a few times.
  function matches(approval: AgentApproval) {
    const repo = options.repository();
    return approval && typeof approval.approval === "string" && approval.approval.length > 0 &&
      sameBranch(approval, branchOf(repo));
  }
  function consentGranted(approval: AgentApproval) {
    if (!matches(approval)) return;
    if (["quota", "paused", "reconnecting"].includes(transportState?.mode ?? "")) return;
    for (const check of consentChecks) clearTimeout(check);
    consentChecks = [1000, 4000, 10_000].map((delay) => setTimeout(() => void checkConsent(approval), delay));
  }
  async function checkConsent(approval: AgentApproval) {
    if (disposed || !matches(approval)) return;
    if (remote) return void readConnections();
    const repo = options.repository();
    if (!repo || changing) return;
    // Off tabs still honour a pause recorded by an on tab before checking consent.
    const workspace = { account: options.account.toLowerCase(), repoId: repo.id };
    if (recoveryHolds(localStorage, workspace, Date.now())) return;
    const since = activation;
    const found: HubState | undefined = await api("connections").catch((error) => {
      // Today's allowance used up, or a cooldown: the workspace's tabs skip their checks until it ends.
      if (!(error instanceof AgentFailureError)) return undefined;
      // This tab's checks stop on quota even when browser storage refuses the record.
      if (error.failure.kind === "quota") {
        for (const check of consentChecks) clearTimeout(check);
        consentChecks = [];
      }
      try { recordFailure(localStorage, workspace, error.failure, Date.now()); } catch { /* storage full: nothing shared */ }
      return undefined;
    });
    // Turned on, or on and off again, meanwhile: this answer decides nothing.
    if (disposed || remote || activation !== since || !sameRepository(options.repository(), repo) || !matches(approval)) return;
    // Match the exact approval, even when token exchange is delayed.
    if (!found?.grants?.some((grant) => grant.via === "oauth" && sameBranch(grant, branchOf(repo)) && sameBranch(grant, approval) && grant.approval === approval.approval && !declined.has(grant.id))) return;
    for (const check of consentChecks) clearTimeout(check);
    consentChecks = [];
    startRemote();
    hub = found;
    await activateSocket();
    paint();
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === AGENT_CONNECTED_KEY) {
      try { consentGranted(JSON.parse(event.newValue ?? "null")); } catch { /* Old or invalid announcements grant nothing. */ }
    }
    // Turned off for this site in another tab (Disconnect, sign-in ended, connections gone): off here
    // too, so this tab never takes over agents that were turned off.
    if (remote && pinned && event.newValue === null && event.key === agentsOnKey(site(pinned))) { turnOff(); paint(); }
  };
  window.addEventListener("storage", onStorage);
  forgetWatch();
  paint();
  void resume();
  return {
    root,
    consentGranted,
    /**
     * Makes a token, as Connect to MCP does, and copies the prompt ending
     * with `task`; while a token waits for its agent, copies it again.
     * Resolves to whether the prompt was copied.
     */
    async connect(task: string) {
      if (state() === "waiting" && token) await copyAgain(task);
      else if (!remote) {
        await turnOn(task);
        // Another tab's token waits: this tab makes a prompt of its own.
        if (!token && offer() === "wait") await start(task);
      } else await start(task);
      return Boolean(token);
    },
    /** Whether an agent is connected now. */
    connected() {
      return state() === "connected";
    },
    /** Ask agent: a request about an element, for agents to fetch, kept in this browser. */
    async ask(text: string, element: AgentElement) {
      const repo = options.repository(), workspace = scope(), at = activation;
      if (!repo || !workspace) throw new Error("Open a site first.");
      const key = workspaceKey(workspace);
      // Refused before anything is sent when this browser cannot keep it.
      const planned = stored({ id: "req-planned", text, createdAt: Date.now(), repoId: repo.id, branch: repo.branch, repository: repo.fullName, state: "open", element, thread: [{ from: "user", text, at: Date.now() }] });
      await records.checkConversation(workspace, { id: planned.id, content: planned as unknown as JsonValue, unfinished: true, updatedAt: Date.now() }).catch((error) => refusal(error, " Nothing was sent."));
      // Turned off, or another site or branch opened, while storage answered: nothing is sent.
      if (!live(at) || !stillOpen(workspace)) throw new Error("Remote agents or the open site changed meanwhile. Nothing was sent; ask again.");
      // The request stays in this browser and reaches agents over the socket.
      const request = localRequest(repo, text, element);
      // Turned off, or another site or branch opened, before the write commits: nothing is kept or announced.
      const still = () => live(at) && stillOpen(workspace);
      const kept = await keep(workspace, request, () => still()).catch((error) => refusal(error, " Nothing was sent."));
      if (!kept) throw new Error("Remote agents or the open site changed meanwhile. Nothing was sent; ask again.");
      requestsChanged(key);
      return request as PinRequest;
    },
    /** Answer an agent's question from its pin: the request waits for agents again. */
    async answer(id: string, text: string) {
      const workspace = scope(), at = activation;
      if (!remote) throw new Error("Remote agents are off in this tab. Choose Connect to MCP in the project menu, then send your answer.");
      if (!workspace || !history.has(id)) throw new Error("This request is not in this site's history any more.");
      const local = history.get(id)!, key = workspaceKey(workspace);
      // Refused before it is sent when this browser cannot keep the conversation with the answer.
      const answered = { ...local, state: "open" as const, thread: [...(local.thread ?? []), { from: "user" as const, text, at: Date.now() }] };
      await records.checkConversation(workspace, { id, content: stored(answered) as unknown as JsonValue, unfinished: true, updatedAt: Date.now() }).catch((error) => refusal(error, " Nothing was sent."));
      if (!live(at) || !stillOpen(workspace)) throw new Error("Remote agents or the open site changed meanwhile. Nothing was sent; answer again.");
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > REQUEST_TEXT_LIMIT) throw new Error(`An answer needs text (up to ${REQUEST_TEXT_LIMIT} characters).`);
      // The browser request waits for every agent again after the user's answer.
      const list = (await records.conversations(workspace)).map((item) => item.content as unknown as AgentRequest);
      // Turned off, or another site or branch opened, during the read: nothing is kept (checked again at the write).
      const still = () => live(at) && stillOpen(workspace);
      if (!still()) throw new Error("Remote agents or the open site changed meanwhile. Nothing was sent; answer again.");
      const { request: result, accept } = answerRequest(list, id, trimmed);
      if (!await keep(workspace, result as StoredRequest, current => still() && accept(current?.content as unknown as AgentRequest | undefined)).catch(refusal))
        throw new Error("This request changed meanwhile (dismissed or answered in another tab). Open its card again.");
      requestsChanged(key);
      return;
    },
    /** Dismisses a request in this browser, including when remote agents are off. */
    async dismiss(id: string) {
      const workspace = scope(), local = history.get(id);
      if (!workspace || !local || local.state === "dismissed") return;
      const waiting = isUnfinishedRequest(local.state);
      // Not kept (browser storage refused): the pin stays, showing it was not dismissed.
      try { await keep(workspace, { ...local, state: "dismissed" }); } catch { return; }
      if (!waiting || !remote) return;
      requestsChanged(workspaceKey(workspace));
    },
    /** The local workspace changed; keep the socket pinned to its original scope. */
    changed() {
      recoverWorkspace();
      // Switched in this tab to another site remembered on: its agents come back on here, and the
      // site left stays remembered.
      const repo = options.repository();
      if (workspaceChanged && !changing && repo && agentsOn(site(repo))) turnOff();
      paint();
      transport?.changed();
      void resume();
    },
    destroy() {
      disposed = true;
      clearTimeout(repaintTimer);
      clearTimeout(confirmTimer);
      flyout.destroy();
      turnOff();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", reread);
      channel?.close();
      unsubscribeStorage();
      token = tokenId = undefined;
    },
  };
}

/** Watch records of the removed Watch control (`native-site-editor:agent-watch:…`): nothing reads them now. */
function forgetWatch() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) if (key?.startsWith("native-site-editor:agent-watch:")) localStorage.removeItem(key);
  } catch { /* Storage blocked: nothing to forget. */ }
}

// A line of at most `limit` characters, with … when cut.
function clip(text: string, limit: number) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > limit ? `${line.slice(0, limit - 1).trimEnd()}…` : line;
}

type StoredRequest = PinRequest & { repoId: number; branch?: string; repository?: string; seenAt?: number; returnedTo?: string[] };
/** A request as this browser keeps it. With the live relay it is the only copy, so it keeps its
 * element's source (clipped) and which connections had it (at most 20), as the hub did. */
function stored(request: StoredRequest): StoredRequest {
  return JSON.parse(JSON.stringify(request));
}
/** Validates and creates Ask agent's browser record. */
function localRequest(repo: { id: number; fullName: string; branch: string }, text: string, element: AgentElement): StoredRequest {
  const asked = text.trim();
  if (!asked || asked.length > REQUEST_TEXT_LIMIT) throw new Error(`A request needs text (up to ${REQUEST_TEXT_LIMIT} characters).`);
  const html = element.html !== undefined && element.html.length > REQUEST_HTML_LIMIT ? element.html.slice(0, REQUEST_HTML_LIMIT) : element.html;
  const createdAt = Date.now();
  return stored({
    id: `req-${crypto.randomUUID()}`, text: asked, createdAt, repoId: repo.id, repository: repo.fullName, branch: repo.branch, state: "open",
    element: { ...element, ...(html !== undefined ? { html } : {}), ...(html !== element.html ? { htmlClipped: true } : {}) } as PinRequest["element"],
    thread: [{ from: "user", text: asked, at: createdAt }],
  });
}
function refusalText(error: unknown) {
  if (error instanceof AgentRecordsError && error.code === "capacity") return error.message;
  if (error instanceof AgentRecordsError)
    return "This browser could not keep your requests to agents: its storage is unavailable or full.";
  return (error as Error).message;
}
function refusal(error: unknown, note = ""): never {
  throw new Error(`${refusalText(error)}${note}`, { cause: error });
}

