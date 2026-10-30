# editor-helper

Starts your own coding agent for each pin you add in [Native Site Editor](https://editor.techies.tools), so pins are picked up even when no chat is open.

```sh
EDITOR_HELPER_TOKEN=<token> npx -y @techiesreviews/editor-helper@0.1.0 https://editor.techies.tools/mcp
```

Choose **Connect to MCP** in the editor: the prompt it copies holds this command with your token. Needs Node 24 or later. It runs until you choose **Disconnect MCP**, sign out, or press Ctrl+C.

- **Which agent:** the one chosen in the editor's **Pins go to** (Claude Code by default; also Codex, Gemini CLI, OpenCode). Each runs on your own plan through its ACP adapter, signed in as you are in the terminal.
- **What it may do:** only the editor's own tools, whose changes are unsaved drafts you review. It gets an empty folder and no shell, files or web of your computer; Claude Code gets no built-in tools at all. Anything else it asks for comes to the pin as "Allow …?", and runs only if you answer yes.
- **Questions** come to the pin; your answer goes back to the same agent.

- **How long:** the token from Connect to MCP lasts as long as your editor sign-in, at most eight hours. Then the helper stops and says so; choose Connect to MCP again for a new command. (Signing the helper in on its own, so it keeps going, is a later decision.)
- **Stopping:** Ctrl+C says on each pin an agent had not finished that it stopped, so you can send it again later.

Options: `--agent-command "<command>"` starts that ACP agent for every pin instead, under its program's name (split on spaces: no quoted arguments); `--max-agents <n>` (default 3); `--verbose` shows the agents' own logs.

Build: `npm run build` (one file, `dist/cli.js`). Tests live in the editor repository (`tests/editor-helper.test.ts`).
