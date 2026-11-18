// Carets and who wrote what (tickets am-22, am-25, am-26): this tab tells the room where its caret is (and the agents'
// whose text it wrote), reads others' carets in its own text, writes an agent's change under the agent's own Yjs client
// id, and names, for the commit, whoever presence says wrote the text that came from others. The overview is in
// src/live-text.ts.

import type { TextChange } from "./draft-store";
import type { LiveAuthor } from "./live-author";
import { agentKey, NAME_LIMIT } from "./participant";
import { saveAuthors } from "./save-authors";
import type { JsonValue } from "../shared/agent-command";
import type { SaveAuthor } from "../shared/types";
import type { LiveCaret } from "./live-text";
import type { CopyContext } from "./live-text-shared";

/** A caret that moves tells the room at most this often (typing moves it with every key). */
const CARET_MS = 50;
/** The most agents' carets one tab's presence is read for (ticket am-25). */
export const AGENT_CARETS = 16;
/** A name cut to NAME_LIMIT code points, never inside a surrogate pair (src/participant.ts `shownName` cuts what shows). */
export const cut = (name: string) => [...name].slice(0, NAME_LIMIT).join("");
/** The most client ids of others' text one copy holds while waiting for presence to name them (the starting texts' never are). */
const UNNAMED_LIMIT = 256;

