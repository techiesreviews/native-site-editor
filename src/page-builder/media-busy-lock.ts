import { button } from "../ui/dom";

export interface MediaBusyLockPorts {
  root: HTMLElement; signal: AbortSignal; tell(text: string): void;
  alive(): boolean; loading(): boolean;
}

export function cancellation(label: string, action: () => void) {
  const control = button(label, action); control.dataset.mediaCancel = label === "Close" ? "close" : "cancel"; return control;
}

export function createBusyLock(ports: MediaBusyLockPorts) {
  let busy = false;
  let pendingTasks = 0;
  let cancellableTask = false;
  let waiting: (() => void)[] = [];
  async function task(work: () => Promise<void>, lock = true, canCancel = false) {
    if (!ports.alive()) return;
    if (lock && ports.loading()) { ports.tell("Repository images are refreshing. Wait for them to finish before making a change."); return; }
    if (busy) { ports.tell("An image change is in progress. Wait for it to finish before making another change."); return; }
    if (lock) { busy = true; cancellableTask = canCancel; }
    pendingTasks++; ports.root.setAttribute("aria-busy", "true");
    setBusyControls();
    try { await work(); } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        ports.tell(error instanceof Error ? error.message : "The image change could not be made.");
    }
    finally {
      if (lock) { busy = false; cancellableTask = false; }
      pendingTasks--;
      if (!pendingTasks) {
        ports.root.removeAttribute("aria-busy");
        const ready = waiting; waiting = []; ready.forEach(resume => resume());
      }
      setBusyControls();
    }
  }
  /** Resolves once no change (or refresh) is running. */
  function idle() {
    return pendingTasks ? new Promise<void>(resume => { waiting.push(resume); }) : Promise.resolve();
  }
  /** Close, and cancelling files being added, always work; a cancellable change's Cancel while it runs. */
  function canUseCancellation(control: Element) {
    return ["close", "adding"].includes(control.getAttribute("data-media-cancel") ?? "") || cancellableTask && control.hasAttribute("data-media-cancel");
  }
  function setBusyControls() {
    for (const control of ports.root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("input,button,select,textarea")) {
      if (busy && !canUseCancellation(control)) control.setAttribute("aria-disabled", "true"); else control.removeAttribute("aria-disabled");
      if (control instanceof HTMLInputElement && control.type !== "checkbox" && control.type !== "file" || control instanceof HTMLTextAreaElement) control.readOnly = busy;
    }
  }
  ports.root.addEventListener("click", event => {
    if (!busy || !(event.target instanceof Element)
      || canUseCancellation(event.target.closest("button,input,select") ?? event.target)
      || !event.target.closest("button,input,select")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    ports.tell("An image change is in progress. Wait for it to finish before making another change.");
  }, { capture: true, signal: ports.signal });
  ports.root.addEventListener("keydown", event => {
    if (!busy || event.target instanceof Element && canUseCancellation(event.target.closest("button,input,select") ?? event.target)
      || !["Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      && !(event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    ports.tell("An image change is in progress. Wait for it to finish before making another change.");
  }, { capture: true, signal: ports.signal });
  return { task, idle, cancellation, sync: setBusyControls, get busy() { return busy; } };
}
