import "./repository-menu.css";
import { mountDropdown } from "./dropdown";
import { button, link, node } from "../ui/dom";
import type { EditorIntegration, Repository } from "../../shared/types";

export function createRepositoryMenu(options: {
  installUrl: string | null;
  onReload: () => void;
  onDisconnect: () => void;
  onUpdateIntegration: () => void;
}) {
  // Project selection lives here, next to the GitHub connection actions.
  const project = node("div", "repository-menu__project");
  project.innerHTML = `
    <label class="field-label" for="repository">Repository</label>
    <select id="repository" disabled><option>Loading repositories…</option></select>
    <div class="branch-row"><div><label class="field-label" for="branch">Branch</label><select id="branch" disabled><option>—</option></select></div><button id="refresh" class="icon-button" title="Refresh from GitHub" aria-label="Refresh from GitHub" disabled>↻</button></div>
  `;
  const root = node("div", "repository-menu");
  const trigger = node("button", "repository-menu__trigger");
  trigger.type = "button";
  const name = node("span", "repository-menu__name");
  const caret = node("span", "", "⌄");
  caret.setAttribute("aria-hidden", "true");
  const identity = node("span", "repository-menu__identity");
  const repository = node("span", "repository-menu__repository");
  identity.append(repository, name);
  trigger.append(identity, caret);
  trigger.setAttribute("aria-controls", "repository-actions");
  trigger.setAttribute("aria-expanded", "false");
  const panel = node("div", "repository-menu__popover");
  panel.id = "repository-actions";
  panel.popover = "auto";
  panel.setAttribute("aria-label", "Repository actions");
  panel.append(project);
  const integration = node("div", "repository-menu__integration");
  const integrationState = node(
    "p",
    "repository-menu__integration-state muted",
    "Integration status unknown.",
  );
  const integrationAction = button(
    "Prepare integration update",
    options.onUpdateIntegration,
    "button secondary repository-menu__integration-action",
  );
  integrationAction.hidden = true;
  integration.append(integrationState, integrationAction);
  panel.append(integration);
  const actionClass = "text-button repository-menu__action";
  if (options.installUrl) {
    const access = link(
      "Repository access ↗",
      options.installUrl,
      actionClass,
    );
    access.target = "_blank";
    access.rel = "noopener noreferrer";
    panel.append(access);
  }
  panel.append(
    button("Reload", options.onReload, actionClass),
    button("Disconnect", options.onDisconnect, actionClass),
  );
  const agentSlot = node("div", "repository-menu__agent");
  agentSlot.id = "agent-menu";
  panel.append(agentSlot);
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
  function setRepository(repo?: Repository) {
    repository.textContent = repo?.full_name ?? "GitHub connected";
    name.textContent = repo?.name ?? "Choose a project";
    trigger.title = repo?.full_name ?? "Repository actions";
    trigger.setAttribute(
      "aria-label",
      `${name.textContent} — repository actions`,
    );
  }
  function setIntegration(status?: EditorIntegration | "loading" | "updating") {
    integrationAction.hidden = true;
    integrationAction.disabled = true;
    if (!status) {
      integrationState.textContent = "Integration status unknown.";
      return;
    }
    if (status === "loading") {
      integrationState.textContent = "Checking visual editing integration…";
      return;
    }
    if (status === "updating") {
      integrationState.textContent = "Preparing integration update branch…";
      return;
    }
    integration.dataset.state = status.state;
    integrationState.textContent = status.message;
    integrationAction.hidden = !status.canUpdate;
    integrationAction.disabled = !status.canUpdate;
  }
  setRepository();
  setIntegration();
  return {
    root,
    setRepository,
    setIntegration,
    close: dropdown.close,
    destroy: dropdown.destroy,
  };
}
