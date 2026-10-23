import { RESERVED_CUSTOM_ELEMENT_NAMES } from "./custom-element-names";

// The rules a new page address and a new component follow, with one wording
// per refusal, so the Pages tab, Change URL, the page builder and the agent
// refuse the same cases alike (ticket 05, item 4). Existing addresses stay:
// only an address someone makes or changes meets the rule. No DOM, no I/O.

const PAGE_ADDRESS = /^[a-z0-9][a-z0-9-]{0,79}$/;
/** The one refusal of a new page address, also for a typed URL part no page can have. */
export const PAGE_ADDRESS_RULE = "Use lowercase letters, digits and dashes in the URL, at most 80, starting with a letter or digit.";

/** Why `slug` cannot be a new page's address (the last part of its URL), or nothing. */
export function pageAddressProblem(slug: string): string | undefined {
  return PAGE_ADDRESS.test(slug) ? undefined : PAGE_ADDRESS_RULE;
}

/** The element Make component would turn into a component, as far as the caller knows it. */
export interface ComponentSource {
  /** Its tag name, lowercase. */
  tag: string;
}

/** Why `tag` cannot name a new component while the components `taken` exist, or nothing. */
export function componentTagProblem(tag: string, taken: Iterable<string>): string | undefined {
  if (!tag) return "Type a name with a dash, such as section-intro.";
  if (!/^[a-z]/.test(tag)) return "A component's name starts with a lowercase letter.";
  if (!tag.includes("-")) return "A component's name has a dash in it, such as section-intro.";
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(tag)) return "Use lowercase letters, digits and single dashes between words.";
  if (RESERVED_CUSTOM_ELEMENT_NAMES.has(tag)) return `${tag} is reserved by HTML.`;
  // The name is taken; not the element's "<x> is a component already." (it is an instance), so the two stay apart.
  if ([...taken].includes(tag)) return `There is a component <${tag}> already.`;
  return undefined;
}

/** Why the element `source` cannot become a component whatever its name, or nothing. */
export function componentSourceProblem(source: ComponentSource): string | undefined {
  const element = source.tag.toLowerCase();
  if (["main", "body", "html", "head"].includes(element)) return `A <${element}> cannot be a component.`;
  if (/^site-(?:header|footer)$/.test(element)) return `<${element}> is the site's ${element.slice(5)} component already.`;
  if (element.includes("-")) return `<${element}> is a component already.`;
  return undefined;
}

/**
 * Why the element `source` cannot become the new component `tag` while the
 * components `taken` exist, or nothing: the name first, then the element.
 * Without `source`, only the name is checked.
 */
export function makeComponentProblem(source: ComponentSource | undefined, tag: string, taken: Iterable<string>): string | undefined {
  return componentTagProblem(tag, taken) ?? (source ? componentSourceProblem(source) : undefined);
}
