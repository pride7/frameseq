import type { Text } from "@codemirror/state";

/** One slide as the rail rendered it, with where it came from in the file on disk. */
export interface RenderedSlide {
  label: string;
  /** The top-level statement that was running when the slide was made. */
  statement?: { start: number; end: number };
  /** The slide() call itself, which may sit inside a loop or a helper function. */
  source?: { line: number; column: number; start: number; end: number };
}

/** A top-level statement of the editor's text, and whether it runs or only declares. */
export interface DocumentStatement {
  start: number;
  end: number;
  runs: boolean;
}

/**
 * The slides one top-level statement made, and the lines that belong to them: from the
 * statement, with the comments written just above it, to where the next group begins.
 */
export interface SlideGroup {
  /** The rendered slides, counted from 0. A loop or a helper call makes more than one. */
  slides: number[];
  /** The statement's position among the document's top-level statements. */
  statement: number;
  /** Editor positions of the lines that move, are duplicated, or are deleted with the group. */
  from: number;
  to: number;
  /** Where the statement begins in the editor. */
  anchor: number;
}

export interface SlideMap {
  groups: SlideGroup[];
  /** The group of each rendered slide; none for a slide made outside the document's statements. */
  groupOf: Array<number | undefined>;
  /** Where each rendered slide's own slide() call is in the editor, when it is in this file. */
  calls: Array<number | undefined>;
}

/** The start of the lines that belong with a statement: its own line and the comments above it. */
function blockStart(doc: Text, anchor: number): number {
  const line = doc.lineAt(anchor);
  // A statement sharing its line with code before it has no line of its own to begin at.
  if (doc.sliceString(line.from, anchor).trim()) return anchor;
  let start = line.number;
  let insideComment = false;
  while (start > 1) {
    const text = doc.line(start - 1).text.trim();
    if (insideComment) {
      start -= 1;
      if (text.startsWith("/*")) insideComment = false;
      continue;
    }
    if (text.startsWith("//")) start -= 1;
    else if (text.endsWith("*/")) {
      start -= 1;
      insideComment = !text.startsWith("/*");
    } else break;
  }
  return doc.line(start).from;
}

/**
 * Match the slides the preview rendered to the statements of the editor's text. The preview
 * names each slide's statement by its offsets in the saved file; `toEditor` carries those into
 * the editor. When a statement no longer lines up, the preview was drawn from other text and no
 * map is returned, so nothing is moved on a guess.
 */
export function buildSlideMap(
  doc: Text,
  statements: DocumentStatement[],
  rendered: RenderedSlide[],
  toEditor: (range: { start: number; end: number }) => { from: number; to: number } | undefined,
): SlideMap | undefined {
  const groups: SlideGroup[] = [];
  const groupOf: Array<number | undefined> = [];
  const calls = rendered.map((slide) => (slide.source ? toEditor(slide.source)?.from : undefined));
  let previous = "";

  for (const [index, slide] of rendered.entries()) {
    if (!slide.statement) {
      groupOf.push(undefined);
      previous = "";
      continue;
    }
    const key = `${slide.statement.start}:${slide.statement.end}`;
    if (key === previous) {
      groups[groups.length - 1].slides.push(index);
      groupOf.push(groups.length - 1);
      continue;
    }
    previous = key;
    const range = toEditor(slide.statement);
    const statement = range
      ? statements.findIndex((candidate) => candidate.start === range.from && candidate.end === range.to)
      : -1;
    if (!range || statement < 0) return undefined;
    // Slides follow the statements in order; anything else is not a document this map can describe.
    if (groups.length > 0 && statement <= groups[groups.length - 1].statement) return undefined;
    groups.push({ slides: [index], statement, from: 0, to: 0, anchor: range.from });
    groupOf.push(groups.length - 1);
  }

  for (const [index, group] of groups.entries()) {
    group.from = blockStart(doc, group.anchor);
    const next = groups[index + 1];
    const nextStart = next ? blockStart(doc, next.anchor) : doc.length;
    // A group's lines run through its last statement that runs, and the blank lines after it.
    // A helper function declared between two slides stays where it is when either one moves.
    const own = statements.slice(group.statement, next ? next.statement : statements.length);
    const last = own.filter((statement) => statement.runs).pop() ?? statements[group.statement];
    let line = doc.lineAt(Math.min(last.end, doc.length)).number;
    while (line < doc.lines && doc.line(line + 1).from < nextStart && !doc.line(line + 1).text.trim()) line += 1;
    group.to = Math.min(line < doc.lines ? doc.line(line + 1).from : doc.length, nextStart);
  }
  return { groups, groupOf, calls };
}

/**
 * The rendered slide the editor position belongs to. Inside a group's lines that is the group's
 * slide (the one already showing, when the group made several). Inside a helper function or a
 * loop body, it is the slide whose own slide() call comes last before the position.
 */
export function slideAt(map: SlideMap, statements: DocumentStatement[], position: number, prefer?: number): number | undefined {
  const containing = map.groups.find((group) => position >= group.from && position < group.to)
    ?? map.groups.find((group, index) => index === map.groups.length - 1 && position >= group.from && position <= group.to);
  const candidates = containing
    ? containing.slides
    : (() => {
      const statement = statements.find((candidate) => position >= candidate.start && position <= candidate.end);
      if (!statement) return [];
      const before = map.calls
        .map((call, index) => ({ call, index }))
        .filter(({ call }) => call !== undefined && call >= statement.start && call <= position);
      const nearest = Math.max(...before.map(({ call }) => call as number));
      return before.filter(({ call }) => call === nearest).map(({ index }) => index);
    })();
  if (candidates.length === 0) return undefined;
  return prefer !== undefined && candidates.includes(prefer) ? prefer : candidates[0];
}
