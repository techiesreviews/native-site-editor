import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const script = new URL("../scripts/agents/port.sh", import.meta.url).pathname;

async function listen(port = 0) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, port: address.port };
}
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "ase-port-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // Reserve both ports while finding a slot, then release them before the script.
  const slots: number[] = [];
  while (slots.length < 2) {
    const first = await listen();
    try {
      const next = await listen(first.port + 1);
      if (!slots.some((port) => Math.abs(port - first.port) <= 1)) slots.push(first.port);
      await close(next.server);
    } catch { /* Try another ephemeral port if its neighbour is occupied. */ }
    await close(first.server);
  }
  const env = { ...process.env, ASE_POOL: slots.join(" "), ASE_PORTS: slots.join(" "), ASE_LOCK_DIR: dir, ASE_MAX_LOAD: "1000000", ASE_MIN_MEM_KB: "0", ASE_PORT_POLL: "0.01" };
  const run = (...args: string[]) => exec("bash", [script, ...args], { env, timeout: 3_000 });
  return { dir, slots, env, run };
}

test("port picks a free slot and preserves the owner PID across exec", async (t) => {
  const { slots, run } = await fixture(t);
  const result = await run(process.execPath, "-e", "console.log(process.env.ASE_TEST_PORT, process.env.ASE_TEST_OWNER_PID, process.pid)");
  const [port, owner, pid] = result.stdout.trim().split(" ");
  assert.equal(port, String(slots[0]));
  assert.equal(owner, pid);
});

for (const offset of [0, 1]) {
  test(`port skips a listener on slot port + ${offset}`, async (t) => {
    const { slots, run } = await fixture(t);
    const listener = await listen(slots[0] + offset);
    t.after(() => close(listener.server));
    const result = await run(process.execPath, "-e", "console.log(process.env.ASE_TEST_PORT)");
    assert.equal(result.stdout.trim(), String(slots[1]));
    assert.match(result.stderr, new RegExp(`listener ${slots[0] + offset}:.*pid=${process.pid}`));
  });
}

test("port rejects ASE_PORTS outside the pool", async (t) => {
  const { env } = await fixture(t);
  await assert.rejects(exec("bash", [script, "true"], {
    env: { ...env, ASE_PORTS: "5410" }, timeout: 3_000,
  }), (error: { code?: number; stderr?: string }) => {
    assert.equal(error.code, 2);
    assert.match(error.stderr ?? "", /ASE_PORTS port 5410 is outside pool/);
    return true;
  });
});

for (const gate of ["memory", "load"]) {
  test(`port waits for ${gate}, then retries with the test-only poll delay`, async (t) => {
    const { dir, slots, env } = await fixture(t);
    const memory = join(dir, "memory");
    const load = join(dir, "load");
    await writeFile(memory, gate === "memory" ? "99\n" : "100\n");
    await writeFile(load, gate === "load" ? "2\n" : "0\n");
    // Stub only resource readings; comparisons and allocation use the real tools.
    await writeFile(join(dir, "awk"), `#!/usr/bin/env bash
if [[ \${!#} == /proc/meminfo ]]; then cat "$ASE_MEMORY_FILE"; exit; fi
args=("$@")
for (( i=0; i<\${#args[@]}; i++ )); do
  if [[ \${args[i]} == cur=* ]]; then args[i]="cur=$(cat "$ASE_LOAD_FILE")"; fi
done
exec /usr/bin/awk "\${args[@]}"
`, { mode: 0o755 });
    const runner = spawn("bash", [script, process.execPath, "-e", "console.log(process.env.ASE_TEST_PORT)"], {
      env: { ...env, PATH: `${dir}:${process.env.PATH}`, ASE_MIN_MEM_KB: "100", ASE_MAX_LOAD: "1", ASE_MEMORY_FILE: memory, ASE_LOAD_FILE: load },
      detached: true,
    });
    const exited = once(runner, "close");
    t.after(async () => {
      if (runner.exitCode === null && runner.pid) process.kill(-runner.pid, "SIGTERM");
      await exited;
    });
    let stdout = "";
    runner.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    const [status] = await once(runner.stderr, "data", { signal: AbortSignal.timeout(3_000) });
    assert.match(String(status), new RegExp(`waiting: ${gate} `));
    assert.equal(stdout, "");
    await writeFile(memory, "100\n");
    await writeFile(load, "0\n");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const [code] = await Promise.race([
        exited,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("resource retry did not finish")), 3_000);
        }),
      ]);
      assert.equal(code, 0);
    } finally { clearTimeout(timer); }
    assert.equal(stdout.trim(), String(slots[0]));
  });
}

