// Minimal text edits to the manifest's route metadata.
//
// A route in `.astro-editor/native.json` is either the bare page path
// (`"/about/": "src/pages/about.html"`) or an object with the path in `file`
// and an optional `title` and `description`. Writing a title or description
// changes only what it must: a bare route becomes the object form when its
// first field is written, an existing string is replaced in place, a field
// emptied is removed, and a route left with only `file` goes back to the bare
// form. Indentation and the order of the file's other keys are kept, so the
// change reads as a small diff. This module has no DOM and no knowledge of
// the editor; the caller applies the returned range edit however it stores
// the file.

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
  let routeMember: Member | undefined;
  let members: Member[] | undefined;
  try {
    const top = scanner.skip(0);
    const routes = scanner.members(top).find((member) => member.key === "routes");
    if (!routes || text[routes.valueStart] !== "{") return { ok: false, error: 'native.json has no "routes" object.' };
    routeMember = scanner.members(routes.valueStart).find((member) => member.key === route);
    if (!routeMember) return { ok: false, error: `native.json has no route ${JSON.stringify(route)}.` };
    if (text[routeMember.valueStart] === "{") members = scanner.members(routeMember.valueStart);
    else if (text[routeMember.valueStart] !== '"') return { ok: false, error: `native.json route ${JSON.stringify(route)} is neither a path nor an object.` };
  } catch {
    return { ok: false, error: "native.json could not be read as JSON." };
  }
  const literal = JSON.stringify(value);
  const done = (edit: NativePageMetaEdit | null): NativePageMetaResult => {
    if (!edit) return { ok: true, text, edit: null };
    const next = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    try {
      JSON.parse(next);
    } catch {
      return { ok: false, error: "The change would leave native.json invalid." };
    }
    return { ok: true, text: next, edit };
  };

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
    // A new field goes after `file` (a title) or at the end (a description),
    // on its own line when the object is written one member per line.
    if (!members.length) return { ok: false, error: `native.json route ${JSON.stringify(route)} is an empty object; give it a "file" first.` };
    const file = members.find((member) => member.key === "file");
    const after = (field === "title" && file) || members[members.length - 1];
    const multiline = text.slice(routeMember.valueStart, members[0].start).includes("\n");
    const lineStart = text.lastIndexOf("\n", after.start) + 1;
    const indent = multiline ? text.slice(lineStart, after.start).match(/^[ \t]*/)![0] : "";
    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    const separator = multiline ? `,${newline}${indent}` : ", ";
    return done({ start: after.valueEnd, end: after.valueEnd, text: `${separator}${JSON.stringify(field)}: ${literal}` });
  }
  if (!existing) return done(null);
  // Removing the last field beside `file` restores the bare form.
  const rest = members.filter((member) => member !== existing);
  const file = members.find((member) => member.key === "file");
  if (file && rest.length === 1)
    return done({ start: routeMember.valueStart, end: routeMember.valueEnd, text: text.slice(file.valueStart, file.valueEnd) });
  if (!rest.length) return done({ start: routeMember.valueStart, end: routeMember.valueEnd, text: "{}" });
  const index = members.indexOf(existing);
  const start = index > 0 ? members[index - 1].valueEnd : existing.start;
  const end = index > 0 ? existing.valueEnd : members[index + 1].start;
  return done({ start, end, text: "" });
}
