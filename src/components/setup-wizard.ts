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
  type Connection,
  type WizardMemory,
  type WizardRepo,
  type WizardStepId,
} from "../setup-wizard";
import { GITHUB_INSTALL_MEDIA, installMedia } from "../onboarding-media";
import { listenForConnected } from "../wizard-tabs";
import { newRepositoryUrl, type CreateChoice } from "./get-started";
import { mountPublishStep } from "./publish-step";
import "./onboarding.css";
import "./setup-wizard.css";

// The Setup wizard: a full-screen guide for a new user, from "no GitHub
// account yet" to a site open in the editor. Numbered steps down the left,
// the current step on the right, Back and Next. Step 1 sends the user to
// GitHub once (installing the App also signs in) in a new tab and waits;
// step 2 makes the repository with its starting point already committed.

export type WizardCreateOutcome =
  | { ok: true; repo: WizardRepo; error?: string }
  /** `fallback`: the editor may not create it here; GitHub's own page instead. */
  | { ok: false; message: string; fallback?: boolean };

export interface SetupWizardOptions {
  /** The signed-in account, or null before sign-in. */
  login: string | null;
  /** The App is installed (and the user is signed in): step 1 is done. */
  connected: boolean;
  step: WizardStepId;
  memory?: WizardMemory;
  /** Where Connect GitHub goes: the editor's /auth/install. */
  connectUrl: string;
  /** Asks the Worker what GitHub connection this browser has. */
  connection: () => Promise<Connection>;
  loadOwners: () => Promise<OwnerInstallation[]>;
  create: (choice: CreateChoice) => Promise<WizardCreateOutcome>;
  /** Looks (uncached) for the repository a user was told to create on GitHub; the editor's own list may not have it yet. */
  findRepository: (choice: CreateChoice) => Promise<WizardRepo | undefined>;
  /** The prompt for a coding agent that does these steps (agent-menu.ts's setupPrompt). */
  agentPrompt: (choice: { name: string; private: boolean; owner?: string }, about: string) => string;
  remember: (change: Partial<WizardMemory>) => void;
  /** This tab was signed out and now is not: the host reloads it into the signed-in editor. */
  signedIn: () => void;
  /** The last step: open the editor on the new repository. */
  finish: (repo: WizardRepo) => void;
  /** Leave the wizard (to Get started, or back to the sign-in screen). */
  exit: () => void;
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function external(text: string, href: string, className = "text-link") {
  const anchor = link(`${text} ↗`, href, className);
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

/** What to click on GitHub: the recording when it has been added, else a drawn card. */
export function createInstallMediaSlot() {
  const figure = node("figure", "wizard-media");
  const media = installMedia();
  const caption = node("figcaption", "wizard-media__caption", GITHUB_INSTALL_MEDIA.description);
  if (media) {
    const video = node("video", "wizard-media__video");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", `What to click on GitHub. ${GITHUB_INSTALL_MEDIA.description}`);
    if (media.poster) video.poster = media.poster;
    for (const source of media.sources) {
      const element = node("source");
      element.src = source.src;
      element.type = source.type;
      video.append(element);
    }
    if (media.captions) {
      const track = node("track");
      track.kind = "captions";
      track.src = media.captions.src;
      track.label = media.captions.label;
      track.srclang = media.captions.lang;
      track.default = true;
      video.append(track);
    }
    figure.append(video);
    if (reducedMotion()) {
      // Reduced motion: the poster, and a button to play it.
      const play = button("", () => {
        play.remove();
        video.controls = true;
        void video.play().catch(() => undefined);
      }, "wizard-media__play");
      play.setAttribute("aria-label", "Play the recording");
      play.append(icon("play", 22), node("span", "", "Play"));
      figure.append(play);
    } else {
      video.autoplay = true;
      void video.play().catch(() => undefined);
    }
  } else {
    // The placeholder: GitHub's install dialog, drawn, with the cursor on the button.
    const mock = node("div", "wizard-mock");
    mock.setAttribute("role", "img");
    mock.setAttribute("aria-label", `An illustration of GitHub's install page. ${GITHUB_INSTALL_MEDIA.description}`);
    const row = (label: string, chosen: boolean) => {
      const item = node("div", `wizard-mock__row${chosen ? " is-chosen" : ""}`);
      item.append(node("span", "wizard-mock__radio"), node("span", "", label));
      return item;
    };
    const install = node("div", "wizard-mock__button", "Install & Authorize");
    const cursor = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    cursor.setAttribute("class", "wizard-mock__cursor");
    cursor.setAttribute("viewBox", "0 0 24 24");
    cursor.setAttribute("width", "26");
    cursor.setAttribute("height", "26");
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrow.setAttribute("d", "M5 3l14 8-6.2 1.6L9.6 19z");
    cursor.append(arrow);
    install.append(cursor);
    mock.append(
      node("div", "wizard-mock__title", "Install Native Site Editor"),
      node("div", "wizard-mock__label", "Repository access"),
      row("All repositories", true),
      row("Only select repositories", false),
      install,
    );
    const steps = node("ol", "wizard-media__steps");
    steps.append(node("li", "", "Choose All repositories."), node("li", "", "Select Install & Authorize."));
    figure.append(mock, steps);
    return { root: figure, destroy: () => undefined };
  }
  figure.append(caption);
  return { root: figure, destroy: () => undefined };
}

/** Shown in the tab GitHub sent the user back to, when the tab that waits is still open. */
export function createWizardLanding(options: { login: string; onContinue: () => void }) {
  const root = node("section", "wizard wizard--landing");
  root.setAttribute("aria-labelledby", "wizard-landing-title");
  const card = node("div", "wizard-landing");
  const title = node("h1", "", "GitHub is connected");
  title.id = "wizard-landing-title";
  title.tabIndex = -1;
  card.append(
    node("span", "wizard-landing__tick"),
    title,
    node("p", "wizard-text", `Signed in as ${options.login}. Go back to the editor tab where you started: it carries on by itself. You can close this tab.`),
    button("Continue here instead", options.onContinue, "button secondary"),
  );
  card.querySelector(".wizard-landing__tick")!.append(icon("check", 22));
  root.append(card);
  return { root, focus: () => title.focus() };
}

export function createSetupWizard(options: SetupWizardOptions) {
  const memory = options.memory;
  const state = {
    step: options.step,
    connected: options.connected,
    waiting: false,
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
  let stopListening: (() => void) | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let publishStep: { destroy?: () => void } | undefined;

  const root = node("section", "wizard");
  root.setAttribute("aria-label", "Set up your site");

  // ---- Waiting for GitHub ----
  function stopWaiting() {
    state.waiting = false;
    stopListening?.();
    stopListening = undefined;
    if (poll) clearInterval(poll);
    poll = undefined;
    options.remember({ waiting: false });
  }
  let checking = false;
  async function check() {
    if (!state.waiting || checking || destroyed) return;
    checking = true;
    try {
      const connection = await options.connection();
      if (!state.waiting || destroyed) return;
      if (options.login === null) {
        // Signed in by the other tab: this one's page knows nothing of it. Reload into the signed-in editor.
        if (connection !== "signed-out") {
          stopWaiting();
          options.remember({ step: connection === "installed" ? "create" : "connect" });
          options.signedIn();
        }
        return;
      }
      if (connection === "installed") {
        stopWaiting();
        state.connected = true;
        goTo("create");
      }
    } catch {
      // Asked again on the next visit.
    } finally {
      checking = false;
    }
  }
  function startWaiting() {
    state.waiting = true;
    options.remember({ waiting: true, step: "connect" });
    stopListening = listenForConnected(() => void check());
    poll = setInterval(() => void check(), 3000);
    render();
  }
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
        options.remember({ repo: found, step: "online" });
        goTo("online");
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
    void check();
    void checkManual(false);
  };
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  if (memory?.waiting && options.step === "connect" && !options.connected) {
    // A reload while waiting (or a return to this page): go on waiting.
    state.waiting = true;
    stopListening = listenForConnected(() => void check());
    poll = setInterval(() => void check(), 3000);
  }

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
      list.append(item);
    }
    return list;
  }

