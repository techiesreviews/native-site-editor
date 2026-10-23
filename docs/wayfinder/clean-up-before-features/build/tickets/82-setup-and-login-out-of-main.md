---
title: "Login, setup checklist, wizard and Get started leave main.ts"
type: task (AFK)
status: closed
assignee: lead-82
builder: sol
blocked_by: [25-boot-and-snapshot]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Login and setup (`renderLogin` 99 lines, the setup checklist, `newDraftPaths` callers, about lines 3210–3439 at `89ac5e0e`) and the wizard, partial start and Get started (5165–5330) move into a setup module; the existing lazy loaders (`loadWizard`, `loadGetStarted`, `loadStartSite`, `loadChecklist`) stay lazy. About −395 lines.

## Decided behaviour

No visible change. Remembering the last site until sign-out stays ([ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22)).

## Files

- `src/main.ts` (the regions above), new `src/setup-host.ts` (name is the builder's), `src/controllers/setup-entry-controller.ts`, `src/controllers/setup-checklist-controller.ts`
- Tests: affected unit tests; setup, wizard and Get started specs through `kit specs --affected`
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Done when

- A moved function keeps its body; ports are live; lazy modules stay type-only imports.
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Edits `main.ts`: at most one other `main.ts` slice at once.

- `kit doctor`; `kit bg slice-82 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/82-setup-and-login-out-of-main.md --builder sol`; `kit wait job slice-82 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.

## Done (2026-10-23)

- Login and setup moved from `src/main.ts` into `src/setup-host.ts` (`createSetupHost`): the login card (`renderLogin`, `EDITOR_HOME`, `EDITOR_LOGIN`), Start your site (`startSitePanel`), the Setup checklist (`setupController`, `setupState`), the Setup wizard (`wizardConnection`, `setupEntry`, `finishWizard`, `wizardCreated`), the partial start (`rememberPartialStart`, `readPartialStart`, `forgetPartialStart`, `offerFinishStarter`, `removeFinishStarter`), Get started (`showGetStarted`, `checkNewRepositories`, `waitingForRepositories`, `rememberRepositories`, `knownRepositories`), the Get started starting point (`rememberStartingPoint`, `takeStartingPoint`) and the setup-action wrappers (`createSiteInWizard`, `findWizardRepository`, `wizardPreview`, `createSite`, `writeSiteSettings`, `writeStartingPoint`). `main.ts` keeps one construction call (`setup`), destructures what its other code calls, and keeps `setupScope`, the focus and visibility listeners, and `newDraftPaths` (its only caller is file creation).
- Bodies are the old ones with `ports.` prefixes. Other changes: `renderLogin`'s workspace teardown stays in `main.ts` as `closeWorkspace` (same lines, same order), which `renderLogin` calls first; `renderLogin` reads `info` once into a local; `errorMessage` is wrapped in arrows (lint's unbound-method); the checklist's `scope`, `loadChecklist` and `loadSpotlight` and the wizard entry's `loadWizard` are arrows; a new section comment heads the setup-action wrappers ("The repository and starting-point writes … loaded on first use"); `loadSetupActions` and `loadRepositories` read `setup.wizardCreated` and `setup.waitingForRepositories`; two orphaned comments (Create a site, the site's name) now sit above `createSite` and `writeSiteSettings`.
- Ports are live: session info, repositories, content, the repository menu, `nativeEngaged`, the loaded agent prompts and onboarding copy, `boot` and `agentController` are getters. The lazy loaders stay in `main.ts`; `setup-host.ts` imports the wizard, Get started, Start your site, checklist, setup actions, agent prompts and onboarding copy as types only.
- No visible change.
- Tests: `tests/setup-host.test.ts` (24 tests, ports typed with `satisfies`, a fake element cast once in `asElement`): the login page closes the workspace first; loading, automatic, error, configured, owner-setup (wizard only when ready) and unconfigured cards; partial start kept by account and repository, damaged records ignored; a Get started starting point taken once, in any case; known repositories by account; Get started shows and waits; coming back lists new repositories only while waiting, not on a hidden tab, and not once Get started stopped waiting or left the page during the fetch; leaving the wizard shows Get started only for a signed-in account with no repository; the wizard's last step falls back to the known list when GitHub's cannot be read; the wizard's last step opens a repository GitHub does not list yet; a starting-point write and a site name saved from the checklist are refused when the session or snapshot moved while the actions loaded; `forEachAwait` races: both writes, and Get started (page, account or repositories moved), write nothing stale at any await; Finish adding writes, says why it failed, and removes itself once left behind; the checklist's state (home draft, commit, site name) and its name save, Start and Save refusals; Start your site copies the agent prompt; the lazy modules stay type-only imports (multi-line imports and dynamic imports included). `tests/main-ts-ceiling.test.ts`: the setup host's destructured members (consts, not hoisted functions) are used above their `const { … } = setup` line only inside functions, with a case that names a member passed by value or used in a function called on the spot. `tests/workspace-session-guard.test.ts`: the `offerFinishStarter` allowlist entry now names `src/setup-host.ts`.
- `main.ts` 5134 → 4803 lines (−331, against the estimated −395: `closeWorkspace`, `setupScope`, `newDraftPaths` and the two listeners stay), ceiling 5140 → 4810; `docs/agents/code-map.md` ranges re-measured and the Login row names `src/setup-host.ts`.

- Evidence: `RESULT: ok unit 37/37 (3 files)` (`kit unit --affected`), `RESULT: ok specs 87/87 passed` (`kit specs --affected`, setup checklist, setup wizard, startup and static starter specs among them), `RESULT: ok size boot 344 KB (±0 KB) vs dev@e881491, budget 355 KB`; `npm run check` and `npm run lint` green; `npm test` 5125/5125.
