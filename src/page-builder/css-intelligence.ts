/** Workspace order is presentation order, not a claim about the cascade. All declarations survive. */
export interface CssVariableDeclaration { name: string; value: string; path: string; start: number; end: number }
export interface CssWorkspace {
  revision: string;
  sources: Readonly<Record<string, string>>;
  orderedPaths: readonly string[];
  openDefinition(path: string, start: number, end: number, revision: string): Promise<boolean>;
}
export function isCssPath(path: string) { return /\.(?:css|scss|less)$/i.test(path); }

// Blank comments and strings without moving offsets. Unterminated tokens stay blank to EOF.
function codeMask(source: string, lineComments = false) {
  const chars = source.split("");
  const excluded: { start: number; end: number; open: boolean }[] = [];
  for (let i = 0; i < source.length;) {
    const start = i;
    let open = false;
    if (lineComments && source.startsWith("//", i) && source[i - 1] !== ":" && !/\burl\([^)]*$/i.test(source.slice(0, i))) {
      const end = source.indexOf("\n", i + 2); open = true; i = end < 0 ? source.length : end;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2); open = end < 0; i = end < 0 ? source.length : end + 2;
    } else if (source[i] === '"' || source[i] === "'") {
      const quote = source[i++];
      open = true;
      while (i < source.length) { if (source[i] === "\\") i += 2; else if (source[i++] === quote) { open = false; break; } }
      i = Math.min(i, source.length);
    } else { i++; continue; }
    excluded.push({ start, end: i, open });
    for (let n = start; n < i; n++) if (chars[n] !== "\n" && chars[n] !== "\r") chars[n] = " ";
  }
  return { mask: chars.join(""), excluded };
}
export function cssVariableDeclarations(workspace: Pick<CssWorkspace, "sources" | "orderedPaths">): CssVariableDeclaration[] {
  const paths = [...new Set([...workspace.orderedPaths, ...Object.keys(workspace.sources).sort()])];
  const found: CssVariableDeclaration[] = [];
  for (const path of paths) {
    if (!isCssPath(path) || !Object.hasOwn(workspace.sources, path)) continue;
    const source = workspace.sources[path], mask = codeMask(source, /\.(?:scss|less)$/i.test(path)).mask;
    const pattern = /(?:[;{]\s*)(--[\w-]+)\s*:/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(mask))) {
      const name = match[1], start = match.index + match[0].indexOf(name);
      let end = pattern.lastIndex, depth = 0;
      for (; end < mask.length; end++) {
        if (mask[end] === "(") depth++;
        else if (mask[end] === ")") depth--;
        else if (!depth && (mask[end] === ";" || mask[end] === "}")) break;
      }
      found.push({ name, value: source.slice(pattern.lastIndex, end).trim(), path, start, end: start + name.length });
      // Let the delimiter begin the next declaration match.
      pattern.lastIndex = end;
    }
  }
  return found;
}
function valueContext(mask: string, offset: number) {
  const before = mask.slice(0, offset);
  const boundary = Math.max(before.lastIndexOf("{"), before.lastIndexOf("}"), before.lastIndexOf(";"));
  const tail = before.slice(boundary + 1);
  const colon = tail.indexOf(":");
  const braceDepth = [...before].reduce((depth, char) => depth + (char === "{" ? 1 : char === "}" ? -1 : 0), 0);
  if (colon < 0 || braceDepth <= 0 || !/^\s*[\w-]+\s*$/.test(tail.slice(0, colon))) return false;
  // A nested selector can begin with a bare element and a pseudo-class,
  // which looks like property:value until its opening rule brace arrives.
  let lookaheadDepth = 0;
  for (let i = offset; i < mask.length; i++) {
    const char = mask[i];
    if (char === "(") lookaheadDepth++;
    else if (char === ")") lookaheadDepth = Math.max(0, lookaheadDepth - 1);
    else if (!lookaheadDepth && char === "{") return false;
    else if (!lookaheadDepth && (char === ";" || char === "}")) break;
  }
  const functions: string[] = [];
  const tokens = /([\w-]+)\s*\(|[()]/g;
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(tail.slice(colon + 1)))) {
    if (token[0] === ")") functions.pop(); else functions.push(token[1]?.toLowerCase() ?? "");
  }
  return !functions.includes("url");
}
export function cssVariableCompletion(source: string, offset: number, path = ""): { start: number; end: number; prefix: string; wrap: boolean } | undefined {
  const { mask, excluded } = codeMask(source, /\.(?:scss|less)$/i.test(path));
  if (excluded.some(span => offset >= span.start && (offset < span.end || (span.open && offset === span.end)))) return;
  if (!valueContext(mask, offset)) return;
  const match = /--[\w-]*$/.exec(mask.slice(0, offset));
  const emptyVar = /\bvar\(\s*$/.test(mask.slice(0, offset));
  if (!match && !emptyVar) return;
  if (match && source.slice(match.index, offset) !== match[0]) return;
  const start = match?.index ?? offset;
  let end = offset; while (/[\w-]/.test(mask[end] ?? "") && end < mask.length) end++;
  const existing = /\bvar\(\s*$/.test(mask.slice(0, start));
  // Bare names are allowed only at a value boundary, not inside another identifier/function.
  if (!existing && !/[\s:,()]$/.test(mask.slice(0, start))) return;
  return { start, end, prefix: match?.[0] ?? "", wrap: !existing };
}
export function cssVariableReference(source: string, offset: number, path = ""): { name: string; start: number; end: number } | undefined {
  const mask = codeMask(source, /\.(?:scss|less)$/i.test(path)).mask, pattern = /\bvar\(\s*(--[\w-]+)\s*(?=[,)])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(mask))) {
    const start = match.index + match[0].indexOf(match[1]), end = start + match[1].length;
    if (offset >= start && offset <= end && valueContext(mask, start)) return { name: match[1], start, end };
  }
}
