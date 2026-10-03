import type { CssVariableDeclaration } from "../page-builder/css-intelligence";
/** Resolve only unambiguous chains; the UI does not infer a cascade. */
export function variablePreview(value: string, declarations: readonly CssVariableDeclaration[]): string | undefined {
  const seen = new Set<string>();
  function resolve(raw: string, depth: number): string | undefined {
    if (depth > 12) return;
    let failed = false;
    const result = raw.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name: string, fallback: string | undefined) => {
      const definitions = declarations.filter(declaration => declaration.name === name);
      if (definitions.length > 1 || seen.has(name)) { failed = true; return ""; }
      if (!definitions.length) { if (fallback !== undefined) return fallback.trim(); failed = true; return ""; }
      seen.add(name); const resolved = resolve(definitions[0].value, depth + 1); seen.delete(name);
      if (resolved === undefined) failed = true;
      return resolved ?? "";
    });
    return failed || /var\(/.test(result) ? undefined : result;
  }
  return resolve(value, 0);
}
export function relevantVariables(property: string, declarations: readonly CssVariableDeclaration[], supports: (property: string, value: string) => boolean): CssVariableDeclaration[] {
  return declarations.filter(declaration => {
    const value = variablePreview(declaration.value, declarations);
    return value !== undefined && supports(property, value.replace(/\s*!important\s*$/, ""));
  });
}
