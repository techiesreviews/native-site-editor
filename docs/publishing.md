# Draft recovery and direct GitHub publishing

Implemented 2026-09-18. This milestone saves source files to GitHub. It does not run a build or claim that a commit is live on a website.

## Edit and publish

Drafts are stored locally in the browser on each edit, including the original source and original Git blob SHA. Refresh automatically reopens the last accessible repository, branch and file for this account and restores the saved draft. The storage key uses the signed-in GitHub account, repository ID, branch and path, so branch changes and a different login do not mix drafts. Logout releases in-memory models but retains that account's saved drafts for its next login on this browser. Clearing browser data deletes them. Undo history is retained while a model is open in the tab; only the text and baseline survive reload.

The toolbar reports a local storage failure and retains an in-memory copy for download. Persistent local drafts contain private repository source; they are not encrypted against someone with access to the same browser profile. GitHub tokens never enter this storage. Drafts do not synchronize across devices.

Open **Publish**, select files, and choose **Publish selected files**. The current file is selected by default. The endpoint supports existing regular text files and new text-file drafts, at most 20 files, 128 KB each and 1 MB total per batch. Unselected drafts remain local. Edits typed while a request runs remain a new draft on top of the committed content. No pull request or force push is used. Branch protection still applies. Workflow files, symlinks, submodules, deletion and renaming are outside this first publishing milestone.

New files created by an MCP agent use a null baseline SHA. They appear in **New draft files** until published. A new-file publish rejects a path that already exists with different content and preserves existing directory boundaries.

## Conflict handling

The server rechecks the signed-in account's installation membership and reads the current branch head. Each selected path must still be a regular file with the draft's original blob SHA (or already contain exactly the submitted text, to recognize a retry after a lost response). Any overlapping change or missing file rejects the entire batch before writes.

The server creates a tree based on the latest head, changing only selected files and preserving their modes. One child commit contains the batch. A non-forced branch update rejects concurrent forward changes; it never retries against a different baseline automatically. Unreachable Git objects may remain after a rejected race, but the branch is not changed by that attempt. These semantics follow GitHub's [tree API](https://docs.github.com/en/rest/git/trees#create-a-tree) and [reference API](https://docs.github.com/en/rest/git/refs#update-a-reference).

On conflict, refresh the repository and reopen the file. The old draft remains. **Review latest GitHub version** compares it with the newly fetched source. **Keep my draft over this version** explicitly adopts that reviewed version as the new baseline; publishing then checks it again. Alternatively discard the draft to use GitHub's latest source. Changes inside one file are not automatically merged.

## Restore an earlier file version

Open a file, then choose **History** in the toolbar. The list shows GitHub commits touching that file on the selected branch. Choose **Restore this version**, review the file, branch and revision, then choose **Restore file**. This writes a new commit for only that file; other files and later commits remain intact. It may start the repository's connected build pipeline.

Publish or discard a draft of that file before restoring. Drafts of other files are kept. A changed branch head stops the restore and asks you to refresh history. Workflow files, symlinks, submodules and revisions where the selected file did not exist cannot be restored through this control. Branch protection still applies.

History lists up to 1,000 commits for the current path. Use GitHub for older history or history before a rename. **Draft changes** keeps the existing local changes list, source comparison and preview comparison available.

## Enable publishing on the existing app

The original app registration requested read-only Contents access. Deploying code cannot change that registration.

1. Open the GitHub App's permissions (for the production app, [native-site-editor-techies](https://github.com/settings/apps/native-site-editor-techies/permissions)).
2. Under **Repository permissions**, change **Contents** to **Read and write** and save. Keep **Metadata** read-only. Set **Actions** to **Read-only** so the editor can show the Change status (Saved, Building, Live, Failed) of a save from its workflow runs (added 2026-09-25); without it the status stays "Saved".
3. Open [installed GitHub Apps](https://github.com/settings/installations), find the app, and accept its updated permissions for the selected repositories.
4. Reconnect in the editor, edit a file and publish. An existing protected branch may still require a PR; this first direct-publish version will report that restriction rather than bypass it.

GitHub requires installation owners to approve newly requested permissions before they take effect. See [modifying app permissions](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration#changing-the-permissions-of-a-github-app). New registrations generated by the setup helper now request Contents write from the start.

## Build preview is a separate milestone

The private starter currently has no GitHub Actions workflow or connected deployment pipeline. A successful source commit therefore does not currently deploy this starter anywhere. The editor reports **Saved to GitHub** with a commit link and does not label it live.

The next bounded proof is a static Astro build from a fixed revision, served on a separate origin and embedded in the editor. Use the actual lockfile and build output, then map visual selections to source. A general project runner must be isolated from editor credentials. The existing Cloudflare Worker cannot execute arbitrary npm builds; the [preview feasibility report](research/hosted-preview.md) documents that boundary. A paid Sandbox is not enabled because the project requires a no-recurring-cost path. No repository code is executed on the editor Worker or the developer host by the publishing endpoint.
