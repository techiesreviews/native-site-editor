# editor-helper

Starts your own coding agent for each pin you add in [Native Site Editor](https://editor.techies.tools), so pins are picked up even when no chat is open.

```sh
EDITOR_HELPER_TOKEN=<token> npx -y @techiesreviews/editor-helper@0.1.0 https://editor.techies.tools/mcp
```

Choose **Connect to MCP** in the editor: the prompt it copies holds this command with your token. Needs Node 24 or later, on macOS or Linux (not Windows). It runs until you choose **Disconnect MCP**, sign out, or press Ctrl+C.

- **Which agent:** Claude Code, on your own plan through its ACP adapter, signed in as you are in the terminal. `--agent codex`, `gemini` or `opencode` names another, but the helper cannot limit their own tools yet, so it says so and ends.
- **What it may do:** only the editor's own tools, whose changes are unsaved drafts you review. Claude Code gets no built-in tools at all (no shell, files or web of your computer) and none of your own settings, hooks or MCP servers, in an empty folder. Anything else it asks for comes to the pin as "Allow …?", and runs only if you answer yes.
- **Keep it running:** start it in a terminal you keep open, or apart from any chat: on Linux `systemd-run --user --unit editor-helper --setenv=EDITOR_HELPER_TOKEN=<token> --setenv=PATH="$PATH" "$(command -v npx)" -y @techiesreviews/editor-helper@0.1.0 <url>` (stop it with `systemctl --user stop editor-helper`), elsewhere `nohup env EDITOR_HELPER_TOKEN=<token> npx -y @techiesreviews/editor-helper@0.1.0 <url> >/dev/null 2>&1 &`. A background job of an agent's chat ends with that chat.
- **Questions** come to the pin; your answer goes back to the same agent.

- **How long:** the token from Connect to MCP lasts as long as your editor sign-in, at most eight hours. Then the helper stops and says so; choose Connect to MCP again for a new command. (Signing the helper in on its own, so it keeps going, is a later decision.)
- **Stopping:** Ctrl+C, a stop, or closing its terminal says on each pin an agent had not finished that it stopped, so you can send it again later. Started again on the same token, it picks up the pins it had taken. An agent you stop in the editor's menu leaves its pin with a word from the helper, and later pins get another agent.

Options: `--agent claude|codex|gemini|opencode` (default `claude`); `--agent-command "<command>"` starts that ACP agent for every pin instead, under its program's name and with its own permissions (split on spaces: no quoted arguments); `--max-agents <n>` (default 3); `--verbose` shows the agents' own logs.

Build: `npm run build` (one file, `dist/cli.js`). Tests live in the editor repository (`tests/editor-helper.test.ts`).
