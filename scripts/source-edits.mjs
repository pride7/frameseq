import { readFile, writeFile } from "node:fs/promises";

/** At most this many numbers change in one drag: x, y, width, height. */
const maximumEdits = 4;

/** Drags to undo, newest last, per slide document. Kept only for the server's lifetime. */
const undoStacks = new Map();
const maximumUndoDepth = 50;

/**
 * Where each number lands once the whole batch has been written, paired with the text it
 * replaced. Restoring that text rather than a formatted number puts a literal such as 80.5
 * back exactly as it was written.
 */
function inverseEdits(edits) {
  let shift = 0;
  return edits.map((edit) => {
    const replacement = String(Math.round(edit.value));
    const start = edit.start + shift;
    shift += replacement.length - (edit.end - edit.start);
    return { start, end: start + replacement.length, expected: replacement, text: edit.expected };
  });
}

/**
 * Put the slide document back the way the last drag found it. The same check applies as on the
 * way in, so an undo never overwrites an edit made in the editor meanwhile; when that happens
 * the rest of the history no longer describes the file and is dropped with it.
 */
export async function undoLastEdit(entry) {
  const stack = undoStacks.get(entry);
  const batch = stack?.pop();
  if (!batch) return { ok: false, undo: true, reason: "There is nothing to undo." };

  const source = await readFile(entry, "utf8");
  for (const edit of batch) {
    if (edit.end > source.length || source.slice(edit.start, edit.end) !== edit.expected) {
      undoStacks.delete(entry);
      return {
        ok: false,
        undo: true,
        reason: "The slide document changed, so the drag can no longer be undone.",
      };
    }
  }

  let updated = source;
  for (const edit of [...batch].reverse()) {
    updated = updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
  }
  await writeFile(entry, updated, "utf8");
  return { ok: true, undo: true };
}

/**
 * Read the numbers the preview asks to rewrite. Only offsets and numbers are accepted, so a
 * request can never introduce source text of its own choosing.
 */
export function readIncomingEdits(payload) {
  const edits = payload?.edits;
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > maximumEdits) return undefined;

  const parsed = [];
  for (const candidate of edits) {
    const { start, end, expected, value } = candidate ?? {};
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return undefined;
    if (typeof expected !== "string" || expected.length === 0 || expected.length > 32) return undefined;
    if (expected.length !== end - start) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    parsed.push({ start, end, expected, value });
  }

  // Overlapping ranges would corrupt each other, so the whole request is refused.
  const ordered = [...parsed].sort((a, b) => a.start - b.start);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end) return undefined;
  }
  return ordered;
}

/**
 * Rewrite the numbers a drag changed, in place, in the slide document. Nothing else in the
 * file is touched: only the character range each number occupies is replaced, and only while
 * it still holds the text the preview was drawn from. A stale request is refused rather than
 * guessed at, so a drag can never overwrite an edit made in the editor meanwhile.
 */
export async function applyIncomingEdits(entry, payload) {
  const edits = readIncomingEdits(payload);
  if (!edits) return { ok: false, reason: "The edit request was malformed." };

  const source = await readFile(entry, "utf8");
  for (const edit of edits) {
    if (edit.end > source.length || source.slice(edit.start, edit.end) !== edit.expected) {
      return { ok: false, reason: "The slide document changed while the preview was being dragged." };
    }
  }

  let updated = source;
  for (const edit of [...edits].reverse()) {
    // The preview only moves things by whole pixels, so the source keeps plain integers.
    updated = updated.slice(0, edit.start) + String(Math.round(edit.value)) + updated.slice(edit.end);
  }
  if (updated === source) return { ok: true };

  await writeFile(entry, updated, "utf8");
  const stack = undoStacks.get(entry) ?? [];
  stack.push(inverseEdits(edits));
  if (stack.length > maximumUndoDepth) stack.shift();
  undoStacks.set(entry, stack);
  return { ok: true };
}
