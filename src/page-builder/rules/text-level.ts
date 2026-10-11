// Tag sets for text and the formatting inside it, pure and unit tested
// (tests/rules-text-level.test.ts). The editor's modules and the preview
// runtime (native-preview-runtime.js, which bundles this file) read the same
// sets, so a line the canvas types into is a line to the editor too. The
// runtime and the template reader also let a <slot> sit in a line of text;
// they add it where they use INLINE_FORMATTING.

/**
 * Formatting inside a line of text: an element holding text and only these
 * is one line, typed into and copied as one text (a bold word, a link, a
 * price struck through: `<p>Was <del>£40</del> £30</p>`).
 */
export const INLINE_FORMATTING = new Set([
  "a", "strong", "em", "b", "i", "u", "s", "span", "small", "code", "mark", "sub", "sup", "br", "wbr",
  "abbr", "time", "cite", "q", "kbd", "data", "var", "del", "ins",
]);

/**
 * Elements that hold a line of text: text blocks, table cells, and the
 * span, link and small a line is often written in. The edit bar makes their
 * whole content bold or italic.
 */
export const TEXT_LINE_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "li", "button", "blockquote", "figcaption",
  "small", "label", "td", "th", "dt", "dd", "div", "summary", "legend", "caption",
]);

/**
 * Elements the canvas types into when they hold text and inline formatting
 * only: the text lines above, and formatting that is text on its own
 * (a selected <strong>).
 */
export const TEXT_TAGS = new Set([...TEXT_LINE_TAGS, "strong", "em", "b", "i", "cite", "q", "mark", "code"]);

/**
 * Elements that are one Page structure row when they hold a line of text
 * with formatting in it (no rows for the formatting inside), even with no
 * text of their own beside it.
 */
export const TEXT_RUN_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "button", "blockquote", "figcaption", "dt", "dd",
  "summary", "legend", "caption", "label", "td", "th", "a", "strong", "em", "b", "i", "small", "cite", "q", "mark", "code",
]);

/**
 * HTML's phrasing content (the content model, so images and form controls
 * too): what may go where only phrasing content is allowed, such as inside
 * a <p>.
 */
export const HTML_PHRASING = new Set([
  "strong", "em", "span", "br", "code", "small", "b", "i", "u", "a", "img", "mark", "time", "s", "sub", "sup",
  "wbr", "abbr", "cite", "q", "kbd", "button", "label", "picture", "input", "var", "samp", "dfn", "data", "bdi", "bdo",
]);

/**
 * HTML's text-level semantics: formatting that is content itself, never a
 * box that holds content (a card's text lives in the box around an <em>).
 */
export const TEXT_LEVEL = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "i", "kbd", "mark", "q", "s",
  "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
]);
