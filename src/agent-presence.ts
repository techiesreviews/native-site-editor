// Agent presence (ticket 33): which agent change shows where. A change at work on a section of a page
// shows its presence (the preview's outline and name chip, the Page Structure row's dot) while the
// workspace it began in is shown, from its start until it lands or stops. Changes that overlap each
// keep their own entry: the latest one still running shows. A workspace switch (`refresh`, at each
// load) clears what no longer holds, so nothing is drawn on a same-named page of another workspace.

/** An element of a page as the editor's node path. */
export interface PresenceTarget { path: string; node: number[] }

export interface AgentPresencePorts {
  /** The page's text now, as the page shown has it; undefined when there is none. */
  source(path: string): string | undefined;
  /** The workspace load now: it holds until the next load. */
  begin(): { holds(): boolean };
  /** Draws the presence on `target` in every view, or none. */
  paint(target: PresenceTarget | undefined): void;
}

export function createAgentPresence(ports: AgentPresencePorts) {
  const running: (PresenceTarget & { at: { holds(): boolean } })[] = [];
  let painted = "";
  function refresh() {
    const shown = [...running].reverse().find(entry => entry.at.holds());
    const target = shown && { path: shown.path, node: [...shown.node] };
    // Nothing shown and nothing to show: the views are left alone (boot, loads with no agent at work).
    const key = target ? JSON.stringify(target) : "";
    if (key === painted) return;
    painted = key;
    ports.paint(target);
  }
  return {
    /** An agent at work on the page `path`: `find` names its element in the page's text now; the returned call ends it. */
    show(path: string, find: (source: string) => number[] | undefined): () => void {
      const source = ports.source(path), node = source === undefined ? undefined : find(source);
      if (!node) return () => {};
      const entry = { path, node: [...node], at: ports.begin() };
      running.push(entry);
      refresh();
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        running.splice(running.indexOf(entry), 1);
        refresh();
      };
    },
    /** Draws again for the workspace shown now (after a load began). */
    refresh,
  };
}
