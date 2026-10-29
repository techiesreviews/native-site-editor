import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
// @ts-expect-error This editor's helper is plain JavaScript without declarations.
import { kitHomeFolder } from "../scripts/agents/kit-home.mjs";
import { toolingHash } from "../scripts/agents/shots/compare.mjs";
import { screens } from "../scripts/agents/shots/core";

// This editor runs the shared kit through its launcher (kitchen-everywhere 30). The kit's own tests live in the
// agent-kit repo; these check what is this editor's: its own commands, its docs into the shared rulebook, the
// forwarders and the context card hook it documents. The kit is the one the launcher picks (KIT_HOME, else the
// machine copy, else the cache clone), so CI in the kit repo runs them against a changed kit.
const kit = resolve("scripts/agents/kit");
const home: string = kitHomeFolder();
const shared = join(home, "docs/kitchen.md");
const sharedUrl = "https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md";
const extras = "docs/agents/kitchen-extras.md";
const pointer = "docs/agents/kitchen.md";
const read = (path: string) => readFileSync(resolve(path), "utf8");
const own = readdirSync("scripts/agents/project.d").filter(name => !/^[._]/.test(name) && statSync(join("scripts/agents/project.d", name)).mode & 0o111);

function temp(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "kit-editor-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function anchors(markdown: string): string[] {
  const seen = new Map<string, number>();
  return markdown.split("\n").filter(line => /^#+ /.test(line)).map(line => {
    const base = line.replace(/^#+ /, "").toLowerCase().replace(/[^\w\- ]/g, "").replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  });
}

test("the launcher lists this editor's own commands, and each answers --help through it", () => {
  const list = spawnSync(kit, [], { encoding: "utf8", timeout: 60_000 });
  assert.equal(list.status, 0, list.stdout + list.stderr);
  assert.deepEqual(own.sort(), ["preview", "shots", "size", "specs"]);
  const projectPart = list.stdout.split("\nProject commands:\n")[1] ?? "";
  for (const name of own) {
    assert.match(projectPart, new RegExp(`^  ${name} +\\S`, "m"), `${name} listed as a project command`);
    const help = spawnSync(kit, [name, "--help"], { encoding: "utf8", timeout: 60_000 });
    assert.equal(help.status, 0, `${name}: ${help.stdout}${help.stderr}`);
    assert.match(help.stdout, new RegExp(`^Usage: kit ${name}`), name);
  }
});

test("kit rulebook prints the kit's shared rulebook, then this editor's extras", () => {
  const result = spawnSync(kit, ["rulebook"], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout, `${readFileSync(shared, "utf8")}\n${read(extras)}RESULT: ok rulebook shared and ${extras}\n`);
  assert.equal(JSON.parse(read("scripts/agents/kit.json")).rulebookExtras, extras);
});

test("every link from this editor's docs into the shared rulebook names a heading it has; relative links resolve", () => {
  const headings = anchors(readFileSync(shared, "utf8"));
  for (const path of [extras, pointer, "docs/agents/runner.md", "docs/agents/agent-scripts.md"]) {
    for (const [, target] of read(path).matchAll(/\]\(([^)\s]+)\)/g)) {
      const [file, anchor] = target.split("#");
      if (file === sharedUrl) {
        if (anchor) assert.ok(headings.includes(anchor), `${path}: the shared rulebook has no heading for ${target}`);
        continue;
      }
      if (/^https?:/.test(target)) continue;
      const full = file ? resolve(dirname(path), file) : resolve(path);
      assert.ok(existsSync(full), `${path}: missing ${target}`);
      if (anchor) assert.ok(anchors(readFileSync(full, "utf8")).includes(anchor), `${path}: no heading for ${target}`);
    }
  }
});