test("port writes PID, cwd and command while the slot lock remains held", async (t) => {
  const { dir, slots, env, run } = await fixture(t);
  const code = `const fs = require('node:fs'); console.log(fs.readFileSync(process.env.ASE_LOCK_DIR + '/ase-' + process.env.ASE_TEST_PORT + '.lock', 'utf8')); console.log(process.pid);`;
  const result = await run(process.execPath, "-e", code);
  const metadata = await readFile(join(dir, `ase-${slots[0]}.lock`), "utf8");
  assert.equal(result.stdout.split("\n")[0].trim(), metadata.trim());
  const pid = result.stdout.trim().split("\n").at(-1);
  assert.ok(metadata.startsWith(`${pid}\t${process.cwd()}\t`));
  assert.ok(metadata.includes(process.execPath));

  const holder = spawn("bash", [script, process.execPath, "-e", "console.log('READY'); setInterval(() => {}, 1000)"], { env, detached: true });
  const exited = once(holder, "close");
  t.after(async () => {
    if (holder.exitCode === null && holder.pid) process.kill(-holder.pid, "SIGTERM");
    await exited;
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("holder did not start")), 3_000);
    holder.once("error", (error) => { clearTimeout(timeout); reject(error); });
    holder.stdout.on("data", (data: Buffer) => {
      if (data.toString().includes("READY")) { clearTimeout(timeout); resolve(); }
    });
  });
  const held = await readFile(join(dir, `ase-${slots[0]}.lock`), "utf8");
  const second = await run(process.execPath, "-e", "console.log(process.env.ASE_TEST_PORT)");
  assert.equal(second.stdout.trim(), String(slots[1]));
  assert.equal(await readFile(join(dir, `ase-${slots[0]}.lock`), "utf8"), held);
  await assert.rejects(exec("flock", ["-n", join(dir, `ase-${slots[0]}.lock`), "true"]), { code: 1 });
  await writeFile(join(dir, "sleep"), "#!/usr/bin/env bash\nexit 1\n", { mode: 0o755 });
  await assert.rejects(exec("bash", [script, "true"], {
    env: { ...env, ASE_PORTS: String(slots[0]), PATH: `${dir}:${process.env.PATH}` }, timeout: 3_000,
  }), (error: { stderr?: string }) => {
    assert.match(error.stderr ?? "", new RegExp(`waiting: all slots busy; slot ${slots[0]}: pid ${holder.pid}.*command .*node`));
    return true;
  });
});

test("full suite caps requested shards to free slots without starting Playwright", async (t) => {
  const { dir, slots, env } = await fixture(t);
  const listener = await listen(slots[0] + 1);
  t.after(() => close(listener.server));
  // Replace only the launcher: no browser or test server is started by this test.
  await writeFile(join(dir, "setsid"), '#!/usr/bin/env bash\nprintf "%s\\n" "$ASE_PORTS" "$@" > "$ASE_LAUNCH_LOG"\nprintf \'{"suites":[]}\' > "$PLAYWRIGHT_JSON_OUTPUT_FILE"\n', { mode: 0o755 });
  const result = await exec("bash", [new URL("../scripts/agents/full-suite.sh", import.meta.url).pathname], {
    env: { ...env, ASE_SHARDS: "99", PATH: `${dir}:${process.env.PATH}`, ASE_LAUNCH_LOG: join(dir, "launch") }, timeout: 3_000,
  });
  const run = /Results: (.+)/.exec(result.stderr)?.[1];
  assert.ok(run);
  t.after(() => rm(run, { recursive: true, force: true }));
  assert.match(result.stderr, /using 1 shard\(s\), 1 free slot/);
  const launch = await readFile(join(dir, "launch"), "utf8");
  assert.ok(launch.startsWith(`${slots.join(" ")}\n`));
  assert.ok(launch.includes("--shard=1/1"));
});

