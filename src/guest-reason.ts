// A thrown error's words for a guest of a synced session (TOOLS-185). Its own module so the image popup and the
// media controller, which load with the first screen, do not pull the guest rules (src/guest-changes.ts) in with them.

/** A thrown error's words for a guest: only a plain Error, which this editor raises with words for people. A TypeError,
 * a failed fetch or a browser's error says nothing a guest can act on, and may name what lies behind the page. */
export const guestReason = (error: unknown) =>
  error instanceof Error && Object.getPrototypeOf(error) === Error.prototype && error.message ? error.message : undefined;