  // Step 1
  function connectStep(content: HTMLElement, footer: HTMLElement) {
    if (state.connected) {
      const done = node("p", "wizard-done");
      done.append(icon("check", 16), ` GitHub is connected${options.login ? ` as ${options.login}` : ""}. The editor can create and change your site's repository.`);
      content.append(done);
      footer.append(nextButton("Next", () => goTo("create")));
      return;
    }
    const left = node("div", "wizard-connect");
    const signup = node("p", "wizard-text");
    signup.append("No GitHub account yet? ", external("Create one free", "https://github.com/signup"), ", then confirm the email GitHub sends you.");
    left.append(signup);
    if (state.waiting) {
      const waiting = node("div", "wizard-waiting");
      waiting.setAttribute("role", "status");
      waiting.append(
        node("span", "wizard-spinner"),
        node("div", "wizard-waiting__text", "GitHub opened in a new tab. Come back here when you've finished."),
      );
      const actions = node("div", "wizard-actions");
      actions.append(
        button("Cancel", () => {
          stopWaiting();
          render();
        }, "button secondary"),
        external("Open GitHub again", options.connectUrl),
      );
      left.append(waiting, actions);
    } else {
      left.append(
        node("p", "wizard-text", "One trip to GitHub installs the editor and signs you in. There it asks which repositories to give the editor: choose All repositories. A new account has no repositories yet, and the editor only changes the ones you open."),
      );
      const connect = link("Connect GitHub", options.connectUrl, "button primary wizard-connect__button");
      connect.target = "_blank";
      connect.rel = "noopener noreferrer";
      connect.addEventListener("click", () => setTimeout(startWaiting, 0));
      left.append(connect);
    }
    left.append(agentLink(() => ({ name: state.name || DEFAULT_REPOSITORY_NAME, private: state.visibility === "private" })));
    const slot = createInstallMediaSlot();
    content.classList.add("wizard__content--split");
    content.append(left, slot.root);
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
      footer.append(nextButton("Next", () => goTo("online")));
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
        options.remember({ repo: outcome.repo, step: "online" });
        setTimeout(() => !destroyed && goTo("online"), reducedMotion() ? 0 : 700);
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

  // Step 3
  function onlineStep(content: HTMLElement, footer: HTMLElement) {
    footer.append(backButton(), nextButton("Skip for now", () => goTo("open")));
    const repo = state.repo;
    const mount = node("div", "wizard-publish");
    content.append(mount);
    if (repo) publishStep = mountPublishStep(mount, { id: repo.id, fullName: repo.fullName, private: repo.private, defaultBranch: repo.defaultBranch });
  }

  // Step 4
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
      node("p", "wizard-text", "A short Setup checklist follows you into the editor: name your site, put it online and connect an agent."),
    );
  }

  const titles: Record<WizardStepId, string> = {
    connect: "Connect GitHub",
    create: "Create your site",
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
      stopListening?.();
      if (poll) clearInterval(poll);
      clearTimeout(progressTimer);
      publishStep?.destroy?.();
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      root.remove();
    },
  };
}

