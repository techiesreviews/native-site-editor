import type { EditorContext } from "./types";
export interface AgentCommand {
  id: string;
  operation: "update_active_draft" | "create_file_draft";
  path: string;
  branch: string;
  commit: string;
  expectedHash?: string;
  content: string;
  state: "pending" | "applied" | "conflict" | "failed";
  message?: string;
  createdAt: number;
}
export async function textHash(content: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export type AgentContext = EditorContext;
