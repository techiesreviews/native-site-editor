// Who writes the drafts at this moment, when it is an agent (ticket am-25). An agent's change is written
// into this tab's drafts synchronously (src/agent-site.ts, the guarded commit's publish); while it is, the
// open file's shared copy (src/live-text.ts) reads the agent here and puts that text change into the copy
// under the agent's own Yjs client id, so its words carry its name and its caret's name tag takes back only
// them. Kept apart from live-text so the agent's side never loads the shared copy's code.

/** The agent a draft change is being written for: its connection and the name it gave itself. */
export interface LiveAuthor { grant: string; name: string }

let writing: LiveAuthor | undefined;

/** Runs `write` (synchronous) with `author` as the one writing the drafts. */
export function writeAs<T>(author: LiveAuthor, write: () => T): T {
  const before = writing;
  writing = author;
  try { return write(); } finally { writing = before; }
}

/** The agent writing the drafts now; none for this tab's own changes. */
export const liveAuthor = (): LiveAuthor | undefined => writing;
