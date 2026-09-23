import "./change-status.css";
import { node } from "../ui/dom";

// Follows a published commit through the repository's preview build and, for
// the live branch, its deployment: Saved → Building → Preview built → Live.
// Uses the stamped revision files only, so no extra GitHub permission is needed.
export interface TrackedChange {
  commit: string;
  previewUrl: string;
  liveUrl?: string;
  actionsUrl: string;
}

const pollMs = 10_000;
const giveUpMs = 6 * 60_000;

export function createChangeStatus(host: HTMLElement) {
  const root = node("a", "change-status");
  root.hidden = true;
  root.target = "_blank";
  root.rel = "noopener";
  host.append(root);
  let timer: number | undefined;
  let attempt = 0;

  function show(text: string, kind: string, href: string, title = "") {
    root.textContent = text;
    root.dataset.kind = kind;
    root.href = href;
    root.title = title;
    root.hidden = false;
  }

  async function revisionAt(url: string) {
    try {
      const response = await fetch(url, { cache: "no-store", credentials: "omit" });
      if (!response.ok) return undefined;
      return ((await response.json()) as { sha?: string }).sha;
    } catch {
      return undefined;
    }
  }

  return {
    track(change: TrackedChange) {
      window.clearTimeout(timer);
      const run = ++attempt;
      const short = change.commit.slice(0, 7);
      const started = Date.now();
      show(`Saved ${short} · building…`, "building", change.actionsUrl, "Committed to GitHub; waiting for the preview build.");
      const poll = async () => {
        if (run !== attempt) return;
        const preview = await revisionAt(change.previewUrl);
        if (run !== attempt) return;
        if (preview === change.commit) {
          if (!change.liveUrl) {
            show(`Preview built · ${short}`, "built", change.actionsUrl, "This branch is not the live branch; nothing was deployed.");
            return;
          }
          const live = await revisionAt(change.liveUrl);
          if (run !== attempt) return;
          if (live === change.commit) {
            show(`Live · ${short}`, "live", change.liveUrl.replace(/\/[^/]*$/, "/").replace(/\.astro-editor\/$/, ""), "Deployed revision matches your commit.");
            return;
          }
          show(`Preview built · deploying ${short}…`, "building", change.actionsUrl);
        }
        if (Date.now() - started > giveUpMs) {
          show(`Build not confirmed · ${short}`, "failed", change.actionsUrl, "No build with this commit appeared within six minutes. Check GitHub Actions.");
          return;
        }
        timer = window.setTimeout(() => void poll(), pollMs);
      };
      void poll();
    },
    clear() {
      window.clearTimeout(timer);
      attempt++;
      root.hidden = true;
    },
  };
}
