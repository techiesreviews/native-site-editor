import type { CreateChoice, CreateOutcome } from "./components/get-started";
import type { WizardCreateOutcome } from "./components/setup-wizard";
import type { WizardRepo } from "./setup-wizard";
import { createConfirmDialog } from "./components/confirm-dialog";
import { siteNameFromRepository, blankSiteFiles, startingConfig, type StartingPoint } from "../shared/starting-point";
import { nativePageBody, nativePageStylesheets, NATIVE_CONFIG_PATH, nativeSitePrefix } from "../shared/native-project";
import { expandStyleImports, resolveImportPath, rewriteCssUrls } from "../shared/css-imports";
import { assetType } from "../shared/asset-types";
import { fileInTheWay, foldersAbove } from "../shared/site-rules";
import { dataUrlOf } from "./native-assets";
import { withSiteSettings } from "./setup-checklist";
import { addUpload, uploadBytes, uploadImageType } from "./uploads";
import type { Repository, Snapshot, StarterFile, SessionInfo } from "../shared/types";
import type { AppStore } from "./app-store";
import type { GuardedEdits } from "./guarded-edit";
import type { DraftScope, draftStore } from "./drafts";
import type { createBootController } from "./controllers/boot-controller";
import type { createRepositoryMenu } from "./components/repository-menu";
import type { RepositoryIndex } from "./repository-loading";
import type { createSetupChecklistController } from "./controllers/setup-checklist-controller";
import type { SessionStamp } from "./workspace-session";

interface SetupPorts {
  readonly info: SessionInfo;
  /** The workspace session now (src/workspace-session.ts). */
  begin(): SessionStamp;
  repositories: Repository[];
  wizardCreated: Repository | undefined;
  waitingForRepositories: boolean;
  readonly repositorySelect: HTMLSelectElement;
  readonly repositoryMenu: ReturnType<typeof createRepositoryMenu> | undefined;
  boot: ReturnType<typeof createBootController>;
  appStore: AppStore;
  guardedEdits: GuardedEdits;
  nativeBaseSources: Map<string, string>;
  repositoryIndex: RepositoryIndex;
  setupController: ReturnType<typeof createSetupChecklistController>;
  api: <T>(action: string, params?: Record<string, string>) => Promise<T>;
  readFiles: (repo: string, shas: string[]) => Promise<Record<string, string>>;
  readFile: (repo: string, sha: string) => Promise<string>;
  readBlob: (repo: string, sha: string, path?: string) => Promise<Blob>;
  branchText: (path: string) => Promise<{ text: string } | undefined>;
  draftScope: () => DraftScope | undefined;
  draftStore: typeof draftStore;
  pathNow: (path: string) => "file" | "folder" | "deleted" | undefined;
  rememberStartingPoint: (owner: string | undefined, name: string, point: StartingPoint) => void;
  rememberPartialStart: (repo: number, point: StartingPoint, committed: string[]) => void;
  rememberRepositories: (list: Repository[]) => void;
  repositoryOptions: () => void;
  chooseRepository: () => Promise<void>;
  forgetPartialStart: (repo: number) => void;
  removeFinishStarter: () => void;
  loadSnapshot: () => Promise<void>;
  announce: (text: string) => void;
  errorMessage: (error: unknown) => void;
}

