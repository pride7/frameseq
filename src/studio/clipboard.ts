/**
 * Objects copied from a slide travel as the lines that write them. Pasting writes those lines
 * again: a name the slide already has becomes a new one, such as box to box2, and the pasted
 * lines that refer to it follow; objects placed by coordinates can be moved over a little, so a
 * copy pasted onto its own slide does not hide the original.
 */

import { analyzeNames } from "../source-names";

/**
 * Blocks of lines as one piece of code, in the order given. Each keeps its indent: a line inside
 * a template literal, such as a formula's or a code block's, is part of the string it is in.
 */
export function copiedCode(blocks: string[]): string {
  return blocks.map((block) => block.replace(/\r?\n$/, "").replace(/\r\n/g, "\n")).join("\n");
}

/** The names given on the slide whose code holds `position`, which a pasted object must not take. */
export function namesAt(source: string, position: number): Set<string> {
  const slide = analyzeNames(source).find((names) => names.start <= position && position <= names.end);
  return new Set(slide?.definitions.map((definition) => definition.name) ?? []);
}

const position = /\.position\(\{\s*x:\s*(-?\d+(?:\.\d+)?),\s*y:\s*(-?\d+(?:\.\d+)?)\s*\}\)/g;
const lineEnds = /\{\s*x1:\s*(-?\d+(?:\.\d+)?),\s*y1:\s*(-?\d+(?:\.\d+)?),\s*x2:\s*(-?\d+(?:\.\d+)?),\s*y2:\s*(-?\d+(?:\.\d+)?)\s*\}/g;

/**
 * The lines to paste: each name in `taken` that the code gives is renamed, with every reference
 * to it in the code, and coordinates written as numbers move `shift` down and to the right.
 */
export function pastedLines(code: string, taken: ReadonlySet<string>, shift = 0): string[] {
  // The code is read as the content of a slide, which is where names are given and found.
  const prefix = 'slide("");\n';
  const source = `${prefix}${code}`;
  const [names] = analyzeNames(source);
  const definitions = names?.definitions.filter((definition) => definition.kind === "object") ?? [];
  const used = new Set([...taken, ...definitions.map((definition) => definition.name)]);
  const renamed = new Map<string, string>();
  for (const { name } of definitions) {
    if (!taken.has(name) || renamed.has(name)) continue;
    const stem = name.replace(/\d+$/, "");
    let index = 2;
    while (used.has(`${stem}${index}`)) index += 1;
    used.add(`${stem}${index}`);
    renamed.set(name, `${stem}${index}`);
  }
  const edits = [
    ...definitions.filter(({ name }) => renamed.has(name))
      .map(({ start, end, name }) => ({ start, end, text: renamed.get(name) as string })),
    ...(names?.references ?? []).filter(({ name }) => renamed.has(name))
      .map(({ start, name }) => ({ start, end: start + name.length, text: renamed.get(name) as string })),
  ].sort((a, b) => b.start - a.start);
  let text = source;
  for (const edit of edits) text = `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`;
  text = text.slice(prefix.length);
  if (shift) {
    const moved = (value: string): number => Number(value) + shift;
    text = text
      .replace(position, (_, x: string, y: string) => `.position({ x: ${moved(x)}, y: ${moved(y)} })`)
      .replace(lineEnds, (_, x1: string, y1: string, x2: string, y2: string) => (
        `{ x1: ${moved(x1)}, y1: ${moved(y1)}, x2: ${moved(x2)}, y2: ${moved(y2)} }`
      ));
  }
  return text.split("\n");
}
