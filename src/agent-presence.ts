// Agent presence (ticket 33; several agents, ticket am-11): which agent works where. A change at work
// on a page shows its agent's presence while the workspace it began in is shown, from its start until it
// lands or stops: on the page shown, an outline and name chip on its section and a dot on that section's
// Page Structure row; on another page, a dot on that page's row in Pages and files. An agent's question
// waiting for the user shows the same way on the request's element, its chip orange. Each agent (a
// connection and the name it works under) keeps one colour, the next of AGENT_COLOURS in order of
// arrival. Changes that overlap each keep their own entry: an agent's latest one still running shows.
// A workspace switch (`refresh`, at each load) clears what no longer holds, so nothing is drawn on a
// same-named page of another workspace.

import { outlineId, parseOutlineId, type AgentWho } from "../shared/agent";
import type { AgentAtWork } from "../shared/agent-read";
import { readSource, type SourceNode, type SourceTree } from "./page-builder/source-tree";

/**
 * One agent as the views draw it: at work on the page `path`, on its element `node` (none: the page
 * alone), named `name`, in colour `colour` (an index into AGENT_COLOURS), its chip orange while `asking`.
 */
export interface AgentMark { key: string; name: string; colour: number; path: string; node?: number[]; asking: boolean }
/** A request as its question shows: its site and branch, the element it is about, and who asked when it waits for the user's answer. */
export interface PresenceQuestion { repoId: number; branch?: string; state: string; element: { file: string; id: string }; reply?: { by?: AgentWho } }

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
  const running: { who: AgentWho; path: string; node?: number[]; at: Hold }[] = [];
  // Questions belong to their request's site and branch (shown again after any load), changes to the load they began in.
  let asked: { who: AgentWho; path: string; element: string; at: Hold }[] = [];
  // Each agent's place in the order of arrival, for the session (a few names each, never cleared): its colour.
  const arrivals = new Map<string, number>();
  // Each agent's latest change, as get_site tells it: held to its site and branch (a reload keeps it), as questions are.
  const latest = new Map<string, { who: AgentWho; path: string; node?: number[]; time: number; at: Hold }>();
  const now = () => ports.now?.() ?? Date.now();
  const keyOf = (who: AgentWho) => JSON.stringify([who.grant, who.name]);
  const arrive = (who: AgentWho) => {
    const key = keyOf(who);
    if (!arrivals.has(key)) arrivals.set(key, arrivals.size);
    return key;
  };
  const isPage = (path: string) => [...ports.pages()].includes(path);
  function marks(): AgentMark[] {
    const shown = new Map<string, AgentMark>();
    const mark = (who: AgentWho, path: string, node: number[] | undefined, asking: boolean): AgentMark =>
      ({ key: keyOf(who), name: who.name || UNNAMED_AGENT, colour: arrivals.get(keyOf(who))! % AGENT_COLOURS.length, path, ...(node ? { node: [...node] } : {}), asking });
    for (const entry of running) if (entry.at.holds()) shown.set(keyOf(entry.who), mark(entry.who, entry.path, entry.node, false));
    for (const question of asked) {
      if (!question.at.holds()) continue;
      const key = keyOf(question.who), working = shown.get(key);
      if (working) { working.asking = true; continue; }
      if (!isPage(question.path)) continue;
      const source = ports.source(question.path);
      const node = source === undefined ? undefined : presenceWithin(readSource(source, { page: true }), parseOutlineId(question.element), ports.sectionTags());
      shown.set(key, mark(question.who, question.path, node, true));
    }
    return [...shown.values()].sort((a, b) => arrivals.get(a.key)! - arrivals.get(b.key)!);
  }
  let painted = "";
  function refresh() {
    const next = marks();
    // Nothing shown and nothing to show: the views are left alone (boot, loads with no agent at work).
    const key = next.length ? JSON.stringify(next) : "";
    if (key === painted) return;
    painted = key;
    ports.paint(next);
  }
  return {
    /**
     * The agent `who` at work on the file `path`: when it is a page, `find` names its element in the page's
     * text now (none: the page alone). The returned call ends it. Only pages show: a component's template, a
     * stylesheet or any other file draws nothing (a template change is every instance's), get_site lists it.
     */
    show(path: string, find: (source: string) => number[] | undefined, who: AgentWho = { grant: "", name: "" }): () => void {
      arrive(who);
      const page = isPage(path), source = page ? ports.source(path) : undefined, node = source === undefined ? undefined : find(source);
      const at = ports.begin(), where = ports.workspace();
      latest.set(keyOf(who), { who, path, ...(node ? { node: [...node] } : {}), time: now(), at: { holds: () => Boolean(where && ports.shows(where)) } });
      if (!page) return () => {};
      const entry = { who, path, ...(node ? { node: [...node] } : {}), at };
      running.push(entry);
      refresh();
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        running.splice(running.indexOf(entry), 1);
        // The agent's latest change (this one, or a newer one of its own begun meanwhile) counts from now.
        latest.set(keyOf(who), { ...latest.get(keyOf(who))!, time: now() });
        refresh();
      };
    },
    /** The open workspace's requests (the agent menu tells them): each question waiting for the user shows on its element, by who asked it. */
    questions(requests: readonly PresenceQuestion[]) {
      asked = requests.flatMap(request => {
        const who = request.state === "question" ? request.reply?.by : undefined;
        if (!who) return [];
        arrive(who);
        const where = { repoId: request.repoId, ...(request.branch ? { branch: request.branch } : {}) };
        return [{ who, path: request.element.file, element: request.element.id, at: { holds: () => ports.shows(where) } }];
      });
      refresh();
    },
    /** Who works on what in the workspace shown (get_site): every agent at work, asking, or with a change in the last AT_WORK_MS. */
    atWork(): AgentAtWork[] {
      const time = now(), told = new Map<string, AgentAtWork>();
      for (const [key, last] of latest) if (last.at.holds() && time - last.time <= AT_WORK_MS)
        told.set(key, { name: last.who.name || UNNAMED_AGENT, file: last.path, ...(last.node ? { section: outlineId(last.node) } : {}) });
      for (const entry of running) if (entry.at.holds())
        told.set(keyOf(entry.who), { name: entry.who.name || UNNAMED_AGENT, file: entry.path, ...(entry.node ? { section: outlineId(entry.node) } : {}) });
      for (const question of asked) if (question.at.holds()) {
        const key = keyOf(question.who);
        told.set(key, { ...told.get(key) ?? { name: question.who.name || UNNAMED_AGENT, file: question.path }, asking: true });
      }
      return [...told.entries()].sort(([a], [b]) => (arrivals.get(a) ?? 0) - (arrivals.get(b) ?? 0)).map(([, agent]) => agent);
    },
    /** Draws again for the workspace shown now (after a load began). */
    refresh,
  };
}
