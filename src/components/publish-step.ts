import { node } from "../ui/dom";
import { HOSTS } from "../setup-checklist";

// Setup wizard, step 3: Put it online.
//
// MOUNT POINT for the Publish panel: another piece of work fills this in.
// `mountPublishStep(container, repo)` renders into `container` and may return
// `destroy` for when the wizard leaves the step. Until then the step explains
// the options and says what is coming; the wizard's own "Skip for now" moves on.

export interface PublishStepRepo {
  id: number;
  /** owner/name */
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export function mountPublishStep(container: HTMLElement, repo: PublishStepRepo): { destroy?: () => void } {
  const intro = node(
    "p",
    "wizard-text",
    repo.private
      ? `${repo.fullName} is private. Free hosts such as Cloudflare Pages, Netlify and Vercel need the repository to be public, or a paid plan.`
      : `${repo.fullName} is public, so any of these hosts can publish it for free. The repository is the site: there is nothing to build.`,
  );
  const list = node("ul", "wizard-hosts");
  for (const host of HOSTS) {
    const item = node("li", "wizard-hosts__item");
    item.append(node("strong", "", host.name), node("span", "wizard-hint", host.how));
    list.append(item);
  }
  const soon = node("p", "wizard-soon", "Coming next: one-click publishing.");
  soon.setAttribute("data-publish-step", "placeholder");
  container.replaceChildren(intro, list, soon);
  return {};
}