/** The copy's carets and authors (part of `makeCopy`, src/live-text-copy.ts). */
export function makeCarets(c: CopyContext) {
  const { s, Y, doc, text, me, ownClients, authors, agentIds, authorOrigin, applyText } = c;
  const { ports, store, scope, path, clock, start, room, caretsMoved } = s;
  /** Agents whose text this tab wrote, by connection and name: the client id their changes carry, a Yjs id of their own
   * made here (random, as Yjs makes its own, and never one this copy has seen), and where their latest change ended. */
  const agents = new Map<string, { author: number; name: string; who: LiveAuthor; at?: import("yjs").RelativePosition }>();
  const agentAuthor = (who: LiveAuthor) => {
    const key = agentKey(who);
    let found = agents.get(key);
    if (!found) {
      let author: number;
      do author = crypto.getRandomValues(new Uint32Array(1))[0];
      while (author === me || author === doc.clientID || doc.store.clients.has(author) || authors.has(author)
        || [...s.peers.values()].some(peer => (peer.state as { author?: unknown } | null)?.author === author));
      found = { author, name: cut(who.name), who: { grant: who.grant, name: who.name } };
      ownClients.add(author);
    }
    // Latest writer last: past AGENT_CARETS, the room hears of the agents that wrote most recently.
    agents.delete(key);
    agents.set(key, found);
    return found;
  };
  /** An agent's change, put into the copy under its own client id (its origin, so its frames name it and its name tag
   * takes it back), its caret left at the end of its first changed range. */
  const writeAgent = (who: LiveAuthor, changes: TextChange[]) => {
    const agent = agentAuthor(who), origin = authorOrigin(agent.author, true), own = doc.clientID;
    doc.clientID = agent.author;
    try { doc.transact(() => { applyText(changes); }, origin); }
    finally { doc.clientID = own; }
    const first = changes.at(-1);
    if (first) agent.at = Y.createRelativePositionFromTypeIndex(text, Math.min(first.start + first.text.length, text.length));
    tellCaret();
    caretsMoved();
  };

  /** This tab's caret as the room hears it: who it is (the Yjs client id its changes carry, its GitHub name) and where,
   * as relative positions read when it moved (the pane's selection read now, in the text as it is), so text others add
   * meanwhile does not shift it. At most every CARET_MS. */
  let telling: unknown, told: JsonValue | undefined;
  function tellCaret() {
    if (!c.synced || s.discarded || s.stopped) return;
    const at = (index: number) => Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, Math.min(index, text.length))) as JsonValue;
    const now = s.selection?.();
    // The agents whose text this tab wrote: each where its latest change ended (ticket am-25).
    const written = [...agents.values()].filter(agent => agent.at).slice(-AGENT_CARETS).map(agent => {
      const there = Y.relativePositionToJSON(agent.at!) as JsonValue;
      return { author: agent.author, name: agent.name, caret: { anchor: there, head: there } };
    });
    told = { author: me, name: cut(scope.account), caret: now ? { anchor: at(now.anchor), head: at(now.head) } : null,
      ...(c.startClient === undefined ? {} : { start: c.startClient }), ...(written.length ? { agents: written } : {}) };
    telling ??= clock.setTimeout(() => { telling = undefined; if (!s.stopped && told !== undefined) room.setPresence?.(told); }, CARET_MS);
  }
  /** Others' carets in this tab's text: whoever says where theirs is in a copy of this file that this one has the words of. */
  function carets(): LiveCaret[] {
    if (!c.synced || s.discarded) return [];
    const out: LiveCaret[] = [];
    // Someone else's say: only a position in this file's text counts. A named root type is looked up only when it is this
    // text's, as Yjs would make any other name a new empty type in this copy.
    const at = (json: unknown) => {
      if (!json || typeof json !== "object") return undefined;
      const said = json as { tname?: unknown; type?: unknown };
      if ((said.tname != null && said.tname !== "source") || said.type != null) return undefined;
      try {
        const found = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), doc);
        return found?.type === text ? found.index : undefined;
      } catch { return undefined; }
    };
    type Said = { author?: unknown; name?: unknown; agent?: unknown; caret?: { anchor?: unknown; head?: unknown } | null; agents?: unknown };
    /** One caret said: who, by name and author id, and where; `agent` its program, none for a person. */
    const read = (peer: string, said: Said | null, agent: (said: Said) => string | undefined) => {
      if (!said || typeof said !== "object" || !Number.isSafeInteger(said.author) || typeof said.name !== "string" || !said.caret) return;
      const anchor = at(said.caret.anchor), head = at(said.caret.head);
      if (anchor === undefined || head === undefined) return;
      const program = agent(said);
      out.push({ peer, author: said.author as number, name: cut(said.name), ...(program === undefined ? {} : { agent: program }), anchor, head });
    };
    for (const [peer, { access, state }] of s.peers) {
      const said = state as Said | null;
      read(peer, said, said => access === "agent" ? (typeof said.agent === "string" ? cut(said.agent) : "") : undefined);
      // The agents whose text a tab wrote into the copy, where their latest change ended (ticket am-25), named as their commands name them.
      if (access === "editor" && said && typeof said === "object" && Array.isArray(said.agents))
        for (const written of (said.agents as unknown[]).slice(0, AGENT_CARETS))
          if (written && typeof written === "object") read(`${peer}/${(written as Said).author}`, written as Said, said => cut(said.name as string));
    }
    // The agents whose text this tab wrote, drawn here too.
    for (const agent of agents.values()) {
      const index = agent.at && Y.createAbsolutePositionFromRelativePosition(agent.at, doc)?.index;
      if (index !== undefined) out.push({ peer: `agent/${agent.author}`, author: agent.author, name: agent.name, agent: agent.name, who: agent.who, anchor: index, head: index });
    }
    // Two participants naming the same author (or this tab's own id): one of them is not who it says, so neither tag takes anything back.
    const claims = new Map<number, number>();
    for (const caret of out) claims.set(caret.author, (claims.get(caret.author) ?? 0) + 1);
    for (const caret of out) if (caret.author === me || claims.get(caret.author)! > 1) caret.contested = true;
    return out;
  }

  /** Client ids whose text reached this copy from others and that no one here has been named for yet (ticket am-26). */
  const unnamed = new Set<number>();
  /** Who presence says wrote under `id`: a tab (its own id or its draft's), an agent in the room, or one a tab wrote for. */
  function authorNamed(id: number): SaveAuthor | undefined {
    type Said = { author?: unknown; start?: unknown; name?: unknown; agents?: unknown };
    for (const { access, state } of s.peers.values()) {
      const said = state as Said | null;
      if (!said || typeof said !== "object") continue;
      if ((said.author === id || said.start === id) && typeof said.name === "string")
        return access === "agent" ? { name: cut(said.name), agent: true } : { name: cut(said.name) };
      if (access === "editor" && Array.isArray(said.agents))
        for (const written of (said.agents as unknown[]).slice(0, AGENT_CARETS)) {
          const agent = written as Said | null;
          if (agent && typeof agent === "object" && agent.author === id && typeof agent.name === "string") return { name: cut(agent.name), agent: true };
        }
    }
    return undefined;
  }
  /** Notes for the commit everyone presence now names among the ids whose text came from others. */
  function nameAuthors() {
    for (const id of unnamed) {
      const who = authorNamed(id);
      if (who) { (ports.authors ?? saveAuthors()).note(start.key, store.get(scope, path)?.baseSha ?? null, who); unnamed.delete(id); }
    }
  }
  /** The clients whose text an update just added to this copy (their clock moved on from `before`), and `sender`, whose
   * own change (an UPDATE frame) changed the text: a deletion adds no text of its own, only marks others' as deleted, so
   * its author shows only as the frame's sender. This tab's own ids, and the agents it writes for, are not others'. A
   * catch-up repeating text this copy holds already names no one again. The outside participant's and the copy's
   * birth's ids are GitHub's, no one's. */
  function heardFrom(before: Map<number, number>, sender?: number) {
    const clients = [...Y.decodeStateVector(Y.encodeStateVector(doc))].filter(([client, clock]) => clock > (before.get(client) ?? 0)).map(([client]) => client);
    const github = new Set(c.github.versions().map(edge => edge.client));
    for (const client of sender === undefined ? clients : [...clients, sender]) {
      const local = authors.get(client);
      if (client === me || client === c.startClient || github.has(client) || (local && agentIds.has(local.origin)) || unnamed.size >= UNNAMED_LIMIT) continue;
      unnamed.add(client);
    }
    nameAuthors();
  }
  /** The copy goes: a caret waiting to be told is not. */
  const stop = () => { clock.clearTimeout(telling); };
  return { agents, agentAuthor, writeAgent, tellCaret, carets, nameAuthors, heardFrom, stop };
}
export type Carets = ReturnType<typeof makeCarets>;
