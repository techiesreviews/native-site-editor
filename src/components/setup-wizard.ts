import { handleChunkLoadFailure } from "../chunk-recovery";
import { button, link, node } from "../ui/dom";
import { reported } from "../ui/report-failure";
import { icon } from "../icons";
import {
  DEFAULT_REPOSITORY_NAME,
  siteNameFromRepository,
  type StartingPoint,
} from "../../shared/starting-point";
import type { OwnerInstallation } from "../../shared/types";
import {
  WIZARD_STEPS,
  stepBefore,
  stepNumber,
  type WizardMemory,
  type WizardRepo,
  type WizardStepId,
} from "../setup-wizard";
import { closeLightbox, createGithubTrip } from "./github-trip";
import { createRepositoryNameField } from "./repository-name-field";
import "./onboarding.css";
import "./setup-wizard.css";

// The Setup wizard: a full-screen guide for a signed-in account that has
// nothing to open yet, from "no site" to a site open in the editor. Steps
// down the left, the current step in one card on the right. The worker sends
// an account without the App to GitHub's install page by itself, so step 1
// (Connect GitHub) shows done, and shows its content only for an account that
// came back without having installed (a retry, with screenshots of what
// GitHub asks). Step 2 makes the repository with its starting point already
// committed, or opens one the account has ("Use a site you have"); the last
// page shows the new home page and the way into the editor. Naming the site
// and connecting an agent are setup items in the editor's Inbox.

export interface CreateChoice {
  name: string;
  /** The organisation to create it in; absent for the signed-in account. */
  owner?: string;
  private: boolean;
  point: StartingPoint;
}

/**
 * GitHub's New repository page, prefilled, for an empty repository: the
 * starting point is written by the editor when the repository opens (a
 * template copy would bring the template's own deployment and test address).
 */
export function newRepositoryUrl(choice: CreateChoice) {
  const url = new URL("https://github.com/new");
  if (choice.owner) url.searchParams.set("owner", choice.owner);
  url.searchParams.set("name", choice.name);
  url.searchParams.set("visibility", choice.private ? "private" : "public");
  url.searchParams.set("description", "A website edited with Native Site Editor");
  return url.href;
}

export type WizardCreateOutcome =
  | { ok: true; repo: WizardRepo; error?: string }
  /** `fallback`: the editor may not create it here; GitHub's own page instead. */
  | { ok: false; message: string; fallback?: boolean };

