// The fake adapter of the preview link's seam (src/components/preview-link.ts):
// it records what the host posts and answers as the runtime does, stamping
// each message with the render token of the last `update` unless told another.
import { FRAME_SOURCE, type FrameMessage, type HostMessage } from "../../src/components/preview-protocol";
import type { FramePort } from "../../src/components/preview-link";

export function createFakeFrame() {
  const posted: HostMessage[] = [];
  let receive: ((data: unknown) => void) | undefined;
  const port: FramePort = {
    post: (message) => { posted.push(message); },
    listen(listener) {
      receive = listener;
      return () => { receive = undefined; };
    },
  };
  const all = <T extends HostMessage["type"]>(type: T) => posted.filter((message): message is Extract<HostMessage, { type: T }> => message.type === type);
  const context = () => all("update").at(-1)?.payload.context ?? "";
  return {
    port,
    posted,
    /** Posted messages of one type, oldest first. */
    all,
    /** The last posted message of one type. */
    last: <T extends HostMessage["type"]>(type: T) => all(type).at(-1),
    /** The render token of the last `update` posted ("" before any). */
    context,
    /** Whether the link listens. */
    listening: () => Boolean(receive),
    /** Post a message as the runtime would: `fields` after `source`, `type` and `context`. */
    emit(type: FrameMessage["type"], fields: Record<string, unknown> = {}, options: { context?: string } = {}) {
      receive?.({ source: FRAME_SOURCE, type, context: Object.hasOwn(options, "context") ? options.context : context(), ...fields });
    },
  };
}

export type FakeFrame = ReturnType<typeof createFakeFrame>;
