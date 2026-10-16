# GitHub settings for Lex

Open [techiesreviews/native-site-editor](https://github.com/techiesreviews/native-site-editor).
A pull request is a proposed change; merging adds it to its destination branch.

1. After the CI workflow is added, open a pull request into `dev` and let **CI / checks** run once.
   This makes **CI / checks** appear in GitHub's required-check search box.

2. Open **Settings → Branches → Add classic branch protection rule**. Set **Branch name pattern** to `main`. If its rule already exists, click **Edit** instead.
   This starts protection for the branch used for releases.

3. Select **Require a pull request before merging** and **Do not allow bypassing the above settings**. Leave **Require approvals**, **Allow force pushes** and **Allow deletions** off.
   This makes everyone, including you and agents, use pull requests to change `main`.

4. Select **Require status checks to pass before merging**, search for and select **CI / checks**, then select **Require branches to be up to date before merging**. Click **Create** (or **Save changes** when editing).
   This blocks merging until the proposed change passes the checks with the latest destination-branch changes included.

5. Repeat steps 2–4 with **Branch name pattern** set to `dev`.
   This gives the working branch the same pull-request and check protection. [GitHub's branch-protection guide](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule).

6. Open **Settings → General → Pull Requests** and select **Allow auto-merge**.
   This lets a pull request merge automatically once its required checks pass. [GitHub's auto-merge guide](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-auto-merge-for-pull-requests-in-your-repository).

7. For `dev`, keep **Require branches to be up to date before merging** plus **Allow auto-merge**. GitHub's **Require merge queue** option needs an organisation-owned repository; `techiesreviews` is a personal account, so it is unavailable here. Agents' `kit pr` waits for checks, then merges.
   This provides checked merges without a merge queue (a line of pull requests GitHub tests and merges in order). [GitHub's merge-queue availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue).

8. In Cloudflare, select the **techies** account and open **Manage Account → Account API tokens → Create Token**. Under **Permission policies → Custom**, choose the **Edit Cloudflare Workers** template. Limit the token to **techies**, finish creating it, and copy its value.
   This creates the access key GitHub needs to update the preview. [Cloudflare's token guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

9. Back on GitHub, open **Settings → Secrets and variables → Actions → New repository secret**. Enter `CLOUDFLARE_API_TOKEN` as **Name**, paste the token into **Secret**, and click **Add secret**.
   This lets successful `dev` pushes deploy the preview by themselves; see [the missing-token issue](../work/tech-debt/issues/05-ci-preview-deploy-token.md) and [GitHub's secret guide](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

Production deploys stay manual.
