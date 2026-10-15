import type { Text, TransactionSpec } from "@codemirror/state";
import { EditorSelection } from "@codemirror/state";
import type { DocumentStatement } from "./outline";

/** A master's name, as master() accepts it. */
export const masterName = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** The page a master is drawn for: the canvas, and the room the theme leaves around content. */
export interface PageGeometry {
  width: number;
  height: number;
  slideX: number;
  slideY: number;
  coverX: number;
  coverY: number;
  gap: number;
}

/**
 * A new master's code. It starts where the theme already puts things, so a presentation looks
 * the same until its master is changed: a cover's title, subtitle, and author each in a box of
 * their own, and a slide's title above the room for its content.
 */
export function starterMaster(name: string, page: PageGeometry): string[] {
  const at = (role: string, x: number, y: number, width: number, height: number, justify?: string): string => (
    `${role === "body" ? "placeholder()" : `placeholder(${JSON.stringify(role)})`}`
    + `.position({ x: ${Math.round(x)}, y: ${Math.round(y)} }).width(${Math.round(width)}).height(${Math.round(height)})`
    + `${justify ? `.justify(${JSON.stringify(justify)})` : ""};`
  );
  if (name === "cover") {
    const width = page.width - 2 * page.coverX;
    const top = page.height * 0.2;
    const title = page.height * 0.32;
    const subtitle = page.height * 0.16;
    return [
      `master("cover");`,
      at("title", page.coverX, top, width, title, "end"),
      at("subtitle", page.coverX, top + title + 16, width, subtitle, "start"),
      at("author", page.coverX, page.height - page.coverY - 48, width, 48, "end"),
    ];
  }
  const width = page.width - 2 * page.slideX;
  const title = Math.round(page.height * 0.09);
  return [
    `master(${JSON.stringify(name)});`,
    at("title", page.slideX, page.slideY, width, title),
    at("body", page.slideX, page.slideY + title + page.gap, width, page.height - 2 * page.slideY - title - page.gap),
  ];
}

/**
 * Where a new master is written: after the masters already there, or else after presentation(),
 * before the first slide. A poster begins its page in poster() itself, so there it goes last,
 * where nothing written after it can land on the master instead of the page.
 */
export function masterInsertion(doc: Text, statements: DocumentStatement[]): number {
  const text = (statement: DocumentStatement): string => doc.sliceString(statement.start, Math.min(statement.end, doc.length));
  const masters = statements.map((statement, index) => ({ statement, index })).filter(({ statement }) => statement.starts === "master");
  const last = masters.at(-1);
  if (last) {
    // Through the master's last statement that runs, up to the next slide or master.
    const next = statements.findIndex((statement, index) => index > last.index && statement.starts);
    const own = statements.slice(last.index, next < 0 ? statements.length : next).filter((statement) => statement.runs);
    return (own.at(-1) ?? last.statement).end;
  }
  if (statements.some((statement) => /\bposter\s*\(/.test(text(statement)))) return doc.length;
  const opening = statements.find((statement) => /\bpresentation\s*\(/.test(text(statement)));
  if (opening) return opening.end;
  const first = statements.find((statement) => statement.starts === "slide");
  return first ? Math.max(first.start - 1, 0) : doc.length;
}

/** Write a new master after `after`, as lines of its own, with the cursor on its first line. */
export function insertMaster(doc: Text, after: number, lines: string[]): TransactionSpec {
  const line = doc.lineAt(Math.min(after, doc.length));
  const insert = `\n\n${lines.join("\n")}`;
  const at = line.to + 2;
  return {
    changes: { from: line.to, insert },
    selection: EditorSelection.cursor(at),
    scrollIntoView: true,
    userEvent: "input.insert",
  };
}

/** The masters a slide can be drawn on, by name, as a slide names them. */
export function masterNames(masters: Array<{ master?: string }> | undefined): string[] {
  return (masters ?? []).map((page) => page.master).filter((name): name is string => Boolean(name));
}
