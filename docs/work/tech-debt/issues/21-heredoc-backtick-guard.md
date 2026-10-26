---
title: bash-guard rejects unquoted heredocs that contain backticks
status: ready-for-agent
assignee:
blocked_by: []
---

# bash-guard rejects unquoted heredocs that contain backticks

## What

Retro 2026-10-26, item 3. An agent wrote a ticket with `cat <<EOF` around text containing `` `src/board/` ``. The shell ran the backticks as a command and silently deleted the path from site-structure ticket 04. Markdown is full of backticks, so this will happen again.

## Done when

- `scripts/agents/hooks/bash-guard.sh` rejects (exit 2) a Bash command with an unquoted heredoc delimiter (`<<EOF`, `<<-EOF`) whose body contains a backtick or `$(`. The message says to quote the delimiter: `<<'EOF'`.
- Quoted delimiters (`<<'EOF'`, `<<"EOF"`) pass, and so does an unquoted heredoc without backticks.
- Cases are added to the guard's existing tests.
- Kit: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr` into dev.
