# GitHub settings for Lex

Agents cannot change these settings (GitHub refuses them), so they are yours to click.
Open [techiesreviews/native-site-editor](https://github.com/techiesreviews/native-site-editor) on GitHub.
A pull request is a proposed change; merging adds it to its destination branch.
Each step says in one line what it changes for you.

1. Wait until one pull request into `dev` has shown **CI / checks** with a green tick (agents open these).
   Until it has run once, GitHub cannot offer **CI / checks** in the search box used in step 4.

2. Open **Settings → Branches** and click **Add classic branch protection rule**. Type `main` in **Branch name pattern**. If a `main` rule already exists, click **Edit** next to it instead.
   This starts protecting `main`, the branch that becomes the live editor.

3. Tick **Require a pull request before merging**. Untick **Require approvals** inside it. Tick **Do not allow bypassing the above settings**. Leave **Allow force pushes** and **Allow deletions** unticked.
   Nobody, you and agents included, can change `main` except through a pull request you can see and merge.

4. Tick **Require status checks to pass before merging**, type `checks` in the search box and pick **CI / checks**, then tick **Require branches to be up to date before merging**. Click **Create** (or **Save changes** when editing).
   A pull request can only be merged once the checks pass on its newest version.

5. Back on **Settings → Branches**, click **Add classic branch protection rule** again and type `dev` in **Branch name pattern**. Tick only **Require status checks to pass before merging** with **CI / checks** and **Require branches to be up to date before merging**, as in step 4. Leave **Require a pull request before merging** and **Do not allow bypassing the above settings** unticked. Click **Create**.
   Pull requests into `dev` must pass the checks first, while agents can still finish their work the way they do today.

6. Open **Settings → General**, scroll to **Pull Requests**, and tick **Allow auto-merge**.
   A pull request can be set to merge by itself the moment its checks turn green.

7. Skip **Require merge queue**. GitHub only offers it to organisation accounts, and `techiesreviews` is a personal account. Steps 4 to 6 stand in for it: agents wait for green checks on an up-to-date branch, then merge.
   Nothing changes for you; pull requests still merge one at a time, each checked first.

8. In Cloudflare, click your profile icon at the top right, then **My Profile → API Tokens → Create Token**. Next to **Edit Cloudflare Workers**, click **Use template**. Under **Account Resources** pick the **techies** account, under **Zone Resources** pick **All zones from an account** and **techies**, then click **Continue to summary → Create Token** and copy the token it shows.
   This makes the key GitHub needs to update the preview editor. It is shown only once; if you lose it, make a new one.

9. Back on GitHub, open **Settings → Secrets and variables → Actions** and click **New repository secret**. Type `CLOUDFLARE_API_TOKEN` in **Name**, paste the token into **Secret**, and click **Add secret**.
   From then on, every change that lands on `dev` updates https://preview-editor.techies.tools by itself.

The live editor (techies.tools) is not touched by any of this: it is still updated only when you ask.
Background for agents: [the missing-token issue](../work/tech-debt/issues/05-ci-preview-deploy-token.md).