test("full suite acquires another eligible slot when an observed free slot is taken before launch", async (t) => {
  const { dir, slots, env } = await fixture(t);
  // Take the first slot after the suite inspects it, then run the real allocator.
  await writeFile(join(dir, "setsid"), `#!/usr/bin/env bash
exec 8>>"$ASE_LOCK_DIR/ase-$ASE_RACED_PORT.lock"
flock -n 8
"$1" "$ASE_NODE" -e 'const fs = require("node:fs"); fs.writeFileSync(process.env.ASE_LAUNCH_LOG, process.env.ASE_TEST_PORT); fs.writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, JSON.stringify({suites: []}));'
`, { mode: 0o755 });
  const result = await exec("bash", [new URL("../scripts/agents/full-suite.sh", import.meta.url).pathname, "1"], {
    env: { ...env, PATH: `${dir}:${process.env.PATH}`, ASE_RACED_PORT: String(slots[0]), ASE_NODE: process.execPath, ASE_LAUNCH_LOG: join(dir, "launch") }, timeout: 3_000,
  });
  const run = /Results: (.+)/.exec(result.stderr)?.[1];
  assert.ok(run);
  t.after(() => rm(run, { recursive: true, force: true }));
  assert.match(result.stderr, /using 1 shard\(s\), 2 free slot/);
  assert.equal(await readFile(join(dir, "launch"), "utf8"), String(slots[1]));
});

async function reaperFixture(t: TestContext) {
  const { dir, env } = await fixture(t);
  const rows = join(dir, "listeners");
  const signals = join(dir, "signals");
  const startup = join(dir, "bash-env");
  // Only socket discovery and signals are stubbed; ancestry uses the real /proc.
  await writeFile(join(dir, "ss"), '#!/usr/bin/env bash\ncat "$ASE_LISTENERS"\n', { mode: 0o755 });
  await writeFile(startup, 'kill() { printf "%s\\n" "$*" >> "$ASE_SIGNALS"; }\n');
  const reap = (dry = false, record = true) => exec("bash", [new URL("../scripts/agents/reap.sh", import.meta.url).pathname, ...(dry ? ["--dry-run"] : [])], {
    env: { ...env, PATH: `${dir}:${process.env.PATH}`, BASH_ENV: record ? startup : "", ASE_LISTENERS: rows, ASE_SIGNALS: signals }, timeout: 3_000,
  });
  const row = (port: number, pid: number) => `LISTEN 0 10 127.0.0.1:${port} 0.0.0.0:* users:(("node",pid=${pid},fd=20))\n`;
  return { dir, rows, signals, reap, row };
}

