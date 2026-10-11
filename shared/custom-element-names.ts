// Custom element names the spec reserves, one list for the component tag
// check (native-project.ts, component-model.ts) and the editor and runtime's
// movable rule (src/page-builder/rules/movable.ts). Here in shared/ because
// shared/ never imports src/; tests/frame-guard.test.ts fails on a copy.

/** Names reserved for SVG and MathML; `customElements.define` throws on them. */
export const RESERVED_CUSTOM_ELEMENT_NAMES = new Set(["annotation-xml", "color-profile", "font-face", "font-face-src", "font-face-uri", "font-face-format", "font-face-name", "missing-glyph"]);
