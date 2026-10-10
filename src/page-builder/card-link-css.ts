import { scanCss } from "./css-write";

/**
 * A component's CSS with its host positioned, so the site's shared card link
 * rule stretches a slotted title link over this card (spec decision 3): the
 * same text when its unconditional `:host` rules already end on a non-static
 * `position` (the cascade's winner: `!important` first, then the last one),
 * else `:host { position: relative; }` appended (`!important` when a static
 * one is). Rules inside `@media` and the like do not count: they may not apply.
 */
export function cardLinkCss(source?: string): string {
  const css = source ?? "";
  const positions = scanCss(css)
    .filter(rule => !rule.parent && rule.selector.trim() === ":host")
    .flatMap(rule => rule.declarations.filter(declaration => declaration.property.toLowerCase() === "position"))
    .map(declaration => {
      const [, value = "", important] = /^(.*?)\s*(!\s*important)?$/i.exec(declaration.value.trim()) ?? [];
      return { value: value.toLowerCase(), important: Boolean(important) };
    });
  const winner = positions.filter(position => position.important).at(-1) ?? positions.at(-1);
  if (winner && /^(relative|absolute|fixed|sticky)$/.test(winner.value)) return css;
  const newline = css.includes("\r\n") ? "\r\n" : "\n";
  const rule = `:host { position: relative${winner?.important ? " !important" : ""}; }`;
  return `${css}${css && !css.endsWith("\n") ? newline : ""}${rule}${newline}`;
}
