import { test } from "node:test";
import assert from "node:assert/strict";
import { startBootReads, type BootResponse, type BootSession } from "../src/boot-reads.ts";

const scope = { source: "workspace", epoch: 1 };
const signedIn: BootResponse<BootSession> = { value: { user: { login: "lex" } }, sessionTag: "session-a" };
const listing = { value: { repositories: ["lex/site"], onboarding: "none" }, sessionTag: "session-a" };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

test("boot starts both reads before either completes and adopts metadata together", async () => {
  const pending = deferred<BootResponse<BootSession>>();
  const calls: string[] = [];
  const reads = startBootReads({ scope, isCurrent: () => true,
    readSession: () => { calls.push("session"); return pending.promise; },
    readRepositories: async () => { calls.push("repositories"); return listing; },
  });
  assert.deepEqual(calls, ["session", "repositories"]);
  pending.resolve(signedIn);
  assert.equal(await reads.takeRepositories(await reads.session), listing);
});

test("signed-out boot ignores a rejected speculative repository read", async () => {
  const reads = startBootReads({ scope, isCurrent: () => true,
    readSession: async () => ({ value: { user: null } }),
    readRepositories: async () => { throw new Error("401"); },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await reads.takeRepositories(await reads.session), undefined);
});

test("repository failure falls back while session errors still propagate", async () => {
  const reads = startBootReads({ scope, isCurrent: () => true,
    readSession: async () => signedIn, readRepositories: async () => { throw new Error("offline"); },
  });
  assert.equal(await reads.takeRepositories(await reads.session), undefined);
  let started = false;
  const failed = startBootReads({ scope, isCurrent: () => true,
    readSession: () => { throw new Error("session unavailable"); },
    readRepositories: async () => { started = true; return listing; },
  });
  assert.equal(started, true);
  await assert.rejects(failed.session, /session unavailable/);
});

test("missing or different session tags cannot reuse same-account or other-account results", async () => {
  for (const sessionTag of [undefined, null, "", "same-account-new-session", "other-account-session"]) {
    const reads = startBootReads({ scope, isCurrent: () => true,
      readSession: async () => signedIn, readRepositories: async () => ({ ...listing, sessionTag }),
    });
    assert.equal(await reads.takeRepositories(await reads.session), undefined);
  }
  const reads = startBootReads({ scope, isCurrent: () => true,
    readSession: async () => ({ ...signedIn, sessionTag: undefined }), readRepositories: async () => listing,
  });
  assert.equal(await reads.takeRepositories(await reads.session), undefined);
});

test("superseded source or epoch rejects adoption before and after a pending repository read", async () => {
  for (const next of [{ source: "other", epoch: 1 }, { source: "workspace", epoch: 2 }]) {
    let current = scope;
    const pending = deferred<typeof listing>();
    const reads = startBootReads({ scope, isCurrent: (captured) => captured.source === current.source && captured.epoch === current.epoch,
      readSession: async () => signedIn, readRepositories: () => pending.promise,
    });
    const taking = reads.takeRepositories(await reads.session);
    await Promise.resolve();
    current = next;
    pending.resolve(listing);
    assert.equal(await taking, undefined);
    assert.equal(await reads.takeRepositories(await reads.session), undefined);
  }
});

test("only this boot's resolved session can adopt its result, and scope is captured", async () => {
  const mutable = { ...scope };
  const reads = startBootReads({ scope: mutable, isCurrent: (captured) => captured.epoch === 1,
    readSession: async () => signedIn, readRepositories: async () => listing,
  });
  mutable.epoch = 2;
  assert.equal(await reads.takeRepositories({ ...signedIn }), undefined);
  assert.equal(await reads.takeRepositories(await reads.session), listing);
});
