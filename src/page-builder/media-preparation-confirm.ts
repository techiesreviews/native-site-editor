import { createConfirmDialog } from "../components/confirm-dialog";

let pending = Promise.resolve();
let confirmation: ReturnType<typeof createConfirmDialog> | undefined;
/** One dialog for both adding paths, loaded only when preparation needs consent. */
export function askToAddUnchanged(question: string): Promise<boolean> {
  // Files and the pane may fail together; each question must receive its own answer.
  const answer = pending.then(() => ask(question));
  pending = answer.then(() => {}, () => {});
  return answer;
}

function ask(question: string): Promise<boolean> {
  confirmation ??= createConfirmDialog("media-preparation-confirm");
  // Inside the open popover (the explorer, with Files or Media), a modal question leaves it open
  // behind, so the adding summary stays in view; otherwise on the page.
  const host = [...document.querySelectorAll<HTMLElement>(":popover-open")].at(-1) ?? document.body;
  if (confirmation.root.parentElement !== host) host.append(confirmation.root);
  return confirmation.ask({ title: "Add unchanged file?", notes: [question], action: "Add unchanged", cancel: "Don't add" });
}
