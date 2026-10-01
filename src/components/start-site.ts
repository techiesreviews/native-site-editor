import { button, node } from "../ui/dom";
import { icon } from "../icons";
import type { StartingPoint } from "../../shared/starting-point";
import "./onboarding.css";

// Start your site: shown in place of the preview when the open repository
// has nothing to show, because it is empty (no commits yet) or has no
// index.html at its top. The Starter site and the Blank page are written as
// drafts (the preview then shows the site, and Save to GitHub saves it);
// Build it with an agent copies a prompt that connects a coding agent to
// this editor tab and asks it to build the site.

export function createStartSite(options: {
  repository: string;
  empty: boolean;
  /** Writes the starting point as drafts; resolves to a problem to show, or nothing. */
  start: (point: StartingPoint) => Promise<string | undefined>;
  /** Copies the agent prompt for a site about `about`; resolves to what to say. */
  agent: (about: string) => Promise<string>;
}) {
  const root = node("section", "start-site");
  root.setAttribute("aria-labelledby", "start-site-title");
  const title = node("h1", "", "Start your site");
  title.id = "start-site-title";
  root.append(
    node("span", "badge", options.empty ? "Empty repository" : "No home page"),
    title,
    node(
      "p",
      "intro",
      options.empty
        ? `${options.repository} has no files yet. Choose how to start: it is added as drafts you review here, and Save to GitHub makes the first commit.`
        : `${options.repository} has no index.html at its top, so there is no page to preview. Choose how to start: it is added as drafts next to your files, which stay as they are unless you say otherwise.`,
    ),
  );
  const message = node("p", "onboard-message");
  message.setAttribute("role", "status");
  const choices = node("div", "start-site__choices");
  let busy = false;
  function choiceButton(label: string, hint: string, action: () => void | Promise<void>) {
    const choice = button("", () => {
      if (!busy) void action();
    }, "onboard-choice");
    choice.append(node("span", "onboard-choice__label", label), node("span", "onboard-choice__hint", hint));
    return choice;
  }
  async function start(point: StartingPoint, label: string) {
    busy = true;
    choices.setAttribute("aria-busy", "true");
    message.textContent = point === "starter" ? "Getting the Starter site…" : "Adding the blank page…";
    try {
      const problem = await options.start(point);
      if (root.isConnected) message.textContent = problem ?? `${label} added as drafts.`;
    } finally {
      busy = false;
      choices.removeAttribute("aria-busy");
    }
  }
  const agentPanel = node("div", "onboard-card onboard-agent start-site__agent");
  agentPanel.hidden = true;
  const agentTitle = node("h2", "onboard-card__title");
  agentTitle.append(icon("sparkle", 16), " Build it with an agent");
  const aboutLabel = node("label", "onboard-field");
  const about = node("input", "onboard-input");
  about.name = "about";
  about.placeholder = "a pottery studio in Bristol";
  about.maxLength = 300;
  aboutLabel.append(node("span", "onboard-field__label", "What is the site about?"), about);
  const copied = node("span", "onboard-message");
  copied.setAttribute("role", "status");
  const copy = button("Copy agent prompt", async () => {
    copy.disabled = true;
    try {
      copied.textContent = await options.agent(about.value);
    } finally {
      copy.disabled = false;
    }
  }, "button primary onboard-copy");
  copy.prepend(icon("copy", 14));
  const row = node("div", "onboard-agent__row");
  row.append(aboutLabel, copy);
  agentPanel.append(
    agentTitle,
    node(
      "p",
      "onboard-card__text",
      "The prompt connects Claude Code, Codex or another coding agent to this editor tab over MCP and asks it to build the site. Its pages appear here as drafts; you review them and save.",
    ),
    row,
    copied,
  );
  choices.append(
    choiceButton("Starter site", "A small studio site with pages, components and styles to make your own.", () => start("starter", "The Starter site")),
    choiceButton("Blank page", "One page and a stylesheet, ready for your words.", () => start("blank", "The blank page")),
    choiceButton("Build it with an agent", "Copy a prompt for a coding agent that builds it through the editor.", () => {
      agentPanel.hidden = false;
      about.focus();
    }),
  );
  root.append(choices, message, agentPanel);
  return { root };
}
