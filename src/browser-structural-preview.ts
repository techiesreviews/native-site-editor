export type StructuralTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "button" | "a";

export interface StructuralElement {
  id: string;
  parentId: string;
  tag: StructuralTag;
  start: number;
  end: number;
  openStart: number;
  openEnd: number;
  bodyStart: number;
  bodyEnd: number;
  closeStart: number;
  closeEnd: number;
  attrs: string;
  text: string;
  href?: { start: number; end: number; value: string };
}

export interface StructuralOperation {
  action: "insert" | "delete";
  element: StructuralElement;
  beforeId?: string;
}

export interface StructuralTransaction {
  path: string;
  source: string;
  previous: string;
  operations: StructuralOperation[];
  parentId: string;
  beforeId?: string;
  afterId?: string;
  oldBeforeAnchor?: StructuralElement;
  oldAfterAnchor?: StructuralElement;
  beforeSpan: { start: number; end: number };
  afterSpan: { start: number; end: number };
  beforeRun: StructuralElement[];
  afterRun: StructuralElement[];
  elements: StructuralElement[];
}

const structuralTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "button", "a"]);
const rawTextTags = new Set(["script", "style"]);

function frontmatterEnd(source: string) {
  if (!source.startsWith("---")) return 0;
  const end = source.indexOf("\n---", 3);
  return end < 0 ? -1 : end + 4;
}

function findTagEnd(source: string, start: number) {
  let quote = "";
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = "";
      else if (char === "\\" && index + 1 < source.length) index++;
    } else if (char === "\"" || char === "'") quote = char;
    else if (char === "{") return -1;
    else if (char === ">") return index + 1;
  }
  return -1;
}

function findOpaqueTagEnd(source: string, start: number) {
  let quote = "";
  let braces = 0;
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = "";
      else if (char === "\\" && index + 1 < source.length) index++;
    } else if (char === "\"" || char === "'") quote = char;
    else if (char === "{") braces++;
    else if (char === "}") braces = Math.max(0, braces - 1);
    else if (char === ">" && braces === 0) return index + 1;
  }
  return -1;
}

