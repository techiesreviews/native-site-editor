import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
// @ts-expect-error This editor's helper is plain JavaScript without declarations.
import { kitHomeFolder } from "../scripts/agents/kit-home.mjs";
import { toolingHash } from "../scripts/agents/shots/compare.mjs";

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

// Heading anchors, plus explicit `<a id="…">` ones: the kit keeps an old anchor that way when it renames a
// heading, so this editor's links never block a kit change (both repos gate on each other's tests).
function anchors(markdown: string): string[] {
  const seen = new Map<string, number>();
  return [...markdown.split("\n").filter(line => /^#+ /.test(line)).map(line => {
    const base = line.replace(/^#+ /, "").toLowerCase().replace(/[^\w\- ]/g, "").replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  }), ...[...markdown.matchAll(/<a (?:id|name)="([^"]+)"/g)].map(match => match[1])];
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

// A kit tried by hand or in the kit's own CI (a KIT_HOME the launcher did not pick) may move or rename what these
// docs link to; the links are checked against the kit the launcher picks (main's), so neither gate blocks the other.
const tryingKit = Boolean(process.env.KIT_HOME) && process.env.KIT_HOME !== process.env.KIT_HOME_PINNED;
const kitUrl = "https://github.com/techiesreviews/agent-kit/blob/main/";

test("every link from this editor's docs into the kit names a file and heading it has; relative links resolve", { skip: tryingKit && "a kit tried through KIT_HOME" }, () => {
  const headings = anchors(readFileSync(shared, "utf8"));
  const docs = readdirSync("docs/agents").filter(name => name.endsWith(".md")).map(name => `docs/agents/${name}`);
  const relative = [extras, pointer, "docs/agents/runner.md", "docs/agents/agent-scripts.md"];
  for (const path of docs) {
    for (const [, target] of read(path).matchAll(/\]\(([^)\s]+)\)/g)) {
      const [file, anchor] = target.split("#");
      if (file.startsWith(kitUrl)) {
        assert.ok(existsSync(join(home, file.slice(kitUrl.length))), `${path}: the kit has no ${file.slice(kitUrl.length)}`);
        if (file === sharedUrl && anchor) assert.ok(headings.includes(anchor), `${path}: the shared rulebook has no heading for ${target}`);
        continue;
      }
      // Relative links are checked in the docs that link into the rulebook (others hold placeholders).
      if (/^https?:/.test(target) || !relative.includes(path)) continue;
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
  // Without KIT_HOME a forwarder asks the launcher, which picks the machine copy as for a kit command.
  const data = join(fake, "data");
  mkdirSync(join(data, "agent-kit"), { recursive: true });
  symlinkSync(fake, join(data, "agent-kit/current"));
  const { KIT_HOME: _drop, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, ...env } = process.env;
  const unit = spawnSync(resolve("scripts/agents/unit.sh"), ["a"], { env: { ...env, XDG_DATA_HOME: data }, encoding: "utf8" });
  assert.deepEqual([unit.status, unit.stdout], [7, "unit.sh|a|\n"]);
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
  symlinkSync(home, join(data, "agent-kit/current"));
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
  const forwarders = ["agent.sh", "unit.sh", "worktree.sh", "worktrees.sh"].map(name => [resolve("scripts/agents", name), [] as string[]] as const);
  for (const [command, args] of [...forwarders, [process.execPath, [resolve("scripts/agents/tickets.mjs"), "check"]]] as const) {
    const result = spawnSync(command, [...args], { env, encoding: "utf8", timeout: 60_000 });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stdout, /^RESULT: fail no Agent Kit at .*\(no machine copy; cannot clone file:\/\//m);
  }
});

test("the shots base cache key changes with the kit's library", async (t) => {
  const directory = temp(t);
  const copy = (name: string, library: string) => {
    const kitFolder = join(directory, name);
    mkdirSync(kitFolder);
    writeFileSync(join(kitFolder, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(kitFolder, "kit"), 0o755);
    writeFileSync(join(kitFolder, "kit-lib.sh"), "# library\n");
    writeFileSync(join(kitFolder, "kit-lib.mjs"), library);
    return kitFolder;
  };
  const one = copy("one", "export const a = 1;\n"), two = copy("two", "export const a = 2;\n");
  const libraries = (folder: string) => [join(folder, "kit-lib.sh"), join(folder, "kit-lib.mjs")];
  const first = await toolingHash(resolve("."), libraries(one));
  assert.equal(await toolingHash(resolve("."), libraries(one)), first);
  assert.notEqual(await toolingHash(resolve("."), libraries(two)), first);
  // By default it hashes the library this process loads: KIT_LIB_MJS when set.
  const hashWith = (library: string) => {
    const stub = join(directory, "stub.mjs");
    writeFileSync(stub, `export * from ${JSON.stringify(pathToFileURL(join(home, "kit-lib.mjs")).href)};\n${library}`);
    const script = `const { toolingHash } = await import(${JSON.stringify(pathToFileURL(resolve("scripts/agents/shots/compare.mjs")).href)});
console.log(await toolingHash(${JSON.stringify(resolve("."))}));`;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env: { ...process.env, KIT_LIB_MJS: stub }, encoding: "utf8", timeout: 60_000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  assert.notEqual(hashWith("// one\n"), hashWith("// two\n"));
});

test("KIT_LIB_MJS wins for this editor's own commands: only that library loads", (t) => {
  const directory = temp(t), stub = join(directory, "stub.mjs"), fake = join(directory, "kit"), loaded = join(directory, "loaded");
  writeFileSync(stub, `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(loaded)}, "stub\\n");\n` +
    `export * from ${JSON.stringify(pathToFileURL(join(home, "kit-lib.mjs")).href)};\n`);
  mkdirSync(fake);
  writeFileSync(join(fake, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(fake, "kit"), 0o755);
  writeFileSync(join(fake, "kit-lib.sh"), "");
  writeFileSync(join(fake, "kit-lib.mjs"), 'throw new Error("the picked kit library loaded");\n');
  for (const name of ["size", "specs", "preview"]) {
    const result = spawnSync(process.execPath, [resolve("scripts/agents/project.d", name), "--help"],
      { env: { ...process.env, KIT_HOME: fake, KIT_LIB_MJS: stub }, encoding: "utf8", timeout: 60_000 });
    assert.equal(result.status, 0, `${name}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout, new RegExp(`^Usage: kit ${name}`), name);
  }
  // One load per command: none loads the library twice.
  assert.equal(readFileSync(loaded, "utf8"), "stub\nstub\nstub\n");
});

test("a pinned KIT_HOME that kit update removed is picked again for this editor's helpers", (t) => {
  const directory = temp(t), data = join(directory, "data"), fake = join(data, "agent-kit", "newer");
  mkdirSync(fake, { recursive: true });
  writeFileSync(join(fake, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(fake, "kit"), 0o755);
  writeFileSync(join(fake, "kit-lib.sh"), "");
  symlinkSync("newer", join(data, "agent-kit/current"));
  const removed = join(directory, "removed-kit");
  const env = { ...process.env, XDG_DATA_HOME: data, KIT_HOME: removed, KIT_HOME_PINNED: removed };
  assert.equal(kitHomeFolder(env), fake);
  // A person's KIT_HOME (no marker) that holds no kit still fails plainly.
  const { KIT_HOME_PINNED: _pinned, ...person } = env;
  assert.throws(() => kitHomeFolder(person), /RESULT: fail no Agent Kit at .*removed-kit/);
});

test("this editor's helpers look the kit up once per process", (t) => {
  const directory = temp(t);
  const whole = (name: string) => {
    const folder = join(directory, name);
    mkdirSync(folder);
    writeFileSync(join(folder, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(folder, "kit"), 0o755);
    writeFileSync(join(folder, "kit-lib.sh"), "");
    return folder;
  };
  const one = whole("one"), two = whole("two");
  const script = `const { kitHomeFolder } = await import(${JSON.stringify(pathToFileURL(resolve("scripts/agents/kit-home.mjs")).href)});
const first = kitHomeFolder(); process.env.KIT_HOME = ${JSON.stringify(two)};
console.log(first, kitHomeFolder(), kitHomeFolder({ ...process.env }));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, KIT_HOME: one }, encoding: "utf8", timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr);
  // The process keeps its first kit; an explicit environment is looked up as given.
  assert.equal(result.stdout, `${one} ${one} ${two}\n`);
});

test("without any kit this editor's own commands end with the launcher's RESULT line, never a stack trace", (t) => {
  const directory = temp(t);
  const { KIT_HOME: _home, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, KIT_LIB_MJS: _mjs, KIT_LIB: _lib, ...rest } = process.env;
  const env = { ...rest, XDG_DATA_HOME: join(directory, "data"), XDG_CACHE_HOME: join(directory, "cache"), KIT_REPO: `file://${join(directory, "none.git")}` };
  for (const name of ["size", "specs", "preview", "shots"]) {
    const result = spawnSync(resolve("scripts/agents/project.d", name), ["--help"], { env, encoding: "utf8", timeout: 60_000 });
    assert.equal(result.status, 2, `${name}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /^RESULT: fail no Agent Kit at /m, name);
    assert.doesNotMatch(result.stderr, /^\s+at /m, name);
  }
});

test("kit shots without KIT_LIB sources the bash library of the kit the launcher picks", (t) => {
  const fake = temp(t);
  writeFileSync(join(fake, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(fake, "kit"), 0o755);
  writeFileSync(join(fake, "kit-lib.sh"), 'kit_node() { printf "fake kit library\\n"; exit 0; }\n');
  const { KIT_LIB: _lib, ...env } = process.env;
  const result = spawnSync(resolve("scripts/agents/project.d/shots"), ["--help"], { env: { ...env, KIT_HOME: fake }, encoding: "utf8" });
  assert.deepEqual([result.status, result.stdout], [0, "fake kit library\n"]);
});

test("the launcher answers --home alone and hands --home with more arguments to the kit's front door", (t) => {
  const fake = temp(t);
  writeFileSync(join(fake, "kit"), '#!/usr/bin/env bash\nprintf "front door %s\\n" "$*"\n'); chmodSync(join(fake, "kit"), 0o755);
  writeFileSync(join(fake, "kit-lib.sh"), "");
  const env = { ...process.env, KIT_HOME: fake };
  assert.equal(spawnSync(kit, ["--home"], { env, encoding: "utf8" }).stdout, `${fake}\n`);
  assert.equal(spawnSync(kit, ["--home", "x"], { env, encoding: "utf8" }).stdout, "front door --home x\n");
});

test("this editor's helpers load the shell and Node libraries of one kit", (t) => {
  const fake = temp(t);
  writeFileSync(join(fake, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(fake, "kit"), 0o755);
  writeFileSync(join(fake, "kit-lib.sh"), "");
  const script = `const { kitLibrary, kitShellLibrary } = await import(${JSON.stringify(pathToFileURL(resolve("scripts/agents/kit-home.mjs")).href)});
console.log(kitShellLibrary()); console.log(kitLibrary());`;
  const { KIT_LIB: _lib, KIT_LIB_MJS: _mjs, ...env } = process.env;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...env, KIT_HOME: fake }, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${join(fake, "kit-lib.sh")}\n${join(fake, "kit-lib.mjs")}\n`);
});

test("the hook launcher finds the machine copy, and picks again for a pinned kit that is gone or has no hooks", (t) => {
  const directory = temp(t), data = join(directory, "data");
  const whole = (folder: string, hooks: boolean) => {
    mkdirSync(join(folder, "hooks"), { recursive: true });
    writeFileSync(join(folder, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(folder, "kit"), 0o755);
    writeFileSync(join(folder, "kit-lib.sh"), "");
    if (hooks) writeFileSync(join(folder, "hooks/run.sh"), 'printf "ran %s\\n" "$*"; exit 2\n');
    return folder;
  };
  whole(join(data, "agent-kit/machine"), true);
  symlinkSync("machine", join(data, "agent-kit/current"));
  const hookless = whole(join(directory, "hookless"), false);
  const { KIT_HOME: _home, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, ...rest } = process.env;
  const env = { ...rest, XDG_DATA_HOME: data, XDG_CACHE_HOME: join(directory, "cache") };
  const hook = (extra: NodeJS.ProcessEnv) => {
    const result = spawnSync("bash", [resolve("scripts/agents/hooks/run.sh"), "bash-guard"], { env: { ...env, ...extra }, input: "{}", encoding: "utf8" });
    return [result.status, result.stdout];
  };
  assert.deepEqual(hook({}), [2, "ran bash-guard\n"]);
  const gone = join(directory, "gone");
  assert.deepEqual(hook({ KIT_HOME: gone, KIT_HOME_PINNED: gone }), [2, "ran bash-guard\n"]);
  assert.deepEqual(hook({ KIT_HOME: hookless, KIT_HOME_PINNED: hookless }), [2, "ran bash-guard\n"]);
});

test("kit version goes through the machine copy the launcher picks", (t) => {
  const directory = temp(t), data = join(directory, "data"), machine = join(data, "agent-kit/machine");
  mkdirSync(machine, { recursive: true });
  writeFileSync(join(machine, "kit"), '#!/usr/bin/env bash\nprintf "commit 1234567\\nRESULT: ok %s 1234567\\n" "$1"\n'); chmodSync(join(machine, "kit"), 0o755);
  writeFileSync(join(machine, "kit-lib.sh"), "");
  symlinkSync("machine", join(data, "agent-kit/current"));
  const { KIT_HOME: _home, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, ...rest } = process.env;
  const result = spawnSync(kit, ["version"], { env: { ...rest, XDG_DATA_HOME: data }, encoding: "utf8" });
  assert.deepEqual([result.status, result.stdout], [0, "commit 1234567\nRESULT: ok version 1234567\n"]);
});

test("kit shots without KIT_LIB hands the kit it picked to its Node helpers", (t) => {
  const directory = temp(t), fake = join(directory, "kit"), other = join(directory, "data");
  mkdirSync(fake);
  writeFileSync(join(fake, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(fake, "kit"), 0o755);
  const helper = `const { kitHomeFolder } = await import(${JSON.stringify(pathToFileURL(resolve("scripts/agents/kit-home.mjs")).href)}); console.log(kitHomeFolder());`;
  writeFileSync(join(fake, "kit-lib.sh"), `kit_node() { node --input-type=module -e ${JSON.stringify(helper).replace(/\$/g, "\\$")}; printf "%s\\n" "\${KIT_HOME_PINNED-unset}"; exit 0; }\n`);
  // A machine copy elsewhere, which a fresh lookup would pick instead.
  mkdirSync(join(other, "agent-kit"), { recursive: true });
  symlinkSync(home, join(other, "agent-kit/current"));
  const { KIT_LIB: _lib, KIT_LIB_MJS: _mjs, KIT_HOME_PINNED: _pinned, ...env } = process.env;
  const person = spawnSync(resolve("scripts/agents/project.d/shots"), ["--help"], { env: { ...env, KIT_HOME: fake, XDG_DATA_HOME: other }, encoding: "utf8" });
  assert.deepEqual([person.status, person.stdout], [0, `${fake}\nunset\n`]);
  const pinned = spawnSync(resolve("scripts/agents/project.d/shots"), ["--help"], { env: { ...env, KIT_HOME: fake, KIT_HOME_PINNED: fake, XDG_DATA_HOME: other }, encoding: "utf8" });
  assert.deepEqual([pinned.status, pinned.stdout], [0, `${fake}\n${fake}\n`]);
});
