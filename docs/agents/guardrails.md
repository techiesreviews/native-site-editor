# Guardrails

Automated checks for mistakes made during Phase 5 (retro, 2026-10-08). Each one is mechanical and gives the same result on every run.

## `npm run check` (about 2 s on an idle machine)

- **Types and unused code** (`scripts/check-types.mjs`): runs TypeScript 7 (`node_modules/typescript/bin/tsc`, by path) with `--noUnusedLocals --noUnusedParameters` over `src` and `shared` (`tsconfig.json`), `worker` and `tests` (`tests/tsconfig.json`) in parallel. Every error fails in `src`, `shared` and `worker`. In the tests program only unused declarations fail for files in `tests/` (other type errors there are not fixed yet) and `worker/` (that program uses the DOM lib; the worker project checks those files); any error it finds in `src/` or `shared/` fails. `src/prototype/` is exempt from the unused checks. Anything else fails, including a missing project, no inputs, or output on stderr. To keep a parameter or loop variable that is not used, start its name with `_`.
- **Clipboard race** (`scripts/check-specs.mjs`): a copy button writes the clipboard asynchronously, so reading straight after the click can return the old text. In `tests/**/*.spec.ts`, every `navigator.clipboard.readText()` must follow an `expect.poll` whose callback reads `navigator.clipboard` and that closes within the three lines before the read. Comments, strings and template text are ignored (`${...}` stays code), and positions are UTF-16 offsets. It is a heuristic: regex literals are read as code, so a quote or backtick inside one can confuse it. `tests/check-specs.test.ts` covers the cases.

  ```ts
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Server: `");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  ```

  These reads also pass: reads inside an `expect.poll` callback, helpers that `return` the read (poll them where they are called), and reads straight after a `keyboard.press("ControlOrMeta+C")`. To opt out, put `// clipboard-ready: <reason>` on the read or on the line above it.

## `npm run lint` (about 20 s, kept separate from `check` because of its speed)

ESLint with type-aware typescript-eslint (`eslint.config.mjs`):

- `@typescript-eslint/unbound-method`: a method passed without its object, such as `x: ports.source` or `.catch(ports.onError)`, loses `this`. Wrap it in an arrow (`(path) => ports.source(path)`) or use `.bind(obj)`. If a port interface only holds free functions, declare its members as properties (`frame?: (callback: () => void) => void`) and not as methods.
- `no-restricted-syntax` for browser and Workers globals (`requestAnimationFrame`, `setTimeout`, `fetch` and others) used as object property values. When a port is called as `ports.frame()`, the global gets the wrong receiver and throws "Illegal invocation" (p5-21). Wrap the global in an arrow.

Opt out on one line with a reason: `// eslint-disable-next-line @typescript-eslint/unbound-method -- <reason>`. A reason is required, for example: the original is saved only to restore it later, and every call passes `.call(this)`.

typescript-eslint needs the TypeScript compiler API, which TypeScript 7 does not include. `tools/typescript-api/` is a small local package, installed as `typescript-eslint-api`, that depends on TypeScript 6. The committed `.npmrc` sets `install-links=true`, so npm copies it into `node_modules` and nests TypeScript 6 inside it, so its `tsc` stays out of `node_modules/.bin` and `npx tsc` remains TypeScript 7. `eslint.config.mjs` resolves typescript-eslint's `typescript` imports to it, and the `overrides` in `package.json` stop npm from rejecting the peer range.

## CI

`.github/workflows/deploy-preview.yml` runs `check`, `test`, `lint`, the byte budget (`tests/perf/byte-budget.ts`, 355 KB, enforced) and the smoke browser tests.

## Pre-commit hook

`.githooks/pre-commit` is tracked in the repo. It runs only when the staged files (including deletions and both sides of a rename) touch `src/`, `shared/`, `worker/`, `tests/`, `scripts/`, `tools/` or config files (`package.json`, tsconfig, ESLint, Vite, Playwright, wrangler). It then runs `npm run check` and lints the staged `.ts` files. Commits that change only docs skip it. It never runs browser suites. If the worktree has no `node_modules`, it prints a one-line notice and skips. If `eslint`, `typescript-eslint` or `typescript-eslint-api` does not resolve (a shared `node_modules` from before this change), it prints "lint skipped: run npm ci to enable" and still runs `npm run check`, which needs no lint packages.

- Turn it on once per clone: `git config core.hooksPath .githooks`. Nothing runs this for you. The setting applies to every worktree of the clone.
- Skip it once: `git commit --no-verify`.
- The hook checks the working tree, not only the staged snapshot.

Browser runs, ports and the full suite: see `docs/agents/agent-scripts.md`.
