import { scanCss } from "./css-write";

/** A slotted title link needs its component host to contain the shared stretch. */
export function cardLinkCss(source?: string): string {
  const css = source ?? "";
  const positioned = scanCss(css).some(rule => rule.selector.trim() === ":host" &&
    rule.declarations.some(declaration => declaration.property.toLowerCase() === "position" &&
      /^(relative|absolute|fixed|sticky)(?:\s*!important)?$/i.test(declaration.value.trim())));
  if (positioned) return css;
  const newline = css.includes("\r\n") ? "\r\n" : "\n";
  return `${css}${css && !css.endsWith("\n") ? newline : ""}:host { position: relative; }${newline}`;
}