/** Creation and starting-point writes are needed only by onboarding actions. */
export function createSetupActions(ports: SetupPorts) {
  let startDialog: ReturnType<typeof createConfirmDialog> | undefined;
  async function createSiteInWizard(choice: CreateChoice): Promise<WizardCreateOutcome> {
    let response: Response;
    try {
      response = await fetch("/api/repositories", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: choice.name,
          ...(choice.owner ? { owner: choice.owner } : {}),
          private: choice.private,
          description: "A website edited with Native Site Editor",
          startingPoint: choice.point,
          siteName: siteNameFromRepository(choice.name),
        }),
      });
    } catch {
      return { ok: false, message: "GitHub could not be reached. Try again." };
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 403 || response.status === 404) {
      ports.rememberStartingPoint(choice.owner, choice.name, choice.point);
      return { ok: false, fallback: true, message: data.error || "The editor cannot create repositories on your account yet." };
    }
    if (response.status === 409) {
      // The name exists. When it is a repository this account can reach (a retry after making it by hand, say), it is the one wanted.
      const existing = await findWizardRepository(choice).catch(() => undefined);
      if (existing) return { ok: true, repo: existing };
    }
    if (!response.ok) return { ok: false, message: data.error || "The site could not be created. Try again." };
    const { commit, startingPointError, committed, ...plain } = data as Repository & { commit?: unknown; startingPointError?: string; committed?: string[]; missing?: string[] };
    const repository = plain as Repository & { missing?: undefined };
    delete (repository as { missing?: unknown }).missing;
    ports.wizardCreated = repository;
    ports.repositories = [...ports.repositories.filter((known) => known.id !== repository.id), repository];
    ports.rememberRepositories(ports.repositories);
    let partial = false;
    if (startingPointError) {
      if (Array.isArray(committed) && committed.length) {
        // Some files are committed already: the editor offers to add the missing ones when the repository opens.
        partial = true;
        ports.rememberPartialStart(repository.id, choice.point, committed);
      } else ports.rememberStartingPoint(repository.owner.login, repository.name, choice.point);
    }
    return { ok: true, repo: wizardRepository(repository, Boolean(commit), partial), ...(startingPointError ? { error: startingPointError } : {}) };
  }

  /**
   * The new site's home page as one self-contained document for the wizard's preview, built with the
   * editor's own helpers: the linked stylesheets with their `@import` chains expanded (`expandStyleImports`)
   * and the repository images turned into data URLs (`rewriteCssUrls`, `resolveImportPath`, as the editor's
   * preview does). A page that needs scripts to render (shared components are custom elements) or that
   * cannot be completed has no preview: the wizard shows its card instead, never a half-styled page.
   */
  async function wizardPreview(repo: WizardRepo): Promise<string | undefined> {
    try {
      const snap = await ports.api<Snapshot>("snapshot", { repo: repo.fullName, branch: repo.defaultBranch });
      if (!snap.tree) return undefined;
      const byPath = new Map(snap.tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha]));
      const homeSha = byPath.get("index.html");
      if (!homeSha) return undefined;
      const home = (await ports.readFiles(repo.fullName, [homeSha]))[homeSha];
      if (typeof home !== "string") return undefined;
      const body = nativePageBody(home);
      if (/<[a-z][a-z\d]*-[a-z\d-]*[\s/>]/i.test(home.slice(body.start, body.end))) return undefined;
      // Stylesheets: the linked ones, then every file they import, round by round.
      const sheets: Record<string, string> = {};
      const linked = nativePageStylesheets(home, "index.html");
      for (let round = 0; round < 20; round++) {
        const known = expandStyleImports(linked.filter((path) => path in sheets), (path) => sheets[path]);
        const wanted = [...new Set([...linked, ...known.imported])].filter((path) => !(path in sheets) && byPath.has(path));
        if (!wanted.length) break;
        const contents = await ports.readFiles(repo.fullName, wanted.map((path) => byPath.get(path)!));
        for (const path of wanted) sheets[path] = contents[byPath.get(path)!] ?? "";
      }
      const expanded = expandStyleImports(linked.filter((path) => path in sheets), (path) => sheets[path]);
      if (expanded.errors.length || linked.some((path) => !(path in sheets))) return undefined;
      // Images the page and the sheets name, as data URLs (the frame cannot reach the repository).
      const imagePath = (from: string, url: string) => {
        const path = resolveImportPath(from, url);
        return path && assetType(path) && byPath.has(path) ? path : undefined;
      };
      const wanted = new Set<string>();
      for (const sheet of expanded.sheets)
        rewriteCssUrls(sheet.source, (url) => {
          const path = imagePath(sheet.path, url);
          if (path) wanted.add(path);
          return undefined;
        });
      for (const match of home.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
        const path = imagePath("index.html", match[1]);
        if (path) wanted.add(path);
      }
      const images = new Map<string, string>();
      for (const path of [...wanted].slice(0, 12)) {
        images.set(path, await dataUrlOf(await ports.readBlob(repo.fullName, byPath.get(path)!, path), assetType(path)!));
      }
      const css = expanded.sheets
        .map((sheet) => rewriteCssUrls(sheet.source, (url) => {
          const path = imagePath(sheet.path, url);
          return path ? images.get(path) : undefined;
        }))
        .join("\n");
      let html = home.replace(/<script\b[\s\S]*?<\/script>/gi, "");
      for (const tag of home.match(/<link\b[^>]*>/gi) ?? []) if (/rel\s*=\s*["']?stylesheet/i.test(tag)) html = html.replace(tag, "");
      html = html.replace(/(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'])/gi, (whole, before: string, url: string, after: string) => {
        const path = imagePath("index.html", url);
        const data = path ? images.get(path) : undefined;
        return data ? `${before}${data}${after}` : whole;
      });
      const style = `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
      return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => `${style}</head>`) : `${style}${html}`;
    } catch {
      return undefined;
    }
  }

  function wizardRepository(repository: Repository, committed: boolean, partial = false): WizardRepo {
    return {
      id: repository.id,
      name: repository.name,
      fullName: repository.full_name,
      private: repository.private,
      defaultBranch: repository.default_branch || "main",
      owner: repository.owner.login,
      committed,
      ...(partial ? { partial: true } : {}),
    };
  }

  /** The repository the user was told to make on GitHub (or retried the name of), looked up afresh; its starting point waits for it to open. */
  async function findWizardRepository(choice: CreateChoice): Promise<WizardRepo | undefined> {
    const owner = (choice.owner ?? ports.info.user?.login ?? "").toLowerCase();
    const list = await ports.boot.fetchList(true);
    const repository = list.find((candidate) => candidate.owner.login.toLowerCase() === owner && candidate.name.toLowerCase() === choice.name.toLowerCase());
    if (!repository) return undefined;
    ports.wizardCreated = repository;
    ports.repositories = [...ports.repositories.filter((known) => known.id !== repository.id), repository];
    ports.rememberRepositories(ports.repositories);
    // Empty, it gets the starting point when it opens; one with files keeps them.
    ports.rememberStartingPoint(repository.owner.login, repository.name, choice.point);
    return wizardRepository(repository, false);
  }


  async function createSite(choice: CreateChoice): Promise<CreateOutcome> {
    let response: Response;
    try {
      response = await fetch("/api/repositories", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: choice.name, ...(choice.owner ? { owner: choice.owner } : {}), private: choice.private, description: "A website edited with Native Site Editor" }),
      });
    } catch {
      return { ok: false, message: "GitHub could not be reached. Try again." };
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 403 || response.status === 404) {
      ports.rememberStartingPoint(choice.owner, choice.name, choice.point);
      return { ok: false, fallback: true, message: data.error || "The editor cannot create repositories on your account yet." };
    }
    if (!response.ok) return { ok: false, message: data.error || "The repository could not be created. Try again." };
    const repo = data as Repository;
    ports.waitingForRepositories = false;
    ports.repositories = [...ports.repositories.filter((known) => known.id !== repo.id), repo];
    ports.rememberRepositories(ports.repositories);
    ports.repositoryOptions();
    ports.repositorySelect.disabled = false;
    ports.repositorySelect.value = String(repo.id);
    ports.repositoryMenu?.setRepositories(ports.repositories);
    await ports.chooseRepository();
    if (ports.appStore.repository.value?.id === repo.id) {
      const problem = await writeStartingPoint(choice.point);
      if (problem) ports.errorMessage(new Error(problem));
    }
    return { ok: true };
  }


  async function writeSiteSettings(change: { name?: string; url?: string }): Promise<string | undefined> {
    // The file is read for this repository and branch; if the user moves on meanwhile, nothing is
    // written (it would land in the other one). The branch's file is read first, so the plan reads it.
    const since = ports.guardedEdits.stamp("repository"), changed = "The repository changed meanwhile. Try again.";
    if (ports.guardedEdits.peek.source(NATIVE_CONFIG_PATH) === undefined) {
      try {
        const base = await ports.branchText(NATIVE_CONFIG_PATH);
        if (!since.holds()) return changed;
        if (base) ports.nativeBaseSources.set(NATIVE_CONFIG_PATH, base.text);
      } catch (error) {
        return error instanceof Error ? error.message : `${NATIVE_CONFIG_PATH} could not be read.`;
      }
    }
    const what = change.name !== undefined ? "name" : "address";
    const done = `Site ${what} set as a draft. Publish to keep it.`, undone = `Undid setting the site ${what}.`;
    const outcome = await ports.guardedEdits.run(r => {
      const text = r.source(NATIVE_CONFIG_PATH), next = withSiteSettings(text, change);
      if ("error" in next) return { refuse: next.error };
      return text === undefined ? { creates: [{ path: NATIVE_CONFIG_PATH, content: next.text }], done, undone }
        : { edits: new Map([[NATIVE_CONFIG_PATH, next.text]]), done, undone };
    }, { since });
    return outcome.ok ? outcome.message : outcome.reason === "stale" ? changed : outcome.message;
  }

  // A starting point's files as drafts: the files of `point` (the blank page,
  // or the Starter site the Worker fetches), new files as new drafts, images
  // as uploads, then the project opened again so the preview shows the site.
  // A file that is already there is replaced only when the user says so.
  async function writeStartingPoint(point: StartingPoint, partial?: { committed: string[]; repoId: number }): Promise<string | undefined> {
    const repo = ports.appStore.repository.value;
    const scope = ports.draftScope();
    if (!repo || !scope) return "Open a repository first.";
    const at = ports.begin();
    // Everything below reads and writes for this repository, branch and snapshot only.
    const snap = ports.appStore.snapshot.value!;
    const bound = () => at.holds() && ports.appStore.snapshot.value === snap && ports.appStore.repository.value === repo;
    const find = (path: string) => ports.repositoryIndex.find(ports.api, repo, snap, path);
    const siteName = siteNameFromRepository(repo.name);
    let starting: StarterFile[];
    try {
      starting = point === "blank" ? blankSiteFiles(siteName, "") : (await ports.api<{ files: StarterFile[] }>("starter", { name: siteName })).files;
    } catch (error) {
      return error instanceof Error ? error.message : "The Starter site could not be loaded. Try again.";
    }
    if (!at.holds()) return "The repository changed meanwhile. Try again.";
    // Finishing a starting point that stopped part way: the files already committed stay as they are, and nothing else is overwritten.
    if (partial) starting = starting.filter((file) => !partial.committed.includes(file.path));
    const state = new Map<string, "free" | "taken" | "folder">();
    // A file cannot go under a path that is a file: the folder it needs is taken by one.
    const blockedBy = new Map<string, string>();
    const isFile = async (path: string) => {
      const now = ports.pathNow(path);
      if (now === "file") return true;
      if (now !== undefined) return false;
      const found = await find(path);
      return Boolean(found);
    };
    try {
      for (const file of starting) {
        for (const ancestor of foldersAbove(file.path)) {
          const blocked = await isFile(ancestor);
          if (!bound()) return "The repository changed meanwhile. Try again.";
          if (blocked) { blockedBy.set(file.path, ancestor); break; }
        }
        if (blockedBy.has(file.path)) continue;
        const now = ports.pathNow(file.path);
        const found = now === undefined ? await find(file.path) : undefined;
        if (!bound()) return "The repository changed meanwhile. Try again.";
        state.set(file.path, now === "folder" ? "folder" : now !== undefined || found ? "taken" : "free");
      }
    } catch (error) {
      return error instanceof Error ? error.message : "GitHub could not be asked which files exist.";
    }
    if (!bound()) return "The repository changed meanwhile. Try again.";
    const taken = starting.filter((file) => state.get(file.path) === "taken");
    let replace = false;
    if (taken.length && !partial) {
      if (!startDialog) {
        startDialog = createConfirmDialog("start-dialog");
        document.body.append(startDialog.root);
      }
      const shown = taken.slice(0, 6).map((file) => file.path).join(", ") + (taken.length > 6 ? ` and ${taken.length - 6} more` : "");
      const answer = await startDialog.choose({
        title: taken.length === 1 ? "A file is already there" : `${taken.length} files are already there`,
        notes: [`${shown} ${taken.length === 1 ? "is" : "are"} in this repository already.`, "Keep yours and add only the rest, or replace them with the starting point's? A replaced text file stays a draft you can discard."],
        actions: [{ label: "Keep mine", value: "keep" }, { label: "Replace them", value: "replace" }],
      });
      if (!answer.value) return "Nothing was added.";
      replace = answer.value === "replace";
      if (!bound()) return "The repository changed meanwhile. Try again.";
    }
    // The overwrite choice determines which configuration will survive.
    if (point === "blank") {
      const keptConfig = (state.get(NATIVE_CONFIG_PATH) === "taken" && !replace) || partial?.committed.includes(NATIVE_CONFIG_PATH);
      const config = keptConfig ? ports.guardedEdits.peek.source(NATIVE_CONFIG_PATH) : startingConfig(siteName);
      const files = blankSiteFiles(siteName, nativeSitePrefix(config));
      starting = partial ? files.filter(file => !partial.committed.includes(file.path)) : files;
    }
    const problems: string[] = [];
    const skipped = new Map<string, string[]>();
    for (const [path, ancestor] of blockedBy) skipped.set(ancestor, [...(skipped.get(ancestor) ?? []), path]);
    for (const [ancestor, paths] of skipped)
      problems.push(`${paths.join(", ")} ${paths.length === 1 ? "was" : "were"} skipped: ${fileInTheWay(ancestor)}`);
    let added = 0;
    for (const file of starting) {
      if (!bound()) return "The repository changed meanwhile. Some files may have been added as drafts; the rest were not.";
      if (blockedBy.has(file.path)) continue;
      const here = state.get(file.path);
      if (here === "folder") { problems.push(`${file.path} is a folder here, so it was skipped.`); continue; }
      if (here === "taken" && !replace) continue;
      if ("base64" in file) {
        // Images and other bytes go the way an upload does; one in the way stays.
        if (here === "taken") continue;
        const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
        const result = await addUpload({
          drafts: ports.draftStore(), bytes: uploadBytes(), scope, folder: "", exact: true,
          file: new File([bytes], file.path, { type: uploadImageType(file.path) }),
          taken: () => false,
        });
        if (!bound()) {
          // The upload went to the scope captured above; it is not left behind for another branch to see.
          if (result.ok) ports.draftStore().remove(scope, result.path);
          return "The repository changed meanwhile. Try again.";
        }
        if (result.ok) added++;
        else problems.push(result.error);
        continue;
      }
      const drafted = ports.draftStore().get(scope, file.path);
      if (drafted?.upload || drafted?.opaque) continue;
      let baseSha: string | null = null;
      let original = "";
      if (drafted) ({ baseSha, original } = drafted);
      else if (here === "taken") {
        try {
          const entry = await find(file.path);
          if (entry) { baseSha = entry.sha; original = await ports.readFile(repo.full_name, entry.sha); }
        } catch {
          problems.push(`${file.path} could not be read, so it was left as it is.`);
          continue;
        }
        if (!bound()) return "The repository changed meanwhile. Try again.";
      }
      if (!bound()) return "The repository changed meanwhile. Try again.";
      ports.draftStore().save({ ...scope, version: 1, path: file.path, baseSha, original, content: file.content, updatedAt: Date.now() });
      added++;
    }
    if (!bound()) return undefined;
    const failure = ports.draftStore().error;
    if (failure) return failure;
    ports.setupController.start(repo.id);
    // Finished: the recovery record and its banner go before the reload below, which would offer them again.
    if (partial) {
      ports.forgetPartialStart(partial.repoId);
      ports.removeFinishStarter();
    }
    // Opened again: the home page is a draft now, so the native preview takes over from this screen.
    await ports.loadSnapshot();
    if (added) ports.announce(`Added ${added} ${added === 1 ? "file" : "files"} as drafts. Publish to keep them.`);
    if (problems.length) ports.errorMessage(new Error(problems.join(" ")));
    return undefined;
  }
  return { createSiteInWizard, findWizardRepository, wizardPreview, createSite, writeSiteSettings, writeStartingPoint };
}
