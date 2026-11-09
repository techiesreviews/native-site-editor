// Share to edit's state in the editor (slice 30; CONTEXT.md "Synced session"): what
// the project menu shows, and the one session at a time on the workspace shown.
// It loads when the project menu first opens (src/shares-later.ts); the session
// itself (src/live-session.ts) and its room load with the first share.

import type { SharePorts, SessionGuest, SyncedSession } from "./live-session";

/** What the project menu shows: no session, one starting, or one open with its link and guests. */
export type ShareState = { sharing: false; starting?: true } | { sharing: true; link: string; guests: SessionGuest[] };

/**
 * Lex's side of Share to edit for the workspace shown: one session at a time. It ends by itself when another project
 * or branch opens (`check`, after each load), when the room refuses, or when the editing preview closes.
 */
export function createShareControl(ports: Pick<SharePorts, "preview"> & {
  /** The repository and branch shown, the site's name and Lex's; none when nothing is open. */
  workspace(): Pick<SharePorts, "repo" | "branch" | "site" | "host"> | undefined;
  /** Whether the workspace open when sharing began is still the one shown. */
  stamp(): { holds(): boolean };
  start?: (ports: SharePorts) => Promise<SyncedSession>;
}) {
  const start = ports.start ?? (async (session: SharePorts) => (await import("./live-session")).startSharing(session));
  let state: ShareState = { sharing: false };
  let session: SyncedSession | undefined;
  let holds: { holds(): boolean } | undefined;
  let run = 0;
  const listeners = new Set<(state: ShareState) => void>();
  const set = (next: ShareState) => { state = next; for (const listener of [...listeners]) listener(state); };
  const stop = () => {
    run++;
    const open = session;
    session = undefined;
    set({ sharing: false });
    open?.stop();
  };
  return {
    state: () => state,
    /** Whether there is a site shown to share: Share to edit shows only then. */
    available: () => state.sharing || ports.workspace() !== undefined,
    /** Hears each change of state; returns the way to stop. */
    watch(listener: (state: ShareState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Starts a session (or keeps the one open): its link, or undefined when nothing is open to share. Throws when the
     * room refuses (its `status`, 401 when signed out). */
    async start(): Promise<string | undefined> {
      if (state.sharing) return state.link;
      const where = ports.workspace();
      if (!where || state.starting) return undefined;
      const mine = ++run;
      const since = holds = ports.stamp();
      set({ sharing: false, starting: true });
      try {
        const started = await start({
          ...where, preview: ports.preview, holds: () => since.holds(),
          changed: (change) => {
            if (mine !== run) return;
            if (change.ended) { session = undefined; set({ sharing: false }); return; }
            if (state.sharing) set({ ...state, guests: change.guests });
          },
        });
        if (mine !== run || !since.holds()) { started.stop(); return undefined; }
        session = started;
        set({ sharing: true, link: started.link, guests: [] });
        return started.link;
      } catch (error) {
        if (mine === run) set({ sharing: false });
        throw error;
      }
    },
    /** Stop sharing: guests' pages say the session ended, and the link refuses. */
    stop,
    /** After a load: a session of another project or branch than the one shown ends. */
    check() {
      if ((session || (!state.sharing && state.starting)) && holds && !holds.holds()) stop();
    },
  };
}
