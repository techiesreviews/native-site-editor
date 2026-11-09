import "./repository-menu.css";
import { mountDropdown } from "./dropdown";
import { mountFlyout } from "./flyout";
import { button, link, node } from "../ui/dom";
import { setIcon } from "../icons";
import { noteCount, noteWords, tileWords, type FinishedNote } from "../finished-elsewhere";
import { sameBranch, sameRepository } from "../workspace-session";
import type { Repository, SessionInfo } from "../../shared/types";
import "./person-chip.css";
import { initialOf, type ShareState } from "../share-control";
import type { PreviewState } from "../preview-control";

type Account = NonNullable<SessionInfo["accounts"]>[number];
/** Share to edit (slice 30, src/live-session.ts): a synced session on the project shown. */
export interface ShareMenuPort {
  state(): ShareState;
  /** Whether a site is shown to share: the items show only then. */
  available(): boolean;
  /** Hears each change; returns the way to stop. */
  watch(listener: (state: ShareState) => void): () => void;
  /** Starts sharing (or keeps the session open): its link, or undefined when there is nothing to share. */
  start(): Promise<string | undefined>;
  stop(): void;
}
/** Share preview (slice 35, src/preview-share.ts): a link that shows the site live while the editor is open. */
export interface PreviewMenuPort {
  state(): PreviewState;
  /** Whether Share preview shows: a preview Worker is set up and a site is shown. */
  available(): boolean;
  watch(listener: (state: PreviewState) => void): () => void;
  /** Makes a link (or keeps the one on) and resolves its address; throws with the refusal's `status`. */
  start(): Promise<string | undefined>;
  /** Turns the link off; throws when the editor could not. */
  stop(): Promise<void>;
  /** Draws the items into `root` once they have loaded (src/components/preview-menu.ts). */
  draw(actionClass: string, root: HTMLElement): Promise<{ refresh(): void; destroy(): void }>;
}
/** How long "Link copied" stays on the item before it reads "Copy edit link" again. */
export const COPIED_MS = 2500;
/** Guests shown by initial beside the project tile; the rest go in one "+N". */
const GUESTS_SHOWN = 3;

