import type { Text } from "@codemirror/state";

/**
 * How the slide document is stored on disk. The editor always works with plain "\n" line
 * breaks and no byte-order mark, while the preview and the development server count offsets in
 * the file exactly as it is written, so every offset that crosses between them is translated.
 */
export interface FileFormat {
  bom: boolean;
  crlf: boolean;
}

export function detectFormat(text: string): FileFormat {
  const lineFeeds = text.match(/\n/g)?.length ?? 0;
  const carriageReturns = text.match(/\r\n/g)?.length ?? 0;
  return {
    bom: text.startsWith("﻿"),
    // A file that mixes both is written back with the style most of its lines use.
    crlf: carriageReturns > 0 && carriageReturns * 2 >= lineFeeds,
  };
}

export function toEditorText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

export function toFileText(text: string, format: FileFormat): string {
  const body = format.crlf ? text.replace(/\n/g, "\r\n") : text;
  return format.bom ? `﻿${body}` : body;
}

/** A position in the editor for an offset into the file on disk. */
export function fromFileOffset(doc: Text, offset: number, format: FileFormat): number {
  const value = Math.max(0, offset - (format.bom ? 1 : 0));
  if (!format.crlf) return Math.min(value, doc.length);
  // Line n (from 1) begins n - 1 carriage returns later in the file than in the editor.
  let low = 1;
  let high = doc.lines;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (doc.line(middle).from + middle - 1 <= value) low = middle;
    else high = middle - 1;
  }
  const line = doc.line(low);
  return Math.min(line.from + (value - (line.from + low - 1)), line.to);
}

/**
 * The smallest single replacement that turns one text into another. Applying it rather than
 * the whole new text keeps the cursor, the scroll position, and a short undo step.
 */
export function minimalChange(before: string, after: string): { from: number; to: number; insert: string } {
  let start = 0;
  const shortest = Math.min(before.length, after.length);
  while (start < shortest && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start
    && before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)) {
    endBefore -= 1;
    endAfter -= 1;
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter) };
}
