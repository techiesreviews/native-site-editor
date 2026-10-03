import { startTagAttribute } from "../../shared/html-source";
import { headTags } from "./site-head";

export const EFFECTS_PATH = "styles/effects.css";
export const effectPresets = [
  { value: "reveal-fade", label: "Fade in on scroll" },
  { value: "reveal-slide", label: "Slide up on scroll" },
  { value: "hover-lift", label: "Hover lift" },
  { value: "hover-underline", label: "Hover underline" },
] as const;
export type EffectPreset = typeof effectPresets[number]["value"];
const rules: Record<EffectPreset, string> = {
  "reveal-fade": `@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    @keyframes reveal-fade { from { opacity: 0; } to { opacity: 1; } }
    .reveal-fade {
      animation: reveal-fade 1s ease-out;
      animation-fill-mode: both;
      animation-timeline: view();
      animation-range: entry 0% entry 100%;
    }
  }
}`,
  "reveal-slide": `@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    @keyframes reveal-slide { from { opacity: 0; translate: 0 16px; } to { opacity: 1; translate: 0 0; } }
    .reveal-slide {
      animation: reveal-slide 1s ease-out;
      animation-fill-mode: both;
      animation-timeline: view();
      animation-range: entry 0% entry 100%;
    }
  }
}`,
  "hover-lift": `@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .hover-lift { transition: translate 160ms ease-out; }
  .hover-lift:hover { translate: 0 -3px; }
}`,
  "hover-underline": `.hover-underline { text-decoration: none; }
.hover-underline:hover, .hover-underline:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}`,
};
/** Append each readable preset once. Removing an instance keeps shared rules available. */
export function insertEffectsCss(css: string, preset: EffectPreset): string {
  // The marker also identifies the complete block; don't mistake another hover selector for this preset.
  const marker = `/* Effect: ${preset} */`;
  if (css.includes(marker)) return css;
  const newline = css.includes("\r\n") ? "\r\n" : "\n";
  return css + (css && !css.endsWith("\n") ? newline : "") + (css ? newline : "") + marker + newline + rules[preset].replace(/\n/g, newline) + newline;
}

export function linkEffectsStylesheet(html: string): string {
  const { tags, head, end } = headTags(html);
  if (tags.some((tag) => tag.start > head.end && tag.end <= end && tag.name === "link" && startTagAttribute(html, tag, "rel")?.value.toLowerCase() === "stylesheet" && startTagAttribute(html, tag, "href")?.value === `/${EFFECTS_PATH}`)) return html;
  const newline = html.includes("\r\n") ? "\r\n" : "\n";
  const before = tags.find((tag) => tag.start >= head.end && tag.end <= end && tag.name === "script")?.start ?? end;
  const lineStart = html.lastIndexOf("\n", before - 1) + 1;
  const at = /^[ \t]*$/.test(html.slice(lineStart, before)) ? lineStart : before;
  return html.slice(0, at) + (at === before ? newline : "") + `  <link rel="stylesheet" href="/${EFFECTS_PATH}">` + newline + html.slice(at);
}