test("the pointer keeps every heading the old kitchen.md had, each linking to the shared part", () => {
  const old = ["house-rules", "who-cooks-pins-from-2026-10-22", "stations", "1-idea", "2-map-and-questions",
    "3-mock-up-before-any-visible-build", "4-tickets", "5-hand-out", "6-build", "7-checks", "8-review", "9-land",
    "10-preview-note-scoreboard", "11-lexs-end-check", "12-release", "ux-confidence-ladder", "weekly-routines",
    "tuesday-review", "small-chores-on-free-models"];
  assert.deepEqual(anchors(read(pointer)).slice(1), old);
  for (const block of read(pointer).split(/^#+ .*$/m).slice(2)) assert.ok(block.includes(`[Shared](${sharedUrl}#`), block);
  assert.match(read("AGENTS.md"), /`docs\/agents\/kitchen\.md` \(the kitchen rulebook\)/);
});

test("runner review, landing and waiting follow the kit and the per-CLI waiting guidance", () => {
  const runner = read("docs/agents/runner.md");
  assert.ok(runner.split("\n").length <= 96);
  assert.match(runner, /Claude runs them with\s+`run_in_background: true`/);
  assert.match(runner, /Codex runs them in the foreground or its background terminal/);
  assert.match(runner, /scripts\/agents\/kit wait pid\|output\|ci/);
  for (const command of ["scripts/agents/kit review --ticket <ticket>", "scripts/agents/kit pr --ticket <ticket>"]) {
    const line = runner.split("\n").find(line => line.includes(command));
    assert.ok(line, command);
    assert.match(line, /in the background/);
  }
  assert.doesNotMatch(runner, /\b(?:review|ci-status|land)\.sh/);
});

test("the forwarders run the kit's own helper with every argument and its exit status", (t) => {
  // A whole kit, as the launcher checks it: an executable kit and kit-lib.sh.
  const fake = temp(t);
  writeFileSync(join(fake, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(fake, "kit"), 0o755);
  writeFileSync(join(fake, "kit-lib.sh"), "");
  const record = 'printf "%s|" "$(basename "$0")" "$@"; printf "\\n"; exit 7\n';
  for (const name of ["agent.sh", "unit.sh", "worktree.sh", "worktrees.sh"]) {
    writeFileSync(join(fake, name), `#!/usr/bin/env bash\n${record}`);
    chmodSync(join(fake, name), 0o755);
    const result = spawnSync(resolve("scripts/agents", name), ["a b", "--c"], { env: { ...process.env, KIT_HOME: fake }, encoding: "utf8" });
    assert.deepEqual([result.status, result.stdout], [7, `${name}|a b|--c|\n`], name);
  }
  writeFileSync(join(fake, "tickets.mjs"), 'console.log(JSON.stringify(process.argv.slice(2))); process.exit(5);\n');
  const tickets = spawnSync(process.execPath, [resolve("scripts/agents/tickets.mjs"), "check", "x y"], { env: { ...process.env, KIT_HOME: fake }, encoding: "utf8" });
  assert.deepEqual([tickets.status, tickets.stdout], [5, '["check","x y"]\n']);
  // Without KIT_HOME a forwarder asks the launcher, which picks the same kit as a kit command.
  const { KIT_HOME: _drop, ...env } = process.env;
  const picked = spawnSync(kit, ["--home"], { env, encoding: "utf8", timeout: 60_000 });
  assert.equal(picked.status, 0, picked.stdout + picked.stderr);
  assert.ok(existsSync(join(picked.stdout.trim(), "tickets.mjs")), picked.stdout);
});

test("the documented user-level card hook skips projects with a hook launcher and prints the card elsewhere", (t) => {
  const directory = temp(t), memory = join(directory, "memory"), projects = join(directory, "Projects");
  mkdirSync(join(memory, "project-notes"), { recursive: true });
  mkdirSync(join(projects, "other"), { recursive: true });
  writeFileSync(join(memory, "project-notes/README.md"), ["# Project notes", "", "| Slug | T3 project title | Project ID | Workspace |",
    "| --- | --- | --- | --- |", "| other | Other | `o` | `~/Projects/other` |", ""].join("\n"));
  writeFileSync(join(memory, "project-notes/other.md"), ["# Other", "", "Project ID `o` · updated 2026-10-24", "", "## Current thinking", "Plain.", ""].join("\n"));
  const data = join(directory, "data");
  mkdirSync(join(data, "agent-kit"), { recursive: true });
  // The machine copy the documented command names, here the kit these tests run.
  spawnSync("ln", ["-s", home, join(data, "agent-kit/current")]);
  const block = /```json\n(.+)\n```/.exec(read("docs/agents/context-card.md"))![1];
  const command = (JSON.parse(block) as { hooks: { SessionStart: { hooks: { command: string }[] }[] } }).hooks.SessionStart[0].hooks[0].command;
  const env = { ...process.env, HOME: directory, XDG_DATA_HOME: data, CHAT_MEMORY_DIR: memory };
  const run = (cwd: string) => spawnSync("/bin/bash", ["-c", command], { cwd, env, input: JSON.stringify({ hook_event_name: "SessionStart", cwd }), encoding: "utf8" });
  const withKit = join(projects, "with-kit");
  mkdirSync(join(withKit, "scripts/agents/hooks"), { recursive: true });
  writeFileSync(join(withKit, "scripts/agents/hooks/run.sh"), "");
  spawnSync("git", ["init", "-q", withKit]);
  assert.deepEqual((({ status, stdout, stderr }) => [status, stdout, stderr])(run(withKit)), [0, "", ""]);
  spawnSync("git", ["init", "-q", join(projects, "other")]);
  const shown = run(join(projects, "other"));
  assert.equal(shown.status, 0, shown.stderr);
  const context = (JSON.parse(shown.stdout) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
  assert.match(context, /^Context card: Other \(updated 2026-10-24\)\n/);
});

test("every kit shots screen maps to the files kit ux reads for it", async () => {
  // Node loads the extensionless command as ESM; a URL keeps tsx from resolving it as TypeScript.
  const ux = await import(pathToFileURL(join(home, "kit.d/ux")).href);
  assert.deepEqual(Object.keys(ux.screenFiles).sort(), [...screens].sort());
});

test("the hook launcher runs the kit's hooks with their arguments and status, and without a kit warns and never blocks", (t) => {
  const directory = temp(t), fake = join(directory, "kit");
  mkdirSync(join(fake, "hooks"), { recursive: true });
  writeFileSync(join(fake, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(fake, "kit"), 0o755);
  writeFileSync(join(fake, "kit-lib.sh"), "");
  writeFileSync(join(fake, "hooks/run.sh"), 'printf "ran %s\\n" "$*"; cat; exit 2\n');
  const empty = { XDG_DATA_HOME: join(directory, "data"), XDG_CACHE_HOME: join(directory, "cache") };
  const { KIT_HOME: _home, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, ...env } = process.env;
  const hook = (name: string, extra: NodeJS.ProcessEnv) => spawnSync("bash", [resolve("scripts/agents/hooks/run.sh"), name],
    { env: { ...env, ...empty, ...extra }, input: "payload", encoding: "utf8" });
  const blocked = hook("bash-guard", { KIT_HOME: fake });
  assert.deepEqual([blocked.status, blocked.stdout], [2, "ran bash-guard\npayload"]);
  const warning = "Agent Kit not found: guards are off; run `scripts/agents/kit doctor`";
  const session = hook("session-env", {});
  assert.deepEqual([session.status, session.stdout], [0, `${warning}\n`]);
  const guard = hook("bash-guard", {});
  assert.deepEqual([guard.status, JSON.parse(guard.stdout)], [0, { systemMessage: warning }]);
  const card = hook("context-card", {});
  assert.deepEqual([card.status, card.stdout], [0, ""]);
});

test("without any kit the forwarders fail with the launcher's RESULT line", (t) => {
  const directory = temp(t);
  const { KIT_HOME: _home, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, ...rest } = process.env;
  const env = { ...rest, XDG_DATA_HOME: join(directory, "data"), XDG_CACHE_HOME: join(directory, "cache"), KIT_REPO: `file://${join(directory, "none.git")}` };
  for (const [command, args] of [[resolve("scripts/agents/unit.sh"), []], [process.execPath, [resolve("scripts/agents/tickets.mjs"), "check"]]] as const) {
    const result = spawnSync(command, [...args], { env, encoding: "utf8", timeout: 60_000 });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stdout, /^RESULT: fail no Agent Kit at .*\(no machine copy; cannot clone file:\/\//m);
  }
});

test("the shots base cache key changes with the kit's library", (t) => {
  const directory = temp(t), before = process.env.KIT_HOME;
  t.after(() => { if (before === undefined) delete process.env.KIT_HOME; else process.env.KIT_HOME = before; });
  const copy = (name: string, library: string) => {
    const kitFolder = join(directory, name);
    mkdirSync(kitFolder);
    writeFileSync(join(kitFolder, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(kitFolder, "kit"), 0o755);
    writeFileSync(join(kitFolder, "kit-lib.sh"), "# library\n");
    writeFileSync(join(kitFolder, "kit-lib.mjs"), library);
    return kitFolder;
  };
  const one = copy("one", "export const a = 1;\n"), two = copy("two", "export const a = 2;\n");
  return (async () => {
    process.env.KIT_HOME = one;
    const first = await toolingHash(resolve("."));
    assert.equal(await toolingHash(resolve(".")), first);
    process.env.KIT_HOME = two;
    assert.notEqual(await toolingHash(resolve(".")), first);
  })();
});
