---
title: Decide whether a folder can be put on GitHub
type: grilling (HITL)
status: closed
assignee: Lex + Codex (grilling)
blocked_by: [08-github-only-features]
---

## Question

Lex asked (2026-10-13) whether the editor can offer to create a new GitHub repository from a folder. When is it offered (only for a folder that is not a git clone, or always); does it need GitHub sign-in at that moment; is the first commit the folder's files as saved, with or without drafts; what happens afterwards: does the editor switch to the new GitHub project, keep the folder project, or link the two; and since the folder gets no `.git`, how does the user keep the folder and the repository in step later? Compare with the existing Create repository flow on Get started.

## Comments

### Round 1 with Lex (2026-10-14)

Lex accepted all four recommendations with **“sounds good”**:

- Offer **Put on GitHub…** for every local folder project, including a git clone. Create a new repository from the saved files, without copying Git history.
- Require the user to save drafts to the folder first, then copy the saved files. Do not upload the unsaved editing preview or silently save drafts.
- Default this new copy flow to **Private**, with an explicit choice of **Public**. The existing new-site wizard's public default stays as it is.
- After the complete copy succeeds, open the new GitHub project and retain the independent folder project on the overview. Do not link it to an existing repository, write `.git`, automatically sync, or deploy. Later coordination belongs to the user's own tools.

### Round 2 with Lex (2026-10-14)

Lex accepted all four recommendations with **“good”**:

- Check the copy before creating a repository. Unreadable or over-limit files needed for the copy, or page dependencies excluded by the skip rules, stop it with an explanation so the user can fix the problem first. Keep the agreed ignore and secret-file rules.
- If copying fails part way, keep the new repository and offer **Retry** for the same copy into that repository. Stay in the folder project until completion; do not delete the repository, roll back, or create a duplicate.
- Copy the collected saved version. Later outside changes stay in the folder; they do not join or cancel the upload merely because the folder changed. Retry must not silently read newer files or mix versions.
- If repository-creation permission is missing, reuse the existing fallback: guide the user to create an **empty repository** on GitHub, grant the editor access, and return to copy the folder's files. Keep the same content and privacy requirements; do not substitute a starting point or overwrite an existing nonempty repository.

## Resolution (2026-10-14)

