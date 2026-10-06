import { connectionPrompt } from "../agent-prompts";
import { button, node } from "../ui/dom";
import { textBytes, type AgentCommand, type AgentElement } from "../../shared/agent";
import type { SharedContext } from "../agent-site";
import type { PinRequest } from "./agent-pins";
import { mountFlyout } from "./flyout";
import { gzip } from "./publish-menu";
import "./agent-menu.css";

// The "Connect with MCP" button, and the editor tab's side of the MCP
// connection.
//
// Agents connect to `/mcp` with OAuth (a custom connector in claude.ai or
// Claude Desktop) or with a token in the prompt copied here. Either way the
// connection belongs to this editor session and works on whichever
// repository the sharing tab shows; the Worker keeps the session's
// connections, the context the sharing tab last reported, and the changes
// agents queued in one hub (worker/agent-context.ts). This tab polls that
// hub: while a connection exists it reports its context (built only when
// sent) and applies queued changes with `onCommand`, then reports the new
// context before it acknowledges each change, so an agent reading after
// "applied" sees it. The context lists the drafts by hash; their texts go
// apart, only those the Worker says it lacks. Of several tabs, the one that reported last (a
// visible one) applies the changes.
//
// Ask agent in the edit bar sends a request about an element to the hub
// (`ask`); agents fetch it with wait_for_requests and answer it. Each poll
// brings the requests back with their state and thread, for the pins; the
// user answers an agent's question from its pin (`answer`).
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
  requests?: (PinRequest & { repoId: number })[];
}

export const AGENT_CONNECTED_KEY = "native-site-editor:agent-connected";
const FAST = 2000;
const SLOW = 30_000;

