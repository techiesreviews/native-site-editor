// The helper's side of the Agent Client Protocol (ACP, protocol version 1): JSON-RPC 2.0, one message per
// line, over an agent program's stdin and stdout. Only what the helper needs: start a session with the
// editor's MCP server, send prompts, answer permission requests. It offers the agent no file system and no
// terminal, so an agent reaches nothing of the computer through the helper.
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { ToolCall } from "./agents.ts";

export const PROTOCOL_VERSION = 1;

export interface PermissionOption { optionId: string; name?: string; kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" }
export interface PermissionRequest { sessionId: string; toolCall: ToolCall; options: PermissionOption[] }
export type PermissionOutcome = { outcome: "cancelled" } | { outcome: "selected"; optionId: string };

export interface AcpHandlers {
  /** The agent asks before running a tool. */
  permission(request: PermissionRequest): Promise<PermissionOutcome>;
  /** session/update: the agent's progress (messages, tool calls, plans). */
  update?(params: unknown): void;
}

type Message = { jsonrpc: "2.0"; id?: number | string | null; method?: string; params?: unknown; result?: unknown; error?: { code: number; message: string } };

/** The option of `kind` to choose ("allow" takes allow_once only; "reject" the first refusal), or a cancel. */
export function choose(options: PermissionOption[], kind: "allow" | "reject"): PermissionOutcome {
  const option = kind === "allow"
    ? options.find(each => each.kind === "allow_once")
    : options.find(each => each.kind === "reject_once") ?? options.find(each => each.kind === "reject_always");
  return option ? { outcome: "selected", optionId: option.optionId } : { outcome: "cancelled" };
}

/** A connection to one agent program: `input` is its stdout, `output` its stdin. */
export function acpConnection(streams: { input: Readable; output: Writable }, handlers: AcpHandlers) {
  let next = 0, ended: Error | undefined;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  const send = (message: Message) => { if (!ended) streams.output.write(`${JSON.stringify(message)}\n`); };
  const lines = createInterface({ input: streams.input, crlfDelay: Infinity });

  async function answer(message: Message) {
    try {
      if (message.method === "session/request_permission")
        send({ jsonrpc: "2.0", id: message.id, result: { outcome: await handlers.permission(message.params as PermissionRequest) } });
      else send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `${message.method} is not offered.` } });
    } catch (error) {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: error instanceof Error ? error.message : "Failed." } });
    }
  }
  lines.on("line", line => {
    if (!line.trim()) return;
    let message: Message;
    try { message = JSON.parse(line) as Message; } catch { return; }
    if (message.method && message.id !== undefined && message.id !== null) void answer(message);
    else if (message.method === "session/update") handlers.update?.(message.params);
    else if (typeof message.id === "number" && pending.has(message.id)) {
      const waiting = pending.get(message.id)!;
      pending.delete(message.id);
      if (message.error) waiting.reject(new Error(message.error.message));
      else waiting.resolve(message.result);
    }
  });
  const closed = new Promise<void>(resolve => lines.once("close", () => {
    ended = new Error("The agent stopped.");
    for (const waiting of pending.values()) waiting.reject(ended);
    pending.clear();
    resolve();
  }));

  return {
    request<T = unknown>(method: string, params: unknown): Promise<T> {
      if (ended) return Promise.reject(ended);
      const id = next++;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        send({ jsonrpc: "2.0", id, method, params });
      });
    },
    notify(method: string, params: unknown) { send({ jsonrpc: "2.0", method, params }); },
    /** Resolves once the agent's output ends; every request still waiting is refused. */
    closed,
  };
}
export type AcpConnection = ReturnType<typeof acpConnection>;
