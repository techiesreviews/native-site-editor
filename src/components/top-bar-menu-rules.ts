// The phone menu's rows (top-bar-menu.ts), pure: which of the approved rows show, in their order (Lex's phone
// layout of 2026-11-11). A row shows only while the control it works is there. Tested in
// tests/top-bar-menu-rules.test.ts.

export type MenuRow = "pages" | "blocks" | "structure" | "code" | "screen" | "history" | "share" | "settings" | "switch";

export interface MenuFacts {
  /** The block rail is offered (a page on the canvas). */
  blocks: boolean;
  /** The pull-up sheet of Page structure and code is offered (phone-sheet.css). */
  sheet: boolean;
  /** The canvas has its breakpoint buttons. */
  devices: boolean;
  /** The open file has a History button. */
  history: boolean;
  /** A project is open: it can be shared and has site settings. */
  project: boolean;
}

export function menuRows(facts: MenuFacts): MenuRow[] {
  const rows: [MenuRow, boolean][] = [
    ["pages", true],
    ["blocks", facts.blocks],
    ["structure", facts.sheet],
    ["code", facts.sheet],
    ["screen", facts.devices],
    ["history", facts.history],
    ["share", facts.project],
    ["settings", facts.project],
    ["switch", true],
  ];
  return rows.filter(([, shown]) => shown).map(([row]) => row);
}
