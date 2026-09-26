// The site beyond the editor: the Change status of the last save in the top
// bar (Saved → Building → Live or Failed, read through the Worker's
// `/api/change-status`, so the GitHub token never reaches the browser), and,
// in the project menu, "View live site" (from `.editor/config.json`'s
// `site.url`) and "Download site" (the repository's files as edited, drafts
// included, as a .zip).
import "./site-actions.css";
import { button, link, node } from "../ui/dom";
import { changeStatusLabel, changeStatusPending, type ChangeState, type ChangeStatus } from "../../shared/change-status";
import { buildSiteZip, saveBytes, siteUrlFromConfig, siteZipName, type SiteFiles } from "../site-download";
import { NATIVE_CONFIG_PATH } from "../../shared/native-project";

export interface SavedCommit {
  repo: string;
  commit: string;
  /** The commit on GitHub. */
  url: string;
}

export interface SiteActionsOptions {
  /** Where the status shows (the top bar). */
  statusHost: HTMLElement;
  /** Where "View live site" and "Download site" go (the project menu's panel). */
  menuHost: HTMLElement;
  /** The site as edited, or undefined when no native site is open. */
  siteFiles: () => Promise<SiteFiles | undefined>;
  announce: (text: string) => void;
  /** Milliseconds before the next status check, by how long the change has been followed. */
  pollDelay?: (elapsed: number) => number;
}

/** 3 s for the first three minutes, then every 10 s. */
export const defaultPollDelay = (elapsed: number) => (elapsed < 180_000 ? 3_000 : 10_000);
/** A commit with workflows but no run after this long gets none (a workflow for other branches or events). */
const WAIT_LIMIT = 90_000;
/** Following stops after this long; the status then says Saved. */
const FOLLOW_LIMIT = 30 * 60_000;
const MAX_ERRORS = 5;

export async function readSiteUrl(site: SiteFiles): Promise<string | undefined> {
  if (!site.paths.includes(NATIVE_CONFIG_PATH)) return undefined;
  let text = site.held(NATIVE_CONFIG_PATH);
  if (text === undefined) {
    const sha = await site.blob(NATIVE_CONFIG_PATH);
    if (sha) text = (await site.readTexts([sha]))[sha];
  }
  return siteUrlFromConfig(text);
}