test("reap signals only listener descendants, including grandchildren in another process group", async (t) => {
  const { rows, signals, reap, row } = await reaperFixture(t);
  const idle = "setInterval(() => {}, 1000);";
  const grandchild = `console.log('grandchild', process.pid); ${idle}`;
  const child = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], {stdio: 'inherit'}); console.log('child', process.pid); ${idle}`;
  const root = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], {stdio: 'inherit', detached: true}); console.log('listener', process.pid); ${idle}`;
  const listener = spawn(process.execPath, ["-e", root], { detached: true });
  const exited = once(listener, "close");
  const pids = new Map<string, number>();
  let output = "";
  t.after(async () => {
    for (const pid of pids.values()) {
      try { process.kill(pid, "SIGKILL"); } catch { /* Already exited. */ }
    }
    if (listener.exitCode === null && listener.pid) {
      try { process.kill(-listener.pid, "SIGKILL"); } catch { /* Already exited. */ }
    }
    await exited;
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("process tree did not start")), 3_000);
    listener.once("error", (error) => { clearTimeout(timer); reject(error); });
    listener.stdout.on("data", (data: Buffer) => {
      output += data.toString();
      for (const match of output.matchAll(/^(listener|child|grandchild) (\d+)$/gm)) pids.set(match[1], Number(match[2]));
      if (pids.size === 3) { clearTimeout(timer); resolve(); }
    });
  });
  assert.ok(listener.pid);
  const expected = [pids.get("grandchild"), pids.get("child"), listener.pid].map((pid) => `-TERM -- ${pid}\n`).join("");
  // Duplicate sockets signal each PID once. A listener in the ancestor stays alive.
  await writeFile(rows, row(5226, listener.pid) + row(5227, listener.pid) + row(5410, process.pid));
  assert.match((await reap(true)).stdout, new RegExp(`would kill pid ${listener.pid}, listener ${listener.pid}`));
  await assert.rejects(readFile(signals), { code: "ENOENT" });
  assert.match((await reap()).stdout, new RegExp(`killed pid ${listener.pid}`));
  assert.equal(await readFile(signals, "utf8"), expected);
  await rm(signals);

  // Descendants with an outside listener and their children are preserved.
  await writeFile(rows, row(5217, listener.pid) + row(5410, pids.get("child")!));
  await reap();
  assert.equal(await readFile(signals, "utf8"), `-TERM -- ${listener.pid}\n`);
  await rm(signals);
  await writeFile(rows, row(5226, listener.pid) + row(5410, listener.pid));
  assert.match((await reap()).stdout, /skipped pid .*listener outside orphan slots/);
  await assert.rejects(readFile(signals), { code: "ENOENT" });
  await writeFile(rows, row(5410, listener.pid));
  assert.equal((await reap()).stdout, "");
  await assert.rejects(readFile(signals), { code: "ENOENT" });
});

test("reap preserves listeners with held slot locks", async (t) => {
  const { dir, rows, signals, reap, row } = await reaperFixture(t);
  const holder = spawn("flock", [join(dir, "ase-5226.lock"), process.execPath, "-e", "console.log('READY'); setInterval(() => {}, 1000)"], { detached: true });
  const exited = once(holder, "close");
  t.after(async () => {
    if (holder.exitCode === null && holder.pid) process.kill(-holder.pid, "SIGTERM");
    await exited;
  });
  const ready = await once(holder.stdout, "data", { signal: AbortSignal.timeout(3_000) });
  assert.ok(String(ready[0]).includes("READY"));
  assert.ok(holder.pid);
  await writeFile(rows, row(5226, holder.pid) + row(5227, holder.pid));
  assert.equal((await reap()).stdout, "");
  await assert.rejects(readFile(signals), { code: "ENOENT" });
});

test("reap kills a compound shell's listener while the coordinating shell survives", async (t) => {
  const { dir, rows, reap, row } = await reaperFixture(t);
  const serverDir = join(dir, "tests", "native-save");
  await mkdir(serverDir, { recursive: true });
  await writeFile(join(serverDir, "server.ts"), "require('node:net').createServer().listen(0, '127.0.0.1', () => console.log('LISTENER', process.pid));\n");
  await writeFile(join(dir, "build.sh"), "#!/usr/bin/env bash\necho BUILT\n", { mode: 0o755 });
  const shell = spawn("bash", ["-c", "node tests/native-save/server.ts & read -r answer; ./build.sh"], { cwd: dir, detached: true });
  const exited = once(shell, "close");
  t.after(async () => {
    if (shell.exitCode === null && shell.pid) process.kill(-shell.pid, "SIGKILL");
    await exited;
  });
  let output = "";
  const listener = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("compound shell listener did not start")), 3_000);
    shell.once("error", (error) => { clearTimeout(timer); reject(error); });
    shell.stdout.on("data", (data: Buffer) => {
      output += data.toString();
      const match = /LISTENER (\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  await writeFile(rows, row(5226, listener));
  // Real SIGTERM is safe here: every advertised process belongs to this test.
  assert.match((await reap(false, false)).stdout, new RegExp(`killed pid ${listener}`));
  assert.ok(shell.pid);
  process.kill(shell.pid, 0);
  assert.equal(shell.exitCode, null);
  shell.stdin.end("continue\n");
  const [code] = await exited;
  assert.equal(code, 0);
  assert.match(output, /BUILT/);
});
