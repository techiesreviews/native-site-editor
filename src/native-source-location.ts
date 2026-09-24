// Maps a native preview selection back to the start tag that produced it.
//
// The preview runtime reports the selected element as element-child indexes
// from its page or component root. Here every start tag in the source is
// tagged with its offset and parsed by the same browser HTML parser the
// preview uses, so implied elements and auto-closed tags line up exactly;
// walking the indexes then yields the tag's position in the source.

export interface StartTag {
  name: string;
  start: number;
  // Offset just past the tag name, where an attribute can be inserted.
  nameEnd: number;
  // Offset just past the closing `>`.
  end: number;
}

// Elements whose content the parser reads as text, so tags inside are not tags.
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
const MARK = "data-native-src";

export function startTags(html: string): StartTag[] {
  const out: StartTag[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      i = close < 0 ? html.length : close + 3;
      continue;
    }
    const next = html[lt + 1] ?? "";
    if (next === "!" || next === "?" || next === "/") {
      const close = html.indexOf(">", lt + 2);
      i = close < 0 ? html.length : close + 1;
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) {
      i = lt + 1;
      continue;
    }
    let j = lt + 1;
    while (j < html.length && !/[\s/>]/.test(html[j])) j++;
    const name = html.slice(lt + 1, j).toLowerCase();
    const nameEnd = j;
    // Attributes: quoted values may contain `>`.
    while (j < html.length && html[j] !== ">") {
      const char = html[j];
      if (char === "\"" || char === "'") {
        const close = html.indexOf(char, j + 1);
        j = close < 0 ? html.length : close + 1;
      } else j++;
    }
    const end = Math.min(j + 1, html.length);
    out.push({ name, start: lt, nameEnd, end });
    i = end;
    if (RAW_TEXT.has(name)) {
      if (name === "plaintext") break;
      const close = html.toLowerCase().indexOf(`</${name}`, i);
      i = close < 0 ? html.length : close;
    }
  }
  return out;
}

// Source with every start tag carrying its index into `tags`.
export function markStartTags(html: string, tags = startTags(html)) {
  let out = "";
  let from = 0;
  tags.forEach((tag, index) => {
    out += `${html.slice(from, tag.nameEnd)} ${MARK}="${index}"`;
    from = tag.nameEnd;
  });
  return out + html.slice(from);
}

// The start tag of the element at `path` (element-child indexes from the root
// of `html`), or of its deepest ancestor the parser kept a source tag for.
export function locateNativeElement(html: string, path: number[]): StartTag | undefined {
  if (!path.length) return undefined;
  const tags = startTags(html);
  const template = document.createElement("template");
  template.innerHTML = markStartTags(html, tags);
  // Mirror the preview runtime's sanitizer, which drops these before render.
  template.content.querySelectorAll("script").forEach((el) => el.remove());
  template.content.querySelectorAll("meta[http-equiv]").forEach((el) => {
    if ((el.getAttribute("http-equiv") ?? "").toLowerCase() === "refresh") el.remove();
  });
  let parent: ParentNode = template.content;
  let found: StartTag | undefined;
  for (const index of path) {
    const child = parent.children[index];
    if (!child) break;
    const tag = tags[Number(child.getAttribute(MARK))];
    if (tag) found = tag;
    parent = child;
  }
  return found;
}