These are planning decisions only. This closes the transfer questions left open by [Decide what GitHub-only features do on a folder](08-github-only-features.md#resolution-2026-10-14); that ticket remains the record of the earlier decision. Building still waits for the media manager.

### An explicit one-time copy

- Offer **Put on GitHub…** as the secondary action in every folder project's **⋯ menu on the project overview**, including a git clone, as settled in [Decide what GitHub-only features do on a folder](08-github-only-features.md#resolution-2026-10-14).
- It copies the folder's allowed, saved site files into a **new, separate GitHub repository**. It does not attach the folder to its existing remote or another existing repository, import Git history, commit or push the clone, show git status, or write `.git` into the folder.
- GitHub sign-in and authorization are required within this explicitly chosen flow when needed. Ordinary opening, editing and saving a folder need no GitHub account. Signing in or opening a menu does not upload folder files.
- Reuse the existing owner and repository-name choices. This copy flow defaults to **Private**; **Public** requires the user's explicit choice. Review the selected owner, name, visibility and a summary of the files to copy, then require final confirmation before creating the repository or uploading any folder files. Confirming the copy authorizes that upload. Do not change the existing new-site wizard's public default.

### Save, catch up and check before creating

- Before collecting the copy and creating a repository, regain folder access if needed, catch up with outside changes and require **all drafts to be saved to the folder**. Offer **Save to folder** when drafts remain; never silently save or include an unsaved editing preview. A failed or unfinished save, failed access check or failed catch-up stops the flow before repository creation.
- Saving and outside changes follow [Decide how saving to a folder works](06-saving-to-a-folder.md#resolution-2026-10-14) and its superseding [outside-change decision](07-outside-changes.md#resolution-2026-10-14): the folder wins without recovery, affected unfinished linked operations are cancelled, and successful earlier writes and unrelated drafts remain. A save stopped by an outside change is not a successful save that can advance this flow.
- Collect and check the saved files for the copy before repository creation. Copy the current allowed site files, including media; this is not a literal upload of everything in the folder. Apply the skip, `.gitignore`, secret-file and size rules from [Research what to skip and how big a folder can be](02-research-skip-and-limits.md#resolution-2026-10-13): `.git`, `node_modules`, caches, ignored files and secrets stay excluded. Secrets are never read or uploaded, even when linked from a page.
- The agreed preview exception and link warnings for ignored files still apply, but a page depending on an excluded file blocks this copy. An unreadable file to be copied, an over-limit file or a folder exceeding the agreed folder limits also blocks it. Identify the problem in plain words and let the user fix it before trying again; never silently omit a required file or create a repository for a known incomplete copy.

### Copy the collected saved version

The upload uses the saved file versions collected and checked for this copy. Later outside changes and new editor drafts remain with the folder project; do not add them to the in-progress copy, clear them on completion, or cancel the copy merely because the folder changed afterwards. Gathering files does not provide an atomic filesystem snapshot across other programs' writes; do not promise one.

### A partial failure keeps its repository

- If repository creation succeeds but copying fails, **keep that repository**, including any files already saved there. Explain the failed step, whether the repository is empty or partially copied, and the saved and pending file counts. A repository existing is not a completed copy.
- Remain in the folder project and offer **Retry** into the **same repository**, completing the same collected copy without duplicating it, repeating successful work unnecessarily, deleting the repository or rolling back its contents. Retry must not silently reread newer folder files or combine them with the original collected versions.
- If the original collected copy is no longer available, explain that the original copy cannot be resumed. Do not claim to resume it or silently replace its pending files with newer versions. How the implementation retains and resumes a copy is a build concern, not a new storage or protocol decision here.
- Do not fall back to Starter site or Blank page drafts after a failed folder copy, or automatically open a partial repository as a successful new project.

### Missing creation permission uses an empty repository

If the account cannot create the new repository, reuse the existing permission fallback: guide the user to create an **empty repository on GitHub**, grant the editor access, and return to complete the folder copy. Review its owner, name and actual visibility with the copy summary and final confirmation; the same explicit privacy choice, saved-file checks and exclusions apply. Do not seed it with Starter site or Blank page, or overwrite a nonempty target. This fallback does not replace a repository already created for a partially failed copy.

### Success opens an independent GitHub project

Only after every file in the collected copy has reached GitHub, open the new **GitHub project**. Keep the **folder project** on the overview, with its own drafts, including edits made during the copy. The projects remain independent: no automatic sync, repository attachment or Git setup in the folder. The user keeps later folder and repository changes in step with their own tools. Creating and copying the repository does not configure hosting, deploy the site or make it live.

### Existing flow and build constraints

Today's Create repository route accepts a 4 KB metadata request and optionally creates only a Starter site or Blank page (`worker/app.ts`, repository POST route); it does not accept a folder's files. The existing first-commit helper saves a seed file and then the remaining files in a further commit (`worker/first-commit.ts`); failures preserve the repository, and the existing new-site flow can fall back to starting-point drafts. A folder copy therefore needs distinct orchestration and truthful resume handling. Do not promise exactly one Git commit or reuse the starting-point fallback for it.

The folder limits are 10,000 files, 1 MB per text file and 20 MiB per file read as bytes. The current Save to GitHub batch allows 2,000 paths and 24 MiB (`worker/publish.ts`), so one existing save request cannot cover every allowed folder. The build must validate the agreed folder limits and transfer capability before creation and transfer in chunks while preserving the agreed collected versions and partial-failure behavior. Reuse the existing GitHub write and path validation and `.github` confirmation; folder copying must not bypass those guards. This decision adds no new limits or implementation protocol.
