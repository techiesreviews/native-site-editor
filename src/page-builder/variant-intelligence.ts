import { expandStyleImports } from "../../shared/css-imports";
import { componentVariants, scriptSetAttributes, siteVariants, variantsForComponent, valueLabel, type Variant } from "../../shared/variants";

export interface VariantLookup {
  forTag(tag: string): Variant[] | undefined;
  isComponentCss(path: string): boolean;
}
/** Component tags map to their own CSS paths. Kept in Monaco's lazy chunk. */
export function createVariantLookup(sources: Record<string, string>, components: Record<string, string>): VariantLookup {
  const componentPaths = new Set(Object.values(components));
  const own = new Map(Object.entries(components).map(([tag, path]) => [tag, expandStyleImports([path], file => sources[file])]));
  const ownPaths = new Set([...componentPaths, ...[...own.values()].flatMap(sheet => sheet.imported)]);
  const sharedPaths = Object.keys(sources).filter(path => /\.css$/i.test(path) && !ownPaths.has(path));
  const expanded = expandStyleImports(sharedPaths, path => sources[path]);
  const roots = sharedPaths.filter(path => !expanded.imported.includes(path));
  const site = siteVariants(expandStyleImports(roots.length ? roots : sharedPaths, path => sources[path]).sheets);
  const scripted = Object.entries(sources).filter(([path]) => /\.js$/i.test(path)).flatMap(([, text]) => scriptSetAttributes(text));
  const byTag = new Map(Object.keys(components).map(tag => [tag,
    variantsForComponent(tag, { css: own.get(tag)!.sheets.map(sheet => sheet.source).join("\n"), site, scriptAttributes: scripted }).variants]));
  return { forTag: tag => byTag.get(tag.toLowerCase()), isComponentCss: path => componentPaths.has(path) };
}
export type VariantLookupFactory = typeof createVariantLookup;

type Lookup = VariantLookup["forTag"];
interface Span { start: number; end: number }
interface Attribute extends Span { name: string; nameEnd: number; value?: string; valueStart?: number; valueEnd?: number; quoted?: boolean }
interface Tag extends Span { name: string; nameEnd: number; attributes: Attribute[] }
export interface VariantSuggestion extends Span { label: string; insertText: string; detail: string; kind: "attribute" | "value" }
export interface VariantMarker extends Span { message: string }

// A small HTML token walk also accepts an unfinished opening tag. Quoted
// values own their '<' and '>' characters; raw text and comments own theirs.
function tags(text: string): Tag[] {
  const result: Tag[] = [];
  let pos = 0;
  while (pos < text.length) {
    const start = text.indexOf("<", pos);
    if (start < 0) break;
    if (text.startsWith("<!--", start)) {
      const end = text.indexOf("-->", start + 4);
      pos = end < 0 ? text.length : end + 3;
      continue;
    }
    const match = /^<([a-z][\w.-]*)(?=[\s/>]|$)/i.exec(text.slice(start));
    if (!match) { pos = start + 1; continue; }
    const name = match[1].toLowerCase(), nameEnd = start + match[0].length;
    pos = nameEnd;
    const attributes: Attribute[] = [];
    while (pos < text.length && text[pos] !== ">" && !text.startsWith("/>", pos)) {
      if (/\s/.test(text[pos])) { pos++; continue; }
      const attrStart = pos;
      while (pos < text.length && !/[\s=/>]/.test(text[pos])) pos++;
      if (pos === attrStart) { pos++; continue; }
      const nameEnd = pos, name = text.slice(attrStart, pos).toLowerCase();
      while (/\s/.test(text[pos] ?? "")) pos++;
      const attribute: Attribute = { start: attrStart, end: nameEnd, nameEnd, name };
      if (text[pos] === "=") {
        pos++;
        while (/\s/.test(text[pos] ?? "")) pos++;
        const quote = text[pos] === '"' || text[pos] === "'" ? text[pos++] : undefined;
        attribute.quoted = !!quote;
        attribute.valueStart = pos;
        while (pos < text.length && (quote ? text[pos] !== quote : !/[\s>]/.test(text[pos]))) pos++;
        attribute.valueEnd = pos;
        attribute.value = text.slice(attribute.valueStart, pos);
        if (quote && text[pos] === quote) pos++;
        attribute.end = pos;
      }
      attributes.push(attribute);
    }
    const end = pos;
    if (name.includes("-")) result.push({ start, end, name, nameEnd, attributes });
    if (text.startsWith("/>", pos)) pos += 2;
    else if (text[pos] === ">") pos++;
    if (name === "script" || name === "style" || name === "textarea" || name === "title") {
      const close = new RegExp(`</${name}\\s*>`, "gi");
      close.lastIndex = pos;
      const found = close.exec(text);
      pos = found ? close.lastIndex : text.length;
    }
  }
  return result;
}
const conditions = (items: string[]) => items.length ? ` (only when ${items.join(" or ")})` : "";
const defaultNote = (variant: Variant) => `Leaving the attribute off: ${variant.defaultValue === undefined ? "Default look" : variant.values.find(item => item.value === variant.defaultValue)?.label ?? valueLabel(variant.defaultValue)}. Choose the default by removing the attribute.`;
const describe = (variant: Variant) => `${variant.label} (${variant.kind})${conditions(variant.conditions)}. ${variant.values.map(item => `${item.value}: ${item.label}${conditions(item.conditions)}`).join("; ")}.${variant.kind === "yes-no" ? " Presence enables this variant." : ""} ${defaultNote(variant)}`;

