---
title: "GitHub collaborators join automatically"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [30-synced-session]
---

## Goal

Someone with access to the repository who opens the same project joins the live pages with no link.

## Decided behaviour

[Ticket 07, item 4](../../tickets/07-grill-synced-session.md#resolution-2026-10-24): own sign-in, own Save and agents, and the same live page.
- Mock-up approved by Lex (2026-10-27, after his changes): [14-share-live.html](../../prototypes/14-share-live.html)

## Files

Expected (confirm while designing): `src/live-session.ts`, `src/live-room.ts`, `worker/agent-relay.ts`; a spec with two signed-in users.

## Done when

- A spec: two signed-in users on the same repository and branch see each other's carets and edits with no link.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-31 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-31 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).

## Done (2026-11-08)

- Live sharing is on by default (`src/live-text.ts` `liveSharingOn`): every signed-in tab's open file joins its live room after the first paint, so two people with access to the same repository and branch meet on the page with no link, invite or switch, each under their own GitHub name, with their own drafts, Save and agents. Lex said "Yes, switch it on for everyone" on 2026-10-31 (Tuesday pack 2026-11-03, live sharing item 1), after the planned final check; this slice takes that default on `dev`, where the stage 3 end check still comes before any release. `localStorage` `native-site-editor:live-sharing` = `off` keeps one browser out of every room (the key used to switch it on).
- Collaborators on another person's personal account reach the site (`worker/github.ts` `reachableInstallations`): the repository listing, and so `authorizeRepository` and the live room's access check, now takes every App installation GitHub's `/user/installations` lists to the user. Before, an installation on another personal account was dropped, so a collaborator on, say, Lex's own sites was refused with 403 and could not open them at all; organisation repositories already worked. GitHub lists such an installation only to someone with access, and lists from it only the repositories they can reach. `ownerInstallations` (Get started's owners, creating a repository, onboarding's "create") still offers only the user's own account and organisations. A new sign-in whose only reachable installation is someone else's goes straight into the editor instead of to the App's install page (`worker/app.ts`).
- The project menu (`src/components/repository-menu.ts`): with several owners, the user's own account comes first, then the others by name; another person's account is marked "Shared with you" (not "You"). Its repositories have no Remove (only the owner chooses which repositories the editor may use), and the Add repositories link never points at another person's installation settings.
- Tests: `tests/native-save/native-collaborators-join.spec.ts` (the demo account's owner and `anna-collab`, two GitHub sign-ins with nothing switched on, open the same site and branch; Anna types on the page and Lex sees her words letter by letter and her caret by her own name; Lex types and Anna sees his words and caret; both sources end identical; Anna's menu shows the owner's repository open with no Remove); `tests/repository-menu-owners.test.ts` (own account first, "Shared with you", no Remove for it); `tests/github.test.ts` (the listing reads a collaboration's installation and authorises its repository, a repository it does not list is refused, owners for creating leave it out; a repository an installation lists under another owner's name is not taken from it); `tests/boot-session-route.test.ts` (a collaborator's onboarding says "none"); `tests/native-save/native-live-text.spec.ts` now checks that `off` keeps a browser's page out of every room (it checked the old default). The test server signs a browser in as another GitHub person with an `ase_demo_login` cookie (`tests/native-save/server.ts`).
- Validation: `RESULT: ok unit 1711/1711 (87 files)` (`kit unit --affected`), plus the docs guards (`RESULT` 98/98); `npm run check` and `npm run lint` clean; specs, with live sharing now on in every tab: `RESULT: ok specs 20/20 passed` (native-agent-live, native-agent-lifecycle, native-agent-quiet, native-mcp, native-mcp-menu, native-share-live, native-file-move-race, native-components, native-invisible-multiplayer, native-invisible-multiplayer-pages, native-switch-mid-work, native-several-agents, native-agent-presence, native-agent-edits, native-boot-requests, native-asset-references, native-media-tab, native-panel-collapse, native-edit-latency, native-save), then 11 of 12 passed (native-collaborators-join, native-org-repositories, native-onboarding, fake-github-onboarding, native-setup-wizard, native-create, native-page-together, native-code-carets, native-agent-merge, native-save-authors, native-static-starter-create) with native-live-text failing on its old "off by default" check, and after that fix `RESULT: ok specs 1/1 passed` (native-live-text); `RESULT: ok doctor 11/11 checks passed` (5 kit setup pieces reported missing, outside this slice).
- Feature list: F-repo-10 Collaborators join automatically (new); F-canvas-15 and the entries that pointed to it no longer ask to switch live sharing on; F-repo-02 says "your own account first". Code map: the GitHub and shared-copy rows.
- Not built here: who saves shared unsaved changes (ticket 07 item 4 leaves it to ticket 08); a collaborator's agent joins the room like any agent (unchanged). `kit shots` and the UX review are the slice's.

### UX follow-ups

- UX (looks off): F-setup-09 The project menu shows "Sign out of native-demo-user" at the bottom of the GitHub accounts section. The menu rows are 32 px tall at 390, under the 44 px touch size (HS18). No image shows what happens after you press it. (.scratch/ux/fleet-lead/20261108-224654-nTtNhD/editor-F-repo-05-390-light-branches-strip.webp)
- UX (looks off): F-repo-02 "Find a repository…" sits at the top of the Repositories list. At 390 the field is 32 px tall and sits right against the 24 px refresh button, under the 44 px touch size (HS18). No image shows the list narrowing as you type. (.scratch/ux/fleet-lead/20261108-224654-nTtNhD/editor-F-repo-05-390-light-branches-strip.webp)
- UX (looks off): F-repo-03 "+ Add repositories" with its outward arrow sits under the list. It is a 32 px row crowded against the last repository at 390 (HS18). No image shows the return from GitHub. (.scratch/ux/fleet-lead/20261108-224654-nTtNhD/editor-F-repo-05-390-light-branches-strip.webp)
- UX (looks off): F-repo-05 At 390 the Branches flyout opens on top of the Repositories list. It hides most of the repository row under it and leaves only that row's avatar edge and owner line showing (L5). The 32 px "main" row and the 24 px refresh button are under the 44 px touch size (HS18). "main" can still be picked. (.scratch/ux/fleet-lead/20261108-224654-nTtNhD/editor-F-repo-05-390-light-branches-strip.webp)
- UX (looks off): F-repo-06 After refresh, the same page shows again with no blank screen, in light and dark at both widths. The refresh button in Branches is 24 px at 390 (HS18). (.scratch/ux/fleet-lead/20261108-224654-nTtNhD/editor-F-repo-06-390-dark-refresh-strip.webp)
- UX (looks off): F-repo-09 "Share to edit" shows in the menu with its broadcast icon, as in the mock-up. The row is 32 px tall at 390 (HS18). The "Link copied" images were cut from the bundle, so the copied state is not shown. (.scratch/ux/fleet-lead/20261108-224654-nTtNhD/editor-F-repo-05-390-dark-branches-strip.webp)

### Follow-ups

- Validation gaps (gap): R1-6 still open: there is still no unit test for a collaborator whose only reachable installation is someone else's and lists no repositories. The `"none"` case in `tests/boot-session-route.test.ts:226` has a listed repository.
- Validation gaps (gap): R1-5 still open: no test was added showing that `accessUrl` (`src/components/repository-menu.ts:139-146`) never returns another person's installation settings URL.
- Validation gaps (gap): R1-4 still open: no test was added for the sign-in redirect at `worker/app.ts:1009-1010` when the user's only installation is someone else's.
- Previous findings (P3): R1-3 still open: no change. `tests/repository-menu-owners.test.ts:562` still passes the fake repositories with `as never`. It has no `satisfies`, no declared type and no comment explaining the cast.
- Previous findings (P3): R1-2 still open: there was no commit after round 1. `worker/github.ts:95-98` still has the doc comment "A blob's text read by `prefetchTexts`…" sitting above the new `ownedBy` comment and helper. That leaves two doc comments stacked over `ownedBy`, with the first one describing the wrong thing.
- Standards (P3): 17d203bff:worker/github.ts:95 — P3 style (CODING_STANDARDS.md header, "Read at review time… readability"): carried over from R1-2. The `textKey`/`blobKey` doc comment now sits above the `ownedBy` comment. Fix: move `ownedBy` and its comment above line 95, so "A blob's text read by `prefetchTexts`…" sits directly over `textKey` again.
- Standards (P3): 17d203bff:tests/repository-menu-owners.test.ts:562 — P3 style (CODING_STANDARDS.md "Test fixtures": type fakes with `satisfies` or a declared type, and document deliberate double assertions): carried over from R1-3. Fix: write `repo` with the return type `Repository` (imported as a type), or add a one-line comment on why `as never` is needed across the `page.evaluate` boundary.
- Validation gaps (gap): Sign-in redirect for a collaborator (`worker/app.ts:1009-1010`): add a test in `tests/` near the other OAuth callback tests. The fake `/user/installations` returns only `{ id, account: { type: "User", login: "lex" } }` for user `anna`. Assert that the callback redirects to `/`, not `/auth/install`, and that it still goes to `/auth/install` when the list is empty.
- Validation gaps (gap): Add repositories link (`src/components/repository-menu.ts:139-146`): in `tests/repository-menu-owners.test.ts`, call `setRepositories` with only `repo(1, "lex", "User")` while signed in as `anna`. Assert that the Add repositories link's `href` equals `installUrl` and contains no `/settings/installations/1`. Then add `repo(2, "anna", "User")` and assert that it points at installation 2.
- Validation gaps (gap): Collaborator with nothing listed: in `tests/github.test.ts`, `reachableInstallations` returns only lex's installation and `/user/installations/<id>/repositories` returns `[]`. Assert that `repositories("anna")` is empty, that the stored `installations` (from `ownedBy`) is empty, and that `/api/repositories` reports onboarding `"install"`.

