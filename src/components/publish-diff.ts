// The Save menu's comparison of one change, GitHub's version beside the draft (publish-menu.ts): loaded when
// first opened, so it and its look (publish-diff.css) stay out of the editor's boot.
import { node } from "../ui/dom";
import { diffHunks, sideBySideRows, type SideCell } from "../text-diff";
import "./publish-diff.css";

// GitHub's version on the left, the draft on the right.
export function splitView(before: string, after: string) {
  const table = node("table", "publish-diff__split");
  const head = node("thead"), headRow = node("tr");
  const leftHead = node("th", "", "GitHub"), rightHead = node("th", "", "Draft");
  leftHead.colSpan = rightHead.colSpan = 2;
  leftHead.scope = rightHead.scope = "col";
  // Fixed layout takes its widths from the columns: narrow numbers, even code halves.
  const columns = node("colgroup");
  for (const kind of ["num", "code", "num", "code"]) columns.append(node("col", `publish-diff__col-${kind}`));
  table.append(columns);
  headRow.append(leftHead, rightHead);
  head.append(headRow);
  const body = node("tbody");
  const cells = (cell: SideCell | null) => {
    const number = node("td", "publish-diff__num", cell ? String(cell.line) : "");
    const code = node("td", `publish-diff__code is-${cell?.kind ?? "empty"}`);
    if (cell) code.append(node("span", "publish-diff__sign", cell.kind === "add" ? "+" : cell.kind === "del" ? "−" : " "), node("span", "", cell.text));
    return [number, code];
  };
  for (const row of sideBySideRows(before, after)) {
    const tr = node("tr", `publish-diff__row is-${row.kind}`);
    if (row.kind === "gap") {
      const cell = node("td", "publish-diff__gap", `${row.count} unchanged ${row.count === 1 ? "line" : "lines"}`);
      cell.colSpan = 4;
      tr.append(cell);
    } else tr.append(...cells(row.left), ...cells(row.right));
    body.append(tr);
  }
  table.append(head, body);
  return table;
}
// The narrow fallback: the changed lines in one column.
export function unifiedView(before: string, after: string) {
  const pre = node("pre", "publish-menu__diff publish-diff__unified");
  diffHunks(before, after, 3).forEach((hunk, index) => {
    if (index) pre.append(node("span", "publish-menu__diff-gap", "⋯\n"));
    for (const line of hunk.lines) {
      const row = node("span", `publish-menu__diff-line is-${line.kind}`);
      row.append(
        node("span", "publish-menu__diff-number", String(line.line)),
        node("span", "publish-menu__diff-sign", line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "),
        node("span", "publish-menu__diff-text", line.text),
        "\n",
      );
      pre.append(row);
    }
  });
  return pre;
}
