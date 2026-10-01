// Words shared by the two places that explain connecting an agent: the Set up
// your site checklist (its spotlight on the project menu) and the Setup
// wizard's Connect an agent step. One source, so they never drift apart.

/** What an agent is for, in three short lines. */
export const AGENT_EXPLAINER = [
  "An AI agent such as Claude Code or Codex can build and edit your site for you.",
  "It connects to this editor over MCP and its changes arrive here as drafts you review and save.",
  "You can always disconnect.",
];

/** Where the connection lives: the project menu (the tile at the top left), and its Connect with MCP entry. */
export function agentWhere(): Node {
  const line = document.createDocumentFragment();
  line.append("Agents connect here, from the project menu. Open it and choose ");
  const strong = document.createElement("strong");
  strong.textContent = "Connect with MCP";
  line.append(strong, " to copy the setup for your agent.");
  return line;
}

/** The same sentence as plain text, for tests and labels. */
export const AGENT_WHERE_TEXT = "Agents connect here, from the project menu. Open it and choose Connect with MCP to copy the setup for your agent.";
