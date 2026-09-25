import type { Repository } from "../shared/types";
import { changeStatusFromRuns, type ChangeStatus, type WorkflowRun } from "../shared/change-status";
import { GitHub, HttpError } from "./github";

/**
 * `GET /api/change-status?repo&sha`: the Change status of a saved commit from
 * its GitHub Actions workflow runs (see shared/change-status.ts). Needs the
 * GitHub App's Actions: read permission; without it GitHub answers 403 (or
 * 404 where Actions is off) and the status is `unavailable`, which the editor
 * shows as plain "Saved". The token stays in the Worker.
 */
export async function changeStatus(github: GitHub, repo: Repository, sha: string): Promise<ChangeStatus> {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new HttpError(400, "Invalid commit.");
  const base = github.base(repo);
  try {
    const runs = await github.get<{ workflow_runs?: WorkflowRun[] }>(
      `${base}/actions/runs?${new URLSearchParams({ head_sha: sha, per_page: "30" })}`,
      1024 * 1024,
    );
    const list = runs.workflow_runs ?? [];
    if (list.length) return changeStatusFromRuns(list, list.length);
    // No run yet: a repository with workflows is about to queue one; one
    // without them never will.
    const workflows = await github.get<{ total_count?: number; workflows?: { state?: string }[] }>(
      `${base}/actions/workflows?per_page=100`,
      1024 * 1024,
    );
    const active = (workflows.workflows ?? []).filter((workflow) => !workflow.state || workflow.state === "active").length;
    return changeStatusFromRuns([], active);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 403 || error.status === 404)) return { state: "unavailable" };
    throw error;
  }
}
