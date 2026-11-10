import type { mountCodeResize, mountCodeWidthResize } from "../components/code-resize";

export interface CodePanesPorts<T> {
  /** The lazy Monaco view chunk (`import("./components/code-editor")`). */
  load(): Promise<T>;
  /** Chunk recovery owns the reload policy for a failed import. */
  onChunkFailure(error: unknown): void;
  mountCodeResize: typeof mountCodeResize;
  mountCodeWidthResize: typeof mountCodeWidthResize;
  /** Scheduling seams; production uses the browser's. Free functions: callers pass them without a receiver. */
  frame?: (callback: () => void) => void;
  idle?: (callback: () => void) => void;
  wait?: (ms: number) => Promise<void>;
  delay?: (callback: () => void, ms: number) => void;
}

/**
 * Owns the code panes' Monaco load gate and their height/width resize handles.
 *
 * Monaco (the code editor chunk, ~1 MB gzip) loads only for a code pane that
 * is shown: a closed pane (the default, faster-opening 02) never loads it on
 * its own, and opening the pane loads it then. A pane left open never
 * competes with the reads the preview needs: a native site's code panes show
 * their code once the preview has painted, the boot reads have settled and
 * the browser is idle. Edits, drafts, Undo/Redo and Save never wait for it
 * (they work from the draft store); reaching for the code (opening or
 * clicking a code pane, the Review diff) loads it at once. Importing the
 * module attaches its view to every mounted pane.
 */
export function createCodePanesController<T>(ports: CodePanesPorts<T>) {
  const frame = ports.frame ?? ((callback: () => void) => void requestAnimationFrame(callback));
  const wait = ports.wait ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const delay = ports.delay ?? ((callback: () => void, ms: number) => void setTimeout(callback, ms));
  const idle = ports.idle ?? ((callback: () => void) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(callback, { timeout: 1500 });
    else setTimeout(callback, 200);
  });

  let loading: Promise<T> | undefined;
  function loadModule() {
    return (loading ??= ports.load().catch((error) => {
      loading = undefined;
      ports.onChunkFailure(error);
      throw error;
    }));
  }

  let gateOpen = false;
  let openGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    openGate = () => { gateOpen = true; resolve(); };
  });
  let codeResize: ReturnType<typeof mountCodeResize> | undefined;
  let codeWidthResize: ReturnType<typeof mountCodeWidthResize> | undefined;
  // The site the latest pane opened for has no preview (plain files): its
  // code pane always shows.
  let plainFiles = false;
  // A closed pane waits until it is opened (its handle's onOpen asks for the code).
  const paneClosed = () => !plainFiles && (codeResize?.collapsed() ?? false);
  let bootDeferred = false;
  let previewPainted = false;
  let readsInFlight = 0;

  function want() {
    openGate();
    return loadModule();
  }
  // The first preview paint (the runtime has rendered and reported the page's
  // structure): Monaco follows once the reads settle and the browser is idle.
  function notePreviewPainted() {
    // A closed pane hides once there is a preview beside it.
    codeResize?.apply();
    if (previewPainted || gateOpen) return;
    previewPainted = true;
    // The runtime reports the structure just before the frame presents it:
    // two frames and a beat later the page is on screen.
    frame(() => frame(() => void (async () => {
      await wait(100);
      // The page's remaining reads (styles, images, the site's text index) go first, for at most 3 s.
      for (let waited = 0; readsInFlight > 0 && waited < 3000 && !gateOpen; waited += 100)
        await wait(100);
      if (gateOpen) return;
      idle(() => { if (!paneClosed()) void want().catch(() => {}); });
    })()));
  }
  // Resolves with Monaco's module: at once when the editor is wanted, once the
  // pane is opened while it is hidden, else (a native site's first code pane)
  // once the preview has painted. A preview that never paints (an error) does
  // not hold the code of a shown pane back for long.
  function whenDue(defer: boolean) {
    if (gateOpen || (!defer && !paneClosed())) return want();
    if (defer) delay(() => { if (!paneClosed()) openGate(); }, 8000);
    return gate.then(loadModule);
  }
  // Only a native site's first code pane, shown, waits for the preview; any
  // later open was asked for and loads the editor at once, unless the pane is
  // closed beside a preview.
  function deferPane(native: boolean) {
    plainFiles = !native;
    // Plain files have no preview: a closed pane shows again.
    codeResize?.apply();
    const defer = !gateOpen && !bootDeferred && native && !paneClosed();
    bootDeferred = true;
    return defer;
  }
  async function trackRead<R>(read: () => Promise<R>): Promise<R> {
    readsInFlight++;
    try {
      return await read();
    } finally {
      readsInFlight--;
    }
  }

  function mountResize(main: HTMLElement, split: HTMLElement, secondary: HTMLElement) {
    // Opening the pane (its handle, a drag, Show code) fetches the code.
    codeResize = ports.mountCodeResize(main, split, () => void want().catch(() => {}));
    // Reaching for the shown code before Monaco's idle load fetches it now;
    // pressing or focusing the handle of a closed pane does not. Not `once`:
    // a press while the pane is closed must not use the listener up, and
    // `want()` loads the module only once.
    for (const type of ["pointerdown", "focusin"])
      split.addEventListener(type, () => { if (!paneClosed()) void want().catch(() => {}); });
    codeWidthResize = ports.mountCodeWidthResize(split, split.querySelector<HTMLElement>(".code-pane")!, secondary);
  }

  return {
    want,
    whenDue,
    deferPane,
    notePreviewPainted,
    trackRead,
    mountResize,
    /** The height handle once mounted (toggle and state). */
    heightResize: () => codeResize,
    applyWidth: () => codeWidthResize?.apply(),
  };
}
