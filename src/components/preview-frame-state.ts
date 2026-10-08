/**
 * The preview frame's lifecycle, apart from the DOM (native-preview.ts).
 *
 * The frame is attached once, as early as a native repo is known (`preload`),
 * parked hidden and inert so its runtime loads alongside the boot reads. It
 * never moves after that: `activate` shows it, `deactivate` parks it again and
 * reloads its document so no page or asset of the old site survives.
 *
 * - `active`: the pane is shown and owns the page (the old `mounted`).
 * - `ready`: the current frame document reported `ready`.
 * - The ready watchdog is armed for every frame load while attached, parked
 *   or not, and disarmed on `ready` or `destroy`.
 */
export interface PreviewFramePorts {
  /** Put the pane in its host (once). */
  attach(): void;
  /** Hide the attached pane: hidden, inert, out of the accessibility tree. */
  park(): void;
  /** Show the parked pane. */
  unpark(): void;
  /** Navigate the frame to a fresh runtime document. */
  reload(): void;
  armWatchdog(): void;
  disarmWatchdog(): void;
  /** Shown over a frame that was already ready: send avoid/theme/focus again. */
  resync(): void;
}

export function createPreviewFrameState(ports: PreviewFramePorts) {
  let attached = false, active = false, ready = false;
  const attach = () => {
    if (attached) return;
    attached = true;
    ports.attach();
    ports.park();
    // Attaching loads the srcdoc document, which must report `ready`.
    ports.armWatchdog();
  };
  return {
    get attached() { return attached; },
    get active() { return active; },
    get ready() { return ready; },
    /** Whether messages that draw the page may be sent. */
    get canPost() { return active && ready; },
    /** Load the runtime early, parked. No-op once attached. */
    preload: attach,
    /** Show the pane. Returns false when it was already active. */
    activate() {
      attach();
      if (active) return false;
      active = true;
      ports.unpark();
      if (ready) ports.resync();
      return true;
    },
    /** The current frame document loaded. Returns whether the pane is active. */
    markReady() {
      ready = true;
      ports.disarmWatchdog();
      return active;
    },
    /** Park the pane and reload its frame. Returns false when it was not active. */
    deactivate() {
      if (!active) return false;
      active = false;
      ports.park();
      ready = false;
      ports.reload();
      ports.armWatchdog();
      return true;
    },
    destroy() {
      ports.disarmWatchdog();
      attached = active = ready = false;
    },
  };
}

export type PreviewFrameState = ReturnType<typeof createPreviewFrameState>;
