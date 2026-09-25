import { test } from "node:test";
import assert from "node:assert/strict";
import { changeStatusFromRuns, changeStatusLabel, changeStatusPending } from "../shared/change-status.ts";
import { changeStatus } from "../worker/change-status.ts";
import { GitHub } from "../worker/github.ts";
import type { Repository } from "../shared/types.ts";

const run = (status: string, conclusion: string | null = null, name = "Deploy", id = 1) => ({
  name,
  status,
  conclusion,
  html_url: `https://github.com/lex/site/actions/runs/${id}`,
});

test("workflow runs map to Saved, Building, Live and Failed", () => {
  assert.deepEqual(changeStatusFromRuns([], 0), { state: "none" });
  assert.deepEqual(changeStatusFromRuns([], 2), { state: "waiting" });
  for (const status of ["queued", "in_progress", "waiting", "requested", "pending"])
    assert.equal(changeStatusFromRuns([run(status)], 1).state, "building");
  assert.deepEqual(changeStatusFromRuns([run("completed", "success")], 1), {
    state: "live",
    url: "https://github.com/lex/site/actions/runs/1",
    name: "Deploy",
  });
  for (const conclusion of ["failure", "timed_out", "startup_failure", "action_required"])
    assert.equal(changeStatusFromRuns([run("completed", conclusion)], 1).state, "failed");
  // A failure wins over a run still going, and links to the failed run.
  assert.deepEqual(changeStatusFromRuns([run("in_progress", null, "Lint", 1), run("completed", "failure", "Deploy", 2)], 2), {
    state: "failed",
    url: "https://github.com/lex/site/actions/runs/2",
    name: "Deploy",
  });
  // One run done, another still going: still building.
  assert.equal(changeStatusFromRuns([run("completed", "success", "Lint", 1), run("queued", null, "Deploy", 2)], 2).state, "building");
  // Cancelled (a newer push) and skipped runs say nothing about the commit.
  assert.equal(changeStatusFromRuns([run("completed", "cancelled")], 1).state, "none");
  assert.equal(changeStatusFromRuns([run("completed", "skipped"), run("completed", "success", "Deploy", 2)], 2).state, "live");
  assert.deepEqual(["none", "unavailable", "waiting", "building", "live", "failed"].map((state) => changeStatusLabel(state as never)),
    ["Saved", "Saved", "Saved", "Building", "Live", "Failed"]);
  assert.deepEqual(["none", "unavailable", "waiting", "building", "live", "failed"].filter((state) => changeStatusPending(state as never)),
    ["waiting", "building"]);
});

const repo: Repository = {
  id: 1,
  name: "site",
  full_name: "lex/site",
  owner: { login: "lex", type: "User" },
  private: true,
  default_branch: "main",
};
const sha = "a".repeat(40);

function github(answer: (path: string, search: URLSearchParams) => Response) {
  const calls: string[] = [];
  const client = new GitHub("private-token", async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    return answer(url.pathname, url.searchParams);
  });
  return { client, calls };
}

test("the endpoint reads the commit's runs, and the workflows when there are none", async () => {
  const running = github((path, search) => {
    assert.equal(path, "/repos/lex/site/actions/runs");
    assert.equal(search.get("head_sha"), sha);
    return Response.json({ total_count: 1, workflow_runs: [run("in_progress")] });
  });
  assert.equal((await changeStatus(running.client, repo, sha)).state, "building");
  assert.equal(running.calls.length, 1);

  const pending = github((path) => path.endsWith("/actions/runs")
    ? Response.json({ total_count: 0, workflow_runs: [] })
    : Response.json({ total_count: 2, workflows: [{ state: "active" }, { state: "disabled_manually" }] }));
  assert.deepEqual(await changeStatus(pending.client, repo, sha), { state: "waiting" });
  assert.deepEqual(pending.calls.map((call) => call.split("?")[0]), ["/repos/lex/site/actions/runs", "/repos/lex/site/actions/workflows"]);

  const none = github((path) => path.endsWith("/actions/runs")
    ? Response.json({ total_count: 0, workflow_runs: [] })
    : Response.json({ total_count: 0, workflows: [] }));
  assert.deepEqual(await changeStatus(none.client, repo, sha), { state: "none" });
});

test("without Actions: read the endpoint answers unavailable, not an error", async () => {
  const forbidden = github(() => Response.json({ message: "Resource not accessible by integration" }, { status: 403 }));
  assert.deepEqual(await changeStatus(forbidden.client, repo, sha), { state: "unavailable" });
  const disabled = github(() => Response.json({ message: "Not Found" }, { status: 404 }));
  assert.deepEqual(await changeStatus(disabled.client, repo, sha), { state: "unavailable" });
  // A rate limit is still an error, so the browser tries again later.
  const limited = github(() => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }));
  await assert.rejects(changeStatus(limited.client, repo, sha), (error: { status?: number }) => error.status === 429);
  await assert.rejects(changeStatus(forbidden.client, repo, "main"), (error: { status?: number }) => error.status === 400);
});
