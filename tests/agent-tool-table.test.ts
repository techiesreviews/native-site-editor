// The agent tool table (shared/agent-tool-table.ts) against every place that runs a tool: the
// Worker's MCP registrations, the tab's registries per route, and applySiteCommand's cases.
// Types catch the rest: the routes' own tool types must name the table's tools (the table's
// `agrees` checks), applySiteCommand must handle every operation, and an MCP registration
// must name a table row.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { AgentCommand, AgentCommandArgs } from "../shared/agent.ts";
import { agentMediaArgsProblem } from "../shared/agent-media-args.ts";
import { mediaTools } from "../shared/agent-media.ts";
import { requestTools } from "../shared/agent-requests.ts";
import { agentTools, agentToolsOn, isAgentOperation, isAtomicOperation, mcpTools, type AgentOperation, type AgentToolName } from "../shared/agent-tool-table.ts";
import { applySiteCommand, atomicAgentCommand, type AgentSiteActions } from "../src/agent-site.ts";
import { createAgentEditTools } from "../src/agent-tools-edit.ts";
import { createAgentMediaTools } from "../src/agent-tools-media.ts";
import { createAgentReadTools } from "../src/agent-tools-read.ts";
import type { AgentRecords } from "../src/agent-records.ts";
import type { AgentReadPorts } from "../src/agent-tools-read.ts";
import { createRequestTools } from "../src/agent-watch.ts";
import { hubOperation, type HubStorage } from "../worker/agent-store.ts";
import { createSiteServer } from "../worker/mcp.ts";

// The fakes below hold only what the code reaches before it answers or refuses (tools/list reads no
// connection field, a probe stops at its first check); each is typed by that part, then cast whole.
type Connection = Parameters<typeof createSiteServer>[0];
type Env = Parameters<typeof createSiteServer>[1];

const names = Object.keys(agentTools) as AgentToolName[];
const operations = [...new Set(Object.values(agentTools).flatMap(row => "operation" in row ? [row.operation] : []))];

