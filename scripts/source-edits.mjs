import { readFile, writeFile } from "node:fs/promises";

/** One keyboard gesture may update both coordinates on each of at most 50 selections. */
const maximumEdits = 100;

/** Drags to undo, newest last, per slide document. Kept only for the server's lifetime. */
const undoStacks = new Map();
const maximumUndoDepth = 50;

/**
 * Where each number lands once the whole batch has been written, paired with the text it
 * replaced. Restoring that text rather than a formatted number puts a literal such as 80.5
 * back exactly as it was written.
 */
function pushUndo(entry, batch) {
  const stack = undoStacks.get(entry) ?? [];
  stack.push(batch);
  if (stack.length > maximumUndoDepth) stack.shift();
  undoStacks.set(entry, stack);
}

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
 * Read a request to move one command's lines to where another command's lines begin or end.
 * The text to move is never supplied: it is read back out of the file, and the caller's copy
 * of it only says which text the drag was aimed at.
 */
export function readIncomingMove(payload) {
  const move = payload?.move;
  if (!move) return undefined;
  const { start, end, expected, at } = move;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return undefined;
  if (typeof expected !== "string" || expected.length !== end - start) return undefined;
  if (!Number.isInteger(at) || at < 0) return undefined;
  // Dropping a command inside its own lines would mean moving it nowhere in particular.
  if (at > start && at < end) return undefined;
  return { start, end, expected, at };
}

/**
 * Move a command's lines to another place among its neighbours. Both ends are whole lines, so
 * the file keeps its shape; the lines themselves are carried over untouched, comments included.
 */
export async function applyIncomingMove(entry, payload) {
  const move = readIncomingMove(payload);
  if (!move) return { ok: false, reason: "The move request was malformed." };

  const source = await readFile(entry, "utf8");
  if (move.end > source.length || source.slice(move.start, move.end) !== move.expected) {
    return { ok: false, reason: "The slide document changed while the preview was being dragged." };
  }
  if (move.at > source.length) return { ok: false, reason: "The move request was malformed." };
  if (move.at === move.start || move.at === move.end) return { ok: true };

  const block = source.slice(move.start, move.end);
  const without = source.slice(0, move.start) + source.slice(move.end);
  const landsAt = move.at < move.start ? move.at : move.at - block.length;
  const updated = without.slice(0, landsAt) + block + without.slice(landsAt);
  if (updated === source) return { ok: true };

  await writeFile(entry, updated, "utf8");
  // Undoing a move is the move back: lift the block out of where it landed and put it where it
  // came from. Moving it up shifted its old place along by its own length; moving it down did
  // not, because everything it passed over is now above it.
  const returnsTo = move.start < landsAt ? move.start : move.start + block.length;
  pushUndo(entry, [
    { start: landsAt, end: landsAt + block.length, expected: block, text: "" },
    { start: returnsTo, end: returnsTo, expected: "", text: block },
  ].sort((a, b) => a.start - b.start));
  return { ok: true };
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
  pushUndo(entry, inverseEdits(edits));
  return { ok: true };
}
