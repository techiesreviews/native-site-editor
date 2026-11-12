// Mock-ups of future features on the catalogue board (kitchen station 3): screens built from the parts in parts.ts,
// with sample data, drawn in frames at each width and in light and dark, and approved the same way as a part.
// A mock-up's own link is catalogue.html?mockup=<id>&theme=light|dark.
import type { Control, Values } from "./parts";

export interface Mockup {
  id: string;
  /** `screens`: the editor's own screens (screens.ts); `mockups`: screens of features still to build. */
  area: "mockups" | "screens";
  name: string;
  /** Where the screen will live once built, for hand edits. */
  files: readonly string[];
  /** The parts it is made of: each a link on the board. */
  madeOf: readonly string[];
  copies?: readonly string[];
  widths: readonly number[];
  height: number;
  defaults: Values;
  controls: readonly Control[];
  render(values: Values): Promise<HTMLElement>;
}

export const MOCKUPS: readonly Mockup[] = [
  {
    id: "sharing-panel", area: "mockups", name: "Sharing, one panel",
    files: ["src/components/repository-menu.ts", "src/components/share-row.ts", "src/components/repository-menu.css", "src/components/share-row.css"],
    madeOf: ["share-row", "button", "icon"],
    widths: [390, 1280], height: 300,
    defaults: { guests: true },
    controls: [{ kind: "switch", key: "guests", label: "Someone watching" }],
    async render(values) {
      const [{ node, button }, { shareRow }, { icon }] = await Promise.all([
        import("../ui/dom"), import("../components/share-row"), import("../icons"), import("../components/repository-menu.css"),
      ]);
      const screen = node("div", "cat-mock");
      const panel = node("section", "cat-mock__panel");
      const head = node("div", "cat-mock__head");
      const title = node("h2", "cat-mock__title", "Share");
      const close = button("", () => undefined, "cat-icon-button");
      close.setAttribute("aria-label", "Close");
      close.append(icon("x", 16));
      head.append(title, close);
      const rows = node("div", "link-rows");
      const row = (label: string, view: () => { label: string; dot: "idle" | "on" | "wait"; link?: string }) =>
        shareRow(label, "text-button repository-menu__action", view, () => undefined).root;
      rows.append(
        row("Preview link", () => values.guests ? { label: "1 watching", dot: "on", link: "https://preview.example/s/site" } : { label: "Preview link", dot: "idle" }),
        row("Edit together", () => ({ label: "Edit together", dot: "idle" })),
      );
      panel.append(head, rows, button("Done", () => undefined, "button primary cat-mock__done"));
      screen.append(panel);
      return screen;
    },
  },
];