function readAttributes(source: string, openStart: number, nameEnd: number, openEnd: number) {
  const attrs = source.slice(nameEnd, openEnd - 1);
  if (/[{}]/.test(attrs) || /(?:^|\s)on[a-z]+\s*=/i.test(attrs) || /(?:^|\s)(?:set:html|slot)\b/i.test(attrs)) return undefined;
  const names = new Set<string>();
  let index = 0;
  let href: StructuralElement["href"];
  while (index < attrs.length) {
    while (/\s/.test(attrs[index] ?? "")) index++;
    if (index >= attrs.length) break;
    const nameMatch = /^[A-Za-z_:][\w:.-]*/.exec(attrs.slice(index));
    if (!nameMatch) return undefined;
    const name = nameMatch[0].toLowerCase();
    if (!["class", "href", "type", "title", "aria-label"].includes(name)) return undefined;
    if (name === "style") return undefined;
    if (names.has(name)) return undefined;
    names.add(name);
    index += nameMatch[0].length;
    while (/\s/.test(attrs[index] ?? "")) index++;
    if (attrs[index] !== "=") continue;
    index++;
    while (/\s/.test(attrs[index] ?? "")) index++;
    const quote = attrs[index];
    if (quote !== "\"" && quote !== "'") return undefined;
    const valueStart = ++index;
    while (index < attrs.length && attrs[index] !== quote) {
      if (attrs[index] === "<" || attrs[index] === ">" || attrs[index] === "{") return undefined;
      index++;
    }
    if (attrs[index] !== quote) return undefined;
    const value = attrs.slice(valueStart, index);
    if (/&#|&[a-z][a-z0-9]+;/i.test(value)) return undefined;
    if (name === "id") return undefined;
    if (name === "href") {
      if (href || /["'<>{}\u0000-\u001f\u007f]/.test(value)) return undefined;
      if (!validHref(value)) return undefined;
      href = { start: openStart + nameEnd - openStart + valueStart, end: openStart + nameEnd - openStart + index, value };
    }
    index++;
  }
  return { attrs, href };
}

function literalText(body: string) {
  return !/[<>{}]/.test(body) && !/&(?!(?:amp|lt|gt|#123|#125);)/.test(body);
}

function validHref(value: string) {
  try {
    const protocol = new URL(value, "https://astro-site-editor.invalid").protocol;
    return ["https:", "http:", "mailto:", "tel:"].includes(protocol);
  } catch { return false; }
}

export function parseStructuralElements(path: string, source: string): StructuralElement[] | undefined {
  const frontmatter = frontmatterEnd(source);
  if (frontmatter < 0) return undefined;
  const elements: StructuralElement[] = [];
  const stack: { tag: string; id: string; counts: Map<string, number> }[] = [{ tag: "#root", id: "root", counts: new Map() }];
  let cursor = frontmatter;
  let serial = 0;
  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    if (open < 0) break;
    if (!/^\s*$/.test(source.slice(cursor, open))) return undefined;
    if (source.startsWith("<!--", open)) {
      const end = source.indexOf("-->", open + 4);
      if (end < 0) return undefined;
      cursor = end + 3;
      continue;
    }
    const closeMatch = /^<\/\s*([a-z][\w-]*)\s*>/i.exec(source.slice(open));
    if (closeMatch) {
      if (closeMatch[1][0] !== closeMatch[1][0].toLowerCase()) {
        cursor = open + closeMatch[0].length;
        continue;
      }
      const tag = closeMatch[1].toLowerCase();
      if (stack.at(-1)?.tag !== tag) return undefined;
      stack.pop();
      cursor = open + closeMatch[0].length;
      continue;
    }
    const nameMatch = /^<([A-Za-z][\w.-]*)/.exec(source.slice(open));
    if (!nameMatch) return undefined;
    const rawName = nameMatch[1];
    if (rawName[0] !== rawName[0].toLowerCase()) {
      const tagEnd = findOpaqueTagEnd(source, open);
      if (tagEnd < 0) return undefined;
      const selfClosing = /\/\s*>$/.test(source.slice(open, tagEnd));
      if (!selfClosing && rawName !== "Layout") return undefined;
      cursor = tagEnd;
      continue;
    }
    const tag = rawName.toLowerCase();
    const tagEnd = findTagEnd(source, open);
    if (tagEnd < 0) return undefined;
    const selfClosing = /\/\s*>$/.test(source.slice(open, tagEnd));
    const nameStart = open + 1;
    const nameEnd = nameStart + rawName.length;
    if (selfClosing && !structuralTags.has(tag)) {
      cursor = tagEnd;
      continue;
    }
    const attrs = readAttributes(source, open, nameEnd, tagEnd);
    if (!attrs) return undefined;
    const parentId = stack.at(-1)!.id;
    const parent = stack.at(-1)!;
    const tagCount = parent.counts.get(tag) ?? 0;
    parent.counts.set(tag, tagCount + 1);
    const id = `${parentId}/${tag}:${tagCount}`;
    if (structuralTags.has(tag) && !selfClosing) {
      const closeStart = source.indexOf(`</${tag}>`, tagEnd);
      if (closeStart < 0) return undefined;
      const body = source.slice(tagEnd, closeStart);
      const closeEnd = closeStart + tag.length + 3;
      if (!literalText(body)) return undefined;
      elements.push({
        id, parentId, tag: tag as StructuralTag, start: open, end: closeEnd,
        openStart: nameStart, openEnd: nameEnd, bodyStart: tagEnd, bodyEnd: closeStart,
        closeStart: closeStart + 2, closeEnd: closeStart + 2 + tag.length,
        attrs: attrs.attrs, text: body, href: tag === "a" ? attrs.href : undefined,
      });
      cursor = closeEnd;
      continue;
    }
    if (!selfClosing) {
      stack.push({ tag, id, counts: new Map() });
      if (rawTextTags.has(tag)) {
        const rawClose = source.indexOf(`</${tag}>`, tagEnd);
        if (rawClose < 0) return undefined;
        stack.pop();
        cursor = rawClose + tag.length + 3;
        continue;
      }
    }
    cursor = tagEnd;
  }
  return stack.length === 1 ? elements : undefined;
}

function sameElement(a: StructuralElement, b: StructuralElement) {
  return a.tag === b.tag && a.attrs === b.attrs && a.text === b.text && (a.href?.value ?? "") === (b.href?.value ?? "");
}

function segmentIsOnlyWhitespaceAndElements(source: string, start: number, end: number, elements: StructuralElement[]) {
  let cursor = start;
  for (const element of elements) {
    if (element.start < cursor || element.end > end) return false;
    if (!/^\s*$/.test(source.slice(cursor, element.start))) return false;
    if (source.slice(element.start, element.end) !==
        `<${element.tag}${element.attrs}>${element.text}</${element.tag}>`) return false;
    if (element.tag === "a" && !element.href) return false;
    cursor = element.end;
  }
  return /^\s*$/.test(source.slice(cursor, end));
}

export function planStructuralTransaction(path: string, previous: string, source: string): StructuralTransaction | undefined {
  const before = parseStructuralElements(path, previous);
  const after = parseStructuralElements(path, source);
  if (!before || !after) return undefined;
  const changedParents = new Set<string>();
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  for (const item of before) if (!afterById.has(item.id) || !sameElement(item, afterById.get(item.id)!)) changedParents.add(item.parentId);
  for (const item of after) if (!beforeById.has(item.id) || !sameElement(item, beforeById.get(item.id)!)) changedParents.add(item.parentId);
  for (const parentId of new Set([...before.map((item) => item.parentId), ...after.map((item) => item.parentId)])) {
    const beforeOrder = before.filter((item) => item.parentId === parentId).map((item) => `${item.tag}:${item.text}:${item.href?.value ?? ""}`).join("\n");
    const afterOrder = after.filter((item) => item.parentId === parentId).map((item) => `${item.tag}:${item.text}:${item.href?.value ?? ""}`).join("\n");
    if (beforeOrder !== afterOrder) changedParents.add(parentId);
  }
  if (changedParents.size !== 1) return undefined;
  const parentId = [...changedParents][0];
  const beforeSiblings = before.filter((item) => item.parentId === parentId);
  const afterSiblings = after.filter((item) => item.parentId === parentId);
  const prefix = firstDiffIndex(beforeSiblings, afterSiblings);
  const suffix = lastSameCount(beforeSiblings, afterSiblings, prefix);
  const removed = beforeSiblings.slice(prefix, beforeSiblings.length - suffix);
  const inserted = afterSiblings.slice(prefix, afterSiblings.length - suffix);
  if (!removed.length && !inserted.length) return undefined;
  if (removed.length && inserted.length && removed.length !== inserted.length) return undefined;
  const beforeSpanStart = beforeSiblings[prefix - 1]?.end ?? removed[0]?.start ?? beforeSiblings[prefix]?.start;
  const beforeSpanEnd = beforeSiblings[prefix + removed.length]?.start ?? removed.at(-1)?.end ?? beforeSpanStart;
  const afterSpanStart = afterSiblings[prefix - 1]?.end ?? inserted[0]?.start ?? afterSiblings[prefix]?.start;
  const afterSpanEnd = afterSiblings[prefix + inserted.length]?.start ?? inserted.at(-1)?.end ?? afterSpanStart;
  if (
    beforeSpanStart === undefined || afterSpanStart === undefined ||
    source.slice(0, afterSpanStart) !== previous.slice(0, beforeSpanStart) ||
    source.slice(afterSpanEnd) !== previous.slice(beforeSpanEnd)
  ) return undefined;
  if (!segmentIsOnlyWhitespaceAndElements(previous, beforeSpanStart, beforeSpanEnd, removed.length ? removed : [])) return undefined;
  if (!segmentIsOnlyWhitespaceAndElements(source, afterSpanStart, afterSpanEnd, inserted.length ? inserted : [])) return undefined;
  const operations: StructuralOperation[] = [];
  const beforeId = afterSiblings[prefix + inserted.length]?.id;
  const afterId = afterSiblings[prefix - 1]?.id;
  const oldBeforeAnchor = beforeSiblings[prefix + removed.length];
  const oldAfterAnchor = beforeSiblings[prefix - 1];
  if (removed.length && inserted.length) {
    const unmatched = [...inserted];
    for (const oldItem of removed) {
      const index = unmatched.findIndex((item) => sameElement(item, oldItem));
      if (index < 0) return undefined;
      unmatched.splice(index, 1);
      operations.push({ action: "delete", element: oldItem });
    }
    for (const element of inserted) operations.push({ action: "insert", element, beforeId });
  } else if (inserted.length) {
    for (const element of inserted) operations.push({ action: "insert", element, beforeId });
  } else {
    for (const element of removed) operations.push({ action: "delete", element });
  }
  if (!operations.length || operations.length > 8) return undefined;
  return {
    path, source, previous, operations, parentId, beforeId, afterId, oldBeforeAnchor, oldAfterAnchor,
    beforeSpan: { start: beforeSpanStart, end: beforeSpanEnd },
    afterSpan: { start: afterSpanStart, end: afterSpanEnd },
    beforeRun: removed,
    afterRun: inserted,
    elements: after,
  };
}

function firstDiffIndex(before: StructuralElement[], after: StructuralElement[]) {
  let index = 0;
  while (index < before.length && index < after.length && sameElement(before[index], after[index])) index++;
  return index;
}

function lastSameCount(before: StructuralElement[], after: StructuralElement[], prefix: number) {
  let count = 0;
  while (
    count + prefix < before.length &&
    count + prefix < after.length &&
    sameElement(before[before.length - 1 - count], after[after.length - 1 - count])
  ) count++;
  return count;
}
