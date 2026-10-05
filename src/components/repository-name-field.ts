import { node } from "../ui/dom";
import { repositoryNameProblem, suggestedRepositoryName } from "../../shared/starting-point";

/**
 * The "Repository name" field shared by Get Started and the setup wizard: a
 * native text input with a described-by hint that shows GitHub's objection to
 * the name, or the caller's preview of where the repository will live.
 */
export function createRepositoryNameField(options: {
  value: string;
  hintId: string;
  /** The hint for a name GitHub accepts (trimmed; may be empty). */
  preview: (name: string) => string;
  /** Runs after a change event has normalised the value, before the hint updates. */
  normalised?: () => void;
}) {
  const label = node("label", "onboard-field");
  const input = node("input", "onboard-input");
  input.name = "name";
  input.value = options.value;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 100;
  const hint = node("span", "onboard-field__hint");
  hint.id = options.hintId;
  input.setAttribute("aria-describedby", hint.id);
  label.append(node("span", "onboard-field__label", "Repository name"), input, hint);

  /** Updates the hint and invalid state; returns the name's problem, if any (empty names too). */
  const show = () => {
    const name = input.value.trim();
    const problem = repositoryNameProblem(name);
    const invalid = Boolean(problem && name);
    input.setAttribute("aria-invalid", String(invalid));
    hint.classList.toggle("is-error", invalid);
    hint.textContent = invalid ? problem! : options.preview(name);
    return problem;
  };
  // A name typed with spaces becomes the name GitHub would make of it.
  input.addEventListener("change", () => {
    const suggested = suggestedRepositoryName(input.value);
    if (suggested && suggested !== input.value) input.value = suggested;
    options.normalised?.();
    show();
  });
  return { label, input, hint, show };
}
