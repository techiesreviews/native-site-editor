// Minimal text edits to the manifest's route metadata.
//
// A route in `.astro-editor/native.json` is either the bare page path
// (`"/about/": "src/pages/about.html"`), an object with the path in `file`
// and an optional `title` and `description`, or an object with only the
// metadata, for a route a page's place under `src/pages/` gives it. Writing a
// title or description changes only what it must: a route with no entry gets
// a metadata-only one (`"/work/": { "title": "Work" }`, and a `routes` object
// when the manifest has none), a bare route becomes the object form when its
// first field is written, an existing string is replaced in place, a field
// emptied is removed, a route left with only `file` goes back to the bare
// form, and a metadata-only entry left empty is removed. Indentation and the
// order of the file's other keys are kept, so the change reads as a small
// diff. A file created in the editor is registered the same way: a new
// stylesheet appended to `styles`, a new component template added to
// `components` (`registerNativeFile`). This module has no DOM and no
// knowledge of the editor; the caller applies the returned range edit however
// it stores the file, and passes only routes the site has.

export type NativePageMetaField = "title" | "description";

export interface NativePageMetaEdit {
  start: number;
  end: number;
  text: string;
}

export type NativePageMetaResult =
  /** `edit` is null when the manifest already says this. */
  | { ok: true; text: string; edit: NativePageMetaEdit | null }
  | { ok: false; error: string };

interface Member {
  key: string;
  /** Offset of the key's opening quote. */
  start: number;
  valueStart: number;
  valueEnd: number;
}

const WHITESPACE = /[ \t\r\n]/;

class Scanner {
  constructor(private text: string) {}
  skip(i: number) {
    while (i < this.text.length && WHITESPACE.test(this.text[i])) i++;
    return i;
  }
  /** End offset (exclusive) of the string token starting at `i`. */
  string(i: number) {
    if (this.text[i] !== '"') throw new Error("string expected");
    for (let j = i + 1; j < this.text.length; j++) {
      if (this.text[j] === "\\") j++;
      else if (this.text[j] === '"') return j + 1;
    }
    throw new Error("unterminated string");
  }
  /** End offset (exclusive) of the value starting at `i`. */
  value(i: number): number {
    const c = this.text[i];
    if (c === '"') return this.string(i);
    if (c === "{" || c === "[") {
      const close = c === "{" ? "}" : "]";
      let j = this.skip(i + 1);
      if (this.text[j] === close) return j + 1;
      for (;;) {
        if (c === "{") {
          j = this.skip(this.string(j));
          if (this.text[j] !== ":") throw new Error("colon expected");
          j = this.skip(j + 1);
        }
        j = this.skip(this.value(j));
        if (this.text[j] === ",") { j = this.skip(j + 1); continue; }
        if (this.text[j] === close) return j + 1;
        throw new Error(`${close} expected`);
      }
    }
    const match = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(this.text.slice(i, i + 40));
    if (!match) throw new Error("value expected");
    return i + match[0].length;
  }
  /** The elements of the array whose `[` is at `i`. */
  elements(i: number): { start: number; end: number }[] {
    if (this.text[i] !== "[") throw new Error("array expected");
    const out: { start: number; end: number }[] = [];
    let j = this.skip(i + 1);
    if (this.text[j] === "]") return out;
    for (;;) {
      const end = this.value(j);
      out.push({ start: j, end });
      j = this.skip(end);
      if (this.text[j] === ",") { j = this.skip(j + 1); continue; }
      if (this.text[j] === "]") return out;
      throw new Error("] expected");
    }
  }
  /** The members of the object whose `{` is at `i`. */
  members(i: number): Member[] {
    if (this.text[i] !== "{") throw new Error("object expected");
    const out: Member[] = [];
    let j = this.skip(i + 1);
    if (this.text[j] === "}") return out;
    for (;;) {
      const start = j;
      const keyEnd = this.string(j);
      const key = JSON.parse(this.text.slice(start, keyEnd)) as string;
      j = this.skip(keyEnd);
      if (this.text[j] !== ":") throw new Error("colon expected");
      const valueStart = this.skip(j + 1);
      const valueEnd = this.value(valueStart);
      out.push({ key, start, valueStart, valueEnd });
      j = this.skip(valueEnd);
      if (this.text[j] === ",") { j = this.skip(j + 1); continue; }
      if (this.text[j] === "}") return out;
      throw new Error("} expected");
    }
  }
}

