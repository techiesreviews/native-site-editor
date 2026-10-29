// Agent presence (ticket 33; several agents, ticket am-11): which agent works where. A change at work
// on a page shows its agent's presence while the workspace it began in is shown, from its start until it
// lands or stops: on the page shown, an outline and name chip on its section and a dot on that section's
// Page Structure row; on another page, a dot on that page's row in Pages and files. An agent's question
// waiting for the user shows the same way on the request's element, its chip orange. Each agent (a
// connection and the name it works under) keeps one colour, the next of AGENT_COLOURS in order of
// arrival. Changes that overlap each keep their own entry: an agent's latest one still running shows.
// A workspace switch (`refresh`, at each load) clears what no longer holds, so nothing is drawn on a
// same-named page of another workspace. An agent the user stopped (ticket am-12) shows nowhere again.
// An agent working through a pin on the page (ticket am-13) wears its chip on the pin alone: its outline
// there has none (`pinned`). A pin only a wait took (ticket am-45) shows the taker when it acts (any call but a
// wait, or a change, or alone on its connection); a watchdog's take (an agent heard only waiting) shows its connection's one agent that acted,
// else no one until one reads or replies (`onPin`). Once named, a take keeps its name, unless that agent is stopped.
// An agent acting first, or stopped, names the pins again at once (the MCP menu's `listen`). An agent can also say
// where it works before it changes anything (working_here, ticket am-14, src/agent-working-here.ts): it shows there
// as a change would (`show`, held).

import { outlineId, parseOutlineId, type AgentWho } from "../shared/agent";
import type { AgentAtWork } from "../shared/agent-read";
import { readSource, type SourceNode, type SourceTree } from "./page-builder/source-tree";

/**
 * One agent as the views draw it: at work on the page `path`, on its element `node` (none: the page
 * alone), named `name`, in colour `colour` (an index into AGENT_COLOURS), its chip orange while `asking`.
 */
export interface AgentMark { key: string; name: string; colour: number; path: string; node?: number[]; asking: boolean; pinned?: boolean }
/** An agent the MCP menu lists as working now (ticket am-12): who, as a mark names it, and when it leaves the list
 * unless it works again (none while it is at work or asking). */
export interface WorkingAgent { key: string; who: AgentWho; name: string; colour: number; asking: boolean; until?: number }
/** A request as its question shows: its site and branch, the element it is about, and who asked when it waits for the user's answer. */
export interface PresenceQuestion { id: string; repoId: number; branch?: string; state: string; element: { file: string; id: string }; reply?: { by?: AgentWho }; agent?: AgentWho; agentTook?: boolean }

/** The agents' colours, theme tokens in order of arrival: the MCP green, the components' violet, video pink, data teal (src/theme.css). */
export const AGENT_COLOURS = ["agent-presence", "agent-presence-2", "agent-presence-3", "agent-presence-4"] as const;
/** How long get_site lists an agent after its last change. */
export const AT_WORK_MS = 10 * 60_000;
/** An agent with no name of its own or of its MCP client. */
export const UNNAMED_AGENT = "Agent";

export interface AgentPresencePorts {
  /** The site's pages (the files its routes show). */
  pages(): Iterable<string>;
  /** The page's text now, as the page shown has it; undefined when there is none. */
  source(path: string): string | undefined;
  /** The workspace load now: it holds until the next load. */
  begin(): { holds(): boolean };
  /** The site's section components' tags (a question's element shows on its section). */
  sectionTags(): ReadonlySet<string>;
  /** Whether the site and branch shown now are `at` (a request's: none named, any branch). */
  shows(at: { repoId: number; branch?: string }): boolean;
  /** The site and branch shown now, if any: an agent's latest change belongs to them. */
  workspace(): { repoId: number; branch: string } | undefined;
  /** Draws every agent's presence in every view: none clears them. */
  paint(marks: AgentMark[]): void;
  /** Whether the user stopped `who`, and recording that they did (src/agent-stops.ts); none: no one is. */
  stops?: { has(who: AgentWho): boolean; add(who: AgentWho): void };
  now?(): number;
}

/** A section of a page: a <section>, or a section component's instance. */
export const sectionLike = (el: SourceNode | undefined, sectionTags: ReadonlySet<string>) => el?.type === "element" && (el.name === "section" || sectionTags.has(el.name));
/** The deepest section holding the element at `node` of `tree` (or being it), else that element; none when there is no such element. */
export function presenceWithin(tree: SourceTree<SourceNode>, node: number[] | undefined, sectionTags: ReadonlySet<string>): number[] | undefined {
  if (!node?.length || !tree.at(node)) return undefined;
  for (let depth = node.length; depth > 0; depth--) if (sectionLike(tree.at(node.slice(0, depth)), sectionTags)) return node.slice(0, depth);
  return node;
}

