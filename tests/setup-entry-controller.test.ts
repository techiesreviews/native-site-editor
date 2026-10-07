import { test } from "node:test";
import assert from "node:assert/strict";
import { createSetupEntryController, type SetupEntryPorts } from "../src/controllers/setup-entry-controller.ts";
import type { SetupWizardOptions } from "../src/components/setup-wizard.ts";
import type { Connection } from "../src/setup-wizard.ts";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function fixture() {
  let login: string | undefined = "lex", owner = "/owner/setup", count = 0, hint: Connection | undefined = "installed";
  let mounts = 0, focuses = 0, destroys = 0, writes = 0, clears = 0, exits = 0;
  const loads: ReturnType<typeof deferred<Awaited<ReturnType<SetupEntryPorts["loadWizard"]>>>>[] = [];
  const connection = deferred<Connection>();
  const options: SetupWizardOptions[] = [];
  const module = { createSetupWizard: (value: SetupWizardOptions) => { options.push(value); return { root: {} as HTMLElement, focus: () => { focuses++; }, destroy: () => { destroys++; } }; } } as unknown as Awaited<ReturnType<SetupEntryPorts["loadWizard"]>>;
  const controller = createSetupEntryController({
    login: () => login, ownerSetupUrl: () => owner, repositoryCount: () => count,
    connectionHint: () => hint, connection: () => connection.promise, readMemory: () => undefined,
    writeMemory: change => { writes++; return { step: "connect", ...change, at: 0 }; }, clearMemory: () => { clears++; },
    loadWizard: () => { const load = deferred<typeof module>(); loads.push(load); return load.promise; },
    append: () => { mounts++; }, onExit: () => { exits++; },
    actions: { loadOwners: async () => [], create: async () => ({ ok: false, message: "Unused" }), findRepository: async () => undefined, agentPrompt: () => "", finish: () => {} },
  });
  return { controller, options, loads, connection, load: (index = 0) => loads[index].resolve(module), counters: () => ({ mounts, focuses, destroys, writes, clears, exits }), login: (value: string | undefined) => { login = value; }, repositories: () => { count = 1; }, noHint: () => { hint = undefined; }, owner: (value: string) => { owner = value; } };
}

test("same account restart shares loading and mounts/focuses exactly once", async () => {
  const f = fixture(), first = f.controller.open();
  assert.equal(f.controller.open(), first);
  f.load(); await first;
  assert.equal(f.loads.length, 1);
  assert.equal(f.counters().mounts, 1); assert.equal(f.counters().focuses, 1);
  f.controller.remove(); assert.equal(f.counters().destroys, 1);
});

test("removal invalidates late mounting without clearing a newer pending load", async () => {
  const f = fixture(), first = f.controller.open();
  f.controller.remove(); const second = f.controller.open();
  f.load(); await first; assert.equal(f.counters().mounts, 0);
  assert.equal(f.controller.open(), second);
  f.load(1); await second; assert.equal(f.counters().mounts, 1);
  f.controller.remove();
});

test("user or repository changes during module loading refuse the signed-in wizard", async () => {
  for (const change of ["login", "repositories"]) {
    const f = fixture(), pending = f.controller.open();
    if (change === "login") f.login("other"); else f.repositories();
    f.load(); await pending; assert.equal(f.counters().mounts, 0); assert.equal(f.counters().writes, 0);
  }
});

test("connection await rechecks the signed-in account and empty repository list", async () => {
  for (const change of ["login", "repositories"]) {
    const f = fixture(); f.noHint(); const pending = f.controller.open(); f.load();
    await Promise.resolve();
    if (change === "login") f.login("other"); else f.repositories();
    f.connection.resolve("installed"); await pending;
    assert.equal(f.counters().mounts, 0); assert.equal(f.counters().writes, 0);
  }
});

test("owner mode does not access memory and refuses changed URL or sign-in", async () => {
  for (const change of ["owner", "login", "none"]) {
    const f = fixture(); f.login(undefined); const pending = f.controller.openOwner("/owner/setup");
    if (change === "owner") f.owner("/different"); else if (change === "login") f.login("lex");
    f.load(); await pending;
    assert.equal(f.counters().writes, 0); assert.equal(f.counters().clears, 0);
    assert.equal(f.counters().mounts, change === "none" ? 1 : 0);
    if (change === "none") { assert.equal(f.options[0].connectPurpose, "register-app"); f.options[0].exit(); assert.equal(f.controller.dismissed(), true); }
  }
});

test("exit clears memory and falls back once; detached callbacks cannot exit a replacement", async () => {
  const f = fixture(), first = f.controller.open(); f.load(); await first;
  const old = f.options[0]; old.exit();
  assert.equal(f.counters().clears, 1); assert.equal(f.counters().exits, 1);
  const second = f.controller.open(); f.load(1); await second;
  old.exit(); old.remember({ step: "create" });
  assert.equal(f.controller.active(), true); assert.equal(f.counters().clears, 1);
  f.controller.remove();
});
