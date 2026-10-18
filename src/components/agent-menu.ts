import { connectionPrompt } from "../agent-prompts";
import { browserAgentRecovery, recordFailure, recoveryHolds } from "../agent-recovery";
import { AgentFailureError, classifyAgentFailure } from "../../shared/agent-failure";
import { button, node } from "../ui/dom";
import { REQUEST_HTML_LIMIT, REQUEST_TEXT_LIMIT, textBytes, type AgentCommand, type AgentElement, type AgentRequest } from "../../shared/agent";
import { WATCH_WAITS, agentWatch, answerRequest, createRequestTools } from "../agent-watch";
import { payloadIdentity, workspaceKey, type AgentWorkspace, type JsonValue } from "../../shared/agent-command";
import { AgentRecordsError, agentStorageStatus, indexedDbAgentRecords, isUnfinishedRequest, type AgentRecords, type AgentStorageProblem } from "../agent-records";
import type { createLiveTransport } from "../agent-transport";
import type { AgentReadPorts } from "../agent-tools-read";
import type { SharedContext } from "../agent-site";
import type { PinRequest } from "./agent-pins";
import { agentHistoryKey } from "../controllers/agent-controller";
import { mountFlyout } from "./flyout";
import { gzip } from "./publish-menu";
import "./agent-menu.css";

// The "Connect with MCP" button, and the editor tab's side of the MCP
// connection.
//
// Agents connect to `/mcp` with OAuth (a custom connector in claude.ai or
// Claude Desktop) or with a token in the prompt copied here. Either way the
// connection belongs to this editor session, repository and branch; the Worker keeps the session's
// connections, the context the sharing tab last reported, and the changes
// agents queued in one hub (worker/agent-context.ts).
//
// Remote agents are off in each tab until the user turns them on there:
// Connect with MCP, or approving a connection in this browser for the
// repository this tab shows (`consentGranted`). Until then the tab makes no
// agent requests at all, an existing connection included, and the choice is
// not remembered across reloads. Turn off (or Disconnect MCP) stops it again.
// The live transport is loaded only on opt-in. It receives fenced commands over one pinned
// socket and keeps background ownership. Polling, context/draft uploads and claim/ack below
// remain reachable only when WebSocket or the relay route is unavailable.
//
// Ask agent in the edit bar keeps a request about an element. With the live
// relay it stays in this browser: agents fetch it with wait_for_requests over the
// socket and answer it (src/agent-watch.ts), and Ask, answer and dismiss make no
// hub call. A wait answers at once unless the user turned on Watch here (at most
// 10 minutes, shown with its deadline, then paused). Only the legacy fallback still
// sends requests to the hub (`ask`), where agents take them the same way. The
// browser keeps its own copy of each request (src/agent-records.ts, per
// account, repository and branch), which is what the pins and this menu
// show: it stays after remote agents are turned off or the tab reloads, is
// not shared with other devices and never turns remote agents back on.
// While remote agents are on, each poll brings the agents' progress on the
// workspace's requests (state and thread); one this browser lacks is adopted
// only while it still waits. Clearing or dismissing a request is local; one still waiting is
// dismissed on the hub too, at once while on, or on the next poll once
// turned on again. The user answers an agent's question from its pin
// (`answer`), which needs remote agents on.
//
// While an agent is connected, Disconnect MCP counts the questions agents
// ask the user, as the project selector's tile does, and hovering or
// focusing it opens a flyout (components/flyout.ts) of what the agents wait
// on: the connected agents, then each question with its element and page,
// which shows its pin with the answer box (`onShowRequest`), or how many
// requests agents have when none asks.

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
  tabId: string | null;
  updatedAt: number | null;
  commands: AgentCommand[];
  requests?: (PinRequest & { repoId: number; branch?: string })[];
}

export interface AgentApproval {
  at: number;
  repo: string;
  branch: string;
  approval: string;
}

export const AGENT_CONNECTED_KEY = "native-site-editor:agent-connected";
const QUOTA_PAUSE = "Remote agents are paused: the editor's service has used up today's allowance. Your drafts and sign-in are safe, and you can keep editing.";
const FAST = 2000;
const SLOW = 30_000;

