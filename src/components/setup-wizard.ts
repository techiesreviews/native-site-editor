import { button, link, node } from "../ui/dom";
import { icon } from "../icons";
import {
  DEFAULT_REPOSITORY_NAME,
  repositoryNameProblem,
  suggestedRepositoryName,
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
import { AGENT_EXPLAINER } from "../onboarding-copy";
import { closeLightbox, createGithubTrip } from "./github-trip";
import { newRepositoryUrl, type CreateChoice } from "./get-started";
import { mountPublishStep } from "./publish-step";
import "./onboarding.css";
import "./setup-wizard.css";

// The Setup wizard: a full-screen guide for a signed-in account that has
// nothing to open yet, from "no site" to a site open in the editor. Numbered
// steps down the left, the current step on the right, Back and Next. The
// sign-in screen has no part in it: the worker sends an account without the
// App to GitHub's install page by itself, so step 1 (Connect GitHub) shows
// done, and shows its content only for an account that came back without
// having installed (a retry, with screenshots of what GitHub asks). Step 2
// makes the repository with its starting point already committed; step 3 is
// the optional agent connection.

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
  loadOwners: () => Promise<OwnerInstallation[]>;
  create: (choice: CreateChoice) => Promise<WizardCreateOutcome>;
  /** Looks (uncached) for the repository a user was told to create on GitHub; the editor's own list may not have it yet. */
  findRepository: (choice: CreateChoice) => Promise<WizardRepo | undefined>;
  /** The prompt for a coding agent that does these steps (agent-menu.ts's setupPrompt). */
  agentPrompt: (choice: { name: string; private: boolean; owner?: string; /** The site is made: no creating or access steps (owner/name). */ repository?: string }, about: string) => string;
  remember: (change: Partial<WizardMemory>) => void;
  /** The last step: open the editor on the new repository. */
  finish: (repo: WizardRepo) => void;
  /** Leave the wizard (to Get started). */
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
    busy: false,
    agentOpen: false,
    about: "",
    message: "",
    /** The repository the user was sent to create by hand on GitHub: this wizard waits for it to appear. */
    manual: undefined as CreateChoice | undefined,
    progress: undefined as "creating" | "adding" | "done" | undefined,
  };
  let owners: OwnerInstallation[] | undefined;
  let copiedAgent = false;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let publishStep: { destroy?: () => void } | undefined;

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
        options.remember({ repo: found, step: "agent" });
        goTo("agent");
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
  };
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  // ---- Navigation ----
  function goTo(step: WizardStepId) {
    publishStep?.destroy?.();
    publishStep = undefined;
    state.step = step;
    state.message = "";
    options.remember({ step });
    render();
    root.querySelector<HTMLElement>(".wizard__title")?.focus();
  }

  // ---- Pieces ----
  function agentLink(choice: () => { name: string; private: boolean; owner?: string }) {
    const wrap = node("div", "wizard-agent");
    const toggle = button("Do this with an agent", () => {
      state.agentOpen = !state.agentOpen;
      panel.hidden = !state.agentOpen;
      toggle.setAttribute("aria-expanded", String(state.agentOpen));
      if (state.agentOpen) about.focus();
    }, "wizard-quiet");
    toggle.setAttribute("aria-expanded", String(state.agentOpen));
    const panel = node("div", "wizard-agent__panel");
    panel.hidden = !state.agentOpen;
    const label = node("label", "onboard-field");
    const about = node("input", "onboard-input");
    about.placeholder = "a pottery studio in Bristol";
    about.maxLength = 300;
    about.value = state.about;
    about.addEventListener("input", () => (state.about = about.value));
    label.append(node("span", "onboard-field__label", "What is the site about?"), about);
    const copied = node("span", "onboard-message");
    copied.setAttribute("role", "status");
    const copy = button("Copy agent prompt", async () => {
      try {
        await navigator.clipboard.writeText(options.agentPrompt(choice(), about.value));
        copied.textContent = "Copied. Paste it into Claude Code, Codex or another coding agent.";
      } catch {
        copied.textContent = "Clipboard access was denied. Allow it in your browser and copy again.";
      }
    }, "button secondary onboard-copy");
    copy.prepend(icon("copy", 14));
    const row = node("div", "onboard-agent__row");
    row.append(label, copy);
    panel.append(
      node("p", "wizard-hint", "A coding agent can create the repository and build the site through the editor; you review its changes here and save them."),
      row,
      copied,
    );
    wrap.append(toggle, panel);
    return wrap;
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
      if (step.optional) item.append(node("span", "wizard__optional", "Optional"));
      list.append(item);
    }
    return list;
  }

  // Step 1: done for an account with the App; for one that came back without it (cancelled on GitHub), the retry.
  function connectStep(content: HTMLElement, footer: HTMLElement) {
    if (state.connected) {
      const done = node("p", "wizard-done");
      done.append(icon("check", 16), ` GitHub is connected as ${options.login}. The editor can create and change your site's repository.`);
      content.append(done);
      footer.append(nextButton("Next", () => goTo("create")));
      return;
    }
    const intro = node("p", "wizard-text wizard-signed-in");
    intro.append(node("strong", "", "You're signed in."), " One more step on GitHub: install the editor on your account.");
    const how = node("p", "wizard-text", "This is one trip: GitHub installs the editor and signs you in together, so there is nothing to do twice. If you left GitHub before finishing, connect again.");
    const heading = node("h2", "wizard-subtitle", "What you'll see on GitHub");
    const trip = createGithubTrip({
      note: "GitHub asks you to authorize the editor (it signs you in) and to install it: choose All repositories. A new account has no repositories yet, and the editor only changes the ones you open. Then you come back here automatically, and the wizard carries on.",
    });
    const connect = link("Connect GitHub", options.connectUrl, "button primary wizard-connect__button");
    const actions = node("div", "wizard-actions");
    actions.append(connect);
    content.append(intro, how, heading, trip, actions, agentLink(() => ({ name: state.name || DEFAULT_REPOSITORY_NAME, private: state.visibility === "private" })));
    footer.append(nextButton("Next", () => goTo("create"), true));
  }

  const nextButton = (text: string, action: () => void, disabled = false, className = "button primary") => {
    const next = button(text, action, className);
    next.disabled = disabled;
    return next;
  };
  const backButton = () => button("Back", () => goTo(stepBefore(state.step)), "button secondary");

  // Step 2
  function createStep(content: HTMLElement, footer: HTMLElement) {
    footer.append(backButton());
    if (state.repo) {
      const done = node("p", "wizard-done");
      done.append(icon("check", 16), ` ${state.repo.fullName} is created${state.repo.committed ? " with your starting point saved as its first commit" : ""}.`);
      content.append(done);
      footer.append(nextButton("Next", () => goTo("agent")));
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
    const nameLabel = node("label", "onboard-field");
    const nameInput = node("input", "onboard-input");
    nameInput.name = "name";
    nameInput.value = state.name;
    nameInput.autocomplete = "off";
    nameInput.spellcheck = false;
    nameInput.maxLength = 100;
    const hint = node("span", "onboard-field__hint");
    hint.id = "wizard-name-hint";
    nameInput.setAttribute("aria-describedby", hint.id);
    nameLabel.append(node("span", "onboard-field__label", "Repository name"), nameInput, hint);
    const ownerName = () => (ownerSelect.value && !ownerLabel.hidden ? ownerSelect.value : login);
    const showName = () => {
      const name = nameInput.value.trim();
      const problem = repositoryNameProblem(name);
      nameInput.setAttribute("aria-invalid", String(Boolean(problem && name)));
      hint.classList.toggle("is-error", Boolean(problem && name));
      hint.textContent = problem && name ? problem : `github.com/${ownerName()}/${name || "…"}`;
      return problem;
    };
    nameInput.addEventListener("input", () => {
      state.name = nameInput.value;
      options.remember({ name: nameInput.value });
      showName();
    });
    nameInput.addEventListener("change", () => {
      const suggested = suggestedRepositoryName(nameInput.value);
      if (suggested && suggested !== nameInput.value) nameInput.value = suggested;
      state.name = nameInput.value;
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

    const pointCard = (value: StartingPoint, label: string, hintText: string) => {
      const card = node("label", "wizard-card");
      const input = node("input");
      input.type = "radio";
      input.name = "point";
      input.value = value;
      input.checked = state.point === value;
      input.addEventListener("change", () => {
        state.point = value;
        options.remember({ point: value });
      });
      const art = node("span", `wizard-card__art wizard-card__art--${value}`);
      art.setAttribute("aria-hidden", "true");
      art.append(node("i", "a"), node("i", "b"), node("i", "c"), node("i", "d"));
      card.append(input, art, node("span", "wizard-card__label", label), node("span", "wizard-hint", hintText));
      return card;
    };
    const points = node("fieldset", "onboard-group wizard-points");
    points.append(
      node("legend", "onboard-field__label", "Start from"),
      pointCard("starter", "Starter site", "Pages, components and styles to make your own."),
      pointCard("blank", "Blank page", "One page and a stylesheet."),
    );

    const visibility = node("fieldset", "onboard-group");
    const visibilityOption = (value: "public" | "private", label: string, hintText: string) => {
      const row = node("label", "onboard-option");
      const input = node("input");
      input.type = "radio";
      input.name = "visibility";
      input.value = value;
      input.checked = state.visibility === value;
      input.addEventListener("change", () => {
        state.visibility = value;
        options.remember({ visibility: value });
      });
      const text = node("span", "onboard-option__text");
      text.append(node("span", "onboard-option__label", label), node("span", "onboard-option__hint", hintText));
      row.append(input, text);
      return row;
    };
    visibility.append(
      node("legend", "onboard-field__label", "Visibility"),
      visibilityOption("public", "Public", "Anyone can see the files."),
      visibilityOption("private", "Private", "Only you and people you invite."),
    );
    const note = node("p", "wizard-hint", "Free hosting needs Public.");

    const message = node("p", "onboard-message wizard-message");
    message.setAttribute("role", "status");
    message.textContent = state.message;
    const progress = node("ol", "wizard-progress");
    progress.hidden = true;
    const fallback = node("div", "onboard-fallback");
    fallback.hidden = true;

    const submit = node("button", "button primary", "Create site");
    submit.type = "submit";
    const draw = (stage: typeof state.progress) => {
      state.progress = stage;
      progress.hidden = !stage;
      if (!stage) return;
      const point = state.point === "starter" ? "the Starter site" : "a blank page";
      const lines: [string, "creating" | "adding" | "done"][] = [
        ["Creating the repository…", "creating"],
        [`Adding ${point}…`, "adding"],
        ["Done", "done"],
      ];
      const order = ["creating", "adding", "done"];
      progress.replaceChildren(
        ...lines.map(([text, id]) => {
          const item = node("li", "wizard-progress__item", text);
          const at = order.indexOf(stage);
          const here = order.indexOf(id);
          item.classList.toggle("is-done", here < at || stage === "done");
          if (here === at && stage !== "done") item.setAttribute("aria-current", "step");
          if (here > at) item.classList.add("is-later");
          return item;
        }),
      );
    };
    form.addEventListener("submit", async (event) => {
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
      back.disabled = true;
      fallback.hidden = true;
      state.manual = undefined;
      message.textContent = "";
      draw("creating");
      progressTimer = setTimeout(() => state.busy && draw("adding"), 1200);
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
        draw("done");
        state.repo = outcome.repo;
        options.remember({ repo: outcome.repo, step: "agent" });
        setTimeout(() => !destroyed && goTo("agent"), reducedMotion() ? 0 : 700);
        return;
      }
      draw(undefined);
      for (const field of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button")) field.disabled = false;
      ownerSelect.disabled = Boolean(owners && owners.length === 1);
      back.disabled = false;
      message.textContent = outcome.message;
      message.setAttribute("role", "alert");
      if (outcome.fallback) {
        const steps = node("ol", "onboard-steps");
        const first = node("li");
        first.append(external(`Create ${choice.name} on GitHub`, newRepositoryUrl(choice)), node("span", "wizard-hint", " Leave it empty: no README, .gitignore or license."));
        steps.append(first, node("li", "", "Give the editor access to it, then come back to this tab: the repository opens here."));
        const other = button("Use a repository you have", options.exit, "button secondary");
        const created = button("I've created it", () => void checkManual(true), "button primary");
        const found = node("p", "onboard-message");
        found.setAttribute("role", "status");
        reportManual = (text) => (found.textContent = text);
        const row = node("div", "wizard-actions");
        row.append(created, other);
        fallback.replaceChildren(steps, row, found);
        fallback.hidden = false;
        state.manual = choice;
      }
    });
    showName();
    const back = footer.querySelector<HTMLButtonElement>("button")!;
    form.append(
      nameLabel,
      ownerLabel,
      points,
      visibility,
      note,
      node("div", "wizard-actions"),
      progress,
      message,
      fallback,
      agentLink(() => ({ name: nameInput.value.trim() || DEFAULT_REPOSITORY_NAME, private: state.visibility === "private", ...(ownerName().toLowerCase() !== login.toLowerCase() ? { owner: ownerName() } : {}) })),
    );
    form.querySelector(".wizard-actions")!.append(submit);
    content.append(form);
  }

  // Step 3: the agent connection, which lives in the project menu of the editor (not open yet): a drawn top bar shows where.
  function topBarMock() {
    const mock = node("div", "wizard-bar");
    mock.setAttribute("role", "img");
    mock.setAttribute("aria-label", "A picture of the editor's top bar. At the top left is the project menu, marked in orange; its Connect with MCP entry is where an agent connects.");
    const bar = node("div", "wizard-bar__bar");
    const tile = node("span", "wizard-bar__tile");
    const badge = node("span", "wizard-bar__badge", (state.repo?.name ?? state.name ?? "m").charAt(0).toUpperCase() || "M");
    const caret = node("span", "wizard-bar__caret");
    caret.append(icon("caret-down", 12));
    tile.append(badge, node("span", "wizard-bar__name", state.repo?.name ?? (state.name || DEFAULT_REPOSITORY_NAME)), caret);
    const page = node("span", "wizard-bar__page");
    page.append("Home", icon("caret-down", 12));
    const pill = node("span", "wizard-bar__pill");
    pill.append(icon("list-checks", 14), "Setup 1/4");
    bar.append(tile, page, node("span", "wizard-bar__spacer"), pill, node("span", "wizard-bar__save", "Save"));
    const menu = node("div", "wizard-bar__menu");
    menu.append(
      node("span", "wizard-bar__row", "Repositories"),
      node("span", "wizard-bar__row wizard-bar__row--agent", "Connect with MCP"),
      node("span", "wizard-bar__row", "Sign out"),
    );
    const label = node("span", "wizard-bar__label");
    label.append(icon("arrow-up-right", 14), "Agents connect here");
    mock.append(bar, menu, label);
    return mock;
  }
  function agentStep(content: HTMLElement, footer: HTMLElement) {
    footer.append(backButton());
    content.append(node("p", "wizard-hint wizard-optional", "Optional. You can do this later from the checklist in the editor."));
    for (const line of AGENT_EXPLAINER) content.append(node("p", "wizard-text", line));
    content.append(
      node("p", "wizard-text", "When the editor opens you will find the agent connection in the project menu, at the top left. Open it and choose Connect with MCP."),
      topBarMock(),
    );
    const copied = node("p", "onboard-message");
    copied.setAttribute("role", "status");
    const copy = button("Copy the agent setup now", async () => {
      const choice = state.repo
        ? { name: state.repo.name, private: state.repo.private, repository: state.repo.fullName, ...(state.repo.owner && state.repo.owner.toLowerCase() !== options.login.toLowerCase() ? { owner: state.repo.owner } : {}) }
        : { name: state.name || DEFAULT_REPOSITORY_NAME, private: state.visibility === "private" };
      try {
        await navigator.clipboard.writeText(options.agentPrompt(choice, ""));
        copied.textContent = "Copied. Paste it into Claude Code, Codex or another coding agent.";
        copiedAgent = true;
        skip.textContent = "Next";
        skip.className = "button primary";
      } catch {
        copied.textContent = "Clipboard access was denied. Allow it in your browser and copy again.";
      }
    }, "button secondary onboard-copy");
    copy.prepend(icon("copy", 14));
    const row = node("div", "wizard-actions");
    row.append(copy);
    content.append(row, copied);
    const skip = nextButton(copiedAgent ? "Next" : "Skip", () => goTo("online"), false, copiedAgent ? "button primary" : "button secondary");
    footer.append(skip);
  }

  // Step 4
  function onlineStep(content: HTMLElement, footer: HTMLElement) {
    footer.append(backButton(), nextButton("Skip for now", () => goTo("open")));
    const repo = state.repo;
    const mount = node("div", "wizard-publish");
    content.append(mount);
    if (repo) publishStep = mountPublishStep(mount, { id: repo.id, fullName: repo.fullName, private: repo.private, defaultBranch: repo.defaultBranch });
  }

  // Step 5
  function openStep(content: HTMLElement, footer: HTMLElement) {
    const repo = state.repo;
    footer.append(backButton());
    const open = nextButton("Open the editor", () => repo && options.finish(repo));
    footer.append(open);
    if (!repo) {
      content.append(node("p", "wizard-text", "Create your site first."));
      open.disabled = true;
      return;
    }
    const done = node("p", "wizard-done");
    done.append(
      icon("check", 16),
      repo.committed
        ? ` ${repo.fullName} is on GitHub with your starting point saved as its first commit.`
        : repo.partial
          ? ` ${repo.fullName} is on GitHub, but only part of your starting point was saved. The editor offers to finish adding it when it opens.`
          : ` ${repo.fullName} is on GitHub. Its starting point is added when the editor opens it.`,
    );
    content.append(
      done,
      node("p", "wizard-text", "A short Setup checklist follows you into the editor: name your site, connect an agent and put it online."),
    );
  }

  const titles: Record<WizardStepId, string> = {
    connect: "Connect GitHub",
    create: "Create your site",
    agent: "Connect an agent",
    online: "Put it online",
    open: "Your site is ready",
  };

  function render() {
    if (destroyed) return;
    publishStep?.destroy?.();
    publishStep = undefined;
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

    const panel = node("div", "wizard__panel");
    const title = node("h1", "wizard__title", titles[state.step]);
    title.tabIndex = -1;
    const content = node("div", "wizard__content");
    const footer = node("div", "wizard__footer");
    if (state.step === "connect") connectStep(content, footer);
    else if (state.step === "create") createStep(content, footer);
    else if (state.step === "agent") agentStep(content, footer);
    else if (state.step === "online") onlineStep(content, footer);
    else openStep(content, footer);
    panel.append(title, content, footer);

    const body = node("div", "wizard__body");
    body.append(aside, panel);
    root.replaceChildren(top, compact, body);
  }
  render();

  return {
    root,
    focus: () => root.querySelector<HTMLElement>(".wizard__title")?.focus(),
    destroy() {
      destroyed = true;
      closeLightbox();
      clearTimeout(progressTimer);
      publishStep?.destroy?.();
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      root.remove();
    },
  };
}

