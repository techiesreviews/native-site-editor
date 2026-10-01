// The Setup wizard sends the user to GitHub in a new tab. That tab comes back
// to the editor signed in; if the tab that is waiting is still open, it takes
// over and the new one only says so. Messages travel over a BroadcastChannel;
// where there is none, the waiting tab finds out by polling and on focus.

const CHANNEL = "native-site-editor:setup-wizard";

type Message = { type: "connected" | "ack" };

function channel(): BroadcastChannel | undefined {
  try {
    return typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : undefined;
  } catch {
    return undefined;
  }
}

/** Tells a waiting wizard tab that GitHub has come back; true when one answered in time. */
export function announceConnected(timeout = 700): Promise<boolean> {
  const bus = channel();
  if (!bus) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (answer: boolean) => {
      clearTimeout(timer);
      bus.close();
      resolve(answer);
    };
    const timer = setTimeout(() => done(false), timeout);
    bus.onmessage = (event: MessageEvent<Message>) => {
      if (event.data?.type === "ack") done(true);
    };
    bus.postMessage({ type: "connected" } satisfies Message);
  });
}

/** While this tab waits for GitHub: answers a tab that came back, and calls `onConnected`. Returns how to stop. */
export function listenForConnected(onConnected: () => void): () => void {
  const bus = channel();
  if (!bus) return () => undefined;
  bus.onmessage = (event: MessageEvent<Message>) => {
    if (event.data?.type !== "connected") return;
    bus.postMessage({ type: "ack" } satisfies Message);
    onConnected();
  };
  return () => bus.close();
}
