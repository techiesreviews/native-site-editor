export interface Field { label: string; property: string; options?: string[]; kind?: "space" | "type" | "color" | "font"; unit?: boolean }
export const sections: { title: string; fields: Field[] }[] = [
  { title: "Layout", fields: [
    { label: "Display", property: "display", options: ["block", "flex", "grid", "none", "inline", "inline-block", "inline-flex"] },
    { label: "Direction", property: "flex-direction", options: ["row", "column", "row-reverse", "column-reverse"] },
    { label: "Wrap", property: "flex-wrap", options: ["nowrap", "wrap", "wrap-reverse"] },
    { label: "Justify", property: "justify-content", options: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] },
    { label: "Align", property: "align-items", options: ["stretch", "flex-start", "center", "flex-end", "baseline"] },
    { label: "Gap", property: "gap", kind: "space", unit: true },
    { label: "Columns", property: "grid-template-columns" },
  ] },
  { title: "Size", fields: [
    { label: "Width", property: "width", unit: true }, { label: "Min width", property: "min-width", unit: true },
    { label: "Max width", property: "max-width", unit: true }, { label: "Height", property: "height", unit: true },
  ] },
  { title: "Typography", fields: [
    { label: "Font family", property: "font-family", kind: "font" },
    { label: "Font size", property: "font-size", kind: "type", unit: true },
    { label: "Weight", property: "font-weight", options: ["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold"] },
    { label: "Line height", property: "line-height", kind: "type" }, { label: "Letter spacing", property: "letter-spacing", unit: true },
    { label: "Text align", property: "text-align", options: ["left", "center", "right", "justify", "start", "end"] },
    { label: "Text colour", property: "color", kind: "color" },
  ] },
  { title: "Background", fields: [ { label: "Background colour", property: "background-color", kind: "color" }, { label: "Background image", property: "background-image" } ] },
  { title: "Border", fields: [
    { label: "Corner radius", property: "border-radius", unit: true },
    { label: "Border width", property: "border-width", unit: true }, { label: "Border style", property: "border-style", options: ["none", "solid", "dashed", "dotted", "double"] },
    { label: "Border colour", property: "border-color", kind: "color" },
    ...["top-left", "top-right", "bottom-right", "bottom-left"].map((corner) => ({ label: `${corner.replace("-", " ")} radius`, property: `border-${corner}-radius`, unit: true })),
  ] },
  { title: "Effects", fields: [ { label: "Opacity", property: "opacity" }, { label: "Box shadow", property: "box-shadow" }, { label: "Transition", property: "transition" }, { label: "Transform", property: "transform" }, { label: "Transform origin", property: "transform-origin" } ] },
];

const extensions: Record<string, Field[]> = {
  "Layout": [
    {
      "label": "Align content",
      "property": "align-content"
    },
    {
      "label": "Align self",
      "property": "align-self"
    },
    {
      "label": "Grow",
      "property": "flex-grow"
    },
    {
      "label": "Shrink",
      "property": "flex-shrink"
    },
    {
      "label": "Basis",
      "property": "flex-basis",
      "unit": true
    },
    {
      "label": "Order",
      "property": "order"
    },
    {
      "label": "Rows",
      "property": "grid-template-rows"
    },
    {
      "label": "Auto flow",
      "property": "grid-auto-flow"
    },
    {
      "label": "Auto rows",
      "property": "grid-auto-rows"
    },
    {
      "label": "Auto columns",
      "property": "grid-auto-columns"
    },
    {
      "label": "Row gap",
      "property": "row-gap",
      "unit": true
    },
    {
      "label": "Column gap",
      "property": "column-gap",
      "unit": true
    }
  ],
  "Size": [
    {
      "label": "Min height",
      "property": "min-height",
      "unit": true
    },
    {
      "label": "Max height",
      "property": "max-height",
      "unit": true
    },
    {
      "label": "Aspect ratio",
      "property": "aspect-ratio"
    },
    {
      "label": "Box sizing",
      "property": "box-sizing"
    }
  ],
  "Typography": [
    {
      "label": "Font style",
      "property": "font-style"
    },
    {
      "label": "Text transform",
      "property": "text-transform"
    },
    {
      "label": "White space",
      "property": "white-space"
    },
    {
      "label": "Text overflow",
      "property": "text-overflow"
    },
    {
      "label": "Word spacing",
      "property": "word-spacing",
      "unit": true
    },
    {
      "label": "Text decoration",
      "property": "text-decoration-line"
    }
  ],
  "Background": [
    {
      "label": "Background position",
      "property": "background-position"
    },
    {
      "label": "Background size",
      "property": "background-size"
    },
    {
      "label": "Background repeat",
      "property": "background-repeat"
    },
    {
      "label": "Background attachment",
      "property": "background-attachment"
    },
    {
      "label": "Object fit",
      "property": "object-fit"
    },
    {
      "label": "Object position",
      "property": "object-position"
    }
  ],
  "Position": [
    {
      "label": "Position",
      "property": "position"
    },
    {
      "label": "Top",
      "property": "top",
      "unit": true
    },
    {
      "label": "Right",
      "property": "right",
      "unit": true
    },
    {
      "label": "Bottom",
      "property": "bottom",
      "unit": true
    },
    {
      "label": "Left",
      "property": "left",
      "unit": true
    },
    {
      "label": "Z index",
      "property": "z-index"
    },
    {
      "label": "Overflow",
      "property": "overflow"
    },
    {
      "label": "Overflow x",
      "property": "overflow-x"
    },
    {
      "label": "Overflow y",
      "property": "overflow-y"
    },
    {
      "label": "Visibility",
      "property": "visibility"
    },
    {
      "label": "Float",
      "property": "float"
    },
    {
      "label": "Clear",
      "property": "clear"
    }
  ]
};
for (const [title, fields] of Object.entries(extensions)) {
 const section = sections.find(section => section.title === title);
 if (section) section.fields.push(...fields); else sections.push({title,fields});
}
export const sectionTitles = ["Layout", "Spacing", "Size", "Position", "Typography", "Background", "Border", "Effects"];
export function matchesStyleSearch(query: string, label: string, property: string, section: string): boolean {
 const aliases = property.includes("radius") ? "round corners rounding" : property === "font-family" ? "typeface font" : property === "opacity" ? "transparency transparent" : "";
 const haystack = `${label} ${property.replace(/-/g, " ")} ${property} ${section} ${aliases}`.toLowerCase();
 return query.toLowerCase().trim().split(/\s+/).every(word => haystack.includes(word));
}
