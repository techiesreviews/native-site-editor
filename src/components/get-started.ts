import { button, link, node } from "../ui/dom";
import { icon } from "../icons";
import {
  DEFAULT_REPOSITORY_NAME,
  type StartingPoint,
} from "../../shared/starting-point";
import type { OwnerInstallation } from "../../shared/types";
import { createCommand, setupPrompt } from "../agent-prompts";
import { createRepositoryNameField } from "./repository-name-field";
import "./onboarding.css";

// Get started: the screen of a signed-in account with no repository in the
// editor yet, in two columns, as a new project page would have them: Create
// a site (a new repository, public or private, starting from the Starter
// site or a Blank page) and Use a repository you have (give the editor
// access on GitHub). Below them, Set up with an agent copies a prompt for a
// coding agent that does the same through the GitHub CLI and the editor's
// MCP server.
//
// Creating needs the GitHub App's Administration permission on an
// installation on the account. Without it the editor cannot, and the form
// offers GitHub's own New repository page, prefilled, then the access step.

export type CreateOutcome =
  | { ok: true }
  /** The editor may not create it: GitHub's page instead. `created`: it exists, only access is missing. */
  | { ok: false; fallback: true; message: string; created?: boolean }
  | { ok: false; fallback?: false; message: string };

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

function radio(name: string, value: string, label: string, hint: string, checked = false) {
  const row = node("label", "onboard-option");
  const input = node("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  const text = node("span", "onboard-option__text");
  text.append(node("span", "onboard-option__label", label));
  if (hint) text.append(node("span", "onboard-option__hint", hint));
  row.append(input, text);
  return row;
}

function external(text: string, href: string, className = "button secondary") {
  const anchor = link(`${text} ↗`, href, className);
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

export function createGetStarted(options: {
  login: string;
  /** Where the editor's GitHub App is installed or its repositories chosen. */
  installUrl: string | null;
  /** The editor's address, for the agent prompt. */
  editor: string;
  create: (choice: CreateChoice) => Promise<CreateOutcome>;
  reload: () => void;
  /** The accounts and organisations the editor is installed on; the Owner picker shows when there is more than one. */
  loadOwners?: () => Promise<OwnerInstallation[]>;
}) {
  const root = node("section", "get-started");
  root.setAttribute("aria-labelledby", "get-started-title");
  const title = node("h1", "", "Get started");
  title.id = "get-started-title";
  root.append(
    node("div", "intro-label", `Signed in as ${options.login}`),
    title,
    node(
      "p",
      "intro",
      "A site lives in a GitHub repository: its files are the site, and the editor saves your changes there. Create one for a new site, or use one you have.",
    ),
  );

  // ---- Create a site ----
  const form = node("form", "onboard-card get-started__create");
  form.noValidate = true;
  form.setAttribute("aria-labelledby", "create-site-title");
  const createTitle = node("h2", "onboard-card__title", "Create a site");
  createTitle.id = "create-site-title";
  const {
    label: nameLabel,
    input: nameInput,
    hint: nameHint,
    show: showName,
  } = createRepositoryNameField({
    value: DEFAULT_REPOSITORY_NAME,
    hintId: "repository-name-hint",
    preview: (name) => (ownerLabel.hidden ? `github.com/${options.login}/${name || "…"}` : `Creates ${ownerSelect.value}/${name || "…"}`),
  });
  // Owner: the personal account or an organisation with an installation, shown once there is a choice.
  const ownerLabel = node("label", "onboard-field");
  const ownerSelect = node("select", "onboard-input");
  ownerSelect.name = "owner";
  ownerLabel.append(node("span", "onboard-field__label", "Owner"), ownerSelect);
  ownerLabel.hidden = true;
  const visibility = node("fieldset", "onboard-group");
  visibility.append(
    node("legend", "onboard-field__label", "Visibility"),
    radio("visibility", "public", "Public", "Anyone can see the files; most free hosts need this.", true),
    radio("visibility", "private", "Private", "Only you and people you invite."),
  );
  const start = node("fieldset", "onboard-group");
  start.append(
    node("legend", "onboard-field__label", "Start from"),
    radio("point", "starter", "Starter site", "A small studio site with pages, components and styles to make your own.", true),
    radio("point", "blank", "Blank page", "One page and a stylesheet."),
  );
  const submit = node("button", "button primary", "Create repository");
  submit.type = "submit";
  const message = node("p", "onboard-message");
  message.setAttribute("role", "status");
  const fallback = node("div", "onboard-fallback");
  fallback.hidden = true;
  form.append(createTitle, ownerLabel, nameLabel, visibility, start, submit, message, fallback);

  const choice = (): CreateChoice => ({
    name: nameInput.value.trim(),
    ...(ownerSelect.value && ownerSelect.value.toLowerCase() !== options.login.toLowerCase() ? { owner: ownerSelect.value } : {}),
    private: (form.elements.namedItem("visibility") as RadioNodeList).value === "private",
    point: (form.elements.namedItem("point") as RadioNodeList).value === "blank" ? "blank" : "starter",
  });
  nameInput.addEventListener("input", () => {
    showName();
    agentPrompt();
  });
  showName();
  ownerSelect.addEventListener("change", () => {
    showName();
    agentPrompt();
  });
  void options.loadOwners?.().then((owners) => {
    // A choice, or the only possible owner is an organisation (the personal account has no installation).
    if (!owners.length || !root.isConnected || (owners.length === 1 && owners[0].login.toLowerCase() === options.login.toLowerCase())) return;
    ownerSelect.replaceChildren(
      ...owners.map((owner) => {
        const option = node("option", "", owner.type === "Organization" ? `${owner.login} (organisation)` : owner.login);
        option.value = owner.login;
        return option;
      }),
    );
    ownerSelect.disabled = owners.length === 1;
    ownerLabel.hidden = false;
    showName();
    agentPrompt();
  }, () => undefined);

  function showFallback(chosen: CreateChoice, text: string, created?: boolean) {
    message.textContent = text;
    const steps = node("ol", "onboard-steps");
    const first = node("li");
    first.append(
      created
        ? node("span", "", `${chosen.name} is on GitHub.`)
        : external(`Create ${chosen.name} on GitHub`, newRepositoryUrl(chosen), "text-link"),
    );
    if (!created)
      first.append(
        node("span", "onboard-card__note", ` Leave it empty: no README, .gitignore or license. The editor adds ${chosen.point === "starter" ? "the Starter site" : "a blank page"} once it opens the repository.`),
      );
    const second = node("li");
    if (options.installUrl) second.append(external("Give the editor access to it", options.installUrl, "text-link"));
    else second.append(node("span", "", "Give the editor access to it on GitHub."));
    const third = node("li", "", "Come back to this tab: the repository opens here.");
    steps.append(first, second, third);
    fallback.replaceChildren(steps);
    fallback.hidden = false;
  }
  let busy = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const problem = showName();
    if (problem) {
      nameInput.setAttribute("aria-invalid", "true");
      nameHint.classList.add("is-error");
      nameHint.textContent = problem;
      nameInput.focus();
      return;
    }
    const chosen = choice();
    busy = true;
    submit.disabled = true;
    fallback.hidden = true;
    message.textContent = `Creating ${chosen.name}…`;
    try {
      const outcome = await options.create(chosen);
      if (outcome.ok) message.textContent = `Created ${chosen.name}. Opening it…`;
      else if (outcome.fallback) showFallback(chosen, outcome.message, outcome.created);
      else message.textContent = outcome.message;
    } finally {
      busy = false;
      if (root.isConnected) submit.disabled = false;
    }
  });

  // ---- Use a repository you have ----
  const existing = node("div", "onboard-card get-started__existing");
  existing.setAttribute("role", "group");
  existing.setAttribute("aria-labelledby", "existing-site-title");
  const existingTitle = node("h2", "onboard-card__title", "Use a repository you have");
  existingTitle.id = "existing-site-title";
  const existingActions = node("div", "actions");
  if (options.installUrl) existingActions.append(external("Give the editor access", options.installUrl, "button primary"));
  existingActions.append(button("Reload repositories", options.reload));
  existing.append(
    existingTitle,
    node(
      "p",
      "onboard-card__text",
      "Choose repositories on your GitHub account, or an organisation you belong to, for the editor. A repository with index.html at its top opens as a site; one without starts from the Starter site or a blank page.",
    ),
    existingActions,
    node("p", "onboard-card__note", "Coming back to this tab lists them."),
  );

  const columns = node("div", "get-started__columns");
  columns.append(form, existing);

  // ---- Set up with an agent ----
  const agent = node("div", "onboard-card onboard-agent");
  agent.setAttribute("role", "group");
  agent.setAttribute("aria-labelledby", "agent-setup-title");
  const agentTitle = node("h2", "onboard-card__title");
  agentTitle.id = "agent-setup-title";
  agentTitle.append(icon("sparkle", 16), " Set up with an agent");
  const aboutLabel = node("label", "onboard-field");
  const about = node("input", "onboard-input");
  about.name = "about";
  about.placeholder = "a pottery studio in Bristol";
  about.maxLength = 300;
  aboutLabel.append(node("span", "onboard-field__label", "What is the site about?"), about);
  const copy = button("Copy agent prompt", () => void copyPrompt(), "button secondary onboard-copy");
  copy.prepend(icon("copy", 14));
  const copied = node("span", "onboard-message");
  copied.setAttribute("role", "status");
  const gh = node("p", "onboard-card__note");
  const ghCommand = node("code");
  gh.append("Agents with the GitHub CLI create the repository themselves (", ghCommand, "), then ask you to give the editor access to it.");
  function agentPrompt() {
    const chosen = choice();
    const name = chosen.name || DEFAULT_REPOSITORY_NAME;
    ghCommand.textContent = createCommand({ name, private: chosen.private, owner: chosen.owner });
    return setupPrompt({ editor: options.editor, installUrl: options.installUrl, name, private: chosen.private, owner: chosen.owner, about: about.value });
  }
  form.addEventListener("change", () => agentPrompt());
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(agentPrompt());
      copied.textContent = "Copied. Paste it into Claude Code, Codex or another coding agent.";
    } catch {
      copied.textContent = "Clipboard access was denied. Allow it in your browser and copy again.";
    }
  }
  const agentRow = node("div", "onboard-agent__row");
  agentRow.append(aboutLabel, copy);
  agent.append(
    agentTitle,
    node(
      "p",
      "onboard-card__text",
      "A coding agent can create the repository and build the site through the editor; you review its changes here and save them.",
    ),
    agentRow,
    copied,
    gh,
  );
  agentPrompt();

  root.append(columns, agent);
  return {
    root,
    focus() {
      nameInput.focus();
      nameInput.select();
    },
  };
}