async function toolsList() {
  const connection: Pick<Connection, "id" | "workspace"> & { grant: Pick<Connection["grant"], "generation">; repo: Pick<Connection["repo"], "full_name"> } =
    { id: "grant-1", grant: { generation: 1 }, workspace: { account: "lex", repo: "lex/starter", repoId: 1, branch: "main" }, repo: { full_name: "lex/starter" } };
  const env: Partial<Env> = {};
  const handler = createMcpHandler(() => createSiteServer(connection as Connection, env as Env), { legacy: "stateless", responseMode: "json", maxSubscriptions: 0 });
  const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const response = await handler.fetch(new Request("https://editor.example/mcp", { method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" } }), { parsedBody: body } as never);
  const text = await response.text();
  const data = text.split("\n").find(line => line.startsWith("data: "))?.slice(6) ?? text;
  return (JSON.parse(data) as { result: { tools: { name: string }[] } }).result;
}

test("MCP tools/list is dev's: same tools, order, descriptions, schemas and hints", async () => {
  const result = await toolsList();
  assert.deepEqual(result.tools.map(tool => tool.name), [
    "get_site", "list_files", "read_file", "export_site", "get_page", "get_command_status", "edit_file", "write_file",
    "move_file", "delete_file", "create_page", "set_page_details", "open_page", "inspect_preview", "list_media",
    "preview_media", "remove_media", "keep_media", "restore_media", "replace_media", "frame_image", "place_media",
    "improve_images", "loop_video", "video_still", "write_subtitles", "describe_media", "change_collection",
    "adding_settings", "make_component", "add_section", "move_section", "remove_section", "wait_for_requests",
    "get_selection", "reply_to_request",
  ]);
  // The whole tools/list result as dev (3c5518e4) answered it, before the table.
  assert.equal(createHash("sha256").update(JSON.stringify(result)).digest("hex"), "25ad006c7f818f56bd847161fab4f9eb5ccda3565ddaedc2c2d4c9650c8fc591");
});

test("the Worker registers exactly the table's MCP tools, in table order", async () => {
  assert.deepEqual((await toolsList()).tools.map(tool => tool.name), mcpTools);
  assert.deepEqual(names.filter(name => !mcpTools.includes(name as never)), ["get_request"]);
});

test("each route's browser registry runs exactly the table's tools of that route", async () => {
  const workspace = { account: "lex", repoId: 1, branch: "main" };
  const portsFake: Partial<AgentReadPorts> = { files: () => undefined, stamp: () => ({ holds: () => true, changed: () => undefined }),
    context: async () => undefined, source: () => undefined };
  const recordsFake: Pick<AgentRecords, "receipt" | "status"> = { receipt: async () => undefined, status: () => Promise.reject(new Error("no records")) };
  const ports = portsFake as AgentReadPorts, records = recordsFake as AgentRecords, run = async () => undefined;
  const edit = createAgentEditTools({ workspace, ports, records, run });
  const media = createAgentMediaTools({ workspace, ports, records, run });
  const read = createAgentReadTools(ports);
  const requests = createRequestTools({ workspace, list: async () => [], save: async () => true });
  // Every table tool goes to every registry, so each request names tools outside its route's type.
  type Edit = Parameters<typeof edit.run>[0];
  type Media = Parameters<typeof media.run>[0];
  type Requests = Parameters<typeof requests.run>[0];
  const registries: [string[], (tool: AgentToolName) => Promise<{ ok: boolean; message?: string; value?: unknown }>][] = [
    [agentToolsOn("read"), tool => read.run(tool, {})],
    [agentToolsOn("edit", "status"), tool => edit.run({ operation: tool === "get_command_status" ? "status" : "edit", tool, args: {}, id: "mcp-1", grantId: "grant-1", createdAt: 1 } as Edit, 1, () => false)],
    [agentToolsOn("media"), tool => media.run({ operation: "media", tool, path: "", args: {}, id: "mcp-1", grantId: "grant-1", createdAt: 1 } as Media, 1, () => false)],
    [agentToolsOn("requests"), tool => requests.run({ operation: "requests", tool, args: {}, grantId: "grant-1" } as Requests, () => false, Date.now())],
  ];
  for (const [tools, runTool] of registries) {
    for (const tool of names) {
      const result = await runTool(tool);
      const unknown = /Unknown (?:browser|request) tool/.test(String(result.message ?? ""));
      assert.equal(unknown, !tools.includes(tool), `${tool} in the ${tools.join(", ")} registry`);
    }
  }
  assert.deepEqual([...mediaTools], agentToolsOn("media"));
  assert.deepEqual([...requestTools], agentToolsOn("requests"));
});

/** Arguments each Media command's own checks accept, so the probe reaches its case. */
const probeArgs: Partial<Record<AgentOperation, AgentCommandArgs>> = {
  keep_media: { files: ["a.png"] }, remove_media: { files: ["a.png"] }, replace_media: { file: "a.png", with: "b.png" },
  frame_image: { element: "0" }, loop_video: { element: "0" }, place_media: { file: "a.png", element: "0" },
  video_still: { file: "v.mp4", moment: 1 }, write_subtitles: { file: "v.mp4", text: "" },
  describe_media: { file: "a.png", text: "A picture" }, change_collection: { action: "new", name: "Holidays" },
};

test("applySiteCommand has a case for every table operation, and only the table's operations are admitted", async () => {
  // Every action throws "reached": a command that gets past its own checks reaches one in its case.
  const actions = new Proxy({}, { get: () => () => { throw new Error("reached"); } }) as AgentSiteActions;
  const command = (operation: string): AgentCommand => ({ id: "mcp-1", operation: operation as AgentOperation, path: "index.html",
    args: probeArgs[operation as AgentOperation] ?? {}, content: "", branch: "main", commit: "c".repeat(40), state: "pending", createdAt: 1 });
  const cannot = /cannot apply that change/;
  for (const operation of [...operations, "update_active_draft", "create_file_draft"]) {
    assert.ok(isAgentOperation(operation), operation);
    assert.equal(agentMediaArgsProblem(operation as AgentOperation, command(operation).args!, "index.html"), undefined, operation);
    await assert.rejects(applySiteCommand(actions, command(operation)), (error: Error) => !cannot.test(error.message), operation);
  }
  assert.equal(isAgentOperation("edit_file"), false, "edit_file arrives as write_file");
  await assert.rejects(applySiteCommand(actions, command("rename_site")), cannot);
});

test("the draft/receipt transaction takes the table's atomic commands, as before the table", () => {
  const atomic = [...operations, "update_active_draft", "create_file_draft"].filter(isAtomicOperation);
  assert.deepEqual(atomic.sort(), ["add_section", "create_file_draft", "create_page", "delete_file", "make_component", "move_file",
    "move_section", "remove_section", "set_page_details", "update_active_draft", "write_file"]);
  // atomicAgentCommand reads the operation only.
  assert.equal(atomicAgentCommand({ operation: "write_file" } satisfies Pick<AgentCommand, "operation"> as AgentCommand), true);
  assert.equal(atomicAgentCommand({ operation: "place_media" } satisfies Pick<AgentCommand, "operation"> as AgentCommand), false);
});

test("the hub refuses anything but a grant operation before touching storage", async () => {
  const calls: string[] = [];
  const storage: HubStorage = {
    get: async () => { calls.push("get"); return undefined; },
    put: async () => { calls.push("put"); },
    delete: async () => { calls.push("delete"); },
  };
  for (const action of [null, undefined, "add-grant", 7, [], {}, { type: "queue" }, { type: "context" }, { type: { toString: () => "add-grant" } }]) {
    const refused = await hubOperation(storage, action, async () => { calls.push("alarm"); });
    assert.equal(refused.status, 400, JSON.stringify(action));
    assert.deepEqual(await refused.json(), { error: "Unknown agent operation." });
  }
  assert.deepEqual(calls, []);
});
