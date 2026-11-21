import { node } from "../ui/dom";
import { repositoryNameProblem, suggestedRepositoryName } from "../../shared/starting-point";

/**
 * The setup wizard's "Repository name" field: a native text input behind the
 * address the repository will have (github.com/<owner>/), shown inside the
 * field, and a described-by hint that shows GitHub's objection to the name.
 */
export function createRepositoryNameField(options: {
  value: string;
  hintId: string;
  /** Where the repository will live, before its name: "github.com/<owner>/". */
  prefix: () => string;
  /** Runs after a change event has normalised the value, before the hint updates. */
  normalised?: () => void;
}) {
  const label = node("label", "onboard-field");
  const box = node("span", "onboard-input onboard-input--prefixed");
  const prefix = node("span", "onboard-input__prefix");
  prefix.id = `${options.hintId}-prefix`;
  const input = node("input", "onboard-input__bare");
  input.name = "name";
  input.value = options.value;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 100;
  const hint = node("span", "onboard-field__hint");
  hint.id = options.hintId;
  input.setAttribute("aria-describedby", `${prefix.id} ${hint.id}`);
  box.append(prefix, input);
  label.append(node("span", "onboard-field__label", "Repository name"), box, hint);

  /** Updates the address, the hint and the invalid state; returns the name's problem, if any (empty names too). */
  const show = () => {
    const name = input.value.trim();
    const problem = repositoryNameProblem(name);
    const invalid = Boolean(problem && name);
    prefix.textContent = options.prefix();
    input.setAttribute("aria-invalid", String(invalid));
    hint.classList.toggle("is-error", invalid);
    hint.textContent = invalid ? problem! : "";
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
