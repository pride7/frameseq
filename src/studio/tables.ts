import type { InspectGrid } from "./api";
import { t } from "./i18n";
import type { OptionEdit, OptionPlan } from "./presentation";

/** What can be done to a table's rows and columns from the cell a menu was opened on. */
export const tableActions = ["row-above", "row-below", "column-left", "column-right", "delete-row", "delete-column"] as const;

export type TableAction = (typeof tableActions)[number];

/** Whether a table's rows are written on lines of their own, and the indent they share. */
function rowLines(text: string, grid: InspectGrid): string | undefined {
  const [first] = grid.rows;
  if (!first) return undefined;
  const lineStart = text.lastIndexOf("\n", first.start - 1) + 1;
  const before = text.slice(lineStart, first.start);
  return lineStart > grid.start && !before.trim() ? before : undefined;
}

/** The whole line a row stands on, its comma and line break included, when it is alone there. */
function ownLine(text: string, item: { start: number; end: number }): { from: number; to: number } | undefined {
  let end = item.end;
  while (/[ \t]/.test(text[end] ?? "")) end += 1;
  if (text[end] === ",") end += 1;
  const lineStart = text.lastIndexOf("\n", item.start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd < 0) lineEnd = text.length;
  if (text.slice(lineStart, item.start).trim() || text.slice(end, lineEnd).trim()) return undefined;
  return { from: lineStart, to: Math.min(lineEnd + 1, text.length) };
}

/** Take one of a list's items away, with the comma between it and a neighbour. */
function removeItem(items: Array<{ start: number; end: number }>, index: number): OptionEdit {
  const item = items[index];
  return index < items.length - 1
    ? { from: item.start, to: items[index + 1].start, insert: "" }
    : { from: items[index - 1].end, to: item.end, insert: "" };
}

/**
 * The edits that add a row above or below the cell at `row`, a column left or right of the one
 * at `column`, or take the cell's row or column away. A new row has as many empty cells as the
 * longest row, written as the others are, one to a line when they are; a new column puts an empty
 * cell into every row. A string when the table cannot lose what it is asked to.
 */
export function tableEdit(
  text: string,
  grid: InspectGrid,
  action: TableAction,
  row: number,
  column: number,
  quote: string,
): OptionPlan | string {
  const rows = grid.rows;
  const empty = `${quote}${quote}`;
  const edits: OptionEdit[] = [];
  const indent = rowLines(text, grid);
  if (action === "row-above" || action === "row-below") {
    const width = Math.max(1, ...rows.map((candidate) => candidate.cells.length));
    const fresh = `[${Array.from({ length: width }, () => empty).join(", ")}]`;
    const anchor = rows[Math.min(row, rows.length - 1)];
    if (action === "row-above") {
      edits.push({ from: anchor.start, to: anchor.start, insert: indent === undefined ? `${fresh}, ` : `${fresh},\n${indent}` });
    } else {
      edits.push({ from: anchor.end, to: anchor.end, insert: indent === undefined ? `, ${fresh}` : `,\n${indent}${fresh}` });
    }
  } else if (action === "delete-row") {
    if (rows.length < 2) return t.tables.lastRow;
    const line = indent === undefined ? undefined : ownLine(text, rows[row]);
    edits.push(line ? { ...line, insert: "" } : removeItem(rows, row));
  } else if (action === "column-left" || action === "column-right") {
    const at = action === "column-left" ? column : column + 1;
    for (const line of rows) {
      const cells = line.cells;
      if (cells.length === 0) edits.push({ from: line.start + 1, to: line.start + 1, insert: empty });
      else if (at < cells.length) edits.push({ from: cells[at].start, to: cells[at].start, insert: `${empty}, ` });
      else edits.push({ from: cells[cells.length - 1].end, to: cells[cells.length - 1].end, insert: `, ${empty}` });
    }
  } else {
    if (rows.every((line) => line.cells.length < 2)) return t.tables.lastColumn;
    for (const line of rows) {
      if (column < line.cells.length && line.cells.length > 1) edits.push(removeItem(line.cells, column));
    }
  }
  return {
    edits,
    checks: [{ from: grid.start, to: grid.start + 1, text: "[" }, { from: grid.end - 1, to: grid.end, text: "]" }],
  };
}

/** The cell that holds the words after an action: the new row's or column's, or the one beside. */
export function cellAfter(action: TableAction, row: number, column: number): [number, number] {
  if (action === "row-below") return [row + 1, column];
  if (action === "column-right") return [row, column + 1];
  if (action === "delete-row") return [Math.max(0, row - 1), column];
  if (action === "delete-column") return [row, Math.max(0, column - 1)];
  return [row, column];
}
