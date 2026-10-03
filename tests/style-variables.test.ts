import assert from "node:assert/strict";
import { test } from "node:test";
import { relevantVariables, variablePreview } from "../src/components/style-variables";
const declaration = (name: string, value: string, path = "theme.css") => ({ name, value, path, start: 0, end: name.length });
test("relevant variables preserve duplicate provenance and native colour syntax", () => {
  const variables = [declaration("--ink", "oklch(0.5 0.1 60)"), declaration("--ink", "blue", "component.css"), declaration("--space", "12px")];
  const result = relevantVariables("color", variables, (_, value) => !value.endsWith("px"));
  assert.deepEqual(result, variables.slice(0, 2)); assert.equal(result[0].value, "oklch(0.5 0.1 60)");
});
test("variable previews reject ambiguous, missing and cyclic chains", () => {
  const variables = [declaration("--space", "12px"), declaration("--chain", "var(--space)"), declaration("--duplicate", "red"), declaration("--duplicate", "blue"), declaration("--cycle", "var(--cycle)")];
  assert.equal(variablePreview("calc(var(--chain) * 2)", variables), "calc(12px * 2)");
  for (const value of ["var(--duplicate)", "var(--missing)", "var(--cycle)"]) assert.equal(variablePreview(value, variables), undefined);
  assert.equal(variablePreview("var(--missing, 3px)", variables), "3px");
});