export function variantSuggestions(text: string, offset: number, lookup: Lookup): VariantSuggestion[] {
  const tag = tags(text).find(tag => offset > tag.nameEnd && offset <= tag.end);
  if (!tag) return [];
  const variants = lookup(tag.name) ?? [];
  const value = tag.attributes.find(attr => attr.valueStart !== undefined && offset >= attr.valueStart && offset <= attr.valueEnd!);
  if (value) {
    const variant = variants.find(item => item.attribute === value.name);
    if (!variant || !value.quoted) return [];
    const prefix = text.slice(value.valueStart, offset);
    return variant.values.filter(item => item.value !== variant.defaultValue && item.value.startsWith(prefix)).map(item => ({
      start: value.valueStart!, end: value.valueEnd!, label: item.value, insertText: item.value, kind: "value",
      detail: `${item.label}${conditions(item.conditions)}. ${defaultNote(variant)}`,
    }));
  }
  const current = tag.attributes.find(attr => offset >= attr.start && offset <= attr.nameEnd);
  if (tag.attributes.some(attr => offset > attr.nameEnd && offset < attr.end)) return [];
  const prefix = current ? text.slice(current.start, offset).toLowerCase() : "";
  return variants.filter(variant => variant.attribute.startsWith(prefix) && !tag.attributes.some(attr => attr.name === variant.attribute)).map(variant => ({
    start: current?.start ?? offset, end: current?.nameEnd ?? offset,
    // A name typed over keeps its value: only the name is replaced.
    label: variant.attribute, insertText: variant.kind === "yes-no" || (current && current.end > current.nameEnd) ? variant.attribute : `${variant.attribute}=""`, kind: "attribute", detail: describe(variant),
  }));
}

export function variantHover(text: string, offset: number, lookup: Lookup): (Span & { text: string }) | undefined {
  for (const tag of tags(text)) {
    const attr = tag.attributes.find(attr => offset >= attr.start && offset < attr.end);
    const variant = attr && lookup(tag.name)?.find(item => item.attribute === attr.name);
    if (attr && variant) return { start: attr.start, end: attr.end, text: describe(variant) };
  }
}

export function variantValueMarkers(text: string, lookup: Lookup): VariantMarker[] {
  return tags(text).flatMap(tag => tag.attributes.flatMap(attr => {
    const variant = lookup(tag.name)?.find(item => item.attribute === attr.name);
    if (!variant || variant.kind !== "choice" || attr.value === undefined || variant.values.some(item => item.value === attr.value)) return [];
    return [{ start: attr.valueStart!, end: Math.max(attr.valueStart! + 1, attr.valueEnd!), message: `${variant.label}: “${attr.value}” is a Custom value. It is kept; no variant rule lists it.` }];
  }));
}

export function variantCssMarkers(text: string, component: boolean): VariantMarker[] {
  return componentVariants(text).warnings.flatMap(warning => {
    // Marked on the first host rule, where a default look would go.
    const host = Math.max(0, text.search(/:host\b/));
    if (warning.kind === "no-default-look") return component ? [{ start: host, end: Math.min(text.length, host + 5), message: "This component has no default look. Consider styling the host with the variant attributes absent." }] : [];
    return [{ start: warning.offset, end: Math.min(text.length, warning.offset + warning.selector.length), message: `${warning.selector} never matches; write ${warning.fix}` }];
  });
}

