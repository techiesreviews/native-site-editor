// The agents' dots on a row (ticket am-11): one per agent at work there, in its colour (src/agent-presence.ts),
// after the row's name, as on the MCP control and the preview's outline. Page Structure's section rows and
// Pages and files' page rows wear them; nothing to click, and the row says it is busy.
import "./agent-dots.css";

/** An agent as a dot shows it. */
export interface AgentDot { key: string; name: string; colour: number }

/**
 * Puts `agents`' dots on `row` (none: takes them off), last in `holder`, or just after `holder` itself
 * with `beside` (a name that clips its overflow); drawn again only when they changed.
 */
export function setAgentDots(row: HTMLElement, holder: Element, agents: readonly AgentDot[], beside = false) {
  let dots = (beside ? holder.parentElement : holder)?.querySelector<HTMLElement>(":scope > .agent-dots") ?? null;
  const want = JSON.stringify(agents.map(agent => [agent.key, agent.colour, agent.name]));
  if (!agents.length) {
    dots?.remove();
    row.removeAttribute("aria-busy");
    return;
  }
  row.setAttribute("aria-busy", "true");
  if (dots?.dataset.agents === want) return;
  if (!dots) {
    dots = document.createElement("span");
    dots.className = "agent-dots";
    if (beside) holder.after(dots); else holder.append(dots);
  }
  dots.dataset.agents = want;
  dots.title = `${agents.map(agent => agent.name).join(", ")} at work here`;
  dots.replaceChildren(...agents.map(agent => {
    const dot = document.createElement("i");
    dot.className = "agent-dots__dot";
    dot.dataset.agentColour = String(agent.colour);
    return dot;
  }));
}
