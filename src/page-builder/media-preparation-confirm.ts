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
  if (!confirmation) {
    confirmation = createConfirmDialog("media-preparation-confirm");
    document.body.append(confirmation.root);
  }
  return confirmation.ask({ title: "Add unchanged file?", notes: [question], action: "Add unchanged", cancel: "Don't add" });
}
