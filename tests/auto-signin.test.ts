import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_SIGNIN_TRIED_KEY,
  SIGNED_IN_BEFORE_KEY,
  autoSignInPlan,
  forgetSignedIn,
  markAutoSignInTried,
  rememberSignedIn,
  signedInBefore,
} from "../src/auto-signin.ts";

function store() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}
const plan = (change: Partial<Parameters<typeof autoSignInPlan>[0]> & { local: ReturnType<typeof store>; session: ReturnType<typeof store> }) =>
  autoSignInPlan({ configured: true, hasSession: false, pathname: "/", search: "", ...change });

test("a browser that signed in before continues to GitHub by itself, once per tab session", () => {
  const local = store();
  const session = store();
  assert.equal(plan({ local, session }), "button", "never signed in here: the button");
  rememberSignedIn(local);
  assert.equal(local.data.get(SIGNED_IN_BEFORE_KEY), "1", "only a flag is kept, no name or token");
  assert.equal(plan({ local, session }), "auto");
  markAutoSignInTried(session);
  assert.equal(session.data.get(AUTO_SIGNIN_TRIED_KEY), "1");
  assert.equal(plan({ local, session }), "button", "tried once: back with no session shows the button");
});

test("it never continues with a session, an error, an unconfigured editor or a page that is not the editor's own", () => {
  const local = store();
  const session = store();
  rememberSignedIn(local);
  assert.equal(plan({ local, session, hasSession: true }), "button");
  assert.equal(plan({ local, session, search: "?error=GitHub%20access%20was%20not%20granted" }), "button");
  assert.equal(plan({ local, session, configured: false }), "button");
  assert.equal(plan({ local, session, pathname: "/auth/setup" }), "button");
  assert.equal(plan({ local, session, pathname: "/auth/mcp/authorize" }), "button");
  assert.equal(plan({ local, session, search: "?installation_id=5&setup_action=install" }), "button");
  assert.equal(plan({ local, session }), "auto");
});

test("signing out of the last account forgets the flag, and unavailable storage means the button", () => {
  const local = store();
  rememberSignedIn(local);
  assert.equal(signedInBefore(local), true);
  forgetSignedIn(local);
  assert.equal(signedInBefore(local), false);
  const broken = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };
  rememberSignedIn(broken);
  assert.equal(signedInBefore(broken), false);
  assert.equal(plan({ local: broken, session: broken }), "button");
});
