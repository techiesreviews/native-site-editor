// Continuing without a click: a browser that has signed in before and has no
// session now (it ended) goes to /auth/login by itself, and GitHub completes
// the authorization silently for a user who already authorized the App. The
// only thing kept is a flag that says "signed in before here" (never a name
// or a token), set after any sign-in and cleared when the last account signs
// out. The attempt is made once per tab session, so a failure shows the
// normal screen with its button instead of looping. Pure and storage-agnostic
// so it is tested without a browser (tests/auto-signin.test.ts).

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const SIGNED_IN_BEFORE_KEY = "ase:signed-in-before";
export const AUTO_SIGNIN_TRIED_KEY = "ase:auto-signin-tried";
/** How long the "Signing you in…" message is readable before the browser goes to GitHub; "Use the button instead" cancels within it. */
export const AUTO_SIGNIN_DELAY_MS = 1500;

function read(store: Store, key: string) {
  try {
    return store.getItem(key) === "1";
  } catch {
    return false;
  }
}
function write(store: Store, key: string, on: boolean) {
  try {
    if (on) store.setItem(key, "1");
    else store.removeItem(key);
  } catch {
    // Storage unavailable: nothing is remembered, the button is always there.
  }
}

export const signedInBefore = (store: Store) => read(store, SIGNED_IN_BEFORE_KEY);
export const rememberSignedIn = (store: Store) => write(store, SIGNED_IN_BEFORE_KEY, true);
export const forgetSignedIn = (store: Store) => write(store, SIGNED_IN_BEFORE_KEY, false);
export const autoSignInTried = (session: Store) => read(session, AUTO_SIGNIN_TRIED_KEY);
export const markAutoSignInTried = (session: Store) => write(session, AUTO_SIGNIN_TRIED_KEY, true);

/**
 * Whether to continue on to GitHub by itself: this browser signed in before,
 * has no session, has not tried in this tab session, and the page is the
 * editor's own (not the owner setup or an MCP consent page under /auth/,
 * not a return carrying an error, not an install's return, which signs in
 * on its own).
 */
export function autoSignInPlan(input: {
  configured: boolean;
  hasSession: boolean;
  pathname: string;
  search: string;
  local: Store;
  session: Store;
}): "auto" | "button" {
  if (!input.configured || input.hasSession) return "button";
  if (input.pathname.startsWith("/auth/") || input.pathname.startsWith("/.well-known/")) return "button";
  const query = new URLSearchParams(input.search);
  if (query.has("error") || query.has("installation_id") || query.has("setup_action")) return "button";
  if (!signedInBefore(input.local) || autoSignInTried(input.session)) return "button";
  return "auto";
}
