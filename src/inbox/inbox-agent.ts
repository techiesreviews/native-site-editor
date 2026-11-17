// Fix with AI's agent (TOOLS-253): the editor's connected agent, asked through the agent channel it already watches.
// Each suggestion is one request about the item's element (as Ask agent sends one, src/controllers/agent-controller.ts),
// asking for the words only and no change; its reply's words are the suggestion, and the request is let go once
// answered, so no pin is left on the page. Loaded with the Inbox's list; tested in tests/inbox-agent.test.ts.
//
// How a suggestion settles, checked in this order each time the menu tells its requests (or the connection changes):
//   1. a reply with words: the suggestion, and the request is let go;
//   2. a reply that asks back: fails, and the request stays on its pin for the user to answer;
//   3. the request gone after it was seen (dismissed on its pin, or another site opened): fails; nothing is left to let go
//      here (another site's request stays with that site);
//   4. no agent connected any more: after DISCONNECT_GRACE_MS (a reply the menu was still saving as the agent left
//      arrives in it and wins, as 1), fails, and the request is let go;
//   5. SUGGESTION_WAIT_MS with none of these: fails, and the request is let go.
// The request is asked only while the session it was pressed in holds (another site or branch, or a reload, refuses it).
import type { AgentElement } from "../../shared/agent";
import type { PinRequest } from "../components/agent-pins";
import { watchReplies } from "../agent-replies";
import type { InboxAgent } from "./inbox-fixes";
import type { InboxItem } from "./inbox-item";

/** The agent connection as Fix with AI uses it: the agent controller's. */
export interface InboxAgentLink {
  connected(): boolean;
  ask(text: string, element: AgentElement): Promise<unknown>;
  dismiss(id: string): unknown;
}

/** How long a suggestion waits for the agent's reply. */
export const SUGGESTION_WAIT_MS = 3 * 60_000;
/** How long a suggestion still waits for a reply once the agent went away. */
export const DISCONNECT_GRACE_MS = 2_000;

const KEEP = "Change nothing on the site. Reply with reply_to_request, giving only the words, nothing else.";

/** What the agent is asked for an item: what is missing, why it matters, and that it only suggests. */
export function suggestionPrompt(item: InboxItem) {
  const shared = item.shared ? ` It is in the shared part ${item.shared.name}, shown on ${item.shared.pages.length} page${item.shared.pages.length === 1 ? "" : "s"}.` : "";
  if (item.fix === "alt")
    return `Suggest alt text for this picture: a short description (under 125 characters) for people who cannot see it.${shared} ${KEEP}`;
  if (item.fix === "name")
    return `This link has no name a screen reader can read. Suggest a short name for it that says where it goes.${shared} ${KEEP}`;
  return `This link only says “${item.words ?? ""}”. Suggest short link words that say where it goes.${shared} ${KEEP}`;
}

export function createInboxAgent(ports: {
  link(): InboxAgentLink | undefined;
  /** The element an item is about, as agents are told it; none when it cannot be pointed out. */
  element(item: InboxItem): Promise<AgentElement | undefined>;
  /** The session now: the request is sent only while the one it was pressed in holds. */
  stamp?(): { holds(): boolean };
  watch?: typeof watchReplies;
  clock?: { setTimeout(run: () => void, ms: number): unknown; clearTimeout(timer: unknown): void };
}): InboxAgent {
  const watch = ports.watch ?? watchReplies;
  const clock = ports.clock ?? { setTimeout: (run: () => void, ms: number) => setTimeout(run, ms), clearTimeout: (timer: unknown) => clearTimeout(timer as number) };
  return {
    connected: () => ports.link()?.connected() ?? false,
    async suggest(item) {
      const link = ports.link();
      if (!link?.connected()) throw new Error("No agent is connected.");
      const session = ports.stamp?.();
      const element = await ports.element(item);
      if (!element) throw new Error("This part of the page cannot be pointed out to an agent.");
      // Another site, branch or load opened while the element was read: this element is not the open site's.
      if (session && !session.holds()) throw new Error("The site changed. Nothing was asked.");
      const asked = await link.ask(suggestionPrompt(item), element) as Pick<PinRequest, "id"> | undefined;
      const id = asked?.id;
      if (!id) throw new Error("The request did not reach the agent.");
      return await new Promise<string>((resolve, reject) => {
        let stop: (() => void) | undefined, settled = false;
        let grace: unknown;
        const finish = (outcome: () => void, letGo: boolean) => {
          if (settled) return;
          settled = true;
          clock.clearTimeout(timer);
          if (grace !== undefined) clock.clearTimeout(grace);
          // Inside watch's first call `stop` is not there yet: it is called once watch returns.
          stop?.();
          if (letGo) void Promise.resolve(link.dismiss(id)).catch(() => undefined);
          outcome();
        };
        const timer = clock.setTimeout(() => finish(() => reject(new Error("The agent did not answer in time.")), true), SUGGESTION_WAIT_MS);
        // The request is in the list once the menu tells it; a list without it after that is a dismissal elsewhere (its pin, another tab).
        let seen = false;
        stop = watch(requests => {
          const request = requests.find(found => found.id === id);
          if (request) seen = true;
          const reply = request?.reply;
          // A question back stays on its pin for the user to answer there.
          if (reply?.status === "question") { finish(() => reject(new Error("The agent asked a question on its pin.")), false); return; }
          if (reply) { finish(() => resolve(reply.message), true); return; }
          if (!request && seen) { finish(() => reject(new Error("The request was dismissed.")), false); return; }
          // The agent went away while this waited (Disconnect MCP): a reply still being saved may follow at once. Back
          // within the grace, the wait goes on as before.
          if (link.connected()) {
            if (grace !== undefined) { clock.clearTimeout(grace); grace = undefined; }
          } else if (grace === undefined) grace = clock.setTimeout(() => {
            grace = undefined;
            if (!link.connected()) finish(() => reject(new Error("The agent is no longer connected.")), true);
          }, DISCONNECT_GRACE_MS);
        });
        if (settled) stop();
      });
    },
  };
}
