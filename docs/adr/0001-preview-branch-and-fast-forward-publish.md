# ADR 0001: Preview branch with fast-forward publishing

Date: 2026-09-18. Status: accepted (Lex).

## Context

Previews are static builds produced by GitHub Actions from commits (about 76 s after a push, see [preview proof](../research/preview-proof.md)); browser-only drafts cannot be previewed. The original direction was "completed edits on the live branch save and publish automatically, without a Publish button". The source proof showed a visual edit is a one-range source change that the user wants to see in the preview before it is live. External agents push to the same repository through ordinary Git.

## Decision

- On the live branch (the default branch unless configured), applied visual edits are committed after a quiet period to an editor-owned preview branch `editor/<branch>`, built and served by the same workflow at its branch alias.
- **Publish** fast-forwards the live branch to the preview branch's commit. It never force-updates live and never creates merge commits; if live moved, it fails and the user reviews.
- If live moves and the external change does not overlap the editor's edits, the preview branch is rebased onto live automatically and rebuilt. Overlaps stop for review. The preview branch may be rewritten; it is not for agents to build on.
- Other branches are edited directly: Apply commits to the branch itself after the quiet period.
- Undo of a committed edit is a new revert commit.
- The editor shows Saved → Building → Live/Failed for the current change.

## Consequences

- "No Publish button" holds for previewing; going live remains one deliberate click. Automatic promotion after a green build can be added later without changing the branch model.
- Every applied edit becomes a commit on a preview branch; Git history on live stays clean because publishing is a fast-forward of already-built commits.
- The GitHub App needs no new permissions: branch creation, commits, fast-forward updates and rebases use the Contents/Git data APIs already granted. Force-updating the editor branch after a rebase is allowed because it is editor-owned.
- Build latency (~76 s) is now part of the editing loop; the status states make it visible instead of hiding it.
- Rejected: auto-commit straight to live (mistakes go live within a minute); pull requests for publishing (extra hop outside the editor, revisit if branch protection is needed); resetting the preview branch for undo.