export function mountSiteActions(options: SiteActionsOptions) {
  const pollDelay = options.pollDelay ?? defaultPollDelay;
  // Top bar status.
  const status = node("div", "change-status");
  status.hidden = true;
  const dot = node("span", "change-status__dot");
  dot.setAttribute("aria-hidden", "true");
  const label = node("span", "change-status__label");
  const links = node("span", "change-status__links");
  status.append(dot, label, links);
  const live = node("span", "sr-only");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  options.statusHost.replaceChildren(status, live);

  // Project menu items.
  const liveSite = link("View live site ↗", "#", "text-button repository-menu__action site-actions__live");
  liveSite.target = "_blank";
  liveSite.rel = "noopener noreferrer";
  liveSite.hidden = true;
  const download = button("Download site", () => void downloadSite(), "text-button repository-menu__action site-actions__download");
  download.hidden = true;
  download.title = "Download the site's files as they are in the editor, unsaved changes included, as a .zip";
  options.menuHost.replaceChildren(liveSite, download);

  let siteUrl: string | undefined;
  let tracking = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let downloading = false;
  let following: (() => boolean) | undefined;

  async function refreshSite() {
    const site = await options.siteFiles().catch(() => undefined);
    download.hidden = !site;
    siteUrl = site ? await readSiteUrl(site).catch(() => undefined) : undefined;
    liveSite.hidden = !siteUrl;
    if (siteUrl) liveSite.href = siteUrl;
    return siteUrl;
  }

  // The project menu reads the settings as they are each time it opens.
  const menu = options.menuHost.closest<HTMLElement>("[popover]");
  const onToggle = (event: Event) => { if ((event as ToggleEvent).newState === "open") void refreshSite(); };
  menu?.addEventListener("toggle", onToggle);
  void refreshSite();

  async function downloadSite() {
    if (downloading) return;
    downloading = true;
    download.disabled = true;
    options.announce("Preparing the download…");
    try {
      const site = await options.siteFiles();
      if (!site) throw new Error("Open a native site to download it.");
      const { zip, count } = await buildSiteZip(site);
      const name = siteZipName(site.repository);
      saveBytes(zip, name);
      options.announce(`Downloaded ${name}, ${count} files.`);
    } catch (error) {
      options.announce(`The site could not be downloaded: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      downloading = false;
      download.disabled = false;
    }
  }

  function render(saved: SavedCommit, state: ChangeState, result?: ChangeStatus, note?: string) {
    status.hidden = false;
    status.dataset.state = state === "building" || state === "live" || state === "failed" ? state : "saved";
    const words = changeStatusLabel(state);
    label.textContent = words;
    status.title = note ?? `${words}: commit ${saved.commit.slice(0, 7)}${result?.name ? ` (${result.name})` : ""}`;
    links.replaceChildren();
    const add = (text: string, href: string, name: string) => {
      const anchor = link(text, href, "text-link change-status__link");
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.setAttribute("aria-label", name);
      links.append(anchor);
    };
    if (state === "live" && siteUrl) add("View live site ↗", siteUrl, "View live site");
    else if ((state === "building" || state === "failed" || state === "live") && result?.url)
      add("View run ↗", result.url, state === "failed" ? "View the failed run on GitHub" : "View the run on GitHub");
    else add("View commit ↗", saved.url, "View the commit on GitHub");
    if (live.textContent !== words) live.textContent = state === "failed" ? "Failed: the site was not updated." : words === "Live" ? "Live: the site is updated." : words;
  }

  function stop() {
    tracking++;
    clearTimeout(timer);
  }

  /** Follows a saved commit's status; `current` says whether it still belongs to the open project and branch. */
  function track(saved: SavedCommit, current: () => boolean) {
    stop();
    following = current;
    const id = tracking;
    const started = Date.now();
    let errors = 0;
    render(saved, "waiting");
    void refreshSite();
    const alive = () => id === tracking && status.isConnected && current();
    const schedule = () => { timer = setTimeout(check, pollDelay(Date.now() - started)); };
    async function check() {
      if (!alive()) { if (id === tracking && !current()) clear(); return; }
      let result: ChangeStatus;
      try {
        const response = await fetch(`/api/change-status?${new URLSearchParams({ repo: saved.repo, sha: saved.commit })}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (response.status === 401) return;
        if (!response.ok) throw new Error(String(response.status));
        result = (await response.json()) as ChangeStatus;
      } catch {
        if (alive() && ++errors < MAX_ERRORS) schedule();
        return;
      }
      if (!alive()) return;
      errors = 0;
      const elapsed = Date.now() - started;
      if (result.state === "unavailable") {
        render(saved, "none", result, "Build status needs the GitHub App's Actions: read permission.");
        return;
      }
      if (result.state === "waiting" && elapsed > WAIT_LIMIT) { render(saved, "none", result); return; }
      if (changeStatusPending(result.state) && elapsed > FOLLOW_LIMIT) { render(saved, "none", result, "Stopped following this build."); return; }
      render(saved, result.state, result);
      if (changeStatusPending(result.state)) schedule();
    }
    timer = setTimeout(check, Math.min(1_000, pollDelay(0)));
  }

  function clear() {
    stop();
    following = undefined;
    status.hidden = true;
    delete status.dataset.state;
    live.textContent = "";
  }

  return {
    track,
    clear,
    /** Hides the status when its commit no longer belongs to the open project and branch. */
    revalidate() { if (following && !following()) clear(); },
    refreshSite,
    destroy() {
      stop();
      menu?.removeEventListener("toggle", onToggle);
    },
  };
}