export interface SetupWizardOptions {
  /** The signed-in account. */
  login: string;
  /** The App is installed: step 1 is done. */
  connected: boolean;
  step: WizardStepId;
  memory?: WizardMemory;
  /** Where Connect GitHub goes, in this tab: the editor's /auth/install, which signs in on the way back. */
  connectUrl: string;
  /**
   * What Connect GitHub does: `install` (the default) installs the App for a signed-in
   * account; `register-app` is the owner of a fresh editor, not signed in, creating the
   * editor's own GitHub App first (owner setup). That guest stays on step 1.
   */
  connectPurpose?: "install" | "register-app";
  loadOwners: () => Promise<OwnerInstallation[]>;
  create: (choice: CreateChoice) => Promise<WizardCreateOutcome>;
  /** Looks (uncached) for the repository a user was told to create on GitHub; the editor's own list may not have it yet. */
  findRepository: (choice: CreateChoice) => Promise<WizardRepo | undefined>;
  /** The prompt for a coding agent that does these steps (agent-menu.ts's setupPrompt). */
  agentPrompt: (choice: { name: string; private: boolean; owner?: string; /** The site is made: no creating or access steps (owner/name). */ repository?: string }, about: string) => string;
  remember: (change: Partial<WizardMemory>) => void;
  /** The home page of the new site as one HTML document (styles inlined, no scripts), for the preview; undefined when it cannot be had. */
  loadPreview?: (repo: WizardRepo) => Promise<string | undefined>;
  /** The repositories the editor can open (uncached), for "Use a site you have". */
  listRepositories?: () => Promise<WizardRepo[]>;
  /** GitHub's page where the account chooses which repositories the editor may open; null when unknown. */
  accessUrl?: string | null;
  /** The last step, or a site the account has: open the editor on that repository. */
  finish: (repo: WizardRepo) => void;
  /** Leave the wizard (to the welcome page). */
  exit: () => void;
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function external(text: string, href: string, className = "text-link") {
  const anchor = link(`${text} ↗`, href, className);
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

export function createSetupWizard(options: SetupWizardOptions) {
  const memory = options.memory;
  const state = {
    step: options.step,
    connected: options.connected,
    name: memory?.name ?? DEFAULT_REPOSITORY_NAME,
    owner: memory?.owner ?? "",
    point: (memory?.point ?? "starter") as StartingPoint,
    visibility: (memory?.visibility ?? "public") as "public" | "private",
    repo: memory?.repo,
    /** Step 2: make a new repository, or open one the account has. */
    mode: "new" as "new" | "existing",
    busy: false,
    agentOpen: false,
    about: "",
    message: "",
    /** The repository the user was sent to create by hand on GitHub: this wizard waits for it to appear. */
    manual: undefined as CreateChoice | undefined,
  };
  let owners: OwnerInstallation[] | undefined;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let confetti: { remove: () => void } | undefined;
  /** "Use a site you have" with nothing to list: back on this tab, it lists again. */
  let relist: (() => void) | undefined;

  const root = node("section", "wizard");
  root.setAttribute("aria-label", "Set up your site");

  // The manual fallback: back on this tab, look for the repository the user made on GitHub, and carry on with it.
  let reportManual: (text: string) => void = () => undefined;
  let lookingForManual = false;
  async function checkManual(explicit: boolean) {
    const wanted = state.manual;
    if (!wanted || lookingForManual || destroyed) return;
    lookingForManual = true;
    try {
      const found = await options.findRepository(wanted);
      if (destroyed || state.manual !== wanted) return;
      if (found) {
        state.manual = undefined;
        state.repo = found;
        options.remember({ repo: found, step: "open" });
        goTo("open");
      } else if (explicit) {
        reportManual(`${wanted.name} is not there yet. Create it on GitHub and give the editor access to it, then try again.`);
      }
    } catch {
      if (explicit) reportManual("GitHub could not be asked. Try again.");
    } finally {
      lookingForManual = false;
    }
  }
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    void checkManual(false);
    relist?.();
  };
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  // ---- Navigation ----
  function goTo(step: WizardStepId, mode: typeof state.mode = "new") {
    confetti?.remove();
    confetti = undefined;
    relist = undefined;
    state.step = step;
    state.mode = mode;
    state.message = "";
    options.remember({ step });
    render();
    root.querySelector<HTMLElement>(".wizard__title")?.focus();
  }

  // ---- Pieces ----
  /** "Do this with an agent": a quiet button for the card's foot, and the box it opens in place. */
  function agentBox(choice: () => { name: string; private: boolean; owner?: string }) {
    const toggle = button("Do this with an agent", () => {
      state.agentOpen = !state.agentOpen;
      box.hidden = !state.agentOpen;
      toggle.setAttribute("aria-expanded", String(state.agentOpen));
      if (state.agentOpen) about.focus();
    }, "button wizard-quiet");
    toggle.setAttribute("aria-expanded", String(state.agentOpen));
    const box = node("div", "wizard-agent");
    box.hidden = !state.agentOpen;
    const label = node("label", "onboard-field");
    const about = node("input", "onboard-input");
    about.placeholder = "a pottery studio in Bristol";
    about.maxLength = 300;
    about.value = state.about;
    about.addEventListener("input", () => (state.about = about.value));
    label.append(node("span", "onboard-field__label", "What is the site about?"), about);
    const failed = node("span", "onboard-message");
    failed.setAttribute("role", "alert");
    // The button says it copied, for a moment.
    const showCopy = (copied: boolean) => {
      copy.replaceChildren(icon(copied ? "check" : "copy", 14), copied ? "Copied" : "Copy agent prompt");
    };
    const copy = button("", async () => {
      failed.textContent = "";
      try {
        await navigator.clipboard.writeText(options.agentPrompt(choice(), about.value));
        showCopy(true);
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => showCopy(false), 1500);
      } catch {
        failed.textContent = "Clipboard access was denied. Allow it in your browser and copy again.";
      }
    }, "button secondary onboard-copy");
    showCopy(false);
    box.append(label, copy, failed);
    return { toggle, box };
  }

