# Coding standards

Read at review time. Apply every section whose subject the diff touches, and
cite the rule with each finding. Mechanical rules live in the automated checks
(`npm run check`, `docs/agents/guardrails.md`), not here.

## Controllers (`src/controllers/*-controller.ts`)

A controller owns a domain's orchestration; `src/main.ts` owns host state,
transactions and DOM mounting, and hands them in as ports.

- Ports are live: each port reads the host's value at call time (a getter or
  an arrow), so the controller holds no copy of repository, branch, snapshot,
  site, source, draft, selection or tree state that the host also owns.
- Proofs survive awaits: capture the proof (generation, scope, revision,
  `masterRevision()`, `proof.isCurrent()`, selection epoch, expected sources
  and files, editor model) before the first await, and re-check that same
  proof after every await and before every write. Taking a fresh proof after
  an await, in place of the old one, hides the race it exists to catch.
- One transaction per user action: a write goes through one guarded edit
  (`edits.run` or `edits.now`, src/guarded-edit.ts) whose plan reads every
  file it depends on through `r`, so it succeeds whole, fails whole, and
  undoes as one step.
- Module order holds: a port that main.ts evaluates before the controller's
  `const` exists reaches it through a hoisted function or an arrow.
- Receivers travel with methods: a DOM, `window`, `Set`/`Map` or object
  method handed over as a port is wrapped in an arrow.
- Lazy stays lazy: a controller imports a lazily loaded module (panels,
  Monaco, page-builder UI) as a type only.
- A moved function keeps its body: an extraction diff reads as the old body
  plus `ports.` prefixes; any other change is named in the commit message.
- Unit tests assert behaviour through the real controller and type their
  port fixtures with `satisfies`, so an added or renamed port fails to
  compile.
- Ports and API names cost bytes (property names are not minified): report
  the budget delta of a slice, and prefer few, short port names.

## Racing and speculative reads

Any code that starts reads before it knows it needs them, or waits on the
first of several results (`Promise.race`, a guessed snapshot, predicted
files), settles every outcome by design.

- Write the settle matrix: for each racing input, resolves, rejects and never
  settles; every combination has a stated outcome, and the page never stays
  in a loading state with no way forward.
- Exactly one path wins; the losing result writes nothing (no state, no
  cache, no UI) once it is abandoned, timed out, or superseded by navigation
  or a new boot.
- A rejection on the speculative path reaches the same outcome the plain path
  would (the same message, an enabled control), never a login or error state
  of its own.
- Timers are created once and cleared on every settle path.
- Each matrix row has a browser spec that forces the order through
  `page.route` hold and release, waiting on observable app state.

## Browser specs

- Wait on observable state (`expect`, `expect.poll`, a locator), so a spec
  passes the same on a slow CI runner as on a fast laptop.
- A spec that reads the clipboard first polls it for the expected content
  (`docs/agents/guardrails.md` checks this).
- A spec states which fixture group it needs (`@actual`, `@native-static`,
  or default) and runs in that group.