// GitHub decides which repositories the editor's GitHub App can reach, and
// its API only lets classic tokens change that, so adding and removing a
// repository happens on the installation's GitHub page. The menu opens that
// page and checks the list again when the editor tab gets focus back.
//
// The open repository's row holds its branch: the row names it, and a
// flyout out of the row lists the branches, with Refresh from GitHub. The
// hidden #branch select keeps the branch the workspace reads, as #repository
// does the repository; the workspace fills it and the menu draws it.
//
// Work that finished on another project or branch (src/finished-elsewhere.ts) is counted on
// that project's tile and its branch's row, as agents' questions are on the menu's own tile,
// which counts it too while no question waits. Its words are part of the row's name; a click
// on the row opens it.
export function createRepositoryMenu(options: {
  installUrl: string | null;
  accounts: Account[];
  /** Fetch the repository list only when the menu is opened. */
  onOpen?: () => void;
  onReload: () => void;
  /** GitHub may have changed which repositories the editor can reach. */
  onAccessChanged: () => void;
  onSwitchAccount: (login: string) => void;
  onSignOut: () => void;
  onSiteSettings?: () => void;
  /** A row with finished work clicked: its project and branch open with its changes. */
  onNote?: (note: FinishedNote) => void;
  share?: ShareMenuPort;
  preview?: PreviewMenuPort;
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
  const finished = tally();
  const identity = node("span", "repository-menu__identity");
  const repository = node("span", "repository-menu__repository");
  identity.append(repository, name);
  trigger.append(badge, questions, finished, identity, caret);
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
  // The App's installations/new page lets the user pick the account or organisation.
  const another = options.installUrl ? anotherAccountLink(options.installUrl) : undefined;
  if (another) sites.append(another);

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
  if (options.onSiteSettings) actions.append(button("Site settings", options.onSiteSettings, actionClass));
  const share = options.share ? shareItems(options.share, actionClass) : undefined;
  if (share) actions.append(share.root);
  // Share preview's items load after the first paint (src/components/preview-menu.ts); drawn on the menu's first open.
  const previewRoot = options.preview && node("div", "repository-menu__preview");
  let preview: ReturnType<PreviewMenuPort["draw"]> | undefined;
  if (previewRoot) { previewRoot.hidden = true; actions.append(previewRoot); }
  const showPreview = () => { if (previewRoot) void (preview ??= options.preview!.draw(actionClass, previewRoot)).then((items) => items.refresh()); };
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
  root.append(trigger, ...share ? [share.people] : [], panel);
  const dropdown = mountDropdown({
    trigger,
    panel,
    anchor: "--repository-menu",
  });
  panel.addEventListener("beforetoggle", (event) => {
    if ((event as ToggleEvent).newState === "open") { options.onOpen?.(); share?.refresh(); showPreview(); }
  });
  panel.addEventListener("click", (event) => {
    // Share to edit and Copy edit link say "Link copied" on themselves, so the menu stays open for them.
    if ((event.target as Element).closest(".repository-menu__action:not([data-keep-open])")) {
      dropdown.close();
      trigger.focus();
    }
  });

  let repositories: Repository[] = [];
  let currentId: number | undefined;
  let currentFullName: string | undefined;
  let confirming: number | undefined;
  let awaitingAccess = false;
  let notes: readonly FinishedNote[] = [];
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

  /** A repository on another person's account that the signed-in user collaborates on (slice am-31): its owner, not
   * this user, chooses whether the editor may use it. */
  function othersAccount(repo: Repository) {
    return repo.owner.type === "User" && current !== undefined && repo.owner.login.toLowerCase() !== current.login.toLowerCase();
  }
  // The installation's settings page: an organisation's differs from a user's. Never another person's.
  function accessUrl(repo?: Repository) {
    const target = repo ?? [repositories.find((item) => item.id === currentId), ...repositories].find((item) => item?.installation_id && !othersAccount(item));
    if (!target?.installation_id || othersAccount(target)) return options.installUrl;
    return target.owner.type === "Organization"
      ? `https://github.com/organizations/${encodeURIComponent(target.owner.login)}/settings/installations/${target.installation_id}`
      : `https://github.com/settings/installations/${target.installation_id}`;
  }
  function anotherAccountLink(href: string) {
    const result = link("+ Install on another account ↗", href, "text-button repository-menu__action repository-menu__quiet repository-menu__another");
    result.target = "_blank";
    result.rel = "noopener noreferrer";
    result.title = "Install the editor on another account or organisation, on GitHub";
    result.addEventListener("click", () => {
      awaitingAccess = true;
    });
    return result;
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
      const note = notes.find((note) => sameBranch(note.scope, { repoId: currentId, repo: currentFullName, branch: name }));
      if (note) item.append(...told([note], noteWords(note)));
      item.addEventListener("click", () => (note && options.onNote ? options.onNote(note) : chooseBranch(name)));
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
    // More than one owner: grouped under the owner's name, the user's own account first, then the others by name.
    if (new Set(repositories.map((repo) => repo.owner.login.toLowerCase())).size < 2) list.replaceChildren(...shown.map(row));
    else {
      const rank = (repo: Repository) => (repo.owner.type === "Organization" || othersAccount(repo) ? 1 : 0);
      const firsts = new Map<string, Repository>();
      for (const repo of shown) if (!firsts.has(repo.owner.login.toLowerCase())) firsts.set(repo.owner.login.toLowerCase(), repo);
      const ordered = [...firsts.values()].sort((a, b) => rank(a) - rank(b) || a.owner.login.localeCompare(b.owner.login));
      list.replaceChildren(
        ...ordered.flatMap((first) => [
          ownerHeading(first),
          ...shown.filter((repo) => repo.owner.login.toLowerCase() === first.owner.login.toLowerCase()).map(row),
        ]),
      );
    }
    branchFlyout.attach(list.querySelector<HTMLElement>('.repository-menu__repo[aria-current="true"]') ?? undefined);
    if (repositories.length && !shown.length) {
      empty.textContent = "No repository matches.";
      empty.hidden = false;
    } else if (repositories.length) empty.hidden = true;
  }
  function ownerHeading(repo: Repository) {
    const organisation = repo.owner.type === "Organization";
    const item = node("li", "repository-menu__owner");
    item.dataset.owner = repo.owner.login;
    item.dataset.kind = organisation ? "organization" : "user";
    const kind = organisation ? "Organisation" : othersAccount(repo) ? "Shared with you" : "You";
    item.append(node("span", "repository-menu__owner-name", repo.owner.login), node("span", "repository-menu__owner-kind", kind));
    return item;
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
    const tile = initial(repo.name);
    // The row carries the tile's hue too, for the remove × drawn over it.
    item.style.setProperty("--initial-hue", tile.style.getPropertyValue("--initial-hue"));
    open.append(tile, text);
    // Finished work here, the latest first; on the open repository it is on its branch's row too.
    const here = notes.filter((note) => sameRepository(note.scope, { repoId: repo.id, repo: repo.full_name }));
    if (here.length) open.append(...told(here, here.map((note) => `${noteWords(note)} on ${note.scope.branch}`).join("; ")));
    if (selected) {
      const more = node("span", "repository-menu__more");
      setIcon(more, "caret-right", 12);
      more.setAttribute("aria-hidden", "true");
      open.append(more);
      open.title = on ? `On ${on}: choose another branch, or refresh` : "Branches";
    }
    // The open repository's row opens its branches instead.
    open.addEventListener("click", () => (selected ? branchFlyout.open(true) : here[0] && options.onNote ? options.onNote(here[0]) : choose(repo)));
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
    // Remove comes first and, on hover or focus, covers the repository's
    // letter tile, apart from its branches' ›. Another person's repository
    // has none: only its owner can take the editor's access away.
    if (othersAccount(repo)) item.append(open);
    else item.append(remove, open);
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
    actions.hidden = !repo || (!showSiteActions && !options.onSiteSettings && !share && !previewRoot);
    siteSlot.hidden = !showSiteActions;
    repository.textContent = repo?.owner.login ?? "GitHub connected";
    name.textContent = repo?.name ?? "Choose a project";
    badge.replaceChildren(repo ? initial(repo.name) : node("span", "repository-menu__initial", "·"));
    currentFullName = repo?.full_name;
    label();
    render();
  }
  // The tile's name and title, with the questions and the finished work it counts.
  function label() {
    const said = tileWords(questions.hidden ? 0 : Number(questions.textContent) || 0, notes, { repoId: currentId, repo: currentFullName }, repositories);
    finished.hidden = !said.counted;
    finished.textContent = String(noteCount(notes));
    trigger.setAttribute("aria-label", `${name.textContent} — repository actions${said.words}`);
    trigger.title = `${currentFullName ?? "Repository actions"}${said.words}`;
  }
  /** Work that finished on other projects and branches, the latest first. */
  function setNotes(next: readonly FinishedNote[]) {
    notes = next;
    label();
    render();
    branchFlyout.refresh();
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
    setNotes,
    close: dropdown.close,
    /** Opens the menu (the Connect an agent spotlight's "Show me"). */
    open: dropdown.open,
    /** The tile at the top left that opens the menu: what a spotlight points at. */
    trigger,
    destroy() {
      share?.destroy();
      void preview?.then((items) => items.destroy());
      controller.abort();
      branchFlyout.destroy();
      dropdown.destroy();
    },
  };
}

/**
 * Share to edit (slice 30; mock-up 14): "Share to edit" starts a synced session and copies its link; while it lasts,
 * "Copy edit link" and "Stop sharing". A copied link says so on the item itself for a moment ("Link copied"), read out
 * to screen readers; a copy the browser refuses shows the link to copy by hand. Who joined shows beside the project
 * tile, by initial, at most three and a "+N". The items show only while a site is shown.
 */
function shareItems(port: ShareMenuPort, actionClass: string) {
  const root = node("div", "repository-menu__share");
  const main = node("button", `${actionClass} repository-menu__share-item`);
  main.type = "button";
  main.dataset.keepOpen = "";
  // Each item leads with its icon (mock-up 14): live for Share to edit, copy, a check once copied, stop.
  const mark = node("span", "repository-menu__share-icon");
  mark.setAttribute("aria-hidden", "true");
  const label = node("span", "repository-menu__share-label");
  label.setAttribute("aria-live", "polite");
  main.append(mark, label);
  const stop = button("Stop sharing", () => port.stop(), actionClass);
  const stopMark = node("span", "repository-menu__share-icon");
  stopMark.setAttribute("aria-hidden", "true");
  setIcon(stopMark, "stop", 16);
  stop.prepend(stopMark);
  const field = node("input", "repository-menu__share-link");
  field.readOnly = true;
  field.setAttribute("aria-label", "Edit link");
  field.addEventListener("focus", () => field.select());
  root.append(main, field, stop);
  const people = node("ul", "repository-menu__people");
  people.setAttribute("aria-label", "Editing with you");
  let copied: "yes" | "failed" | undefined;
  // A refusal said on the item for a moment: signed out, or anything else.
  let refused: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const draw = () => {
    const state = port.state();
    root.hidden = !port.available();
    const word = refused ?? (state.sharing
      ? copied === "yes" ? "Link copied" : copied === "failed" ? "Copy the link below" : "Copy edit link"
      : state.starting ? "Sharing…" : "Share to edit");
    if (label.textContent !== word) label.textContent = word;
    main.classList.toggle("is-done", copied === "yes");
    const icon = copied === "yes" ? "check" : state.sharing ? "copy" : "broadcast";
    if (mark.dataset.icon !== icon) { mark.dataset.icon = icon; setIcon(mark, icon, 16); }
    // Not `disabled`: a focused button that is disabled drops the keyboard's focus out of the menu.
    main.setAttribute("aria-disabled", String(!state.sharing && Boolean(state.starting)));
    stop.hidden = !state.sharing;
    field.hidden = !(state.sharing && copied === "failed");
    if (state.sharing) field.value = state.link;
    const guests = state.sharing ? state.guests : [];
    people.hidden = !guests.length;
    const shown = guests.slice(0, GUESTS_SHOWN);
    const rest = guests.slice(shown.length);
    people.replaceChildren(...shown.map((guest) => {
      const item = node("li", "person-chip", initialOf(guest.name));
      item.title = `${guest.name} (guest)`;
      item.setAttribute("aria-label", `${guest.name}, a guest`);
      item.dataset.colour = guest.colour;
      return item;
    }), ...rest.length ? [(() => {
      const more = node("li", "person-chip person-chip--more", `+${rest.length}`);
      more.title = rest.map((guest) => guest.name).join(", ");
      more.setAttribute("aria-label", `and ${rest.map((guest) => guest.name).join(", ")}, guests`);
      return more;
    })()] : []);
  };
  const later = (then: () => void) => { clearTimeout(timer); timer = setTimeout(() => { if (!destroyed) then(); }, COPIED_MS); };
  const copy = async (link: string) => {
    try { await navigator.clipboard.writeText(link); copied = "yes"; }
    catch { copied = "failed"; }
    if (destroyed) return;
    draw();
    if (copied === "failed") { clearTimeout(timer); field.focus(); return; }
    later(() => { copied = undefined; draw(); });
  };
  main.addEventListener("click", () => {
    const state = port.state();
    if (state.sharing) { void copy(state.link); return; }
    if (state.starting) return;
    port.start().then((link) => { if (link && !destroyed) return copy(link); }, (error: unknown) => {
      if (destroyed) return;
      // Signed out: signing in again is the way on. Anything else (no access any more, no connection): said as such.
      refused = (error as { status?: unknown } | null)?.status === 401 ? "Sign in to share" : "Couldn't share";
      draw();
      later(() => { refused = undefined; draw(); });
    });
  });
  const unwatch = port.watch((state) => { if (!state.sharing) { copied = undefined; } draw(); });
  draw();
  return { root, people, refresh: draw, destroy() { destroyed = true; unwatch(); clearTimeout(timer); } };
}

// The count of finished work on a tile's corner, its words for screen readers.
function tally() {
  const result = node("span", "repository-menu__finished");
  result.setAttribute("aria-hidden", "true");
  result.hidden = true;
  return result;
}
function told(notes: readonly FinishedNote[], words: string) {
  const shown = tally();
  shown.hidden = false;
  shown.textContent = String(noteCount(notes));
  return [shown, node("span", "sr-only", ` — ${words}`)];
}

export function initial(text: string) {
  const result = node("span", "repository-menu__initial", (text.match(/[a-z0-9]/i)?.[0] ?? "·").toUpperCase());
  // A stable hue per name tells repositories apart at a glance.
  let hash = 0;
  for (const character of text) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  result.style.setProperty("--initial-hue", String(hash % 360));
  result.setAttribute("aria-hidden", "true");
  return result;
}

export function avatar(login: string, url: string) {
  const image = node("img", "repository-menu__avatar");
  image.alt = "";
  image.width = 24;
  image.height = 24;
  image.referrerPolicy = "no-referrer";
  image.src = `${url}${url.includes("?") ? "&" : "?"}s=48`;
  image.addEventListener("error", () => image.replaceWith(initial(login)), { once: true });
  return image;
}
