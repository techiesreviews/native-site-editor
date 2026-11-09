// The fake GitHub's push webhook (ticket am-32): the secret the save server's Worker holds (server.ts), and a signed
// delivery as the GitHub App sends it, for specs to POST to /api/github/webhook.
import { createHmac } from "node:crypto";

export const DEMO_WEBHOOK_SECRET = "native-demo-webhook-secret-for-tests-only";

/** A push of `branch` to `commit` in the demo repository (id 501), with GitHub's headers and signature. */
export function pushDelivery(commit: string, branch = "main", repoId = 501) {
  const body = JSON.stringify({ ref: `refs/heads/${branch}`, after: commit, deleted: false, repository: { id: repoId } });
  return {
    data: body,
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": `sha256=${createHmac("sha256", DEMO_WEBHOOK_SECRET).update(body).digest("hex")}`,
    },
  };
}
