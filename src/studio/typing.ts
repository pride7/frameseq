import type { InspectObject, InspectText } from "./api";
import { unframe } from "./properties";

/**
 * The part of an object a double-click on the slide landed on, as the preview tells it: one of
 * the command's arguments, a list's item, a table's cell, or a shape's label. Nothing at all
 * means the object's first words, as when it has just been inserted.
 */
export interface TextPart {
  argument?: number;
  item?: number;
  cell?: [number, number];
  label?: boolean;
}

/** The objects whose words are typed on the slide; formulas and pictures are set in Current slide. */
const typedKinds = new Set([
  "text", "lead", "caption", "quote", "code",
  "bullets", "steps", "card", "metric", "table",
  "rect", "circle", "junction", "shape", "polygon",
]);

/** The argument a shape's label is, by its command: shape() and polygon() take it second. */
const labelArgument: Record<string, number> = { rect: 0, circle: 0, junction: 0, shape: 1, polygon: 1 };

/** What typing on an object edits, or why it cannot. */
export type WordsChoice =
  /** A literal the words are written in, shown as Content shows it. */
  | { kind: "text"; text: InspectText; value: string; multiline: boolean }
  /** A shape written without a label, which takes one when words are typed on it. */
  | { kind: "label" }
  /** Words the code works out, such as a variable or a template with `${...}`. */
  | { kind: "computed" }
  /** An object set in Current slide instead, such as a formula or a picture. */
  | { kind: "elsewhere" };

/** The words a template written over lines shows, without its frame, as Content shows them. */
export function shownWords(text: InspectText): string {
  const template = text.raw === true || text.expected.startsWith("`");
  return template ? unframe(String(text.value)).body : String(text.value);
}

/** What a double-click on `part` of an object types into. */
export function wordsFor(object: InspectObject, part: TextPart): WordsChoice {
  if (!typedKinds.has(object.type)) return { kind: "elsewhere" };
  const texts = object.texts ?? [];
  let text: InspectText | undefined;
  if (object.type === "table") {
    const [row, column] = part.cell ?? [0, 0];
    text = object.cells?.find((cell) => cell.row === row && cell.column === column);
  } else if (object.type === "bullets" || object.type === "steps") {
    text = texts.find((candidate) => candidate.argument === (part.item ?? 0));
  } else if (object.type in labelArgument) {
    text = texts.find((candidate) => candidate.argument === labelArgument[object.type]);
    if (!text && object.labelAt) return { kind: "label" };
  } else {
    text = texts.find((candidate) => candidate.argument === (part.argument ?? 0));
  }
  if (!text) return { kind: "computed" };
  const value = shownWords(text);
  return { kind: "text", text, value, multiline: object.type === "code" || value.includes("\n") };
}
