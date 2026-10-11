import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  if [[ \${args[i]} == load=* ]]; then args[i]="load=$(cat "$ASE_LOAD_FILE")"; fi
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

test("reap defaults to signalling orphans, dry-run lists, and protects outside listeners", async (t) => {
  const { dir, env } = await fixture(t);
  const rows = join(dir, "listeners");
  const signals = join(dir, "signals");
  const processes = join(dir, "processes");
  const startup = join(dir, "bash-env");
  // Synthetic process table and a recorded signal keep reaper tests harmless.
  await writeFile(join(dir, "ss"), '#!/usr/bin/env bash\ncat "$ASE_LISTENERS"\n', { mode: 0o755 });
  await writeFile(join(dir, "ps"), '#!/usr/bin/env bash\nif [[ $1 == -eo ]]; then cat "$ASE_PROCESSES"; else echo 34567; fi\n', { mode: 0o755 });
  await writeFile(startup, 'kill() { printf "%s\\n" "$*" >> "$ASE_SIGNALS"; }\n');
  const reap = (dry = false) => exec("bash", [new URL("../scripts/agents/reap.sh", import.meta.url).pathname, ...(dry ? ["--dry-run"] : [])], {
    env: { ...env, PATH: `${dir}:${process.env.PATH}`, BASH_ENV: startup, ASE_LISTENERS: rows, ASE_SIGNALS: signals, ASE_PROCESSES: processes }, timeout: 3_000,
  });
  const server = "12345 12344 23456 node tests/native-save/server.ts\n";
  const launcher = "12344 1 23456 node /repo/node_modules/tsx/dist/cli.mjs tests/native-save/server.ts\n";
  await writeFile(processes, server + launcher);
  const row = (port: number) => `LISTEN 0 10 127.0.0.1:${port} 0.0.0.0:* users:(("node",pid=12345,fd=20))\n`;
  await writeFile(rows, row(5227));
  assert.match((await reap(true)).stdout, /would kill group 23456, port 5227/);
  await assert.rejects(readFile(signals), { code: "ENOENT" });
  assert.match((await reap()).stdout, /killed group 23456, port 5227/);
  assert.equal(await readFile(signals, "utf8"), "-TERM -- -23456\n");
  await rm(signals);

  for (const command of [
    "tsx tests/native-save/server.ts",
    "npm exec tsx tests/native-save/server.ts",
    "npx tsx tests/native-save/server.ts",
    "sh -c 'node tests/native-save/server.ts'",
  ]) {
    await writeFile(processes, server + `12344 1 23456 ${command}\n`);
    assert.match((await reap()).stdout, /killed group 23456/);
    assert.equal(await readFile(signals, "utf8"), "-TERM -- -23456\n");
    await rm(signals);
  }

  // No unrelated process needs a listener to make whole-group signalling unsafe.
  for (const members of [
    launcher + "45678 1 23456 bash\n",
    launcher + "45678 1 23456 node /repo/agent.js\n",
    launcher + "45678 12344 23456 node /repo/build.js\n",
    "12344 1 23456 node /repo/agent.js tests/native-save/server.ts\n",
  ]) {
    await writeFile(processes, server + members);
    assert.match((await reap(true)).stdout, /would kill pid 12345, group 23456/);
    await assert.rejects(readFile(signals), { code: "ENOENT" });
    const result = await reap();
    assert.match(result.stdout, /unrelated members; signalling only orphan listener PIDs/);
    assert.match(result.stdout, /killed pid 12345, group 23456/);
    assert.equal(await readFile(signals, "utf8"), "-TERM -- 12345\n");
    await rm(signals);
  }
  await writeFile(processes, server + launcher);
  await writeFile(rows, row(5226) + row(5410));
  assert.match((await reap()).stdout, /skipped group 23456/);
  await assert.rejects(readFile(signals), { code: "ENOENT" });
  await writeFile(rows, row(5410));
  assert.equal((await reap()).stdout, "");
  await assert.rejects(readFile(signals), { code: "ENOENT" });

  const holder = spawn("flock", [join(dir, "ase-5226.lock"), process.execPath, "-e", "console.log('READY'); setInterval(() => {}, 1000)"], { detached: true });
  const exited = once(holder, "close");
  t.after(async () => {
    if (holder.exitCode === null && holder.pid) process.kill(-holder.pid, "SIGTERM");
    await exited;
  });
  const ready = await once(holder.stdout, "data");
  assert.ok(String(ready[0]).includes("READY"));
  await writeFile(rows, row(5226));
  assert.equal((await reap()).stdout, "");
  await assert.rejects(readFile(signals), { code: "ENOENT" });
});
