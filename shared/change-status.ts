// Change status: what became of a saved commit on the site's host, read from
// the GitHub Actions workflow runs for that commit (the starter's deploy
// workflow runs on every push to main). Shared by the Worker endpoint
// (`/api/change-status`, worker/change-status.ts) and the browser
// (src/components/site-actions.ts).
//
// - `none`: the repository has no workflows, or every run for the commit was
//   cancelled or skipped; the editor shows "Saved" and stops asking.
// - `unavailable`: GitHub refused (the app lacks Actions: read); "Saved", stop.
// - `waiting`: there are workflows but no run for the commit yet (GitHub
//   takes a few seconds to queue one); "Saved", ask again for a while.
// - `building`: a run is queued or in progress; "Building".
// - `live`: the runs succeeded; "Live".
// - `failed`: a run failed; "Failed", linking to that run.

export type ChangeState = "none" | "unavailable" | "waiting" | "building" | "live" | "failed";

export interface ChangeStatus {
  state: ChangeState;
  /** The run on GitHub that decided the state (the failed one, the running one, the successful one). */
  url?: string;
  /** That run's workflow name. */
  name?: string;
}

/** A workflow run as GitHub lists it (`GET /repos/{owner}/{repo}/actions/runs`). */
export interface WorkflowRun {
  name?: string | null;
  status?: string | null;
  conclusion?: string | null;
  html_url?: string;
}

// Conclusions that say nothing about the commit: a newer push cancelled the
// run (the starter's `cancel-in-progress`), or its conditions skipped it.
const SUPERSEDED = new Set(["cancelled", "skipped", "neutral", "stale"]);

/** The status of a commit from its workflow runs; `workflows` is how many the repository has. */
export function changeStatusFromRuns(runs: WorkflowRun[], workflows: number): ChangeStatus {
  if (!runs.length) return { state: workflows > 0 ? "waiting" : "none" };
  const pick = (run: WorkflowRun, state: ChangeState): ChangeStatus => ({
    state,
    ...(run.html_url ? { url: run.html_url } : {}),
    ...(run.name ? { name: run.name } : {}),
  });
  const failed = runs.find((run) => run.status === "completed" && !SUPERSEDED.has(run.conclusion ?? "") && run.conclusion !== "success");
  if (failed) return pick(failed, "failed");
  const running = runs.find((run) => run.status !== "completed");
  if (running) return pick(running, "building");
  const succeeded = runs.find((run) => run.conclusion === "success");
  if (succeeded) return pick(succeeded, "live");
  return { state: "none" };
}

/** Whether the state can still change, so the browser asks again. */
export function changeStatusPending(state: ChangeState) {
  return state === "waiting" || state === "building";
}

/** The words the editor shows for a state (CONTEXT.md: Saved, Building, Live, Failed). */
export function changeStatusLabel(state: ChangeState) {
  return state === "building" ? "Building" : state === "live" ? "Live" : state === "failed" ? "Failed" : "Saved";
}
