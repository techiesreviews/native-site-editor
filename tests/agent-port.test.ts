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
  const env = { ...process.env, ASE_POOL: slots.join(" "), ASE_PORTS: slots.join(" "), ASE_LOCK_DIR: dir, ASE_MAX_LOAD: "1000000" };
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
  assert.ok(launch.startsWith(`${slots[1]}\n`));
  assert.ok(launch.includes("--shard=1/1"));
});

test("reap defaults to signalling orphans, dry-run lists, and protects outside listeners", async (t) => {
  const { dir, env } = await fixture(t);
  const rows = join(dir, "listeners");
  const signals = join(dir, "signals");
  const startup = join(dir, "bash-env");
  // Synthetic process table and a recorded signal keep reaper tests harmless.
  await writeFile(join(dir, "ss"), '#!/usr/bin/env bash\ncat "$ASE_LISTENERS"\n', { mode: 0o755 });
  await writeFile(join(dir, "ps"), '#!/usr/bin/env bash\nif [[ $2 == 12345 ]]; then if [[ $4 == args= ]]; then echo "node test-server"; else echo 23456; fi; else echo 34567; fi\n', { mode: 0o755 });
  await writeFile(startup, 'kill() { printf "%s\\n" "$*" >> "$ASE_SIGNALS"; }\n');
  const reap = (dry = false) => exec("bash", [new URL("../scripts/agents/reap.sh", import.meta.url).pathname, ...(dry ? ["--dry-run"] : [])], {
    env: { ...env, PATH: `${dir}:${process.env.PATH}`, BASH_ENV: startup, ASE_LISTENERS: rows, ASE_SIGNALS: signals }, timeout: 3_000,
  });
  const row = (port: number) => `LISTEN 0 10 127.0.0.1:${port} 0.0.0.0:* users:(("node",pid=12345,fd=20))\n`;
  await writeFile(rows, row(5227));
  assert.match((await reap(true)).stdout, /would kill group 23456, port 5227/);
  await assert.rejects(readFile(signals), { code: "ENOENT" });
  assert.match((await reap()).stdout, /killed group 23456, port 5227/);
  assert.equal(await readFile(signals, "utf8"), "-TERM -- -23456\n");
  await rm(signals);
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