/**
 * The edit that sets `field` of `route` to `value` (empty removes it) in the
 * manifest text, and the text after it.
 */
export function editNativePageMeta(text: string, route: string, field: NativePageMetaField, value: string): NativePageMetaResult {
  const scanner = new Scanner(text);
  let top: Member[];
  let routes: Member | undefined;
  let routeMembers: Member[] = [];
  let routeMember: Member | undefined;
  let members: Member[] | undefined;
  try {
    const start = scanner.skip(0);
    top = scanner.members(start);
    routes = top.find((member) => member.key === "routes");
    if (routes) {
      if (text[routes.valueStart] !== "{") return { ok: false, error: 'native.json "routes" is not an object.' };
      routeMembers = scanner.members(routes.valueStart);
      routeMember = routeMembers.find((member) => member.key === route);
    }
    if (routeMember) {
      if (text[routeMember.valueStart] === "{") members = scanner.members(routeMember.valueStart);
      else if (text[routeMember.valueStart] !== '"') return { ok: false, error: `native.json route ${JSON.stringify(route)} is neither a path nor an object.` };
    }
  } catch {
    return { ok: false, error: "native.json could not be read as JSON." };
  }
  const literal = JSON.stringify(value);
  const done = (edit: NativePageMetaEdit | null) => finish(text, edit);
  const separator = (open: number, first: Member, after: Member) => separatorAfter(text, open, first.start, after.start);
  const entry = `${JSON.stringify(route)}: { ${JSON.stringify(field)}: ${literal} }`;

  // No entry: a derived route's first field adds a metadata-only one.
  if (!routeMember) {
    if (!value) return done(null);
    if (!routes) {
      if (!top.length) return done({ start: text.indexOf("{") + 1, end: text.indexOf("{") + 1, text: ` "routes": { ${entry} } ` });
      const after = top.find((member) => member.key === "version") ?? top[top.length - 1];
      return done({ start: after.valueEnd, end: after.valueEnd, text: `${separator(scanner.skip(0), top[0], after)}"routes": { ${entry} }` });
    }
    if (!routeMembers.length) return done({ start: routes.valueStart, end: routes.valueEnd, text: `{ ${entry} }` });
    const last = routeMembers[routeMembers.length - 1];
    return done({ start: last.valueEnd, end: last.valueEnd, text: `${separator(routes.valueStart, routeMembers[0], last)}${entry}` });
  }

  // The bare form: the first field written turns it into the object form.
  if (!members) {
    if (!value) return done(null);
    const file = text.slice(routeMember.valueStart, routeMember.valueEnd);
    return done({ start: routeMember.valueStart, end: routeMember.valueEnd, text: `{ "file": ${file}, ${JSON.stringify(field)}: ${literal} }` });
  }

  const existing = members.find((member) => member.key === field);
  if (value) {
    if (existing) {
      if (text.slice(existing.valueStart, existing.valueEnd) === literal) return done(null);
      return done({ start: existing.valueStart, end: existing.valueEnd, text: literal });
    }
    if (!members.length) return done({ start: routeMember.valueStart, end: routeMember.valueEnd, text: `{ ${JSON.stringify(field)}: ${literal} }` });
    // A new field goes after `file` (a title) or at the end (a description),
    // on its own line when the object is written one member per line.
    const file = members.find((member) => member.key === "file");
    const after = (field === "title" && file) || members[members.length - 1];
    return done({ start: after.valueEnd, end: after.valueEnd, text: `${separator(routeMember.valueStart, members[0], after)}${JSON.stringify(field)}: ${literal}` });
  }
  if (!existing) return done(null);
  const rest = members.filter((member) => member !== existing);
  const file = members.find((member) => member.key === "file");
  // Removing the last field beside `file` restores the bare form.
  if (file && rest.length === 1)
    return done({ start: routeMember.valueStart, end: routeMember.valueEnd, text: text.slice(file.valueStart, file.valueEnd) });
  // A metadata-only entry left with nothing goes, as the route needs no entry.
  if (!rest.length) return done(removal(routeMembers, routeMember) ?? { start: routes!.valueStart, end: routes!.valueEnd, text: "{}" });
  return done(removal(members, existing)!);
}