export function createAgentPresence(ports: AgentPresencePorts) {
  type Hold = { holds(): boolean };
  // `held`: a working_here hold, not a change (ticket am-14).
  const running: { who: AgentWho; path: string; node?: number[]; at: Hold; held: boolean }[] = [];
  // Questions belong to their request's site and branch (shown again after any load), changes to the load they began in.
  let asked: { who: AgentWho; path: string; element: string; at: Hold }[] = [];
  // The pins an agent works through now, by agent and page: their chips carry its name.
  let pinned: { key: string; path: string; at: Hold }[] = [];
  // Every agent heard (each call of its let in, waits included), by key: when last, and whether it acts (a call
  // other than a wait, or a change): whom a wait's take names. Stored requests move neither.
  const heard = new Map<string, { who: AgentWho; time: number; acts: boolean }>();
  const hear = (who: AgentWho, acts: boolean) => {
    const key = keyOf(who), before = heard.get(key);
    heard.set(key, { who, time: now(), acts: acts || Boolean(before?.acts) });
    // A new agent, or one acting for the first time, may name a pin a watchdog took.
    if ((!before || acts && !before.acts) && name()) refresh();
  };
  // The agent each pin an agent works through shows, by request; and for one a wait took, its taker (key) and the
  // agent it was named after: kept while that take holds, so another agent heard since does not rename it.
  let onPins = new Map<string, AgentWho>();
  const named = new Map<string, { took: string; who: AgentWho }>();
  // Each agent's place in the order of arrival, for the session (a few names each, never cleared): its colour.
  const arrivals = new Map<string, number>();
  // Each agent's latest change, as get_site tells it: held to its site and branch (a reload keeps it), as questions are.
  const latest = new Map<string, { who: AgentWho; path: string; node?: number[]; time: number; at: Hold; held?: true }>();
  const now = () => ports.now?.() ?? Date.now();
  const keyOf = (who: AgentWho) => JSON.stringify([who.grant, who.name]);
  const stopped = (who: AgentWho) => ports.stops?.has(who) ?? false;
  // The MCP menu's list, told each time it may have changed.
  const listeners = new Set<() => void>();
  const tell = () => { for (const listener of listeners) listener(); };
  const arrive = (who: AgentWho) => {
    const key = keyOf(who);
    if (!arrivals.has(key)) arrivals.set(key, arrivals.size);
    return key;
  };
  /** Whom the pin of request `id`, taken by `taker`'s wait, names (ticket am-45): the taker when it acts (a worker's
   * own wait); for a watchdog (heard only waiting), the agent this take was named after before, else its connection's
   * one agent that acted this session, else (none) the taker itself until one acts. Never a stopped agent (am-12); else no one (until one reads or replies). */
  const takenBy = (id: string, taker: AgentWho) => {
    const took = keyOf(taker), before = named.get(id);
    // Acting at any time this session: a main agent goes quiet while its watchdog waits.
    const others = [...heard].flatMap(([key, agent]) => key !== took && agent.acts && agent.who.grant === taker.grant && !stopped(agent.who) ? [agent.who] : []);
    const who = stopped(taker) ? undefined
      : heard.get(took)?.acts ? taker
      : before?.took === took && !stopped(before.who) ? before.who
      : others.length === 1 ? others[0]
      : others.length ? undefined : taker;
    // Kept only when another agent is named: the taker alone gives way to its main agent once that one acts.
    if (who && keyOf(who) !== took) named.set(id, { took, who });
    else named.delete(id);
    return who;
  };
  // The open workspace's requests, as `questions` last told them: named again when an agent acts or is stopped.
  let told: readonly PresenceQuestion[] = [];
  const holds = (request: PresenceQuestion) => {
    const where = { repoId: request.repoId, ...(request.branch ? { branch: request.branch } : {}) };
    return { holds: () => ports.shows(where) };
  };
  /** Names the pins agents work through (`onPin`, `pinned`) from the requests told; true when a name changed. */
  function name() {
    const working = told.filter(request => request.state === "seen" && request.agent);
    for (const id of named.keys()) if (!working.some(request => request.id === id && request.agentTook)) named.delete(id);
    // A watchdog that only took it for its connection's agent takes no colour, nor one whose pin names no one yet.
    const next = new Map(working.flatMap(request => {
      const who = request.agentTook ? takenBy(request.id, request.agent!) : request.agent!;
      return who ? [[request.id, who] as const] : [];
    }));
    const changed = next.size !== onPins.size || [...next].some(([id, who]) => keyOf(who) !== (onPins.has(id) ? keyOf(onPins.get(id)!) : ""));
    onPins = next;
    pinned = working.flatMap(request => onPins.has(request.id) ? [{ key: arrive(onPins.get(request.id)!), path: request.element.file, at: holds(request) }] : []);
    return changed;
  }
  const isPage = (path: string) => [...ports.pages()].includes(path);
  // The section a question's element is in, in its page's text now: where its agent shows, and what get_site tells.
  const questionAt = (question: { path: string; element: string }) => {
    const source = isPage(question.path) ? ports.source(question.path) : undefined;
    return source === undefined ? undefined : presenceWithin(readSource(source, { page: true }), parseOutlineId(question.element), ports.sectionTags());
  };
  // What runs, a working_here hold before any change (ticket am-14): an agent's change shows over its hold, whichever began first.
  const byHolds = () => [...running.filter(entry => entry.held), ...running.filter(entry => !entry.held)];
  function marks(): AgentMark[] {
    const shown = new Map<string, AgentMark>();
    const mark = (who: AgentWho, path: string, node: number[] | undefined, asking: boolean): AgentMark => {
      const key = keyOf(who), onPin = !asking && pinned.some(pin => pin.key === key && pin.path === path && pin.at.holds());
      return { key, name: who.name || UNNAMED_AGENT, colour: arrivals.get(key)! % AGENT_COLOURS.length, path, ...(node ? { node: [...node] } : {}), asking, ...(onPin ? { pinned: true } : {}) };
    };
    for (const entry of byHolds()) if (entry.at.holds() && !stopped(entry.who)) shown.set(keyOf(entry.who), mark(entry.who, entry.path, entry.node, false));
    for (const question of asked) {
      if (!question.at.holds() || stopped(question.who)) continue;
      const key = keyOf(question.who), working = shown.get(key);
      if (working) { working.asking = true; delete working.pinned; continue; }
      if (!isPage(question.path)) continue;
      shown.set(key, mark(question.who, question.path, questionAt(question), true));
    }
    return [...shown.values()].sort((a, b) => arrivals.get(a.key)! - arrivals.get(b.key)!);
  }
  let painted = "";
  // `again`: a load began, whose views may have dropped what was painted: marks still shown are painted again.
  function refresh(again = false) {
    const next = marks();
    // Nothing shown and nothing to show: the views are left alone (boot, loads with no agent at work).
    const key = next.length ? JSON.stringify(next) : "";
    if (key === painted && !(again && key)) { tell(); return; }
    painted = key;
    ports.paint(next);
    tell();
  }
  /** Every agent at work, asking, or with a change in the last AT_WORK_MS in the workspace shown, in order of arrival:
   * where each is, whether it asks, and until when it stays listed (none while at work or asking). */
  function working() {
    const time = now(), told = new Map<string, { who: AgentWho; file: string; node?: number[]; asking?: boolean; until?: number }>(), placed = new Set<string>();
    for (const [key, last] of latest) if (last.at.holds() && time - last.time <= AT_WORK_MS && !stopped(last.who))
      told.set(key, { who: last.who, file: last.path, ...(last.node ? { node: last.node } : {}), until: last.time + AT_WORK_MS });
    for (const entry of byHolds()) if (entry.at.holds() && !stopped(entry.who)) {
      placed.add(keyOf(entry.who));
      told.set(keyOf(entry.who), { who: entry.who, file: entry.path, ...(entry.node ? { node: entry.node } : {}) });
    }
    for (const question of asked) if (question.at.holds() && !stopped(question.who)) {
      // As marks() draws it: at work on a change meanwhile, told there, asking; else on its first question about
      // a page, on that question's section (an ended change gives way). Until one about a page comes, the latest
      // question about another file is told, its file alone.
      const key = keyOf(question.who), there = placed.has(key) ? told.get(key) : undefined;
      if (there) { there.asking = true; continue; }
      const node = questionAt(question);
      told.set(key, { who: question.who, file: question.path, ...(node ? { node } : {}), asking: true });
      if (isPage(question.path)) placed.add(key);
    }
    return [...told.entries()].sort(([a], [b]) => (arrivals.get(a) ?? 0) - (arrivals.get(b) ?? 0));
  }
  /**
   * The agent `who` at work on the file `path`: when it is a page, `find` names its element in the page's
   * text now (none: the page alone). The returned call ends it. Only pages show: a component's template, a
   * stylesheet or any other file draws nothing (a template change is every instance's), get_site lists it.
   * `held` (working_here): no change, so its end leaves get_site as it was before it, unless a change came since.
   */
  function show(path: string, find: (source: string) => number[] | undefined, who: AgentWho = { grant: "", name: "" }, held = false): () => void {
    // Stopped: its calls are refused before they run (src/components/agent-menu.ts, with shared/agent.ts AGENT_STOPPED); one already under way draws nothing.
    if (stopped(who)) return () => {};
    arrive(who);
    hear(who, true);
    const page = isPage(path), source = page ? ports.source(path) : undefined, node = source === undefined ? undefined : find(source);
    const at = ports.begin(), where = ports.workspace(), key = keyOf(who), before = latest.get(key);
    const said = { who, path, ...(node ? { node: [...node] } : {}), time: now(), at: { holds: () => Boolean(where && ports.shows(where)) }, ...(held ? { held: true as const } : {}) };
    latest.set(key, said);
    if (!page) { tell(); return () => {}; }
    const entry = { who, path, ...(node ? { node: [...node] } : {}), at, held };
    running.push(entry);
    refresh();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      running.splice(running.indexOf(entry), 1);
      if (held) {
        if (latest.get(key) === said) { if (before) latest.set(key, before); else latest.delete(key); }
      } else {
        // The agent's latest change (this one, or a newer one of its own begun meanwhile) counts from now. A hold begun
        // meanwhile is no change: this one is told, not the hold, which on its end leaves this in place.
        const last = latest.get(key)!;
        latest.set(key, { ...(last.held ? said : last), time: now() });
      }
      refresh();
    };
  }
  return {
    show,
    /** The load shown now, for working_here as its command arrives (src/agent-working-here.ts). */
    begin: () => ports.begin(),
    /** The open workspace's requests (the agent menu tells them): each question waiting for the user shows on its element, by who asked it;
     * each request an agent works through puts its name on the pin (`onPin`), not on its outline on that page. */
    questions(requests: readonly PresenceQuestion[]) {
      asked = requests.flatMap(request => {
        const who = request.state === "question" ? request.reply?.by : undefined;
        if (!who) return [];
        arrive(who);
        return [{ who, path: request.element.file, element: request.element.id, at: holds(request) }];
      });
      told = requests;
      name();
      refresh();
    },
    /** `who` called on its connection (src/components/agent-menu.ts): one of its agents, whom a pin a wait took may name;
     * `acts` false for a wait (wait_for_requests). */
    heard: (who: AgentWho, acts = true) => hear(who, acts),
    /** The agent the pin of request `id` shows at work on it, as the last `questions` told (none: its spinner, or not being worked on). */
    onPin: (id: string): AgentWho | undefined => onPins.get(id),
    /** `who`'s colour (an index into AGENT_COLOURS), the same on its pins as on its outline: it arrives now if new. */
    colour: (who: AgentWho) => arrivals.get(arrive(who))! % AGENT_COLOURS.length,
    /** Who works on what in the workspace shown (get_site): every agent at work, asking, or with a change in the last AT_WORK_MS. */
    atWork(): AgentAtWork[] {
      return working().map(([, agent]) => ({ name: agent.who.name || UNNAMED_AGENT, file: agent.file, ...(agent.node ? { section: outlineId(agent.node) } : {}), ...(agent.asking ? { asking: true } : {}) }));
    },
    /** The same agents as the MCP menu lists them (ticket am-12), each in its colour. */
    agents(): WorkingAgent[] {
      return working().map(([key, agent]) => ({ key, who: agent.who, name: agent.who.name || UNNAMED_AGENT, colour: arrivals.get(key)! % AGENT_COLOURS.length,
        asking: Boolean(agent.asking), ...(agent.until !== undefined ? { until: agent.until } : {}) }));
    },
    /** Stops `who` (the MCP menu's Stop): its outline, chip and dots go at once, here and, through the record, in this browser's other tabs. */
    stop(who: AgentWho) {
      ports.stops?.add(who);
      name();
      refresh();
    },
    /** `listener` hears each time the agents listed may have changed; the returned call stops it. */
    listen(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** Whether the user stopped `who`: its calls are refused (src/components/agent-menu.ts, with shared/agent.ts AGENT_STOPPED). */
    stopped,
    /** Another tab stopped an agent: drawn again without it. */
    stopsChanged: () => { name(); refresh(); },
    /** Draws again for the workspace shown now, after a load began: what still holds (a question on this branch) is painted again. */
    loaded: () => refresh(true),
  };
}
