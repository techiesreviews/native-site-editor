import type { AgentEditTool } from "./agent-edit";
import type { MediaTool } from "./agent-media";
import type { AgentRead } from "./agent-read";

/**
 * Every agent tool, once. Its executors live where they run: the Worker's MCP registration
 * (worker/mcp.ts, which registers the tools in this order), and the receiving tab's
 * registry for its route (src/agent-tools-read.ts, src/agent-tools-edit.ts,
 * src/agent-tools-media.ts, src/agent-watch.ts) with applySiteCommand's case for its
 * operation (src/agent-site.ts). tests/agent-tool-table.test.ts fails when they disagree.
 *
 * - `route`: the relay command the Worker sends the tab (its `operation`): a read, a
 *   change's status, a text edit, a Media command, or a request tool.
 * - `effect`: what the tool does to the site, as its MCP hints say: reads, edits or removes.
 * - `operation`: the browser command a text edit or Media command becomes; `atomic`: that
 *   command enters the draft/receipt transaction.
 * - `idempotent: false`: calling it twice is not the same as once.
 * - `mcp: false`: a browser tool behind another MCP tool (get_selection with a request).
 */
export const agentTools = {
  get_site: { route: "read", effect: "read" },
  list_files: { route: "read", effect: "read" },
  read_file: { route: "read", effect: "read" },
  export_site: { route: "read", effect: "read" },
  get_page: { route: "read", effect: "read" },
  get_command_status: { route: "status", effect: "read" },
  edit_file: { route: "edit", effect: "edit", operation: "write_file", atomic: true },
  write_file: { route: "edit", effect: "edit", operation: "write_file", atomic: true },
  move_file: { route: "edit", effect: "edit", operation: "move_file", atomic: true },
  delete_file: { route: "edit", effect: "remove", operation: "delete_file", atomic: true },
  create_page: { route: "edit", effect: "edit", operation: "create_page", atomic: true },
  set_page_details: { route: "edit", effect: "edit", operation: "set_page_details", atomic: true },
  open_page: { route: "edit", effect: "read", operation: "open_page" },
  inspect_preview: { route: "edit", effect: "read", operation: "inspect_preview" },
  list_media: { route: "media", effect: "read", operation: "list_media" },
  preview_media: { route: "media", effect: "read", operation: "preview_media" },
  remove_media: { route: "media", effect: "remove", operation: "remove_media" },
  keep_media: { route: "media", effect: "edit", operation: "keep_media" },
  restore_media: { route: "media", effect: "edit", operation: "restore_media" },
  replace_media: { route: "media", effect: "edit", operation: "replace_media" },
  frame_image: { route: "media", effect: "edit", operation: "frame_image" },
  place_media: { route: "media", effect: "edit", operation: "place_media" },
  improve_images: { route: "media", effect: "edit", operation: "improve_images" },
  loop_video: { route: "media", effect: "edit", operation: "loop_video" },
  video_still: { route: "media", effect: "edit", operation: "video_still" },
  write_subtitles: { route: "media", effect: "edit", operation: "write_subtitles" },
  describe_media: { route: "media", effect: "edit", operation: "describe_media" },
  change_collection: { route: "media", effect: "edit", operation: "change_collection" },
  adding_settings: { route: "media", effect: "edit", operation: "adding_settings" },
  make_component: { route: "edit", effect: "edit", operation: "make_component", atomic: true },
  add_section: { route: "edit", effect: "edit", operation: "add_section", atomic: true },
  move_section: { route: "edit", effect: "edit", operation: "move_section", atomic: true },
  remove_section: { route: "edit", effect: "remove", operation: "remove_section", atomic: true },
  wait_for_requests: { route: "requests", effect: "read", idempotent: false },
  get_selection: { route: "read", effect: "read" },
  reply_to_request: { route: "requests", effect: "edit", idempotent: false },
  get_request: { route: "requests", effect: "read", mcp: false },
} as const satisfies Record<string, {
  route: "read" | "status" | "edit" | "media" | "requests";
  effect: "read" | "edit" | "remove";
  operation?: string;
  atomic?: true;
  idempotent?: false;
  mcp?: false;
}>;

/** The Astro-era active-file commands the code editor still applies, as write_file; both atomic. */
const legacyOperations = ["update_active_draft", "create_file_draft"] as const;

type Table = typeof agentTools;
export type AgentToolName = keyof Table;
export type AgentToolRoute = Table[AgentToolName]["route"];
/** The tools a route carries. */
export type AgentToolOn<R extends AgentToolRoute> = { [K in AgentToolName]: Table[K]["route"] extends R ? K : never }[AgentToolName];
export type McpToolName = { [K in AgentToolName]: Table[K] extends { mcp: false } ? never : K }[AgentToolName];
/** What an agent can ask the open editor tab to do: the browser commands of the table's rows. */
export type AgentOperation = { [K in AgentToolName]: Table[K] extends { operation: infer O } ? O : never }[AgentToolName]
  | typeof legacyOperations[number];

const names = Object.keys(agentTools) as AgentToolName[];
const rows: readonly { route: AgentToolRoute; operation?: string; atomic?: true; mcp?: false }[] = Object.values(agentTools);
/** The tools the routes carry, in table order. */
export const agentToolsOn = <R extends AgentToolRoute>(...routes: R[]) =>
  names.filter(name => (routes as AgentToolRoute[]).includes(agentTools[name].route)) as AgentToolOn<R>[];
export const mcpTools = names.filter((_name, at) => rows[at].mcp !== false) as McpToolName[];
const operations = new Set<string>([...legacyOperations, ...rows.flatMap(row => row.operation ?? [])]);
const atomic = new Set<string>([...legacyOperations, ...rows.flatMap(row => row.atomic ? row.operation! : [])]);
export const isAgentOperation = (value: unknown): value is AgentOperation => typeof value === "string" && operations.has(value);
/** Only these commands enter the draft/receipt transaction. */
export const isAtomicOperation = (operation: string) => atomic.has(operation);

// The routes' own types name the same tools as the table (both ways, so neither can grow alone).
type Same<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
const agrees = <_ extends true>() => undefined;
agrees<Same<AgentRead["tool"], AgentToolOn<"read">>>();
agrees<Same<AgentEditTool, AgentToolOn<"edit">>>();
agrees<Same<MediaTool, AgentToolOn<"media">>>();
