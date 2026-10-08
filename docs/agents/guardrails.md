# Guardrails

Automated checks for mistakes made during Phase 5 (retro, 2026-10-08). Each one is mechanical and gives the same result on every run.

## `npm run check` (about 2 s on an idle machine)

- **Types and unused code** (`scripts/check-types.mjs`): runs `tsc --noUnusedLocals --noUnusedParameters` over `src` and `shared` (`tsconfig.json`), `worker` and `tests` (`tests/tsconfig.json`) in parallel. Every error fails in `src`, `shared` and `worker`. In `tests` only unused declarations fail, because the tests have other type errors that are not fixed yet. `src/prototype/` is exempt from the unused checks. To keep a parameter or loop variable that is not used, start its name with `_`.
- **Clipboard race** (`scripts/check-specs.mjs`): a copy button writes the clipboard asynchronously, so reading straight after the click can return the old text. In `tests/**/*.spec.ts`, every `navigator.clipboard.readText()` must come within three lines after an `expect.poll` on the clipboard:

  ```ts
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Server: `");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  ```

  These reads also pass: reads inside an `expect.poll` (on the same line or in its callback block), helpers that `return` the read (poll them where they are called), and reads straight after a `keyboard.press("ControlOrMeta+C")`. To opt out, put `// clipboard-ready: <reason>` on the read or on the line above it.

## `npm run lint` (about 20 s, kept separate from `check` because of its speed)

ESLint with type-aware typescript-eslint (`eslint.config.mjs`):

- `@typescript-eslint/unbound-method`: a method passed without its object, such as `x: ports.source` or `.catch(ports.onError)`, loses `this`. Wrap it in an arrow (`(path) => ports.source(path)`) or use `.bind(obj)`. If a port interface only holds free functions, declare its members as properties (`frame?: (callback: () => void) => void`) and not as methods.
- `no-restricted-syntax` for browser and Workers globals (`requestAnimationFrame`, `setTimeout`, `fetch` and others) used as object property values. When a port is called as `ports.frame()`, the global gets the wrong receiver and throws "Illegal invocation" (p5-21). Wrap the global in an arrow.

Opt out on one line with a reason: `// eslint-disable-next-line @typescript-eslint/unbound-method -- <reason>`. A reason is required, for example: the original is saved only to restore it later, and every call passes `.call(this)`.

typescript-eslint needs the TypeScript compiler API, which TypeScript 7 does not include. `eslint.config.mjs` therefore resolves its `typescript` imports to TypeScript 6, installed as `typescript-eslint-api`, and the `overrides` in `package.json` stop npm from rejecting the peer range.

## CI

`.github/workflows/deploy-preview.yml` runs `check`, `test`, `lint`, the byte budget (`tests/perf/byte-budget.ts`, 355 KB, enforced) and the smoke browser tests.

## Pre-commit hook

`.githooks/pre-commit` is tracked in the repo. It runs only when the staged files include `src/`, `shared/`, `worker/`, `tests/`, `scripts/` or config files (`package.json`, tsconfig, ESLint, Vite, Playwright, wrangler). It then runs `npm run check` and lints the staged `.ts` files. Commits that change only docs skip it. It never runs browser suites. If the worktree has no `node_modules`, it prints a one-line notice and skips. If ESLint or `typescript-eslint-api` is missing (a shared `node_modules` from before this change), it prints "lint skipped: run npm ci to enable" and still runs `npm run check`, which needs no lint packages.

- Turn it on: `git config core.hooksPath .githooks`. `npm install` does this through `prepare`. The setting applies to every worktree of the clone.
- Skip it once: `git commit --no-verify`.
- The hook checks the working tree, not only the staged snapshot.

Browser runs, ports and the full suite: see `docs/agents/agent-scripts.md`.
