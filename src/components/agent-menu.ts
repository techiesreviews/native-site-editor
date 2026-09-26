import { button, node } from "../ui/dom";
import type { EditorContext } from "../../shared/types";
import type { AgentCommand } from "../../shared/agent";
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
// "applied" sees it. Of several tabs, the one that reported last (a
// visible one) applies the changes.

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
}

export const AGENT_CONNECTED_KEY = "native-site-editor:agent-connected";
const FAST = 2000;
const SLOW = 30_000;

export function createAgentMenu(options: {
  account: string;
  /** The open repository, for the panel; nothing before one is open. */
  repository: () => { id: number; fullName: string } | undefined;
  /** The context to share, built when it is sent. */
  context: () => Promise<EditorContext | undefined>;
  onCommand: (command: AgentCommand) => Promise<AgentCommandOutcome | void>;
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
  const action = button("Connect with MCP", () => void act(), "text-button agent-menu__action");
  const hint = node("p", "agent-menu__hint");
  hint.setAttribute("role", "status");
  const again = button("Copy again", () => void copyPrompt(), "text-button agent-menu__link");
  const cancel = button("Cancel", () => void revoke(), "text-button agent-menu__link");
  const links = node("span", "agent-menu__links");
  links.append(again, cancel);
  root.append(action, hint, links);
  /** A message that replaces the state's own hint until the state changes. */
  let notice: { text: string; state: string } | undefined;

  async function api(action: string, body?: unknown) {
    const response = await fetch(`/api/agent/${action}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
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
  function paint() {
    const current = state();
    if (notice && notice.state !== current) notice = undefined;
    root.dataset.state = current;
    action.disabled = changing || current === "closed";
    action.textContent =
      current === "connected" ? "Disconnect MCP" : current === "waiting" ? "Waiting for connection…" : "Connect with MCP";
    const names = [...new Set(usedGrants().map((grant) => grant.client ?? "An agent"))].join(", ");
    action.title =
      current === "connected"
        ? `${names} connected. Choose to revoke its access.`
        : current === "waiting"
          ? "Copy the prompt again"
          : "Copy a prompt that connects Claude, Codex or another agent to this site";
    links.hidden = current !== "waiting";
    const text = current === "waiting" ? "Prompt copied. Paste it into Claude, Codex or another agent." : "";
    hint.textContent = notice?.text ?? text;
    hint.hidden = !hint.textContent;
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
  async function start() {
    const repo = options.repository();
    if (!repo || changing) return;
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
      await navigator.clipboard.writeText(connectionPrompt(`${location.origin}/mcp`, token, repo.fullName));
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
      const context = await options.context();
      if (disposed) return;
      if (context) {
        await api("context", { tabId, context });
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
  const onStorage = (event: StorageEvent) => {
    if (event.key === AGENT_CONNECTED_KEY) {
      // The consent page was just allowed: the token arrives in a moment.
      for (const delay of [1000, 4000, 10_000]) setTimeout(() => void poll(true), delay);
    }
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  window.addEventListener("storage", onStorage);
  paint();
  void poll(true);
  return {
    root,
    /** Something the context holds changed: it is sent again shortly. */
    changed() {
      revision++;
      paint();
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), 600);
    },
    destroy() {
      disposed = true;
      clearInterval(interval);
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("storage", onStorage);
      token = tokenId = undefined;
    },
  };
}

/** What to paste into an agent so it connects itself (or says how). */
export function connectionPrompt(url: string, token: string, repo: string) {
  return `Connect to my website editor (Native Site Editor) over MCP, so you can help me edit my site ${repo} (and whichever site I open in the editor after it).

Server URL: ${url} (streamable HTTP)
Header: Authorization: Bearer ${token}

Add it to your MCP servers as "native-site-editor":
- Claude Code: run
  claude mcp add --transport http native-site-editor ${url} --header "Authorization: Bearer ${token}"
- Codex: add to ~/.codex/config.toml, then restart Codex:
  [mcp_servers.native_site_editor]
  url = "${url}"
  http_headers = { Authorization = "Bearer ${token}" }
- Any other MCP client: an HTTP server with that URL and header.

If you cannot change your own MCP settings, tell me exactly what to do. Once connected, call get_site to see what I have open. Your changes appear in my editor as unsaved drafts that I review and save.

The token works like a password: keep it out of files, commits and chats other than this one. It stops working when I choose Disconnect MCP or sign out of the editor (at most eight hours).`;
}
