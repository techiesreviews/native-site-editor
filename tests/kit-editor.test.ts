import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
// @ts-expect-error This editor's helper is plain JavaScript without declarations.
import { kitHomeFolder } from "../scripts/agents/kit-home.mjs";
import { toolingHash } from "../scripts/agents/shots/compare.mjs";
import { kitEnv, triedKit } from "./support/kit-env.ts";

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

const kitUrl = "https://github.com/techiesreviews/agent-kit/blob/main/";
const agentDocs = readdirSync("docs/agents").filter(name => name.endsWith(".md")).map(name => `docs/agents/${name}`);
const links = (path: string) => [...read(path).matchAll(/\]\(([^)\s]+)\)/g)].map(([, target]) => target);

// Links from this editor's docs into the kit that `kit` lacks. A tried kit (a KIT_HOME the launcher did not pick:
// a kit branch by hand, the kit's own CI) is checked against the kit the launcher picks (`main`): it fails only for
// a file or heading `main` has, so a kit change that removes one this editor links to stops in the kit's gate, and
// a link to one new on the branch cannot deadlock the two gates.
function kitLinkProblems(kitFolder: string, main?: string, docs = agentDocs): string[] {
  const resolves = (folder: string, file: string, anchor?: string) => {
    const path = join(folder, file);
    return existsSync(path) && (!anchor || !file.endsWith(".md") || anchors(readFileSync(path, "utf8")).includes(anchor));
  };
  return docs.flatMap(path => links(path).filter(target => target.startsWith(kitUrl)).flatMap(target => {
    const [file, anchor] = target.slice(kitUrl.length).split("#");
    return resolves(kitFolder, file, anchor) || (main && !resolves(main, file, anchor)) ? [] : [`${path}: the kit has no ${anchor && existsSync(join(kitFolder, file)) ? `heading for ${file}#${anchor}` : file}`];
  }));
}

// The kit the launcher picks without a tried KIT_HOME; none when it is the tried kit (the kit's CI points the
// machine copy at the changed kit too), so the tried kit is then checked in full.
function mainKit(tried: string): string | undefined {
  try {
    const main = kitHomeFolder(kitEnv({ ...process.env, KIT_HOME: undefined }));
    return realpathSync(main) === realpathSync(tried) ? undefined : main;
  } catch { return undefined; }
}

test("every link from this editor's docs into the kit names a file and heading it has; relative links resolve", () => {
  const tried = triedKit();
  assert.deepEqual(kitLinkProblems(home, tried && mainKit(tried)), []);
  const relative = [extras, pointer, "docs/agents/runner.md", "docs/agents/agent-scripts.md"];
  for (const path of relative) {
    for (const target of links(path)) {
      const [file, anchor] = target.split("#");
      // Relative links are checked in the docs that link into the rulebook (others hold placeholders).
      if (/^https?:/.test(target)) continue;
      const full = file ? resolve(dirname(path), file) : resolve(path);
      assert.ok(existsSync(full), `${path}: missing ${target}`);
      if (anchor) assert.ok(anchors(readFileSync(full, "utf8")).includes(anchor), `${path}: no heading for ${target}`);
    }
  }
});

test("a tried kit that drops a heading this editor links to fails the link check; one new on the branch does not", (t) => {
  const directory = temp(t), doc = join(directory, "runner.md");
  writeFileSync(doc, `[Hand-out](${kitUrl}docs/kitchen.md#5-hand-out), [new](${kitUrl}docs/kitchen.md#6-build), [kit](${kitUrl}kit-lib.mjs#L1)\n`);
  const kitWith = (name: string, rulebook: string) => {
    mkdirSync(join(directory, name, "docs"), { recursive: true });
    writeFileSync(join(directory, name, "docs/kitchen.md"), rulebook);
    writeFileSync(join(directory, name, "kit-lib.mjs"), "");
    return join(directory, name);
  };
  const main = kitWith("main", "# The kitchen\n### 5. Hand-out\n");
  const problems = (tried: string, against?: string) => kitLinkProblems(tried, against, [doc]);
  const dropped = kitWith("dropped", "# The kitchen\n### 6. Build\n");
  assert.deepEqual(problems(dropped, main), [`${doc}: the kit has no heading for docs/kitchen.md#5-hand-out`]);
  // An old anchor kept for a renamed heading passes; #6-build, new on the branch, is not asked of main.
  assert.deepEqual(problems(kitWith("renamed", '# The kitchen\n<a id="5-hand-out"></a>\n### 5. Handing out\n### 6. Build\n'), main), []);
  // With no other kit to compare with, the tried kit is checked in full.
  assert.deepEqual(problems(main), [`${doc}: the kit has no heading for docs/kitchen.md#6-build`]);
  // A file main has and the branch removed fails too.
  rmSync(join(dropped, "kit-lib.mjs"));
  assert.deepEqual(problems(dropped, main).at(-1), `${doc}: the kit has no kit-lib.mjs`);
});

test("a front door's own KIT_HOME and a pinned one are not a tried kit; a person's is", () => {
  assert.equal(triedKit({ KIT_HOME: "/x", KIT_HOME_DEFAULT: "/x" }), undefined);
  assert.equal(triedKit({ KIT_HOME: "/x", KIT_HOME_PINNED: "/x" }), undefined);
  assert.equal(triedKit({}), undefined);
  assert.equal(triedKit({ KIT_HOME: "/x", KIT_HOME_PINNED: "/y" }), "/x");
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
  // Each helper prints its arguments, then the kit it was handed and the launcher's marker.
  const record = 'printf "%s|" "$(basename "$0")" "$@" "$KIT_HOME" "${KIT_HOME_PINNED-unset}"; printf "\\n"; exit 7\n';
  const { KIT_HOME: _drop, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, ...env } = process.env;
  const person = { ...env, KIT_HOME: fake };
  for (const name of ["agent.sh", "unit.sh", "worktree.sh", "worktrees.sh"]) {
    writeFileSync(join(fake, name), `#!/usr/bin/env bash\n${record}`);
    chmodSync(join(fake, name), 0o755);
    const result = spawnSync(resolve("scripts/agents", name), ["a b", "--c"], { env: person, encoding: "utf8" });
    assert.deepEqual([result.status, result.stdout], [7, `${name}|a b|--c|${fake}|unset|\n`], name);
  }
  writeFileSync(join(fake, "tickets.mjs"), 'console.log(JSON.stringify([...process.argv.slice(2), process.env.KIT_HOME, process.env.KIT_HOME_PINNED ?? "unset"])); process.exit(5);\n');
  const tickets = (extra: NodeJS.ProcessEnv) => spawnSync(process.execPath, [resolve("scripts/agents/tickets.mjs"), "check", "x y"], { env: { ...env, ...extra }, encoding: "utf8" });
  const given = tickets({ KIT_HOME: fake });
  assert.deepEqual([given.status, given.stdout], [5, `${JSON.stringify(["check", "x y", fake, "unset"])}\n`]);
  // Without KIT_HOME a forwarder asks the launcher, which picks the machine copy as for a kit command, and hands
  // that kit with its marker to the helper, so nothing below it looks up current again.
  const data = join(fake, "data"), machine = realpathSync(fake);
  mkdirSync(join(data, "agent-kit"), { recursive: true });
  symlinkSync(fake, join(data, "agent-kit/current"));
  const unit = spawnSync(resolve("scripts/agents/unit.sh"), ["a"], { env: { ...env, XDG_DATA_HOME: data }, encoding: "utf8" });
  assert.deepEqual([unit.status, unit.stdout], [7, `unit.sh|a|${machine}|${machine}|\n`]);
  const picked = tickets({ XDG_DATA_HOME: data });
  assert.deepEqual([picked.status, picked.stdout], [5, `${JSON.stringify(["check", "x y", machine, machine])}\n`]);
});

test("a kit tried through KIT_HOME runs in kitEnv() fixtures, not the machine copy", (t) => {
  const directory = temp(t), data = join(directory, "data");
  const frontDoor = (folder: string, label: string) => {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "kit"), `#!/usr/bin/env bash\nprintf "${label} %s\\n" "$*"\n`); chmodSync(join(folder, "kit"), 0o755);
    writeFileSync(join(folder, "kit-lib.sh"), "");
    return folder;
  };
  const tried = frontDoor(join(directory, "tried"), "tried");
  frontDoor(join(data, "agent-kit/machine"), "machine");
  symlinkSync("machine", join(data, "agent-kit/current"));
  const { KIT_HOME: _home, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, ...rest } = process.env;
  const version = (env: NodeJS.ProcessEnv) => spawnSync(kit, ["version"], { env: kitEnv({ ...rest, XDG_DATA_HOME: data, ...env }), encoding: "utf8" }).stdout;
  assert.equal(version({ KIT_HOME: tried }), "tried version\n");
  // A kit the launcher or a front door filled in is dropped: the fixture picks the machine copy again.
  assert.equal(version({ KIT_HOME: tried, KIT_HOME_PINNED: tried }), "machine version\n");
  assert.equal(version({ KIT_HOME: tried, KIT_HOME_DEFAULT: tried }), "machine version\n");
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
  // A person's hookless KIT_HOME stays theirs: the guards are off, said plainly, and nothing blocks.
  const warning = "Agent Kit not found: guards are off; run `scripts/agents/kit doctor`";
  assert.deepEqual(hook({ KIT_HOME: hookless }), [0, `${JSON.stringify({ systemMessage: warning })}\n`]);
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
  // A front door's own KIT_HOME is picked again, as the forwarders pick it: the machine copy, with its marker.
  const machine = join(directory, "machine");
  mkdirSync(machine);
  writeFileSync(join(machine, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(machine, "kit"), 0o755);
  writeFileSync(join(machine, "kit-lib.sh"), readFileSync(join(fake, "kit-lib.sh"), "utf8"));
  const data = join(directory, "machine-data"), picked = realpathSync(machine);
  mkdirSync(join(data, "agent-kit"), { recursive: true });
  symlinkSync(machine, join(data, "agent-kit/current"));
  const { KIT_HOME_DEFAULT: _default, ...plain } = env;
  const frontDoor = spawnSync(resolve("scripts/agents/project.d/shots"), ["--help"], { env: { ...plain, KIT_HOME: fake, KIT_HOME_DEFAULT: fake, XDG_DATA_HOME: data }, encoding: "utf8" });
  assert.deepEqual([frontDoor.status, frontDoor.stdout], [0, `${picked}\n${picked}\n`]);
});

