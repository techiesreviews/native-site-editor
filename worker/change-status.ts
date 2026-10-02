import type { Repository } from "../shared/types";
import { changeStatusFromRuns, type ChangeStatus, type WorkflowRun } from "../shared/change-status";
import { GitHub, HttpError } from "./github";

/** A check run as GitHub lists it (`GET /repos/{owner}/{repo}/commits/{ref}/check-runs`). */
interface CheckRun extends WorkflowRun {
  details_url?: string | null;
  app?: { slug?: string } | null;
}

/**
 * `GET /api/change-status?repo&sha`: the Change status of a saved commit (see
 * shared/change-status.ts), from its GitHub Actions workflow runs and the
 * check runs other apps report on it: Cloudflare Workers Builds and Pages
 * deploy a push without a workflow and report it as a check run. Actions'
 * own check runs are left out (their workflow runs say it). Each source needs
 * the GitHub App's permission (Actions: read, Checks: read); one GitHub
 * refuses (403, or 404 where Actions is off) is left out, and with neither
 * the status is `unavailable`, which the editor shows as plain "Saved". The
 * token stays in the Worker.
 */
export async function changeStatus(github: GitHub, repo: Repository, sha: string): Promise<ChangeStatus> {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new HttpError(400, "Invalid commit.");
  const base = github.base(repo);
  const allowed = <T>(read: Promise<T>) => read.catch((error) => {
    if (error instanceof HttpError && (error.status === 403 || error.status === 404)) return undefined;
    throw error;
  });
  const checksOf = async (commit: string) => {
    const data = await allowed(github.get<{ check_runs?: CheckRun[] }>(
      `${base}/commits/${commit}/check-runs?${new URLSearchParams({ filter: "latest", per_page: "50" })}`,
      1024 * 1024,
    ));
    // The host's own page for the run (its build log), else GitHub's.
    return data && (data.check_runs ?? [])
      .filter((run) => run.app?.slug !== "github-actions")
      .map((run): WorkflowRun => ({ name: run.name, status: run.status, conclusion: run.conclusion, html_url: run.details_url || run.html_url }));
  };
  const [runs, checks] = await Promise.all([
    allowed(github.get<{ workflow_runs?: WorkflowRun[] }>(
      `${base}/actions/runs?${new URLSearchParams({ head_sha: sha, per_page: "30" })}`,
      1024 * 1024,
    )).then((data) => data && (data.workflow_runs ?? [])),
    checksOf(sha),
  ]);
  if (!runs && !checks) return { state: "unavailable" };
  const all = [...(runs ?? []), ...(checks ?? [])];
  if (all.length) return changeStatusFromRuns(all, all.length);
  // Nothing yet. Active workflows are about to queue a run, and a host that
  // checked the commit before this one will check this one; else none will.
  let expected = 0;
  if (runs) {
    const workflows = await github.get<{ workflows?: { state?: string }[] }>(`${base}/actions/workflows?per_page=100`, 1024 * 1024);
    expected += (workflows.workflows ?? []).filter((workflow) => !workflow.state || workflow.state === "active").length;
  }
  if (!expected && checks) {
    const commit = await github.get<{ parents?: { sha: string }[] }>(`${base}/git/commits/${sha}`);
    const parent = commit.parents?.[0]?.sha;
    if (parent) expected += (await checksOf(parent))?.length ?? 0;
  }
  return changeStatusFromRuns([], expected);
}
