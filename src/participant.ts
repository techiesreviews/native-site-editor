// Who someone is, as every view draws them (sweep 2026-11-10, item 3): one person or agent keeps one colour, one
// shown name and one initial on its outline and chip, its pin, the MCP menu, its caret and a guest's chip. Each
// view asks here instead of working them out itself, so the same agent never shows in two colours at once.
//
// Colours are the four presence colours (src/theme.css; a caret's and a guest chip's CSS name them by index). A tab
// gives them from a colour book: the least used of those it holds, so the first four it meets each get their own.
// Agents are held for the session (in order of arrival), a session's guests while they are in. Someone this tab does
// not know (another tab's person or agent, seen only by their caret) takes the colour of the Yjs client id their
// changes carry, which every tab reads the same.

import { AGENT_NAME_LIMIT, type AgentWho } from "../shared/agent";

/** The presence colours, theme tokens by index: the MCP green, the components' violet, video pink, data teal (src/theme.css). */
export const AGENT_COLOURS = ["agent-presence", "agent-presence-2", "agent-presence-3", "agent-presence-4"] as const;
/** What someone is: an agent, a person in the shared text (a signed-in tab), or a guest of a synced session. */
export type ParticipantKind = "agent" | "person" | "guest";
/** Who someone is, as every view draws them: `colour` an index into AGENT_COLOURS. */
export interface Participant { key: string; name: string; initial: string; colour: number }

/** The name shown for someone who gives none. */
const UNNAMED: Record<ParticipantKind, string> = { agent: "Agent", person: "Someone", guest: "Guest" };
/** Characters that show nothing and can hide or spoof a name: zero-width spaces, the soft hyphen, the word joiner and
 * invisible operators, direction marks and controls, and the Hangul fillers. The joiners a word or an emoji needs (U+200C, U+200D) and tag characters stay. */
const INVISIBLE = /[\u00AD\u061C\u180E\u200B\u200E\u200F\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069\u115F\u1160\u3164\uFFA0]/g;
/** Space, and a joiner with nothing to join, at either end. */
const ENDS = /^[\s\u200C\u200D]+|[\s\u200C\u200D]+$/g;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const segments = (text: string) => [...graphemes.segment(text)].map(part => part.segment);

/** The name shown for `name`, what someone says of itself: one line, nothing invisible, at most AGENT_NAME_LIMIT
 * characters (never cut inside one), else its kind's own ("Agent", "Someone", "Guest"). */
export function shownName(name: string, kind: ParticipantKind) {
  const line = name.replace(INVISIBLE, "").replace(/[\u0000-\u001f\u007f\s]+/g, " ").replace(ENDS, "");
  return segments(line).slice(0, AGENT_NAME_LIMIT).join("").replace(ENDS, "") || UNNAMED[kind];
}

/** A character that can stand for a name: a letter, a digit or an emoji (a flag too). */
const STANDS = /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
/** The initial of `name`: `letter`, its first letter, digit or emoji (with its accents, a whole emoji) upper-cased, one
 * character still ("ß" is "SS": the first), "·" when there is none; `first`, `name` up to and with it, and `rest` after. */
export function initialOf(name: string) {
  let first = "";
  for (const part of segments(name)) {
    first += part;
    if (STANDS.test(part)) return { first, letter: segments(part.toLocaleUpperCase())[0], rest: name.slice(first.length) };
  }
  return { first: "", letter: "·", rest: name };
}

/** A tab's colours for those it holds, by key: each keeps the one it was given, the least used then (the lowest on a tie). */
export function createColourBook() {
  const held = new Map<string, number>();
  return {
    /** `key`'s colour: given now if it has none. */
    colour(key: string) {
      if (!held.has(key)) {
        const use = AGENT_COLOURS.map(() => 0);
        for (const given of held.values()) use[given]++;
        held.set(key, use.indexOf(Math.min(...use)));
      }
      return held.get(key)!;
    },
    /** Where `key` came in among those held (-1: never): an agent's order of arrival. */
    order: (key: string) => [...held.keys()].indexOf(key),
    /** `key` gives its colour back (a guest left). */
    forget: (key: string) => held.delete(key),
  };
}
export type ColourBook = ReturnType<typeof createColourBook>;

/** An agent's key: its connection and the name it works under. */
export const agentKey = (who: AgentWho) => JSON.stringify([who.grant, who.name]);

/** Who someone is from `key`, the name they give as their kind shows it, and their colour. */
const participant = (key: string, given: string, kind: ParticipantKind, colour: number): Participant => {
  const name = shownName(given, kind);
  return { key, name, initial: initialOf(name).letter, colour };
};

/** The participants a tab draws: the agents it meets, each with its colour from the tab's book. */
export function createParticipants(agents: ColourBook = createColourBook()) {
  const agent = (who: AgentWho) => { const key = agentKey(who); return participant(key, who.name, "agent", agents.colour(key)); };
  return {
    agent,
    /** The agent of `key` (agentKey)'s place in this tab's order of arrival (-1: not met). */
    order: (key: string) => agents.order(key),
    /** Someone's caret: an agent this tab writes for (`who`) as `agent` draws it; anyone else in the colour of the
     * client id their changes carry (`author`), so every tab agrees. */
    caret(caret: { author: number; name: string; agent?: string; who?: AgentWho }): Participant {
      return caret.who ? agent(caret.who)
        : participant(`author:${caret.author}`, caret.name, caret.agent === undefined ? "person" : "agent", Math.abs(caret.author) % AGENT_COLOURS.length);
    },
  };
}
export type Participants = ReturnType<typeof createParticipants>;

/** This tab's participants: its agent presence (src/main.ts) and its carets draw from the same. */
export const participants = createParticipants();