/** `text` after `edit`, when it is still valid JSON. */
function finish(text: string, edit: NativePageMetaEdit | null): NativePageMetaResult {
  if (!edit) return { ok: true, text, edit: null };
  const next = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  try {
    JSON.parse(next);
  } catch {
    return { ok: false, error: "The change would leave native.json invalid." };
  }
  return { ok: true, text: next, edit };
}

// The separator before a new member or element placed after the one starting
// at `after`: on its own line, indented like it, when the object or array it
// joins is written one per line from `open` (its `{` or `[`), whose first
// member starts at `first`.
function separatorAfter(text: string, open: number, first: number, after: number) {
  if (!text.slice(open, first).includes("\n")) return ", ";
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lineStart = text.lastIndexOf("\n", after) + 1;
  return `,${newline}${text.slice(lineStart, after).match(/^[ \t]*/)![0]}`;
}

/** What a new file adds to the manifest. */
export type NativeRegistration =
  | { kind: "style"; path: string }
  | { kind: "component"; tag: string; path: string };

/**
 * The edit that registers a new file: a stylesheet's path appended to
 * `styles`, a component's tag added to `components` (either created when the
 * manifest has none). Nothing to do when the manifest already says so; an
 * error when the tag already names another file.
 */
export function registerNativeFile(text: string, entry: NativeRegistration): NativePageMetaResult {
  const scanner = new Scanner(text);
  const unreadable: NativePageMetaResult = { ok: false, error: "native.json could not be read as JSON." };
  let open: number;
  let top: Member[];
  try {
    open = scanner.skip(0);
    top = scanner.members(open);
  } catch {
    return unreadable;
  }
  const key = entry.kind === "style" ? "styles" : "components";
  const item = entry.kind === "style" ? JSON.stringify(entry.path) : `${JSON.stringify(entry.tag)}: ${JSON.stringify(entry.path)}`;
  const member = top.find((member) => member.key === key);
  if (!member) {
    const fresh = entry.kind === "style" ? `"styles": [${item}]` : `"components": { ${item} }`;
    if (!top.length) return finish(text, { start: open + 1, end: open + 1, text: ` ${fresh} ` });
    const last = top[top.length - 1];
    return finish(text, { start: last.valueEnd, end: last.valueEnd, text: `${separatorAfter(text, open, top[0].start, last.start)}${fresh}` });
  }
  try {
    if (entry.kind === "style") {
      if (text[member.valueStart] !== "[") return { ok: false, error: 'native.json "styles" is not an array.' };
      const items = scanner.elements(member.valueStart);
      if (items.some((value) => text.slice(value.start, value.end) === item)) return finish(text, null);
      if (!items.length) return finish(text, { start: member.valueStart, end: member.valueEnd, text: `[${item}]` });
      const last = items[items.length - 1];
      return finish(text, { start: last.end, end: last.end, text: `${separatorAfter(text, member.valueStart, items[0].start, last.start)}${item}` });
    }
    if (text[member.valueStart] !== "{") return { ok: false, error: 'native.json "components" is not an object.' };
    const members = scanner.members(member.valueStart);
    const existing = members.find((member) => member.key === entry.tag);
    if (existing) {
      if (text.slice(existing.valueStart, existing.valueEnd) === JSON.stringify(entry.path)) return finish(text, null);
      return { ok: false, error: `native.json already names the component <${entry.tag}> with another file.` };
    }
    if (!members.length) return finish(text, { start: member.valueStart, end: member.valueEnd, text: `{ ${item} }` });
    const last = members[members.length - 1];
    return finish(text, { start: last.valueEnd, end: last.valueEnd, text: `${separatorAfter(text, member.valueStart, members[0].start, last.start)}${item}` });
  } catch {
    return unreadable;
  }
}

/** The edit that takes `member` out of its object; undefined when it is the only one. */
function removal(members: Member[], member: Member): NativePageMetaEdit | undefined {
  const index = members.indexOf(member);
  if (members.length === 1) return undefined;
  const start = index > 0 ? members[index - 1].valueEnd : member.start;
  const end = index > 0 ? member.valueEnd : members[index + 1].start;
  return { start, end, text: "" };
}
