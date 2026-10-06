/**
 * How an agent adds the editor's MCP server as "native-site-editor",
 * signing in with the editor's own OAuth (a custom connector).
 */
function addServerSteps(url: string) {
  return `Add it to your MCP servers as "native-site-editor" (it signs in with my GitHub account in the browser):
- Claude Code: run
  claude mcp add --transport http native-site-editor ${url}
  then /mcp, choose native-site-editor and Authenticate.
- claude.ai or Claude Desktop: Settings → Connectors → Add custom connector, URL ${url}, then Connect.
- Any other MCP client: a streamable HTTP server with that URL and OAuth.`;
}

/** The task that builds a site from nothing, about `about` when the user said. */
export function buildSitePrompt(about?: string) {
  const subject = about?.trim() ? about.trim().replace(/\s+/g, " ").slice(0, 300) : "<what it is about>";
  return `Build a site for ${subject} in this repository: call get_site, read the native-site://conventions resource and follow it (with no index.html yet, its "Starting a site from nothing"), write the pages with write_file and create_page, then tell me to review the drafts in the editor and Save to GitHub.`;
}

/**
 * What to paste into an agent before there is a repository (Get started):
 * create one (with the GitHub CLI when the agent has it), have the user give
 * the editor access, connect over MCP with OAuth, and build the site.
 */
/** The GitHub CLI command that creates the repository, in an organisation when `owner` is one. */
export function createCommand(options: { name: string; private: boolean; owner?: string }) {
  return `gh repo create ${options.owner ? `${options.owner}/` : ""}${options.name} --${options.private ? "private" : "public"}`;
}

export function setupPrompt(options: { editor: string; installUrl?: string | null; name: string; private: boolean; /** The organisation to create it in; absent for my own account. */ owner?: string; about?: string; /** The repository already open in the editor (owner/name): no creating or access steps. */ repository?: string }) {
  const url = `${options.editor}/mcp`;
  const first = options.repository
    ? `1. The repository is ${options.repository}, and it is open in the editor at ${options.editor}. Keep that tab open.`
    : `1. Create the repository ${options.name} ${options.owner ? `in my GitHub organisation ${options.owner}` : "on my GitHub account"}. If you have the GitHub CLI, run
   ${createCommand(options)}
   Otherwise ask me to create it on the editor's Get started screen.
2. Ask me to give the editor access to it${options.installUrl ? ` at ${options.installUrl} (choose the repository there)` : " (Get started, Use a repository you have)"}, then to open it in the editor at ${options.editor} and keep that tab open.`;
  const n = options.repository ? 2 : 3;
  return `Help me start a website with Native Site Editor (${options.editor}). The site is a GitHub repository whose files are the site: plain HTML, CSS and browser JavaScript, no build.

${first}
${n}. Connect to the editor over MCP. Server URL: ${url} (streamable HTTP)
${addServerSteps(url)}
   If you cannot change your own MCP settings, tell me exactly what to do.
${n + 1}. ${buildSitePrompt(options.about)}

Your changes appear in my editor as unsaved drafts; I review them and save them to GitHub.`;
}

/**
 * What to paste into an agent so it talks to the editor over a temporary,
 * direct connection (curl, no MCP configuration), then watches for requests
 * or does `task`. The server is stateless and answers in JSON, so each
 * JSON-RPC message is one POST.
 */
export function connectionPrompt(url: string, token: string, repo: string, task?: string) {
  const code = (text: string) => `\`${text}\``;
  const work = task
    ? `Then: ${task}`
    : `Then watch for my requests without spending a turn on each empty wait: run this loop as one shell command (in the background if your tools can wake you when it exits), which calls ${code("wait_for_requests")} until a request arrives or something fails, then prints the response:

\`\`\`bash
while :; do
  r=$(curl -s --max-time 70 ${url} \\
    -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \\
    -H "Accept: application/json, text/event-stream" \\
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wait_for_requests","arguments":{"waitSeconds":50}}}')
  case "$r" in *"No requests yet"*) ;; *) echo "$r"; break ;; esac
done
\`\`\`

Make the requested changes as unsaved editor drafts and answer each through ${code("reply_to_request")}: done when you made the change, answered when you replied without changing the site, question (at most 60 characters) when you need my input; my answer to a question arrives through the loop as well. Then run the loop again. If your shell stops the loop on a timeout, start it again. Follow whichever site I open. Continue until I say stop.`;
  return `Connect to Native Site Editor for this conversation using a temporary, direct MCP connection over streamable HTTP, so you can help me edit my site ${repo}.

Server: ${code(url)}

Authorization: ${code(`Bearer ${token}`)}

**Use curl to send MCP JSON-RPC requests. Do not modify MCP configuration, install anything, create helper files, or restart yourself.** Keep the token in memory; never save it or repeat it in responses. Curl works; Python's default HTTP client receives Cloudflare Error 1010.

Send each JSON-RPC message as its own POST with the headers ${code("Authorization")}, ${code("Content-Type: application/json")} and ${code("Accept: application/json, text/event-stream")}; the response body is the JSON-RPC result. The server is stateless, so there is no session id to keep. Start with ${code("initialize")} (protocolVersion "2025-11-25"), then use ${code("tools/call")}, ${code("prompts/get")} and ${code("resources/read")}. Give curl a timeout of at least 70 seconds: wait_for_requests holds the request open for up to waitSeconds (at most 50).

Initialize the MCP connection, call ${code("get_site")}, and read the ${code("watch_editor")} prompt. ${work}

When stopped, terminate pending requests (answer each request you took but did not finish with reply_to_request, status answered, saying you stopped) and discard the temporary connection credentials. The token also stops working when I choose Disconnect MCP or sign out of the editor (at most eight hours).`;
}