test("with no machine copy the hook launcher runs the cache clone's hooks, and warns when the clone has none", (t) => {
  const directory = temp(t), cache = join(directory, "cache"), clone = join(cache, "agent-kit");
  mkdirSync(join(clone, "hooks"), { recursive: true });
  writeFileSync(join(clone, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(clone, "kit"), 0o755);
  writeFileSync(join(clone, "kit-lib.sh"), "");
  writeFileSync(join(clone, "hooks/run.sh"), 'printf "ran %s\\n" "$*"; exit 2\n');
  const { KIT_HOME: _home, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, ...rest } = process.env;
  const hook = () => {
    const result = spawnSync("bash", [resolve("scripts/agents/hooks/run.sh"), "bash-guard"],
      { env: { ...rest, XDG_DATA_HOME: join(directory, "data"), XDG_CACHE_HOME: cache }, input: "{}", encoding: "utf8" });
    return [result.status, result.stdout];
  };
  assert.deepEqual(hook(), [2, "ran bash-guard\n"]);
  rmSync(join(clone, "hooks/run.sh"));
  const warning = "Agent Kit not found: guards are off; run `scripts/agents/kit doctor`";
  assert.deepEqual(hook(), [0, `${JSON.stringify({ systemMessage: warning })}\n`]);
});

test("with no machine copy the launcher clones the kit once into the cache, and refuses a clone that holds no kit", (t) => {
  const directory = temp(t);
  const repo = (name: string, files: Record<string, string>) => {
    const folder = join(directory, name);
    mkdirSync(folder);
    for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
    if (files.kit) chmodSync(join(folder, "kit"), 0o755);
    const git = (...args: string[]) => assert.equal(spawnSync("git", ["-C", folder, "-c", "user.name=Kit test", "-c", "user.email=kit@example.com", ...args]).status, 0, args.join(" "));
    git("init", "-q"); git("add", "."); git("commit", "-qm", "kit");
    return `file://${folder}`;
  };
  const { KIT_HOME: _home, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, ...rest } = process.env;
  const lookUp = (name: string, kitRepo: string) => {
    const cache = join(directory, `${name}-cache`);
    const result = spawnSync(kit, ["--home"], { env: { ...rest, XDG_DATA_HOME: join(directory, `${name}-data`), XDG_CACHE_HOME: cache, KIT_REPO: kitRepo }, encoding: "utf8", timeout: 60_000 });
    return { cache, result };
  };
  const good = lookUp("good", repo("kit-repo", { kit: "#!/usr/bin/env bash\n", "kit-lib.sh": "" }));
  assert.deepEqual([good.result.status, good.result.stdout], [0, `${realpathSync(join(good.cache, "agent-kit"))}\n`], good.result.stderr);
  assert.ok(existsSync(join(good.cache, "agent-kit/.git/kit-cloned")));
  assert.deepEqual(readdirSync(good.cache), ["agent-kit"]);
  const emptyRepo = repo("no-kit-repo", { "README.md": "no kit here\n" });
  const empty = lookUp("empty", emptyRepo);
  assert.equal(empty.result.status, 2);
  assert.equal(empty.result.stdout, `RESULT: fail no Agent Kit at ${join(empty.cache, "agent-kit")} (the clone of ${emptyRepo} holds no whole kit)\n`);
  assert.deepEqual(readdirSync(empty.cache), []);
});

test("kit preview in a kitEnv() fixture loads the library of the kit tried through KIT_HOME", (t) => {
  const directory = temp(t), fake = join(directory, "kit"), loaded = join(directory, "loaded");
  mkdirSync(fake);
  writeFileSync(join(fake, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(fake, "kit"), 0o755);
  writeFileSync(join(fake, "kit-lib.sh"), "");
  writeFileSync(join(fake, "kit-lib.mjs"), `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(loaded)}, "tried\\n");\n` +
    `export * from ${JSON.stringify(pathToFileURL(join(home, "kit-lib.mjs")).href)};\n`);
  const { KIT_LIB: _lib, KIT_LIB_MJS: _mjs, ...rest } = process.env;
  const result = spawnSync(resolve("scripts/agents/project.d/preview"), ["--help"], { env: kitEnv({ ...rest, KIT_HOME: fake, KIT_HOME_PINNED: undefined }), encoding: "utf8", timeout: 60_000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^Usage: kit preview/);
  assert.equal(readFileSync(loaded, "utf8"), "tried\n");
});

test("a person's relative KIT_HOME reaches this editor's helpers as a full path", (t) => {
  const directory = temp(t), fake = join(directory, "kit");
  mkdirSync(fake);
  writeFileSync(join(fake, "kit"), "#!/usr/bin/env bash\n"); chmodSync(join(fake, "kit"), 0o755);
  writeFileSync(join(fake, "kit-lib.sh"), "");
  writeFileSync(join(fake, "unit.sh"), '#!/usr/bin/env bash\nprintf "%s\\n" "$KIT_HOME"\n'); chmodSync(join(fake, "unit.sh"), 0o755);
  writeFileSync(join(fake, "tickets.mjs"), "console.log(process.env.KIT_HOME);\n");
  const { KIT_HOME: _home, KIT_HOME_DEFAULT: _default, KIT_HOME_PINNED: _pinned, ...rest } = process.env;
  const env = { ...rest, KIT_HOME: "kit" }, full = `${realpathSync(fake)}\n`;
  assert.equal(spawnSync(resolve("scripts/agents/unit.sh"), [], { cwd: directory, env, encoding: "utf8" }).stdout, full);
  assert.equal(spawnSync(process.execPath, [resolve("scripts/agents/tickets.mjs")], { cwd: directory, env, encoding: "utf8" }).stdout, full);
});

test("new worktrees link the native-static fixture the browser suite reads", () => {
  const { worktreeLinks } = JSON.parse(read("scripts/agents/kit.json")) as { worktreeLinks?: string[] };
  const fixture = /group === "native-static" && !creationOnly \? "([^"]+)"/.exec(read("scripts/native-browser-tests.mjs"))?.[1];
  assert.equal(fixture, ".scratch/native-static-preview");
  assert.ok(worktreeLinks?.includes(fixture), `worktreeLinks in scripts/agents/kit.json must name ${fixture}`);
});