export function createAgentMenu(options: {
  account: string;
  /** The open repository, for the panel; nothing before one is open. */
  repository: () => { id: number; fullName: string } | undefined;
  /** The context to share and its drafts' texts, built when it is sent. */
  context: () => Promise<SharedContext | undefined>;
  onCommand: (command: AgentCommand) => Promise<AgentCommandOutcome | void>;
  /** Whether an agent is connected changed. */
  onConnection?: (connected: boolean) => void;
  /** The open repository's requests to agents, each time they may have changed. */
  onRequests?: (requests: PinRequest[]) => void;
  /** How many of them are agents' questions waiting for the user, when it changed. */
  onQuestions?: (count: number) => void;
  /** Show a request's pin with its card open (closing the menus). */
  onShowRequest?: (id: string) => void;
}) {
  const tabId = `tab-${crypto.randomUUID()}`;
  let hub: HubState = { grants: [], tabId: null, updatedAt: null, commands: [] };
  let token: string | undefined,
    tokenId: string | undefined;
  let disposed = false,
    polling = false,
    changing = false,
    shared = false;
  let revision = 0,
    sentRevision = -1,
    lastSent = 0,
    lastPoll = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
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
  const links = node("span", "agent-menu__links");
  links.append(again, cancel);
  // What the connected agents wait on, beside Disconnect MCP.
  const waitingOn = node("div", "agent-menu__waiting");
  waitingOn.id = "agent-waiting";
  waitingOn.setAttribute("role", "menu");
  root.append(action, hint, links, waitingOn);
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

  async function api(action: string, body?: unknown, zipped = false) {
    const response = await fetch(`/api/agent/${action}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json", ...(zipped ? { "Content-Encoding": "gzip" } : {}) },
      body: body === undefined ? undefined : zipped ? await gzip(JSON.stringify(body)) : JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Agent connection failed.");
    return result;
  }
  // A connection follows the open repository, so every one of the session's counts.
  const liveGrants = () => (options.repository() ? hub.grants : []);
  const usedGrants = () => liveGrants().filter((grant) => grant.via === "oauth" || grant.usedAt);
  /** The token this tab made, while no agent has used it yet. */
  const waiting = () => Boolean(token && tokenId && liveGrants().some((grant) => grant.id === tokenId && !grant.usedAt));
  function state() {
    if (!options.repository()) return "closed";
    if (usedGrants().length) return "connected";
    return waiting() ? "waiting" : "idle";
  }
  let lastState = "";
  let lastRequests = "";
  let lastQuestions = 0;
  // The open repository's requests, oldest first as their pins are numbered.
  let requests: PinRequest[] = [];
  // The open repository's requests, told only when they changed.
  function tellRequests() {
    const repo = options.repository();
    const next = repo ? (hub.requests ?? []).filter((item) => item.repoId === repo.id) : [];
    const key = JSON.stringify(next);
    if (key === lastRequests) return;
    lastRequests = key;
    requests = [...next].sort((a, b) => a.createdAt - b.createdAt);
    options.onRequests?.(next);
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
    tellRequests();
    if (notice && notice.state !== current) notice = undefined;
    root.dataset.state = current;
    action.disabled = changing || current === "closed";
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
          : "Copy a prompt that connects Claude, Codex or another agent to this site";
    links.hidden = current !== "waiting";
    const text =
      current === "waiting" ? "Prompt copied. Paste it into Claude, Codex or another agent." : "";
    hint.textContent = notice?.text ?? text;
    hint.hidden = !hint.textContent;
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
    else await start();
  }
  // A task the copied prompt ends with instead of watching for requests
  // (Start your site's Build it with an agent).
  let goal: string | undefined;
  async function start(task?: string) {
    const repo = options.repository();
    if (!repo || changing) return;
    goal = task;
    changing = true;
    paint();
    try {
      // Tokens made earlier that no agent used cannot be copied again.
      for (const grant of liveGrants())
        if (grant.via === "token" && !grant.usedAt) await api("revoke", { id: grant.id }).catch(() => undefined);
      const result = await api("connect", { repo: repo.fullName, repoId: repo.id });
      if (disposed) return;
      token = result.token;
      tokenId = result.id;
      sentRevision = -1;
      changing = false;
      await poll(true);
      await copyPrompt();
    } catch (error) {
      say((error as Error).message);
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
      await api("revoke", { all: true });
      token = tokenId = undefined;
      changing = false;
      await poll(true);
    } catch (error) {
      say((error as Error).message);
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
    if (disposed) return;
    const grants = liveGrants();
    if (!grants.length) {
      if (shared) {
        shared = false;
        await api("pause", { tabId }).catch(() => undefined);
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
      if (disposed) return;
      if (built) {
        const { missing } = await api("context", { tabId, context: built.context }, true);
        await sendTexts(Array.isArray(missing) ? missing : [], built.texts);
        hub.tabId = tabId;
        hub.updatedAt = Date.now();
        shared = true;
      } else if (shared) {
        await api("pause", { tabId });
        shared = false;
      }
      sentRevision = version;
      lastSent = Date.now();
    } catch (error) {
      if (!disposed) say((error as Error).message);
    }
  }

  // The draft texts the Worker lacks, a few MB of JSON at a time.
  async function sendTexts(missing: string[], texts: Map<string, string>) {
    let batch: { hash: string; content: string }[] = [],
      size = 0;
    for (const hash of missing) {
      const content = texts.get(hash);
      if (content === undefined || disposed) continue;
      const bytes = textBytes(JSON.stringify(content)) + 80;
      if (batch.length && (size + bytes > 4 * 1024 * 1024 || batch.length >= 200)) {
        await api("drafts", { texts: batch }, true);
        batch = [];
        size = 0;
      }
      batch.push({ hash, content });
      size += bytes;
    }
    if (batch.length) await api("drafts", { texts: batch }, true);
  }

  async function poll(now = false) {
    if (disposed || polling || changing) return;
    // A tab in the background keeps applying changes while an agent is
    // connected (browsers may slow its timer); otherwise it waits to be seen.
    if (document.visibilityState === "hidden" && !now && !liveGrants().length) return;
    const interval = hub.grants.length ? FAST : SLOW;
    if (!now && Date.now() - lastPoll < interval - 100) return;
    polling = true;
    lastPoll = Date.now();
    try {
      hub = await api("hub");
      if (disposed) return;
      await sync();
      paint();
      if (hub.tabId !== tabId) return;
      const repo = options.repository();
      for (const command of hub.commands) {
        if (command.state !== "pending" || disposed) continue;
        if (command.claimedBy && command.claimedBy !== tabId) continue;
        let ack = applied.get(command.id);
        if (!ack) {
          try {
            await api("claim", { tabId, id: command.id, grantId: command.grantId });
          } catch {
            continue;
          }
          try {
            if (!repo || command.repoId !== undefined && command.repoId !== repo.id)
              throw new Error("The editor switched to another repository. Read the site again.");
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
        await api("ack", { tabId, id: command.id, grantId: command.grantId, ...ack });
        say(ack.message);
      }
    } catch (error) {
      if (!disposed) say((error as Error).message);
    } finally {
      polling = false;
    }
  }
  const interval = setInterval(() => void poll(), FAST);
  const wake = () => {
    if (document.visibilityState === "visible") {
      sentRevision = -1;
      void poll(true);
    }
  };
  const consentGranted = () => {
    // Consent announces before the grant arrives. Retry the same event after lazy loading.
    for (const delay of [1000, 4000, 10_000]) setTimeout(() => void poll(true), delay);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === AGENT_CONNECTED_KEY) {
      // The consent page was just allowed: the token arrives in a moment.
      consentGranted();
    }
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  window.addEventListener("storage", onStorage);
  paint();
  void poll(true);
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
      } else await start(task);
      return Boolean(token);
    },
    /** Whether an agent is connected now. */
    connected() {
      return state() === "connected";
    },
    /** Ask agent: a request about an element, for agents to fetch. */
    async ask(text: string, element: AgentElement) {
      const repo = options.repository();
      if (!repo) throw new Error("Open a site first.");
      const request = await api("ask", { repository: repo, text, element });
      hub.requests = [...(hub.requests ?? []), request];
      tellRequests();
      // Agents waiting pick it up at once; the tab sees their progress as it polls.
      void poll(true);
      return request as PinRequest;
    },
    /** Answer an agent's question from its pin: the request waits for agents again. */
    async answer(id: string, text: string) {
      const request = await api("answer", { id, text });
      hub.requests = (hub.requests ?? []).map((item) => (item.id === id ? request : item));
      tellRequests();
      void poll(true);
    },
    /** Dismiss (or clear) a request from its pin. */
    async dismiss(id: string) {
      hub.requests = (hub.requests ?? []).filter((item) => item.id !== id);
      tellRequests();
      try {
        await api("dismiss", { id });
      } catch (error) {
        say((error as Error).message);
      }
    },
    /** Something the context holds changed: it is sent again shortly. */
    changed() {
      revision++;
      paint();
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), 600);
    },
    destroy() {
      disposed = true;
      flyout.destroy();
      clearInterval(interval);
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("storage", onStorage);
      token = tokenId = undefined;
    },
  };
}

// A line of at most `limit` characters, with … when cut.
function clip(text: string, limit: number) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > limit ? `${line.slice(0, limit - 1).trimEnd()}…` : line;
}

export { buildSitePrompt, createCommand, setupPrompt, connectionPrompt } from "../agent-prompts";