export function createAgentMenu(options: {
  account: string;
  /** The open repository, for the panel; nothing before one is open. */
  repository: () => { id: number; fullName: string; branch: string } | undefined;
  /** The context to share and its drafts' texts, built when it is sent. */
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
  let hub: HubState = { grants: [], tabId: null, updatedAt: null, commands: [] };
  let token: string | undefined,
    tokenId: string | undefined;
  let disposed = false,
    polling = false,
    changing = false,
    shared = false,
    remote = false,
    // Each Connect and Turn off starts a new activation; work begun in an older one writes nothing.
    activation = 0;
  let revision = 0,
    sentRevision = -1,
    lastSent = 0,
    lastPoll = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let consentChecks: ReturnType<typeof setTimeout>[] = [];
  let recovery: ReturnType<typeof browserAgentRecovery> | undefined;
  let recoveryRepo: number | undefined, retrying = false;
  let transport: ReturnType<typeof createLiveTransport> | undefined;
  let transportMode: "pending" | "socket" | "legacy" = "pending";
  let pinned: ReturnType<typeof options.repository>;
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
    if (!remote || disposed || workspaceChanged || transportMode !== "pending" || !pinned) return;
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
      workspace, watch: agentWatch(workspace),
      list: async () => (await records.conversations(workspace)).map(item => item.content as unknown as AgentRequest),
      save: (request, accept, owner) => keep(workspace, request as StoredRequest, current => accept(current?.content as unknown as AgentRequest | undefined), owner),
    });
    let editTools: Promise<ReturnType<typeof import("../agent-tools-edit")["createAgentEditTools"]>> | undefined;
    let mediaTools: Promise<ReturnType<typeof import("../agent-tools-media")["createAgentMediaTools"]>> | undefined;
    transport = createLiveTransport({
      workspace: { account: options.account, repoId: repo.id, branch: repo.branch }, repo: repo.fullName, tabId,
      current: scope, records, reload: snapshot => options.reload?.(snapshot) ?? Promise.resolve(),
      source: path => options.tools?.source?.(path),
      media: async (request, generation, current, deadline, seen, signal) => {
        const ports = options.tools, stamp = ports?.stamp(), commit = ports?.files()?.snapshot.commit;
        if (!ports || !stamp) return { ok: false, message: "Browser media tools are unavailable. Refresh the editor." };
        mediaTools ??= import("../agent-tools-media").then(({ createAgentMediaTools }) => createAgentMediaTools({
          workspace: { account: options.account, repoId: repo.id, branch: repo.branch }, ports, records, run,
        }));
        return (await mediaTools).run(request, generation, () => current() && stamp.holds() && ports.files()?.snapshot.commit === commit, deadline, seen, signal);
      },
      edit: async (request, generation, current, signal) => {
        const ports = options.tools, stamp = ports?.stamp();
        const source = ports?.files(), commit = source?.snapshot.commit;
        if (!ports || !stamp) return { ok: false, message: "Browser edit tools are unavailable. Refresh the editor." };
        editTools ??= import("../agent-tools-edit").then(({ createAgentEditTools }) => createAgentEditTools({
          workspace: { account: options.account, repoId: repo.id, branch: repo.branch }, ports, records,
          run,
        }));
        return (await editTools).run(request, generation, () => current() && stamp.holds() && ports.files()?.snapshot.commit === commit, signal);
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
      requests: async (request, generation, current, deadline, signal) => {
        const tools = requestTools;
        if (!tools) return { ok: false, message: "Browser request tools are unavailable. Refresh the editor." };
        // An agent asking for requests is connected, as one sending a change is.
        const grant = hub.grants.find(each => each.id === request.grantId);
        if (grant && !grant.usedAt) { grant.usedAt = Date.now(); paint(); }
        try { return await tools.run(request, current, deadline, generation, signal); }
        finally {
          if (request.tool !== "get_request") broadcast(workspaceKey(workspace));
          if (live(at)) { refreshWatch(); paint(); }
        }
      },
      run,
      listen: next => {
        // Same activation, even while a refresh briefly removes the repository: quota, pause and
        // takeover updates must not be lost (a real move sets workspaceChanged and a new activation).
        if (disposed || !remote || activation !== at || workspaceChanged) return;
        transportState = next;
        if (next.mode === "fallback") {
          transportMode = "legacy";
          transport?.stop(); transport = undefined;
          recoverWorkspace();
        }
        paint();
      },
    });
    await transport.start().catch((error: unknown) => { if (live(at)) say((error as Error).message); });
  }
  // Grants this tab saw before Turn off: a later approval elsewhere never turns them back on.
  const declined = new Set<string>();
  const applied = new Map<string, { state: string; message: string; result?: AgentCommand["result"] }>();

  // One button: "Connect with MCP" makes a token and copies a prompt that
  // tells an agent how to connect; it waits until an agent first uses the
  // connection, then offers "Disconnect MCP", which revokes the
  // repository's connections (OAuth ones included).
  const root = node("div", "agent-menu");
  const action = button("", () => void act(), "text-button agent-menu__action");
  const actionLabel = node("span", "agent-menu__label", "Connect with MCP");
  // The questions waiting for the user, as on the project selector's tile.
  const count = node("span", "agent-menu__count");
  count.setAttribute("aria-hidden", "true");
  count.hidden = true;
  action.append(actionLabel, count);
  const hint = node("p", "agent-menu__hint");
  hint.setAttribute("role", "status");
  const again = button("Copy again", () => void copyPrompt(), "text-button agent-menu__link");
  const cancel = button("Cancel", () => void revoke(), "text-button agent-menu__link");
  // Stops this tab's remote work; the agents' access stays for when it is turned on again.
  const off = button("Turn off", () => turnOff(), "text-button agent-menu__link");
  const retry = button("Retry", () => {
    if ((!recovery && !transport) || retrying) return;
    retrying = true;
    paint();
    void (transport ? transport.retry() : recovery!.retry()).finally(() => { retrying = false; paint(); });
  }, "text-button agent-menu__link");
  off.title = "Stop remote agents in this tab. Their access stays; Connect with MCP turns them on again.";
  const links = node("span", "agent-menu__links");
  const takeover = button("Take over", () => {
    void transport?.takeover().catch((error: unknown) => showError(error));
  }, "text-button agent-menu__link");
  const move = button("Move agents here", () => void moveHere(), "text-button agent-menu__link");
  const another = button("Connect another agent", () => { turnOff(); void turnOn(); }, "text-button agent-menu__link");
  links.append(again, cancel, retry, takeover, move, another, off);
  // Agent edits stopped because this browser cannot keep them: what to do, and a copy of the work.
  const storage = agentStorageStatus();
  const trouble = node("div", "agent-menu__storage");
  trouble.setAttribute("role", "alert");
  const troubleText = node("p", "agent-menu__storage-text");
  let exporting = false;
  const download = button("Download unsaved changes", () => void exportWork(), "text-button agent-menu__link");
  const tryAgain = button("Try again", () => { storage.resume(); paint(); }, "text-button agent-menu__link");
  tryAgain.title = "Let agents edit again once there is space; a full browser stops them again.";
  const troubleLinks = node("span", "agent-menu__links");
  troubleLinks.append(download, tryAgain);
  trouble.append(troubleText, troubleLinks);
  trouble.hidden = true;
  // What the connected agents wait on, beside Disconnect MCP.
  const waitingOn = node("div", "agent-menu__waiting");
  waitingOn.id = "agent-waiting";
  waitingOn.setAttribute("role", "menu");
  // Watch (ticket 18): the user lets agents wait for requests here, for at most ten minutes.
  const watchRow = node("div", "agent-menu__watch");
  const watchText = node("p", "agent-menu__watch-text");
  const watchStart = button("Watch for requests", () => setWatch(true), "text-button agent-menu__link");
  const watchStop = button("Stop watching", () => setWatch(false), "text-button agent-menu__link");
  const watchLinks = node("span", "agent-menu__links");
  watchLinks.append(watchStart, watchStop);
  watchRow.append(watchText, watchLinks);
  watchRow.hidden = true;
  root.append(action, hint, links, watchRow, trouble, waitingOn);
  const flyout = mountFlyout({
    panel: waitingOn,
    label: "What agents wait on",
    render: drawWaiting,
    enabled: () => state() === "connected",
    openOnFocus: true,
  });
  flyout.attach(action);
  /** A message that replaces the state's own hint until the state changes. */
  let notice: { text: string; state: string } | undefined;

  /** `at`: the remote activation an upload belongs to; once it ended, nothing is sent. */
  async function api(action: string, body?: unknown, zipped = false, at?: number, recovering = false) {
    const sent = body === undefined ? undefined : zipped ? await gzip(JSON.stringify(body)) : JSON.stringify(body);
    if (at !== undefined && !live(at)) throw new Error("Remote agents were turned off.");
    if (!recovering && (recovery && !recovery.allowAutomatic() || transportMode === "socket" && !workspaceChanged && ["quota", "paused", "reconnecting"].includes(transportState?.mode ?? ""))) throw new AgentFailureError({ kind: "other" }, "Remote agents are paused.");
    // A failure counts only for the workspace that sent the request: not one opened since.
    const scope = recovery;
    const report = (error: AgentFailureError) => {
      if (!recovering && recovery === scope && (at === undefined || live(at))) failed(error);
      return error;
    };
    let response: Response | undefined, text: string;
    // A connection lost while the answer's body arrives is a network failure too.
    try {
      response = await fetch(`/api/agent/${action}`, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers: body === undefined ? undefined : { "Content-Type": "application/json", ...(zipped ? { "Content-Encoding": "gzip" } : {}) },
        body: sent,
      });
      text = await response.text();
    } catch {
      // Headers that did arrive still carry their Retry-After.
      throw report(new AgentFailureError(classifyAgentFailure({ networkError: true, status: response?.status, retryAfter: response?.headers.get("Retry-After"), now: Date.now() })));
    }
    let result;
    try { result = JSON.parse(text); } catch { /* Cloudflare's 1027 answer is HTML. */ }
    if (!response.ok) {
      throw report(new AgentFailureError(classifyAgentFailure({ status: response.status, body: result, text, retryAfter: response.headers.get("Retry-After"), now: Date.now() }), result?.error));
    }
    return result ?? {};
  }
  function stopAutomatic() {
    clearInterval(interval);
    interval = undefined;
    clearTimeout(timer);
    for (const check of consentChecks) clearTimeout(check);
    consentChecks = [];
  }
  function failed(error: AgentFailureError) {
    if (error.failure.kind === "auth") {
      turnOff(false);
      say("Your sign-in to the editor ended. Sign in again, then choose Connect with MCP.");
    } else if (transportMode === "socket") transport?.report(error.failure);
    else if (recovery) recovery.report(error.failure);
    else if (pinned) {
      try { recordFailure(localStorage, { account: options.account.toLowerCase(), repoId: pinned.id }, error.failure, Date.now()); } catch { /* Activation still reports the failure below. */ }
      if (error.failure.kind === "quota") say(QUOTA_PAUSE);
    }
  }
  function showError(error: unknown) {
    if (!(error instanceof AgentFailureError) || error.failure.kind === "other") say((error as Error).message);
  }
  function recoverWorkspace() {
    const repo = options.repository();
    if (!remote) return;
    // Only another open repository or branch is a move: none while a refresh reloads it.
    if (!workspaceChanged && pinned && repo && (repo.id !== pinned.id || repo.branch !== pinned.branch)) {
      workspaceChanged = true;
      activation++;
      stopAutomatic();
      recovery?.dispose(); recovery = undefined;
      transport?.changed();
      transportState = { mode: "workspace-changed" };
    }
    if (workspaceChanged || transportMode !== "legacy" || repo?.id === recoveryRepo && recovery) return;
    recovery?.dispose();
    activation++;
    recoveryRepo = repo?.id;
    recovery = repo ? browserAgentRecovery({ account: options.account.toLowerCase(), repoId: repo.id }, tabId, async (current) => {
      const at = activation;
      try {
        const next: HubState = await api("hub", undefined, false, at, true);
        if (live(at) && current()) hub = next;
      } catch (error) {
        if (live(at) && current() && error instanceof AgentFailureError && error.failure.kind === "auth") failed(error);
        throw error;
      }
    }) : undefined;
    recovery?.subscribe(recoveryChanged);
    recoveryChanged();
  }
  function recoveryChanged() {
    if (!remote || transportMode !== "legacy") return;
    if (!recovery?.allowAutomatic()) stopAutomatic();
    else if (interval === undefined) {
      interval = setInterval(() => void poll(), FAST);
      // Resume with a fresh read, without re-arming consent checks.
      timer = setTimeout(() => void poll(true), 0);
    }
    paint();
  }
  // Only connections pinned to this tab's repository and branch count.
  const liveGrants = () => {
    const repo = options.repository();
    return repo ? hub.grants.filter((grant) => grant.repoId === repo.id && grant.branch === repo.branch) : [];
  };
  const usedGrants = () => liveGrants().filter((grant) => grant.via === "oauth" || grant.usedAt);
  /** The token this tab made, while no agent has used it yet. */
  const waiting = () => Boolean(token && tokenId && liveGrants().some((grant) => grant.id === tokenId && !grant.usedAt));
  function state() {
    if (!remote) return options.repository() ? "off" : "closed";
    if (workspaceChanged) return "workspace-changed";
    if (transportMode === "pending") return "connecting";
    if (transportMode === "socket" && transportState && !["live", "fallback"].includes(transportState.mode)) return transportState.mode;
    if (recovery && recovery.state().mode !== "ok") return "paused";
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
  let historyKey = "", loadingKey: string | undefined, historyLoads = 0;
  const scope = (): AgentWorkspace | undefined => {
    const repo = options.repository();
    return repo ? { account: options.account, repoId: repo.id, branch: repo.branch } : undefined;
  };
  const scopeKey = () => { const current = scope(); return current ? workspaceKey(current) : ""; };
  /** Reads the workspace's requests: on opening it, and when the tab is seen again. */
  async function loadHistory() {
    const current = scope(), key = current ? workspaceKey(current) : "", load = ++historyLoads;
    loadingKey = key;
    let list: StoredRequest[] = [];
    try {
      if (current) list = (await records.conversations(current)).map((item) => item.content as unknown as StoredRequest);
    } catch { /* Browser storage unavailable: no history; Ask agent says so. */ }
    if (disposed || load !== historyLoads || scopeKey() !== key) return;
    loadingKey = undefined;
    history = new Map(list.map((item) => [item.id, item]));
    historyKey = key;
    tellRequests();
  }
  function followHistory() {
    const key = scopeKey();
    if (key !== historyKey && key !== loadingKey) void loadHistory();
  }
  /**
   * Keeps one request in this browser and shows it; refuses (throws) at capacity. As `progress`
   * (an agent's progress from the hub, or an answer), it is kept only over a stored request it is
   * newer than, and never over one dismissed (perhaps by another tab meanwhile), and when none is
   * stored only if `adopt`: then this tab reads them again.
   */
  async function keep(workspace: AgentWorkspace, request: StoredRequest, progress?: { adopt: boolean } | ((current?: { content: JsonValue }) => boolean), owner?: number) {
    const content = stored(request);
    const accept = typeof progress === "function" ? progress : progress ? (current?: { content: JsonValue }) => {
      const before = current?.content as unknown as StoredRequest | undefined;
      return before ? before.state !== "dismissed" && progressOf(content) >= progressOf(before) : progress.adopt;
    } : undefined;
    const kept = await records.putConversation(workspace, { id: content.id, content: content as unknown as JsonValue, unfinished: isUnfinishedRequest(content.state), updatedAt: Date.now() }, accept, owner);
    if (disposed) return kept;
    // Shown at once; then read again, as the write may have evicted others and a read begun
    // before it may miss it.
    historyLoads++;
    loadingKey = undefined;
    if (kept && workspaceKey(workspace) === historyKey) {
      history.set(content.id, content);
      tellRequests();
    }
    void loadHistory();
    return kept;
  }
  // Another tab of this browser may have changed them: read them again when this one is seen.
  const reread = () => { if (document.visibilityState === "visible" && historyKey) void loadHistory(); };
  document.addEventListener("visibilitychange", reread);
  // While remote agents are on, a poll brings the agents' progress on the requests asked here.
  async function mergeHub(at: number) {
    const workspace = scope();
    if (!workspace || workspaceKey(workspace) !== historyKey) return;
    for (const item of hub.requests ?? []) {
      const local = history.get(item.id);
      if (item.repoId !== workspace.repoId || item.branch !== workspace.branch || !live(at)) continue;
      // One this browser does not have (asked in this session before it kept them, or kept in a
      // storage since cleared) is adopted while it still waits; a finished one is not.
      if (!local) {
        if (isUnfinishedRequest(item.state)) await keep(workspace, item, { adopt: true }).catch((error: unknown) => say(refusalText(error)));
        continue;
      }
      if (local.state === "dismissed") {
        // Dismissed while remote agents were off: the hub hears of it now.
        if (isUnfinishedRequest(item.state)) await api("dismiss", { id: item.id }, false, at).catch(() => undefined);
        continue;
      }
      const next = stored(item);
      if (progressOf(next) < progressOf(local) || payloadIdentity(next as unknown as JsonValue) === payloadIdentity(local as unknown as JsonValue)) continue;
      await keep(workspace, next, { adopt: false }).catch((error: unknown) => say(refusalText(error)));
    }
  }
  // The open workspace's requests, told only when they changed.
  function tellRequests() {
    const next = historyKey && historyKey === scopeKey() ? [...history.values()].filter((item) => item.state !== "dismissed") : [];
    const key = JSON.stringify(next);
    if (key === lastRequests) return;
    lastRequests = key;
    // Startup mounts this menu for a workspace with requests to show (src/controllers/agent-controller.ts).
    const workspace = scope();
    if (workspace && historyKey === workspaceKey(workspace)) {
      try {
        if (next.length) localStorage.setItem(agentHistoryKey(workspace), "1");
        else localStorage.removeItem(agentHistoryKey(workspace));
      } catch { /* Storage full or blocked: the menu shows them once opened. */ }
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
  // The connected agents' names, as MCP `initialize` gave them.
  const agentNames = () => [...new Set(usedGrants().map((grant) => grant.client ?? "An agent"))].join(", ");
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
    if (notice && notice.state !== current) notice = undefined;
    root.dataset.state = current;
    action.disabled = changing || current === "closed" ||
      !["off", "idle", "connected", "waiting", "workspace-changed"].includes(current);
    if (current === "workspace-changed") action.hidden = true;
    else action.hidden = false;
    actionLabel.textContent =
      current === "connected" ? "Disconnect MCP" : current === "waiting" ? "Waiting for connection…" : "Connect with MCP";
    const asked = current === "connected" ? lastQuestions : 0;
    root.classList.toggle("is-asking", asked > 0);
    count.hidden = !asked;
    count.textContent = asked ? String(asked) : "";
    const names = agentNames();
    action.title =
      current === "connected"
        ? `${names} connected. Choose to revoke its access.`
        : current === "waiting"
          ? "Copy the prompt again"
          : current === "off"
            ? "Turn on remote agents in this tab and copy a prompt that connects Claude, Codex or another agent"
            : "Copy a prompt that connects Claude, Codex or another agent to this site";
    links.hidden = changing || current === "off" || current === "closed";
    again.hidden = cancel.hidden = current !== "waiting";
    const recovering = transportMode === "socket" ? transportState : recovery?.state();
    takeover.hidden = !["other-owner", "taken-over", "takeover-failed"].includes(current);
    takeover.textContent = current === "takeover-failed" ? "Try again" : "Take over";
    move.hidden = another.hidden = current !== "workspace-changed";
    move.disabled = changing;
    const returned = workspaceChanged && pinned && options.repository()?.id === pinned.id && options.repository()?.branch === pinned.branch;
    move.textContent = returned ? "Turn on again" : "Move agents here";
    retry.hidden = !["paused", "quota"].includes(current);
    retry.disabled = retrying || (recovering?.retryAt ?? 0) > Date.now();
    const text =
      current === "waiting"
        ? "Prompt copied. Paste it into Claude, Codex or another agent."
        : current === "off"
          ? "Remote agents are off in this tab. Choose Connect with MCP to turn them on."
          : "";
    let pause = "";
    if (recovering?.mode === "quota") {
      pause = QUOTA_PAUSE;
      if (recovering.resetAt !== undefined) pause += ` It should work again after ${new Date(recovering.resetAt).toLocaleString()} (midnight UTC).`;
    } else if (recovering?.mode === "paused") pause = "Remote agents are paused: the editor could not reach its service. Your drafts are safe. Choose Retry to try again.";
    else if (recovering?.mode === "reconnecting") pause = "Reconnecting to remote agents…";
    if (pause && (recovering?.retryAt ?? 0) > Date.now()) pause += ` You can retry after ${new Date(recovering!.retryAt!).toLocaleString()}.`;
    const liveCopy: Record<string, string> = {
      connecting: "Connecting remote agents…", live: "Remote agents are on in this tab.",
      "other-owner": transportState?.closed ? "The receiving tab closed. Choose Take over to receive agent changes here." : "Another tab receives agent changes for this site. Choose Take over to receive them here.",
      "taken-over": "Another tab took over agent changes for this site.",
      "taking-over": "Taking over agent changes…",
      "takeover-failed": "Agent changes are paused for this site until a tab takes over.",
    };
    const moved = workspaceChanged && pinned ? `Agents are connected to ${pinned.fullName} on ${pinned.branch}; this tab now shows ${options.repository()?.fullName ?? "no site"} on ${options.repository()?.branch ?? "no branch"}.${scopeKey() === workspaceKey({ account: options.account, repoId: pinned.id, branch: pinned.branch }) ? " Choose Turn on again to reconnect." : ""}` : "";
    hint.textContent = moved || pause || notice?.text || text || (transportMode === "socket" ? liveCopy[transportState?.mode ?? "connecting"] : "");
    hint.hidden = !hint.textContent;
    const problem = storage.problem;
    trouble.hidden = !problem || current === "closed";
    root.dataset.storage = problem?.reason ?? "";
    if (problem) troubleText.textContent = storageText(problem);
    download.disabled = exporting;
    paintWatch(current);
  }
  // Watch's record is read on paint, on its own changes and on another tab's storage event; the
  // countdown re-renders it each second from memory while it runs (no reads, no requests).
  let watchReport: ReturnType<ReturnType<typeof agentWatch>["report"]> = { state: "off" }, watchWorkspace = "";
  let watchTicker: ReturnType<typeof setInterval> | undefined;
  const watchOf = () => { const workspace = pinned && scope(); return workspace && workspaceKey(workspace) === workspaceKey({ account: options.account, repoId: pinned!.id, branch: pinned!.branch }) ? agentWatch(workspace) : undefined; };
  function refreshWatch() {
    const watch = watchOf();
    watchWorkspace = watch?.key ?? "";
    try { watchReport = watch?.report() ?? { state: "off" }; } catch { watchReport = { state: "off" }; }
  }
  function paintWatch(current = state()) {
    const shown = remote && transportMode === "socket" && current === "connected";
    if (shown && !watchWorkspace) refreshWatch();
    let report = shown ? watchReport : { state: "off" as const };
    // Ended while shown: paused, without a new read.
    if (report.state === "on" && Date.now() >= report.until) {
      report = watchReport = { state: "paused", reason: "ended", at: report.until };
      requestTools?.notify();
    }
    watchRow.hidden = !shown;
    root.dataset.watch = shown ? report.state : "";
    const ticking = shown && report.state === "on";
    if (ticking && watchTicker === undefined) watchTicker = setInterval(() => paintWatch(), 1000);
    if (!ticking && watchTicker !== undefined) { clearInterval(watchTicker); watchTicker = undefined; }
    if (!shown) return;
    const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    watchStop.hidden = report.state !== "on";
    watchStart.textContent = report.state === "off" ? "Watch for requests" : "Watch again";
    watchStart.title = "Let your agent wait for your requests for the next 10 minutes";
    if (report.state === "on") {
      const left = Math.max(0, Math.ceil((report.until - Date.now()) / 1000));
      watchText.textContent = `Watching for requests until ${time(report.until)} (${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left, ${report.waitsLeft} ${report.waitsLeft === 1 ? "wait" : "waits"} left).`;
    } else if (report.state === "paused") {
      watchText.textContent = report.reason === "used"
        ? `Watch paused: your agent used all ${WATCH_WAITS} waits. It stops waiting for requests; choose Watch again for 10 more minutes.`
        : `Watch paused at ${time(report.at)}. Your agent stops waiting for requests; choose Watch again for 10 more minutes.`;
    } else watchText.textContent = "Agents stop when nothing is waiting. After you send a request, ask your agent to continue, or choose Watch for requests to keep it waiting for up to 10 minutes.";
  }
  /** Only the user starts (or renews) and stops Watch; a stopped one releases a held wait at once. */
  function setWatch(on: boolean) {
    const watch = watchOf();
    if (!watch) return;
    try {
      if (on) watch.start(); else watch.stop();
    } catch {
      say("This browser could not keep Watch: its storage is full or blocked.");
      return;
    }
    refreshWatch();
    if (!on) requestTools?.notify();
    paint();
  }
  const unsubscribeStorage = storage.subscribe(() => paint());
  /** Downloads the open workspace's unsaved drafts and says what the file holds. */
  async function exportWork() {
    const repo = options.repository(), key = scopeKey();
    if (!repo || exporting) return;
    // The workspace whose drafts are read; another one opened, or the menu gone, downloads nothing.
    const current = () => !disposed && scopeKey() === key;
    exporting = true;
    paint();
    try {
      const { downloadUnsavedWork } = await import("../agent-recovery-export");
      if (!current()) return;
      const done = await downloadUnsavedWork({ account: options.account, repository: repo }, current);
      if (!done || !current()) return;
      const { name, entries } = done;
      const included = entries.filter((entry) => entry.status === "included").length;
      const missing = entries.filter((entry) => entry.status === "missing").length;
      say(`Downloaded ${name}: ${included} file${included === 1 ? "" : "s"}.${missing ? ` ${missing} uploaded file${missing === 1 ? " is" : "s are"} no longer in this browser; README.txt lists ${missing === 1 ? "it" : "them"}.` : ""}`);
    } catch (error) {
      if (current()) say(`The download failed: ${(error as Error).message}. Your unsaved changes are still in this tab.`);
    } finally {
      exporting = false;
      if (!disposed) paint();
    }
  }
  // The flyout: the questions waiting for the user (each shows its pin),
  // or what the agents have otherwise.
  function drawWaiting() {
    const questions = requests.filter((request) => request.state === "question");
    const parts: Node[] = [];
    if (questions.length) {
      for (const request of questions) {
        const number = requests.indexOf(request) + 1;
        const question = request.reply?.message.trim() || request.text;
        const item = node("button", "flyout__item agent-menu__question");
        item.type = "button";
        item.setAttribute("role", "menuitem");
        item.dataset.key = request.id;
        const where = request.element.route ?? request.element.file;
        const text = node("span", "agent-menu__question-text");
        text.append(
          node("span", "agent-menu__question-line", clip(question, 60)),
          node("span", "agent-menu__question-where", `<${request.element.tag}> · ${where}`),
        );
        item.append(node("span", "agent-menu__question-number", String(number)), text);
        item.setAttribute("aria-label", `Request ${number}: ${question}, on <${request.element.tag}> of ${where}`);
        item.title = "Show it and answer";
        item.addEventListener("click", () => options.onShowRequest?.(request.id));
        parts.push(item);
      }
    } else {
      const working = requests.filter((request) => request.state === "seen").length;
      const open = requests.filter((request) => request.state === "open").length;
      const busy = working + open;
      // "2 requests: agent working", "3 requests: 1 agent working, 2 waiting for an agent".
      const doing = !open ? "agent working" : !working ? "waiting for an agent" : `${working} agent working, ${open} waiting for an agent`;
      parts.push(node("p", "flyout__note", busy ? `${busy} request${busy === 1 ? "" : "s"}: ${doing}` : "Nothing waiting"));
    }
    waitingOn.replaceChildren(...parts);
  }
  function say(text: string) {
    const shown = (notice = { text, state: state() });
    paint();
    setTimeout(() => {
      if (notice !== shown) return;
      notice = undefined;
      paint();
    }, 8000);
  }
  async function act() {
    const current = state();
    if (current === "connected") await revoke();
    else if (current === "waiting") await copyPrompt();
    else if (current === "off") await turnOn();
    else await start();
  }
  // Connect with MCP while remote agents are off: an agent connected before
  // is used again (it may need resuming); otherwise a new prompt is made.
  async function turnOn(task?: string) {
    if (!options.repository() || changing) return;
    startRemote();
    await poll(true);
    await activateSocket();
    if (state() === "connected") say("Remote agents are on. If an agent you connected before stopped, ask it to continue.");
    else if (state() === "idle") await start(task);
  }
  const live = (at: number) => !disposed && remote && !workspaceChanged && activation === at && options.repository()?.id === pinned?.id && options.repository()?.branch === pinned?.branch;
  function startRemote() {
    if (remote || disposed) return;
    remote = true;
    activation++;
    pinned = options.repository();
    workspaceChanged = false;
    transportMode = "pending";
    transportState = undefined;
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    paint();
  }
  /** Stops every remote request of this tab; a shared context is withdrawn once. */
  function turnOff(withdraw = true) {
    if (!remote) return;
    remote = false;
    activation++;
    stopAutomatic();
    transport?.stop(); transport = undefined;
    transportState = undefined;
    requestTools?.notify(); requestTools = undefined;
    watchWorkspace = "";
    workspaceChanged = false;
    const paused = recovery && !recovery.allowAutomatic();
    recovery?.dispose();
    recovery = undefined;
    recoveryRepo = undefined;
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("focus", wake);
    for (const grant of hub.grants) declined.add(grant.id);
    hub = { grants: [], tabId: null, updatedAt: null, commands: [], requests: [] };
    sentRevision = -1;
    if (shared && !disposed && !paused && withdraw) {
      void api("pause", { tabId }).catch(() => undefined);
    }
    shared = false;
    paint();
  }
  async function moveHere() {
    const target = options.repository(), old = pinned, at = activation;
    if (!target || !old || changing) return;
    const grants = hub.grants.filter(grant => grant.repoId === old.id && grant.branch === old.branch && (grant.via === "oauth" || grant.usedAt));
    changing = true; paint();
    const current = () => !disposed && remote && activation === at && options.repository()?.id === target.id && options.repository()?.branch === target.branch;
    try {
      for (const grant of grants) {
        if (target.id === old.id && target.branch === old.branch) break;
        if (!current()) return;
        await api("rebind", { id: grant.id, repo: target.fullName, repoId: target.id, branch: target.branch });
        if (!current()) return;
      }
      turnOff(false);
      changing = false;
      await turnOn();
    } catch (error) { showError(error); }
    finally { changing = false; paint(); }
  }
  // A task the copied prompt ends with instead of watching for requests
  // (Start your site's Build it with an agent).
  let goal: string | undefined;
  async function start(task?: string) {
    const repo = options.repository(), at = activation;
    if (!repo || changing) return;
    goal = task;
    changing = true;
    paint();
    try {
      // Tokens made earlier that no agent used cannot be copied again.
      for (const grant of liveGrants()) {
        if (grant.via === "token" && !grant.usedAt) await api("revoke", { id: grant.id }).catch(() => undefined);
        if (!live(at)) return;
      }
      const result = await api("connect", { repo: repo.fullName, repoId: repo.id, branch: repo.branch });
      if (disposed) return;
      // The tab moved to another repository or branch meanwhile: that token is pinned to the old one.
      const now = options.repository();
      if (!live(at) || now?.id !== repo.id || now.branch !== repo.branch) {
        await api("revoke", { id: result.id }).catch(() => undefined);
        return;
      }
      token = result.token;
      tokenId = result.id;
      sentRevision = -1;
      changing = false;
      await poll(true);
      await copyPrompt();
    } catch (error) {
      changing = false;
      // A failed first prompt leaves remote agents off; a connected agent keeps them on.
      if (!usedGrants().length && recovery?.allowAutomatic()) turnOff();
      showError(error);
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
      for (const grant of liveGrants()) await api("revoke", { id: grant.id });
      token = tokenId = undefined;
      changing = false;
      turnOff();
    } catch (error) {
      showError(error);
    } finally {
      changing = false;
      paint();
    }
  }
  async function copyPrompt() {
    const repo = options.repository();
    if (!token || !repo) return;
    try {
      await navigator.clipboard.writeText(connectionPrompt(`${location.origin}/mcp`, token, repo.fullName, goal));
      paint();
    } catch {
      say("Clipboard access was denied. Allow it in your browser, then choose Copy again.");
    }
  }

  // Reports the context (or stops sharing it) when it changed, every 30
  // seconds as a heartbeat, or at once with `force`.
  let syncChain: Promise<void> = Promise.resolve();
  function sync(force = false) {
    syncChain = syncChain.then(() => doSync(force));
    return syncChain;
  }
  async function doSync(force: boolean) {
    const at = activation;
    if (transportMode !== "legacy" || !live(at) || !recovery?.allowAutomatic()) return;
    const grants = liveGrants();
    if (!grants.length) {
      if (shared) {
        shared = false;
        await api("pause", { tabId }, false, at).catch(() => undefined);
      }
      return;
    }
    const version = revision;
    // Of several tabs, the one sharing keeps sharing; another takes over when
    // it is the one in use, or when the sharing tab went quiet (closed).
    const visible = document.visibilityState === "visible";
    const mine =
      !hub.tabId ||
      hub.tabId === tabId ||
      (visible && document.hasFocus()) ||
      (visible && Date.now() - (hub.updatedAt ?? 0) > 45_000);
    if (!force && !mine) return;
    if (!force && sentRevision === version && hub.tabId === tabId && Date.now() - lastSent < 30_000) return;
    try {
      const built = await options.context();
      if (!live(at) || !recovery?.allowAutomatic()) return;
      if (built) {
        const { missing } = await api("context", { tabId, context: built.context }, true, at);
        if (live(at)) await sendTexts(Array.isArray(missing) ? missing : [], built.texts, at);
        // Turned off while this share was on its way: withdraw it again.
        if (!live(at)) {
          if (!remote && !disposed) await api("pause", { tabId }).catch(() => undefined);
          return;
        }
        hub.tabId = tabId;
        hub.updatedAt = Date.now();
        shared = true;
      } else if (shared) {
        await api("pause", { tabId }, false, at);
        shared = false;
      }
      sentRevision = version;
      lastSent = Date.now();
    } catch (error) {
      if (live(at)) showError(error);
      // Turned off mid-share (a draft batch may have followed the context): withdraw it.
      else if (!remote && !disposed) await api("pause", { tabId }).catch(() => undefined);
    }
  }

  // The draft texts the Worker lacks, a few MB of JSON at a time.
  async function sendTexts(missing: string[], texts: Map<string, string>, at: number) {
    let batch: { hash: string; content: string }[] = [],
      size = 0;
    for (const hash of missing) {
      const content = texts.get(hash);
      if (!live(at)) return;
      if (content === undefined) continue;
      const bytes = textBytes(JSON.stringify(content)) + 80;
      if (batch.length && (size + bytes > 4 * 1024 * 1024 || batch.length >= 200)) {
        await api("drafts", { texts: batch }, true, at);
        if (!live(at)) return;
        batch = [];
        size = 0;
      }
      batch.push({ hash, content });
      size += bytes;
    }
    if (batch.length) await api("drafts", { texts: batch }, true, at);
  }

  async function poll(now = false) {
    recoverWorkspace();
    if (disposed || !remote || polling || changing) return;
    if (workspaceChanged || transportMode !== "legacy" && !now || recovery && !recovery.allowAutomatic()) return;
    // A tab in the background keeps applying changes while an agent is
    // connected (browsers may slow its timer); otherwise it waits to be seen.
    if (document.visibilityState === "hidden" && !now && !liveGrants().length) return;
    const interval = hub.grants.length ? FAST : SLOW;
    if (!now && Date.now() - lastPoll < interval - 100) return;
    polling = true;
    lastPoll = Date.now();
    const at = activation;
    try {
      const next: HubState = await api("hub", undefined, false, at);
      // Turned off meanwhile: its answer is not applied.
      if (!live(at)) return;
      hub = next;
      await mergeHub(at);
      if (transportMode !== "legacy") { paint(); return; }
      await sync();
      paint();
      if (hub.tabId !== tabId) return;
      const repo = options.repository();
      for (const command of hub.commands) {
        if (command.state !== "pending" || !live(at) || !recovery?.allowAutomatic()) continue;
        if (command.claimedBy && command.claimedBy !== tabId) continue;
        let ack = applied.get(command.id);
        if (!ack) {
          try {
            await api("claim", { tabId, id: command.id, grantId: command.grantId }, false, at);
            if (!live(at) || !recovery?.allowAutomatic()) return;
          } catch {
            continue;
          }
          try {
            if (!repo || command.repoId !== undefined && command.repoId !== repo.id || command.branch !== repo.branch)
              throw new Error("The editor switched to another repository or branch. Read the site again.");
            if (Date.now() - command.createdAt > 120_000)
              throw new Error("This change expired before the editor received it.");
            const outcome = (await options.onCommand(command)) || {};
            ack = {
              state: "applied",
              message: outcome.message ?? "Applied in the editor as an unsaved draft.",
              ...(outcome.result ? { result: outcome.result } : {}),
            };
          } catch (error) {
            ack = { state: "conflict", message: (error as Error).message || "The change could not be applied." };
          }
          applied.set(command.id, ack);
          if (applied.size > 100) applied.delete(applied.keys().next().value!);
          // The context goes first, so an agent reading after "applied" sees the change.
          revision++;
          await sync(true);
        }
        // A change claimed before Turn off is still answered, so the agent knows its outcome.
        await api("ack", { tabId, id: command.id, grantId: command.grantId, ...ack }, false, at);
        // While storage stops agent edits, the alert below already says why each one is refused.
        if (!storage.problem) say(ack.message);
      }
    } catch (error) {
      if (!disposed && live(at)) showError(error);
    } finally {
      polling = false;
    }
  }
  function wake() {
    if (workspaceChanged) return;
    if (transportMode !== "legacy") {
      // Socket mode never polls. Only while a copied token waits for its agent does returning to
      // the tab read the hub once, so the menu learns the agent connected (at most one read per 2 s).
      if (transportMode === "socket" && document.visibilityState === "visible" && state() === "waiting" && Date.now() - lastPoll >= 2000) {
        lastPoll = Date.now();
        void poll(true);
      }
      return;
    }
    if (document.visibilityState === "visible") {
      sentRevision = -1;
      void poll(true);
    }
  }
  // A connection approved in this browser turns remote agents on only for
  // the exact approval, repository and branch named by the consent page.
  // The grant arrives after the consent page's announcement, so check a few times.
  function matches(approval: AgentApproval) {
    const repo = options.repository();
    return approval && typeof approval.approval === "string" && approval.approval.length > 0 &&
      repo?.fullName === approval.repo && repo.branch === approval.branch;
  }
  function consentGranted(approval: AgentApproval) {
    if (!matches(approval)) return;
    if (recovery && !recovery.allowAutomatic()) return;
    for (const check of consentChecks) clearTimeout(check);
    consentChecks = [1000, 4000, 10_000].map((delay) => setTimeout(() => void checkConsent(approval), delay));
  }
  async function checkConsent(approval: AgentApproval) {
    if (disposed || !matches(approval)) return;
    if (remote) return void poll(true);
    const repo = options.repository();
    if (!repo || changing) return;
    // Off tabs still honour a pause recorded by an on tab before checking consent.
    const workspace = { account: options.account.toLowerCase(), repoId: repo.id };
    if (recoveryHolds(localStorage, workspace, Date.now())) return;
    const since = activation;
    const found: HubState | undefined = await api("hub").catch((error) => {
      // Today's allowance used up, or a cooldown: the workspace's tabs skip their checks until it ends.
      if (!(error instanceof AgentFailureError)) return undefined;
      // This tab's checks stop on quota even when browser storage refuses the record.
      if (error.failure.kind === "quota") {
        for (const check of consentChecks) clearTimeout(check);
        consentChecks = [];
        say(QUOTA_PAUSE);
      }
      try { recordFailure(localStorage, workspace, error.failure, Date.now()); } catch { /* storage full: nothing shared */ }
      return undefined;
    });
    // Turned on, or on and off again, meanwhile: this answer decides nothing.
    if (disposed || remote || activation !== since || options.repository()?.id !== repo.id || !matches(approval)) return;
    // Match the exact approval, even when token exchange is delayed.
    if (!found?.grants?.some((grant) => grant.via === "oauth" && grant.repoId === repo.id && grant.repo === approval.repo && grant.branch === approval.branch && grant.approval === approval.approval && !declined.has(grant.id))) return;
    for (const check of consentChecks) clearTimeout(check);
    consentChecks = [];
    startRemote();
    hub = found;
    await mergeHub(activation);
    await activateSocket();
    paint();
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key === watchWorkspace) {
      refreshWatch();
      // Stopped or renewed in another tab: a wait held here looks again (and ends when Watch is off).
      if (watchReport.state !== "on") requestTools?.notify();
      paint();
      return;
    }
    if (event.key === AGENT_CONNECTED_KEY) {
      try { consentGranted(JSON.parse(event.newValue ?? "null")); } catch { /* Old or invalid announcements grant nothing. */ }
    }
  };
  window.addEventListener("storage", onStorage);
  paint();
  return {
    root,
    consentGranted,
    /**
     * Makes a token, as Connect with MCP does, and copies the prompt ending
     * with `task`; while a token waits for its agent, copies it again.
     * Resolves to whether the prompt was copied.
     */
    async connect(task: string) {
      if (state() === "waiting" && token) {
        goal = task;
        await copyPrompt();
      } else if (!remote) await turnOn(task);
      else await start(task);
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
      if (!live(at) || scopeKey() !== key) throw new Error("Remote agents or the open site changed meanwhile. Nothing was sent; ask again.");
      if (transportMode === "socket") {
        // Live relay: the request stays in this browser and reaches agents over the socket.
        const request = localRequest(repo, text, element);
        // Turned off, or another site or branch opened, before the write commits: nothing is kept or announced.
        const still = () => live(at) && scopeKey() === key;
        const kept = await keep(workspace, request, () => still()).catch((error) => refusal(error, " Nothing was sent."));
        if (!kept) throw new Error("Remote agents or the open site changed meanwhile. Nothing was sent; ask again.");
        requestsChanged(key);
        return request as PinRequest;
      }
      const request: StoredRequest = await api("ask", { repository: repo, text, element }, false, at);
      try {
        await keep(workspace, request);
      } catch (error) {
        // Another tab filled the space meanwhile: agents do not get what the user cannot see.
        void api("dismiss", { id: request.id }).catch(() => undefined);
        refusal(error, " The request was withdrawn.");
      }
      // Agents waiting pick it up at once; the tab sees their progress as it polls.
      void poll(true);
      return request as PinRequest;
    },
    /** Answer an agent's question from its pin: the request waits for agents again. */
    async answer(id: string, text: string) {
      const workspace = scope(), at = activation;
      if (!remote) throw new Error("Remote agents are off in this tab. Choose Connect with MCP in the project menu, then send your answer.");
      if (!workspace || !history.has(id)) throw new Error("This request is not in this site's history any more.");
      const local = history.get(id)!, key = workspaceKey(workspace);
      // Refused before it is sent when this browser cannot keep the conversation with the answer.
      const answered = { ...local, state: "open" as const, thread: [...(local.thread ?? []), { from: "user" as const, text, at: Date.now() }] };
      await records.checkConversation(workspace, { id, content: stored(answered) as unknown as JsonValue, unfinished: true, updatedAt: Date.now() }).catch((error) => refusal(error, " Nothing was sent."));
      if (!live(at) || scopeKey() !== key) throw new Error("Remote agents or the open site changed meanwhile. Nothing was sent; answer again.");
      if (transportMode === "socket") {
        const trimmed = text.trim();
        if (!trimmed || trimmed.length > REQUEST_TEXT_LIMIT) throw new Error(`An answer needs text (up to ${REQUEST_TEXT_LIMIT} characters).`);
        // The hub's own rule, on this browser's copy: the request waits for every agent again.
        const list = (await records.conversations(workspace)).map((item) => item.content as unknown as AgentRequest);
        // Turned off, or another site or branch opened, during the read: nothing is kept (checked again at the write).
        const still = () => live(at) && scopeKey() === key;
        if (!still()) throw new Error("Remote agents or the open site changed meanwhile. Nothing was sent; answer again.");
        const { request: result, accept } = answerRequest(list, id, trimmed);
        if (!await keep(workspace, result as StoredRequest, current => still() && accept(current?.content as unknown as AgentRequest | undefined)).catch(refusal))
          throw new Error("This request changed meanwhile (dismissed or answered in another tab). Open its card again.");
        requestsChanged(key);
        return;
      }
      const request: StoredRequest = await api("answer", { id, text }, false, at);
      // Dismissed in another tab meanwhile: it stays dismissed (the hub hears of it on the next poll).
      await keep(workspace, request, { adopt: false }).catch(refusal);
      void poll(true);
    },
    /**
     * Dismiss (or clear) a request from its pin, in this browser. One agents
     * still wait on is dismissed on the hub too while remote agents are on
     * (otherwise on the next poll once they are).
     */
    async dismiss(id: string) {
      const workspace = scope(), local = history.get(id);
      if (!workspace || !local || local.state === "dismissed") return;
      const waiting = isUnfinishedRequest(local.state);
      try {
        await keep(workspace, { ...local, state: "dismissed" });
      } catch (error) {
        say(refusalText(error));
        return;
      }
      if (!waiting || !remote) return;
      // With the live relay agents read this browser's copy: nothing to tell the hub.
      if (transportMode === "socket") { requestsChanged(workspaceKey(workspace)); return; }
      try {
        await api("dismiss", { id });
      } catch (error) {
        showError(error);
      }
    },
    /** Something the context holds changed: it is sent again shortly. */
    changed() {
      recoverWorkspace();
      revision++;
      paint();
      clearTimeout(timer);
      transport?.changed();
      if (remote && transportMode === "legacy" && recovery?.allowAutomatic()) timer = setTimeout(() => void sync(), 600);
    },
    destroy() {
      disposed = true;
      flyout.destroy();
      turnOff();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", reread);
      channel?.close();
      if (watchTicker !== undefined) clearInterval(watchTicker);
      unsubscribeStorage();
      token = tokenId = undefined;
    },
  };
}

