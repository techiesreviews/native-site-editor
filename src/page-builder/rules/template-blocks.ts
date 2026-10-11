// Where blocks go in a component's template (Edit component mode): one rule
// for the editor (block-insert.ts, tree-drop.ts over the template's outline)
// and the preview runtime (its drop containers over the shadow root).

/** A template's own elements that take blocks, as a Section or a Div does on a page. */
export const TEMPLATE_BLOCK_TAGS = new Set(["section", "div", "article", "aside", "header", "footer", "nav", "figure"]);
