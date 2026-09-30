import "./repository-menu.css";
import { mountDropdown } from "./dropdown";
import { mountFlyout } from "./flyout";
import { button, link, node } from "../ui/dom";
import { setIcon } from "../icons";
import type { Repository, SessionInfo } from "../../shared/types";

type Account = NonNullable<SessionInfo["accounts"]>[number];

// GitHub decides which repositories the editor's GitHub App can reach, and
// its API only lets classic tokens change that, so adding and removing a
// repository happens on the installation's GitHub page. The menu opens that
// page and checks the list again when the editor tab gets focus back.
//
// The open repository's row holds its branch: the row names it, and a
// flyout out of the row lists the branches, with Refresh from GitHub. The
// hidden #branch select keeps the branch the workspace reads, as #repository
// does the repository; the workspace fills it and the menu draws it.
export function createRepositoryMenu(options: {
  installUrl: string | null;
  accounts: Account[];
  onReload: () => void;
  /** GitHub may have changed which repositories the editor can reach. */
  onAccessChanged: () => void;
  onSwitchAccount: (login: string) => void;
  onSignOut: () => void;
}) {
  const root = node("div", "repository-menu");
  const trigger = node("button", "repository-menu__trigger");
  trigger.type = "button";
  const badge = node("span", "repository-menu__badge");
  badge.setAttribute("aria-hidden", "true");
  const name = node("span", "repository-menu__name");
  const caret = node("span", "repository-menu__caret");
  setIcon(caret, "caret-down", 12);
  caret.setAttribute("aria-hidden", "true");
  // Agents' questions waiting for the user (on their pins), counted on the tile.
  const questions = node("span", "repository-menu__questions");
  questions.setAttribute("aria-hidden", "true");
  questions.hidden = true;
  const identity = node("span", "repository-menu__identity");
  const repository = node("span", "repository-menu__repository");
  identity.append(repository, name);
  trigger.append(badge, questions, identity, caret);
  trigger.setAttribute("aria-controls", "repository-actions");
  trigger.setAttribute("aria-expanded", "false");
  const panel = node("div", "repository-menu__popover");
  panel.id = "repository-actions";
  panel.popover = "auto";
  panel.setAttribute("aria-label", "Repository actions");

  // The repository list. The hidden select keeps the value the workspace
  // reads; choosing a row sets it and sends `change`.
  const sites = node("section", "repository-menu__section");
  const heading = node("div", "repository-menu__heading");
  const title = node("span", "", "Repositories");
  title.id = "repository-menu-title";
  const reload = button("", options.onReload, "repository-menu__heading-button");
  setIcon(reload, "arrows-clockwise");
  reload.title = "Reload repositories";
  reload.setAttribute("aria-label", "Reload repositories");
  heading.append(title, reload);
  const search = node("input", "repository-menu__search");
  search.type = "search";
  search.placeholder = "Find a repository…";
  search.setAttribute("aria-label", "Find a repository");
  search.hidden = true;
  const list = node("ul", "repository-menu__repos");
  list.setAttribute("aria-labelledby", title.id);
  const empty = node("p", "repository-menu__empty", "Loading repositories…");
  const select = node("select", "");
  select.id = "repository";
  select.hidden = true;
  select.disabled = true;
  const branch = node("select", "");
  branch.id = "branch";
  branch.hidden = true;
  branch.disabled = true;
  branch.append(node("option", "", "—"));
  const add = accessLink("Add repositories", "repository-menu__add");
  sites.append(heading, search, list, empty, select, branch);
  if (add) sites.append(add);

  // The branches, beside the open repository's row.
  const branches = node("div", "repository-menu__branches");
  branches.id = "branch-menu";
  branches.setAttribute("role", "menu");
  const branchesHeading = node("div", "flyout__heading");
  branchesHeading.setAttribute("role", "none");
  const branchesTitle = node("span", "", "Branches");
  branchesTitle.setAttribute("aria-hidden", "true");
  const refresh = node("button", "flyout__icon-button");
  setIcon(refresh, "arrows-clockwise");
  refresh.type = "button";
  refresh.id = "refresh";
  refresh.title = "Refresh from GitHub";
  refresh.setAttribute("aria-label", "Refresh from GitHub");
  refresh.setAttribute("role", "menuitem");
  refresh.disabled = true;
  branchesHeading.append(branchesTitle, refresh);
  const branchList = node("div", "flyout__list");
  branchList.setAttribute("role", "group");
  const branchNote = node("p", "flyout__note");
  branches.append(branchesHeading, branchList, branchNote);
  const branchFlyout = mountFlyout({
    panel: branches,
    label: "Branches",
    render: drawBranches,
    initial: () => branchList.querySelector<HTMLElement>('[aria-checked="true"]:not(:disabled)'),
  });

  const actionClass = "text-button repository-menu__action";
  // "View live site" and "Download site" (components/site-actions.ts),
  // hidden from the menu for now; the Change status keeps View live site.
  const showSiteActions = false;
  const siteSlot = node("div", "repository-menu__site");
  siteSlot.id = "site-actions";
  const actions = node("div", "repository-menu__section repository-menu__actions");
  actions.append(siteSlot);
  const agentSlot = node("div", "repository-menu__agent");
  agentSlot.id = "agent-menu";

  const accounts = node("section", "repository-menu__section repository-menu__accounts");
  const accountsTitle = node("div", "repository-menu__heading");
  accountsTitle.append(node("span", "", "GitHub accounts"));
  accounts.append(accountsTitle);
  const current = options.accounts.find((account) => account.current);
  for (const account of options.accounts) {
    const row = account.current
      ? node("div", "repository-menu__account")
      : button("", () => options.onSwitchAccount(account.login), "repository-menu__account repository-menu__action");
    row.append(avatar(account.login, account.avatar_url), node("span", "repository-menu__account-name", account.login));
    if (account.current) {
      row.setAttribute("aria-current", "true");
    } else {
      row.title = `Switch to ${account.login}`;
      row.append(node("span", "repository-menu__hint", "Switch"));
    }
    accounts.append(row);
  }
  const addAccount = link("+ Add another account", "/auth/login?add=1", `${actionClass} repository-menu__quiet`);
  accounts.append(
    addAccount,
    button(current ? `Sign out of ${current.login}` : "Sign out", options.onSignOut, `${actionClass} repository-menu__quiet`),
  );

  panel.append(sites, actions, agentSlot, accounts, branches);
  root.append(trigger, panel);
  const dropdown = mountDropdown({
    trigger,
    panel,
    anchor: "--repository-menu",
  });
  panel.addEventListener("click", (event) => {
    if ((event.target as Element).closest(".repository-menu__action")) {
      dropdown.close();
      trigger.focus();
    }
  });

  let repositories: Repository[] = [];
  let currentId: number | undefined;
  let currentFullName: string | undefined;
  let confirming: number | undefined;
  let awaitingAccess = false;
  const controller = new AbortController();
  window.addEventListener(
    "focus",
    () => {
      if (!awaitingAccess) return;
      awaitingAccess = false;
      options.onAccessChanged();
    },
    { signal: controller.signal },
  );
  search.addEventListener("input", () => render());
  search.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const first = list.querySelector<HTMLButtonElement>(".repository-menu__repo");
    if (first) {
      event.preventDefault();
      first.click();
    }
  });

  function accessUrl(repo?: Repository) {
    const installation = repo?.installation_id ?? repositories.find((item) => item.installation_id)?.installation_id;
    return installation ? `https://github.com/settings/installations/${installation}` : options.installUrl;
  }
  function accessLink(text: string, className: string) {
    if (!options.installUrl) return undefined;
    const result = link(`+ ${text} ↗`, options.installUrl, `text-button repository-menu__action ${className}`);
    result.target = "_blank";
    result.rel = "noopener noreferrer";
    result.title = "Choose the repositories this editor can use, on GitHub";
    result.addEventListener("click", () => {
      result.href = accessUrl() ?? result.href;
      awaitingAccess = true;
    });
    return result;
  }
  function choose(repo: Repository) {
    if (String(repo.id) === select.value) {
      dropdown.close();
      trigger.focus();
      return;
    }
    select.value = String(repo.id);
    select.dispatchEvent(new Event("change"));
  }
  // The branch being worked on, once the workspace has the repository's branches.
  const branchName = () => (branch.disabled ? "" : branch.value);
  function drawBranches() {
    const names = [...branch.options].map((option) => option.value).filter(Boolean);
    branchList.replaceChildren(...names.map((name) => {
      const checked = name === branch.value;
      const item = node("button", "flyout__item repository-menu__branch-item");
      item.type = "button";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(checked));
      item.dataset.key = name;
      item.disabled = branch.disabled;
      item.append(node("span", "repository-menu__branch-name", name));
      item.addEventListener("click", () => chooseBranch(name));
      return item;
    }));
    // "Loading branches…", "No branches yet", "Branches unavailable".
    branchNote.textContent = names.length ? "" : branch.options[0]?.textContent ?? "";
    branchNote.hidden = !branchNote.textContent;
  }
  function chooseBranch(name: string) {
    if (name === branch.value) {
      dropdown.close();
      trigger.focus();
      return;
    }
    branch.value = name;
    branch.dispatchEvent(new Event("change"));
  }
  new MutationObserver(() => {
    render();
    branchFlyout.refresh();
  }).observe(branch, { childList: true, attributes: true, attributeFilter: ["disabled"] });
  branch.addEventListener("change", () => render());
  function render() {
    const query = search.value.trim().toLowerCase();
    const shown = repositories.filter((repo) => !query || repo.full_name.toLowerCase().includes(query));
    list.replaceChildren(...shown.map(row));
    branchFlyout.attach(list.querySelector<HTMLElement>('.repository-menu__repo[aria-current="true"]') ?? undefined);
    if (repositories.length && !shown.length) {
      empty.textContent = "No repository matches.";
      empty.hidden = false;
    } else if (repositories.length) empty.hidden = true;
  }
  function row(repo: Repository) {
    const item = node("li", "repository-menu__item");
    const selected = repo.id === currentId;
    const open = node("button", "repository-menu__repo");
    open.type = "button";
    if (selected) open.setAttribute("aria-current", "true");
    const text = node("span", "repository-menu__repo-text");
    const on = selected ? branchName() : "";
    text.append(
      node("span", "repository-menu__repo-name", repo.name),
      node("span", "repository-menu__repo-owner", `${repo.owner.login}${repo.private ? " · private" : ""}${on ? ` · ⑂ ${on}` : ""}`),
    );
    open.append(initial(repo.name), text);
    if (selected) {
      const more = node("span", "repository-menu__more");
      setIcon(more, "caret-right", 12);
      more.setAttribute("aria-hidden", "true");
      open.append(more);
      open.title = on ? `On ${on}: choose another branch, or refresh` : "Branches";
    }
    // The open repository's row opens its branches instead.
    open.addEventListener("click", () => (selected ? branchFlyout.open(true) : choose(repo)));
    const remove = node("button", "repository-menu__remove");
    setIcon(remove, "x");
    remove.type = "button";
    remove.title = `Remove ${repo.name} from the editor`;
    remove.setAttribute("aria-label", `Remove ${repo.name}`);
    remove.setAttribute("aria-expanded", String(confirming === repo.id));
    remove.addEventListener("click", () => {
      confirming = confirming === repo.id ? undefined : repo.id;
      render();
      list.querySelector<HTMLElement>(".repository-menu__confirm a")?.focus();
    });
    // Remove comes first, left of the repository, apart from its branches' ›.
    item.append(remove, open);
    if (confirming === repo.id) {
      const confirm = node("div", "repository-menu__confirm");
      confirm.append(
        node("p", "", `GitHub controls which repositories this editor can use. On the page that opens, uncheck ${repo.name} and save. Nothing in the repository changes.`),
      );
      const go = link("Remove on GitHub ↗", accessUrl(repo) ?? "#", "button primary");
      go.target = "_blank";
      go.rel = "noopener noreferrer";
      go.addEventListener("click", () => {
        awaitingAccess = true;
        confirming = undefined;
        render();
      });
      confirm.append(
        go,
        button("Cancel", () => {
          confirming = undefined;
          render();
          list.querySelector<HTMLElement>(`[aria-label="Remove ${CSS.escape(repo.name)}"]`)?.focus();
        }, "text-button"),
      );
      item.append(confirm);
    }
    return item;
  }

  function setRepository(repo?: Repository) {
    currentId = repo?.id;
    actions.hidden = !repo || !showSiteActions;
    repository.textContent = repo?.owner.login ?? "GitHub connected";
    name.textContent = repo?.name ?? "Choose a project";
    badge.replaceChildren(repo ? initial(repo.name) : node("span", "repository-menu__initial", "·"));
    currentFullName = repo?.full_name;
    label();
    render();
  }
  // The tile's name and title, with the questions it counts.
  function label() {
    const count = Number(questions.textContent) || 0;
    const asking = questions.hidden ? "" : ` — ${count === 1 ? "an agent asks you a question" : `agents ask you ${count} questions`}`;
    trigger.setAttribute("aria-label", `${name.textContent} — repository actions${asking}`);
    trigger.title = `${currentFullName ?? "Repository actions"}${asking}`;
  }
  /** How many agents' questions wait for the user's answer on their pins. */
  function setQuestions(count: number) {
    questions.hidden = count < 1;
    questions.textContent = count > 0 ? String(count) : "";
    questions.title = count === 1 ? "An agent asks you a question: answer it on its orange pin" : `Agents ask you ${count} questions: answer them on their orange pins`;
    label();
  }
  /** The repositories to list, or none with a message while loading or after a failure. */
  function setRepositories(next: Repository[], message?: string) {
    repositories = next;
    if (confirming !== undefined && !next.some((repo) => repo.id === confirming)) confirming = undefined;
    search.hidden = next.length < 6;
    empty.hidden = Boolean(next.length);
    if (!next.length) empty.textContent = message ?? "This editor can't use any of your repositories yet. Add one on GitHub.";
    render();
  }
  setRepository();
  return {
    root,
    setRepository,
    setRepositories,
    setQuestions,
    close: dropdown.close,
    destroy() {
      controller.abort();
      branchFlyout.destroy();
      dropdown.destroy();
    },
  };
}

function initial(text: string) {
  const result = node("span", "repository-menu__initial", (text.match(/[a-z0-9]/i)?.[0] ?? "·").toUpperCase());
  // A stable hue per name tells repositories apart at a glance.
  let hash = 0;
  for (const character of text) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  result.style.setProperty("--initial-hue", String(hash % 360));
  result.setAttribute("aria-hidden", "true");
  return result;
}

function avatar(login: string, url: string) {
  const image = node("img", "repository-menu__avatar");
  image.alt = "";
  image.width = 24;
  image.height = 24;
  image.referrerPolicy = "no-referrer";
  image.src = `${url}${url.includes("?") ? "&" : "?"}s=48`;
  image.addEventListener("error", () => image.replaceWith(initial(login)), { once: true });
  return image;
}
