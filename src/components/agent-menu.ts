import { button, node } from "../ui/dom";
import { mountDropdown } from "./dropdown";
import type { EditorContext } from "../../shared/types";
import type { AgentCommand } from "../../shared/agent";
import "./agent-menu.css";

export function createAgentMenu(options: {
  account: string;
  embedded?: boolean;
  onCommand: (command: AgentCommand) => Promise<void>;
}) {
  const storageKey = `astro-site-editor:agent:${options.account.toLowerCase()}`;
  let id: string | undefined;
  try {
    id = sessionStorage.getItem(storageKey) ?? undefined;
  } catch {
    /* Optional. */
  }
  let repoId: number | undefined,
    latest: EditorContext | undefined,
    token: string | undefined;
  let disposed = false,
    syncing = false,
    polling = false,
    changing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0,
    sentRevision = -1,
    lastSent = 0;
  const applied = new Map<string, { state: string; message: string }>();
  const root = node("div", "agent-menu");
  const trigger = node("button", "text-button", "Agent context");
  trigger.type = "button";
  const panel = node("div", "agent-menu__panel");
  panel.id = "agent-context";
  panel.setAttribute("aria-label", "Agent context");
  const status = node("p", "muted agent-menu__status");
  status.setAttribute("role", "status");
  const endpoint = node("input", "agent-menu__endpoint");
  endpoint.readOnly = true;
  endpoint.value = `${location.origin}/mcp`;
  endpoint.setAttribute("aria-label", "MCP endpoint");
  const connect = button("Connect agent", () => void start(), "button primary");
  const copy = button(
    "Copy MCP connection",
    () => void copyConnection(),
    "button secondary",
  );
  copy.hidden = true;
  const stop = button("Revoke connection", () => void revoke(), "text-button");
  stop.hidden = !id;
  const copyContext = button(
    "Copy current context",
    async () => {
      try {
        if (!latest) return;
        await navigator.clipboard.writeText(JSON.stringify(latest, null, 2));
        status.textContent = "Context copied.";
      } catch {
        status.textContent =
          "Clipboard access was denied. Allow it in your browser and retry.";
      }
    },
    "text-button",
  );
  panel.append(
    node("strong", "", "Work with an agent"),
    node(
      "p",
      "muted",
      "Share the active file, selection, diagnostics and draft changes. Agents can create and edit drafts in this repository. Publishing stays in the editor.",
    ),
    endpoint,
    status,
    connect,
    copy,
    stop,
    copyContext,
  );
  root.append(trigger, panel);
  let dropdown: ReturnType<typeof mountDropdown> | undefined;
  if (options.embedded) {
    root.classList.add("agent-menu--embedded");
    panel.hidden = true;
    trigger.setAttribute("aria-controls", panel.id);
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      trigger.setAttribute("aria-expanded", String(!panel.hidden));
    });
  } else {
    dropdown = mountDropdown({ trigger, panel, anchor: "--agent-context" });
  }
  function remember(value?: string) {
    id = value;
    try {
      if (value) sessionStorage.setItem(storageKey, value);
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* Optional. */
    }
  }
  async function api(action: string, body?: unknown, connectionId = id) {
    const response = await fetch(
      `/api/agent/${action}${action === "connect" ? "" : `?id=${encodeURIComponent(connectionId ?? "")}`}`,
      {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      if ([401, 403].includes(response.status) && connectionId === id) {
        remember();
        token = undefined;
        repoId = undefined;
        copy.hidden = true;
        stop.hidden = true;
      }
      throw new Error(result.error ?? "Agent connection failed.");
    }
    return result;
  }
  function paint() {
    connect.disabled = !latest || changing;
    connect.textContent = id ? "Replace connection" : "Connect agent";
    copyContext.disabled = !latest;
    stop.hidden = !id;
    if (!id)
      status.textContent = latest
        ? `Connect an agent to ${latest.repository.fullName}.`
        : "Open a project, then connect your MCP client.";
    else if (repoId !== undefined && latest?.repository.id !== repoId)
      status.textContent =
        "Sharing paused: this connection belongs to another repository.";
    else
      status.textContent =
        "Connected. Draft changes from agents appear here while this tab is open.";
  }
  async function start() {
    if (!latest || changing) return;
    changing = true;
    paint();
    try {
      if (id) await api("revoke", {});
      remember();
      const selected = latest.repository;
      const result = await api("connect", {
        repo: selected.fullName,
        repoId: selected.id,
      });
      if (disposed) return;
      remember(result.id);
      token = result.token;
      repoId = selected.id;
      sentRevision = -1;
      copy.hidden = false;
      await sync();
    } catch (error) {
      status.textContent = (error as Error).message;
    } finally {
      changing = false;
      connect.disabled = !latest;
      connect.textContent = id ? "Replace connection" : "Connect agent";
      stop.hidden = !id;
    }
  }
  async function revoke() {
    try {
      if (id) await api("revoke", {});
      remember();
      token = undefined;
      repoId = undefined;
      copy.hidden = true;
      paint();
    } catch (error) {
      status.textContent = (error as Error).message;
    }
  }
  async function copyConnection() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            mcpServers: {
              "astro-site-editor": {
                url: endpoint.value,
                headers: { Authorization: `Bearer ${token}` },
              },
            },
          },
          null,
          2,
        ),
      );
      status.textContent =
        "MCP connection copied. Paste it into your client's remote MCP configuration. Treat the token as a password.";
    } catch {
      status.textContent =
        "Clipboard access was denied. Allow it in your browser and retry.";
    }
  }
  async function sync() {
    if (disposed || !id || repoId === undefined || syncing) return;
    const connectionId = id;
    const version = revision;
    if (sentRevision === version && Date.now() - lastSent < 30_000) return;
    syncing = true;
    try {
      if (latest?.repository.id === repoId)
        await api("context", latest, connectionId);
      else await api("pause", {}, connectionId);
      sentRevision = version;
      lastSent = Date.now();
    } catch (error) {
      if (!disposed) status.textContent = (error as Error).message;
    } finally {
      syncing = false;
    }
  }
  async function poll() {
    if (
      disposed ||
      !id ||
      polling ||
      document.visibilityState === "hidden" ||
      changing
    )
      return;
    polling = true;
    const connectionId = id;
    try {
      const result = await api("connection", undefined, connectionId);
      if (disposed || connectionId !== id) return;
      repoId = result.repoId;
      for (const command of result.commands as AgentCommand[]) {
        if (command.state !== "pending" || !latest) continue;
        let ack = applied.get(command.id);
        if (!ack) {
          try {
            if (
              !latest ||
              latest.repository.id !== repoId ||
              latest.branch !== command.branch ||
              latest.commit !== command.commit
            )
              throw new Error(
                "The editor changed repository, branch or revision.",
              );
            if (Date.now() - command.createdAt > 120_000)
              throw new Error(
                "This change expired before the editor received it.",
              );
            await options.onCommand(command);
            ack = {
              state: "applied",
              message: "Draft applied in the editor. Not published.",
            };
          } catch (error) {
            ack = { state: "conflict", message: (error as Error).message };
          }
          applied.set(command.id, ack);
          if (applied.size > 100) applied.delete(applied.keys().next().value!);
        }
        await api("ack", { id: command.id, ...ack }, connectionId);
        status.textContent = ack.message;
      }
      await sync();
    } catch (error) {
      if (!disposed) status.textContent = (error as Error).message;
    } finally {
      polling = false;
    }
  }
  const interval = setInterval(() => void poll(), 2000);
  paint();
  if (id) void poll();
  return {
    root,
    setContext(value?: EditorContext) {
      latest = value;
      revision++;
      paint();
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), 600);
    },
    destroy() {
      disposed = true;
      clearInterval(interval);
      clearTimeout(timer);
      token = undefined;
      dropdown?.destroy();
    },
  };
}