/** What the user reads when this browser stopped keeping agent edits, and what to do. */
function storageText(problem: AgentStorageProblem) {
  return problem.reason === "full"
    ? "Agent edits are stopped: this browser's storage is full, so it cannot keep new changes. Your unsaved changes are still in this tab. Download them to keep a copy, free up space in your browser or save your changes, then choose Try again."
    : "Agent edits are off: this browser does not let the editor keep data here (private browsing or blocked site data). Your unsaved changes are only in this tab: download them to keep a copy before you close it.";
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
/** Ask agent's request, made here as the hub makes one (worker/agent-schemas.ts validateAsk). */
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
// How far a request has come: its latest message or the time an agent took it. A poll answered
// before the user's answer reached the hub is older and changes nothing here.
const progressOf = (request: StoredRequest) => Math.max(request.seenAt ?? 0, request.createdAt, ...(request.thread ?? []).map((message) => message.at), request.reply?.at ?? 0);
function refusalText(error: unknown) {
  if (error instanceof AgentRecordsError && error.code === "capacity") return error.message;
  if (error instanceof AgentRecordsError)
    return "This browser could not keep your requests to agents: its storage is unavailable or full.";
  return (error as Error).message;
}
function refusal(error: unknown, note = ""): never {
  throw new Error(`${refusalText(error)}${note}`, { cause: error });
}