  function stepper() {
    const list = node("ol", "wizard__steps");
    for (const [index, step] of WIZARD_STEPS.entries()) {
      const item = node("li", "wizard__step");
      const number = index + 1;
      const current = step.id === state.step;
      const done = number < stepNumber(state.step);
      if (current) item.setAttribute("aria-current", "step");
      item.classList.toggle("is-done", done);
      const badge = node("span", "wizard__badge");
      if (done) badge.append(icon("check", 12));
      else badge.textContent = String(number);
      item.append(badge, node("span", "wizard__step-title", step.title));
      list.append(item);
    }
    return list;
  }

  const signedIn = () => {
    const line = node("p", "wizard-signed");
    line.append(icon("check", 14), `Signed in as ${options.login}`);
    return line;
  };

  // Step 1: done for an account with the App; for one that came back without it (cancelled on GitHub), the retry.
  function connectStep(content: HTMLElement, footer: HTMLElement) {
    if (options.connectPurpose === "register-app") {
      registerAppStep(content, footer);
      return;
    }
    content.append(signedIn());
    if (state.connected) {
      footer.append(nextButton("Next", () => goTo("create")));
      return;
    }
    const figure = node("figure", "wizard-trip");
    figure.append(createGithubTrip(), node("figcaption", "wizard-hint", "What you'll see on GitHub"));
    content.append(node("p", "wizard-lead", "One more step on GitHub: install the editor on your account."), figure);
    footer.append(link("Connect GitHub", options.connectUrl, "button primary wizard-push"));
  }

  // Step 1 for the owner of a fresh editor: nobody is signed in yet, because the editor has no GitHub App to sign in with.
  function registerAppStep(content: HTMLElement, footer: HTMLElement) {
    content.append(node("p", "wizard-lead", "This editor has no GitHub App yet. Create one for it on GitHub, then sign in here."));
    footer.append(link("Create this editor's GitHub App", options.connectUrl, "button primary wizard-push"));
  }

  const nextButton = (text: string, action: () => void) => button(text, action, "button primary wizard-push");
  const backButton = () => button("Back", () => goTo(stepBefore(state.step)), "button secondary");

  // Step 2, "Use a site you have": the repositories the editor can open, each opened in one click.
  function existingStep(content: HTMLElement, footer: HTMLElement) {
    const list = node("ul", "wizard-repos");
    list.setAttribute("aria-busy", "true");
    const message = node("p", "onboard-message wizard-message");
    message.setAttribute("role", "status");
    content.append(list, message);
    footer.append(button("Start a new site", () => goTo("create"), "button wizard-quiet"));
    let listing = false;
    const fill = async () => {
      if (listing || !options.listRepositories) return;
      listing = true;
      try {
        const repos = await options.listRepositories();
        if (destroyed || !list.isConnected) return;
        list.removeAttribute("aria-busy");
        message.textContent = "";
        relist = repos.length ? undefined : () => void fill();
        if (repos.length) {
          list.replaceChildren(...repos.map((repo) => {
            const item = node("li", "wizard-repos__item");
            const mark = node("span", "wizard-repos__mark", repo.name.charAt(0).toUpperCase());
            mark.setAttribute("aria-hidden", "true");
            const open = button("Open", () => options.finish(repo), "button secondary");
            open.setAttribute("aria-label", `Open ${repo.fullName}`);
            item.append(mark, node("b", "wizard-repos__name", repo.fullName), open);
            return item;
          }));
          return;
        }
        // Nothing the editor may open yet: GitHub's page that gives it access, and back here it lists again.
        const none = node("li", "wizard-repos__none");
        none.append(node("span", "", "No repositories yet."));
        if (options.accessUrl) none.append(external("Choose repositories on GitHub", options.accessUrl, "button secondary"));
        list.replaceChildren(none);
      } catch {
        if (!destroyed) message.textContent = "GitHub could not be asked. Come back to this tab to try again.";
        relist = () => void fill();
      } finally {
        listing = false;
      }
    };
    void fill();
  }

