# Changelog

## 0.2.0

- The token comes from a file only you may read, `~/.config/editor-helper/token` (or the file `--token-file <path>` names), never from the environment. It no longer appears in the helper's command line or environment, your shell history or the user service's settings. The helper refuses a token file other users can read or change (`chmod 600` fixes it). Connect to MCP's copied prompt saves the file before it starts the helper. (TOOLS-270)
- `EDITOR_HELPER_TOKEN` is no longer read. 0.1.0 was never published, so no start command in use names it.

## 0.1.0

- First version: starts Claude Code for each pin, through its ACP adapter. Never published to npm.
