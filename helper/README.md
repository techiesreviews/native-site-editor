# editor-helper

Starts your own coding agent for each pin you add in [Native Site Editor](https://editor.techies.tools), so pins are picked up even when no chat is open.

```sh
npx -y @techiesreviews/editor-helper@0.2.0 https://editor.techies.tools/mcp
```

Choose **Connect to MCP** in the editor: the prompt it copies has your agent save your token in `~/.config/editor-helper/token`, where the helper reads it, and gives it this command. To save the token yourself, without it reaching your shell history, run `(umask 077 && mkdir -p ~/.config/editor-helper && rm -f ~/.config/editor-helper/token && cat > ~/.config/editor-helper/token)`, paste the token, then press Enter and Ctrl+D. Needs Node 24 or later, on macOS or Linux (not Windows). It runs until you choose **Disconnect MCP**, sign out, or press Ctrl+C.

- **Which agent:** Claude Code, on your own plan through its ACP adapter, signed in as you are in the terminal. `--agent codex`, `gemini` or `opencode` names another, but the helper cannot limit their own tools yet, so it says so and ends.
- **What it may do:** only the editor's own tools, whose changes are unsaved drafts you review. Claude Code gets no built-in tools at all (no shell, files or web of your computer) and none of your own settings, hooks or MCP servers, in an empty folder. Anything else it asks for comes to the pin as "Allow …?", and runs only if you answer yes.
- **Keep it running:** start it in a terminal you keep open, or apart from any chat: on Linux `systemd-run --user --collect --unit editor-helper --setenv=PATH="$PATH" "$(command -v npx)" -y @techiesreviews/editor-helper@0.2.0 <url>` (stop it with `systemctl --user stop editor-helper`), elsewhere `nohup npx -y @techiesreviews/editor-helper@0.2.0 <url> >/dev/null 2>&1 &`. A background job of an agent's chat ends with that chat.
- **Questions** come to the pin; your answer goes back to the same agent.

- **How long:** the token from Connect to MCP lasts as long as your editor sign-in, at most eight hours. Then the helper stops and says so; choose Connect to MCP again for a new token. (Signing the helper in on its own, so it keeps going, is a later decision.)
- **Stopping:** Ctrl+C, a stop, or closing its terminal says on each pin an agent had not finished that it stopped, so you can send it again later. Started again on the same token, it picks up the pins it had taken. An agent you stop in the editor's menu leaves its pin with a word from the helper, and later pins get another agent.

## Security

- **Agent programs:** the helper starts each agent's ACP program with `npx -y`, which downloads and runs it without asking: `@agentclientprotocol/claude-agent-acp@0.99.1`, `@agentclientprotocol/codex-acp@2.5.0`, `@google/gemini-cli@0.66.0` or `opencode-ai@1.19.5`. The version is pinned, but the download is not checked against a hash, so a hijacked release of one of these packages would run on your computer as you. Pinning them by integrity hash comes when the helper is published more widely.
- **The token:** the helper reads it from `~/.config/editor-helper/token` (or the file `--token-file <path>` names), never from a command line or the environment, so it is not in your shell history, the helper's process or the user service's settings. When your agent saves the file for you, the token is in its shell's command line for the instant the save runs. The file must be yours alone: the helper refuses one other users can read or change (`chmod 600` fixes it). Programs running as you can still read it. It lasts at most eight hours and can only write drafts you review; choose Disconnect MCP to end it sooner.

Options: `--token-file <path>` (default `~/.config/editor-helper/token`); `--agent claude|codex|gemini|opencode` (default `claude`); `--agent-command "<command>"` starts that ACP agent for every pin instead, under its program's name and with its own permissions (split on spaces: no quoted arguments); `--max-agents <n>` (default 3); `--verbose` shows the agents' own logs.

Build: `npm run build` (one file, `dist/cli.js`). Tests live in the editor repository (`tests/editor-helper.test.ts`).