  // Step 2
  function createStep(content: HTMLElement, footer: HTMLElement) {
    if (state.repo) {
      const done = node("p", "wizard-signed");
      done.append(icon("check", 14), `${state.repo.fullName} is created`);
      content.append(done);
      footer.append(nextButton("Next", () => goTo("open")));
      return;
    }
    const form = node("form", "wizard-form");
    form.noValidate = true;
    const login = options.login ?? "";
    // Owner: only when there is a choice.
    const ownerLabel = node("label", "onboard-field");
    const ownerSelect = node("select", "onboard-input");
    ownerSelect.name = "owner";
    ownerLabel.append(node("span", "onboard-field__label", "Owner"), ownerSelect);
    ownerLabel.hidden = true;
    const ownerName = () => (ownerSelect.value && !ownerLabel.hidden ? ownerSelect.value : login);
    const {
      label: nameLabel,
      input: nameInput,
      hint,
      show: showName,
    } = createRepositoryNameField({
      value: state.name,
      hintId: "wizard-name-hint",
      preview: (name) => `github.com/${ownerName()}/${name || "…"}`,
      normalised: () => {
        state.name = nameInput.value;
      },
    });
    nameInput.addEventListener("input", () => {
      state.name = nameInput.value;
      options.remember({ name: nameInput.value });
      showName();
    });
    ownerSelect.addEventListener("change", () => {
      state.owner = ownerSelect.value;
      options.remember({ owner: ownerSelect.value });
      showName();
    });
    const fillOwners = (list: OwnerInstallation[]) => {
      if (!list.length || !root.isConnected || (list.length === 1 && list[0].login.toLowerCase() === login.toLowerCase())) return;
      ownerSelect.replaceChildren(
        ...list.map((owner) => {
          const option = node("option", "", owner.type === "Organization" ? `${owner.login} (organisation)` : owner.login);
          option.value = owner.login;
          return option;
        }),
      );
      if (state.owner && list.some((owner) => owner.login === state.owner)) ownerSelect.value = state.owner;
      ownerSelect.disabled = list.length === 1;
      ownerLabel.hidden = false;
      showName();
    };
    if (owners) fillOwners(owners);
    else void options.loadOwners().then((list) => { owners = list; fillOwners(list); }, () => undefined);

    // A choice as a tile: the whole tile is the radio's label, and a check shows on the chosen one.
    const tile = <T extends string>(group: "point" | "visibility", value: T, label: string, chosen: () => T, choose: (value: T) => void, art?: HTMLElement) => {
      const card = node("label", "wizard-tile");
      const input = node("input");
      input.type = "radio";
      input.name = group;
      input.value = value;
      input.checked = chosen() === value;
      input.addEventListener("change", () => choose(value));
      const name = node("b", "wizard-tile__label", label);
      name.append(icon("check", 14));
      card.append(input, ...(art ? [art] : []), name);
      return card;
    };
    const pointArt = (value: StartingPoint) => {
      const art = node("span", `wizard-tile__art wizard-tile__art--${value}`);
      art.setAttribute("aria-hidden", "true");
      art.append(node("i", "a"), node("i", "b"), node("i", "c"), node("i", "d"));
      return art;
    };
    const group = (legend: string, ...tiles: HTMLElement[]) => {
      const set = node("fieldset", "onboard-group");
      const row = node("div", "wizard-tiles");
      row.append(...tiles);
      set.append(node("legend", "onboard-field__label", legend), row);
      return set;
    };
    const choosePoint = (value: StartingPoint) => { state.point = value; options.remember({ point: value }); };
    const chooseVisibility = (value: "public" | "private") => { state.visibility = value; options.remember({ visibility: value }); };
    const points = group("Start from",
      tile("point", "starter", "Starter site", () => state.point, choosePoint, pointArt("starter")),
      tile("point", "blank", "Blank page", () => state.point, choosePoint, pointArt("blank")),
    );
    const visibility = group("Visibility",
      tile("visibility", "public", "Public", () => state.visibility, chooseVisibility),
      tile("visibility", "private", "Private", () => state.visibility, chooseVisibility),
    );

    const message = node("p", "onboard-message wizard-message");
    message.setAttribute("role", "status");
    message.textContent = state.message;
    const fallback = node("div", "onboard-fallback");
    fallback.hidden = true;

    // While it works, the button itself says what is happening.
    const submit = node("button", "button primary wizard-push", "Create site");
    submit.type = "submit";
    const progress = (text?: string) => {
      if (!text) {
        submit.replaceChildren("Create site");
        return;
      }
      const spinner = node("span", "wizard-spinner");
      spinner.setAttribute("aria-hidden", "true");
      submit.replaceChildren(spinner, node("span", "", text));
    };
    form.addEventListener("submit", reported(async (event) => {
      event.preventDefault();
      if (state.busy) return;
      const problem = showName();
      if (problem) {
        nameInput.setAttribute("aria-invalid", "true");
        hint.classList.add("is-error");
        hint.textContent = problem;
        nameInput.focus();
        return;
      }
      const owner = ownerName();
      const choice: CreateChoice = {
        name: nameInput.value.trim(),
        ...(owner && owner.toLowerCase() !== login.toLowerCase() ? { owner } : {}),
        private: state.visibility === "private",
        point: state.point,
      };
      state.busy = true;
      form.setAttribute("aria-busy", "true");
      for (const field of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button")) field.disabled = true;
      fallback.hidden = true;
      state.manual = undefined;
      message.textContent = "";
      progress("Creating the repository…");
      progressTimer = setTimeout(() => state.busy && progress(`Adding ${state.point === "starter" ? "the Starter site" : "a blank page"}…`), 1200);
      let outcome: WizardCreateOutcome;
      try {
        outcome = await options.create(choice);
      } catch {
        outcome = { ok: false, message: "The site could not be created. Try again." };
      }
      clearTimeout(progressTimer);
      if (destroyed) return;
      state.busy = false;
      form.removeAttribute("aria-busy");
      if (outcome.ok) {
        progress("Done");
        state.repo = outcome.repo;
        options.remember({ repo: outcome.repo, step: "open" });
        setTimeout(() => !destroyed && goTo("open"), reducedMotion() ? 0 : 700);
        return;
      }
      progress();
      for (const field of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button")) field.disabled = false;
      ownerSelect.disabled = Boolean(owners && owners.length === 1);
      message.textContent = outcome.message;
      message.setAttribute("role", "alert");
      if (outcome.fallback) {
        const steps = node("ol", "onboard-steps");
        const first = node("li");
        first.append(external(`Create ${choice.name} on GitHub`, newRepositoryUrl(choice)), node("span", "wizard-hint", " Leave it empty: no README, .gitignore or license."));
        steps.append(first, node("li", "", "Give the editor access to it, then come back to this tab: the repository opens here."));
        const created = button("I've created it", () => void checkManual(true), "button primary");
        const found = node("p", "onboard-message");
        found.setAttribute("role", "status");
        reportManual = (text) => (found.textContent = text);
        fallback.replaceChildren(steps, created, found);
        fallback.hidden = false;
        state.manual = choice;
      }
    }));
    showName();
    const agent = agentBox(() => ({ name: nameInput.value.trim() || DEFAULT_REPOSITORY_NAME, private: state.visibility === "private", ...(ownerName().toLowerCase() !== login.toLowerCase() ? { owner: ownerName() } : {}) }));
    const foot = node("div", "wizard-foot");
    foot.append(button("Use a site you have", () => goTo("create", "existing"), "button wizard-quiet"), agent.toggle, submit);
    form.append(nameLabel, ownerLabel, points, visibility, message, fallback, agent.box, foot);
    content.append(form);
  }

  // Last page: the site is made. A moment, not a form: its home page, its address and the way in.
  function openStep(content: HTMLElement, footer: HTMLElement, panel: HTMLElement) {
    const repo = state.repo;
    if (!repo) {
      footer.append(backButton());
      content.append(node("p", "wizard-text", "Create your site first."));
      return;
    }
    panel.classList.add("wizard__panel--celebrate");
    const siteName = siteNameFromRepository(repo.name);

    const frame = node("div", "wizard-preview");
    const placeholder = node("div", "wizard-preview__card");
    placeholder.append(node("span", "brand-mark", "n"), node("span", "wizard-preview__title", siteName), node("span", "wizard-hint", repo.fullName));
    frame.append(placeholder);
    if (repo.committed && options.loadPreview) {
      void options.loadPreview(repo).then((html) => {
        if (!html || destroyed || !frame.isConnected) return;
        const view = node("iframe", "wizard-preview__frame");
        view.setAttribute("sandbox", "");
        view.setAttribute("title", `Preview of the ${siteName} home page`);
        view.setAttribute("tabindex", "-1");
        view.setAttribute("loading", "lazy");
        view.srcdoc = html;
        frame.replaceChildren(view);
        frame.classList.add("is-live");
        const fit = () => frame.style.setProperty("--preview-scale", String(frame.clientWidth / 1280));
        fit();
        if (typeof ResizeObserver === "function") new ResizeObserver(fit).observe(frame);
      }, () => undefined);
    }

    const where = `github.com/${repo.fullName}`;
    const address = node("p", "wizard-ready__where");
    address.append(external(where, `https://${where}`, "wizard-ready__link"));
    const open = button("Open the editor", () => options.finish(repo), "button primary wizard-ready__open");
    content.append(address);
    if (repo.partial) content.append(node("p", "wizard-hint", "Only part of your starting point was saved; the editor offers to finish adding it."));
    content.append(open);
    // The home page sits above the heading.
    panel.prepend(frame);
    if (!reducedMotion()) {
      void import("./confetti").then((module) => {
        if (destroyed || state.step !== "open" || !frame.isConnected) return;
        confetti = module.burst(frame);
      }).catch((error) => { void handleChunkLoadFailure(error); });
    }
  }

  const titles: Record<WizardStepId, string> = {
    connect: "Connect GitHub",
    create: "Create your site",
    open: "Your site is ready",
  };

  function render() {
    if (destroyed) return;
    const top = node("header", "wizard__top");
    const brand = node("span", "wizard__brand");
    brand.append(node("span", "brand-mark", "n"), node("span", "", "Native Site Editor"));
    const exit = button("", () => options.exit(), "wizard__exit");
    exit.setAttribute("aria-label", "Leave setup");
    exit.append(icon("x", 16));
    top.append(brand, exit);

    const compact = node("p", "wizard__compact");
    compact.append(node("strong", "", `Step ${stepNumber(state.step)} of ${WIZARD_STEPS.length}`), ` · ${WIZARD_STEPS[stepNumber(state.step) - 1].title}`);
    const aside = node("nav", "wizard__aside");
    aside.setAttribute("aria-label", "Setup steps");
    aside.append(stepper());

    const existing = state.step === "create" && state.mode === "existing";
    const panel = node("div", "wizard__panel");
    const title = node("h1", "wizard__title", existing ? "Use a site you have" : titles[state.step]);
    title.tabIndex = -1;
    const content = node("div", "wizard__content");
    const footer = node("div", "wizard__footer wizard-foot");
    panel.append(title, content, footer);
    if (state.step === "connect") connectStep(content, footer);
    else if (existing) existingStep(content, footer);
    else if (state.step === "create") createStep(content, footer);
    else openStep(content, footer, panel);

    const main = node("div", "wizard__main");
    main.append(compact, panel);
    const body = node("div", "wizard__body");
    body.append(aside, main);
    root.replaceChildren(top, body);
  }
  render();

  return {
    root,
    focus: () => root.querySelector<HTMLElement>(".wizard__title")?.focus(),
    destroy() {
      destroyed = true;
      closeLightbox();
      clearTimeout(progressTimer);
      clearTimeout(copiedTimer);
      confetti?.remove();
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      root.remove();
    },
  };
}

