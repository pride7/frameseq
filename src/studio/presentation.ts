import type { PresentationOption, PresentationOptions } from "./api";
import { stringLiteral } from "./properties";

/** One change to the source, in the offsets of the text the report was made from. */
export interface OptionEdit {
  from: number;
  to: number;
  insert: string;
}

/** The changes that set options, and the text each touched range must still hold. */
export interface OptionPlan {
  edits: OptionEdit[];
  checks: Array<{ from: number; to: number; text: string }>;
}

/** The option of that name, as the call writes it last. */
export function presentationOption(options: PresentationOptions | undefined, name: string): PresentationOption | undefined {
  if (options?.form === "title" && name === "title" && options.title) {
    const { value, kind, source, expected } = options.title;
    return { name, start: source.start, end: source.end, value, kind, code: expected, source };
  }
  return options?.properties?.filter((property) => property.name === name).at(-1);
}

/** The quote the options' strings are written with, so a new one reads like the rest. */
function quoteOf(options: PresentationOptions): string {
  const written = options.form === "title"
    ? options.title?.expected
    : options.properties?.find((property) => property.kind === "string")?.code;
  return written?.startsWith("'") ? "'" : '"';
}

/** A string option's value as code, in the quotes the call already uses. */
export function optionString(options: PresentationOptions, value: string): string {
  return stringLiteral(value, quoteOf(options)) ?? JSON.stringify(value);
}

const identifier = /^[A-Za-z_$][\w$]*$/;

function entry(name: string, code: string): string {
  return `${identifier.test(name) ? name : JSON.stringify(name)}: ${code}`;
}

/**
 * Set or remove options of the presentation() call: each name maps to the code of its new value,
 * or to undefined to take it away. A value already written is rewritten where it stands, and a
 * new one goes after the last option, on a line of its own when the options have lines of their
 * own. A call with no options, or a title alone, becomes an object of options. Undefined when
 * the code works the options out, or nothing would change.
 */
export function planOptions(
  text: string,
  options: PresentationOptions | undefined,
  changes: Record<string, string | undefined>,
): OptionPlan | undefined {
  if (!options || options.form === "other") return undefined;
  const wanted = Object.entries(changes);
  const added = (written: Set<string>): string[] => wanted
    .filter(([name, code]) => code !== undefined && !written.has(name))
    .map(([name, code]) => entry(name, code as string));

  if (options.form !== "object") {
    const title = options.form === "title" ? options.title : undefined;
    // presentation("Title") keeps its form while only its title changes.
    const code = changes.title;
    if (title && wanted.length === 1 && code !== undefined) {
      if (code === title.expected) return undefined;
      const range = { from: title.source.start, to: title.source.end };
      return { edits: [{ ...range, insert: code }], checks: [{ ...range, text: title.expected }] };
    }
    // presentation() or presentation("Title") becomes presentation({ title: "Title", ... }).
    const kept = title && !("title" in changes) ? [entry("title", title.expected)] : [];
    const all = [...kept, ...added(new Set())];
    const unchanged = title ? all.length === 1 && kept.length === 1 : all.length === 0;
    if (unchanged) return undefined;
    const from = title ? title.source.start : options.arguments.start;
    const to = title ? title.source.end : options.arguments.end;
    return {
      edits: [{ from, to, insert: all.length ? `{ ${all.join(", ")} }` : "" }],
      checks: [{ from, to, text: text.slice(from, to) }],
    };
  }

  const object = options.object as NonNullable<PresentationOptions["object"]>;
  const properties = options.properties ?? [];
  const written = new Set(properties.map((property) => property.name).filter((name): name is string => Boolean(name)));
  const fresh = added(written);
  const whole = { from: object.start, to: object.end };
  const wholeCheck = [{ ...whole, text: text.slice(whole.from, whole.to) }];
  /** The option as it will read: its own code, with a new value, or nothing when it goes. */
  const rewritten = (property: PresentationOption): string | undefined => {
    const own = text.slice(property.start, property.end);
    if (!property.name || !(property.name in changes)) return own;
    const code = changes[property.name];
    if (code === undefined) return undefined;
    // Only the last of an option written twice says anything, and it takes the new value.
    if (property !== presentationOption(options, property.name) || !property.source) return own;
    return `${text.slice(property.start, property.source.start)}${code}${text.slice(property.source.end, property.end)}`;
  };

  // Options on one line are written out again, which keeps their commas right whatever goes.
  if (!object.multiline || object.indent === undefined) {
    const parts = [...properties.map(rewritten).filter((part): part is string => part !== undefined), ...fresh];
    const insert = parts.length ? `{ ${parts.join(", ")} }` : "{}";
    return insert === wholeCheck[0].text ? undefined : { edits: [{ ...whole, insert }], checks: wholeCheck };
  }

  // Options on lines of their own keep their lines: a value is rewritten where it stands, an
  // option taken away takes its line, and a new one gets a line after the last that stays.
  const edits: OptionEdit[] = [];
  for (const property of properties) {
    const part = rewritten(property);
    const own = text.slice(property.start, property.end);
    if (part === own) continue;
    if (part !== undefined) {
      edits.push({ from: property.start, to: property.end, insert: part });
      continue;
    }
    const line = ownLine(text, property);
    // An option that shares its line with another cannot take the line; the object is rewritten.
    if (!line) return rewriteLines(text, options, rewritten, fresh, wholeCheck);
    edits.push({ ...line, insert: "" });
  }
  if (fresh.length) {
    const anchor = properties.filter((property) => rewritten(property) !== undefined).at(-1);
    edits.push(newLines(text, anchor, object, fresh));
  }
  if (edits.length === 0) return undefined;
  return { edits: merge(edits), checks: wholeCheck };
}

/** The whole line an option stands on, its comma and line break included, when it is alone there. */
function ownLine(text: string, property: PresentationOption): { from: number; to: number } | undefined {
  let end = property.end;
  while (/[ \t]/.test(text[end] ?? "")) end += 1;
  if (text[end] === ",") end += 1;
  const lineStart = text.lastIndexOf("\n", property.start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd < 0) lineEnd = text.length;
  if (text.slice(lineStart, property.start).trim() || text.slice(end, lineEnd).trim()) return undefined;
  return { from: lineStart, to: Math.min(lineEnd + 1, text.length) };
}

/** New options on lines of their own after `anchor`, keeping the commas as the others have them. */
function newLines(
  text: string,
  anchor: PresentationOption | undefined,
  object: NonNullable<PresentationOptions["object"]>,
  added: string[],
): OptionEdit {
  const indent = object.indent ?? "  ";
  const lines = added.map((option) => `\n${indent}${option},`).join("");
  if (!anchor) return { from: object.start + 1, to: object.start + 1, insert: lines };
  let after = anchor.end;
  while (/[ \t]/.test(text[after] ?? "")) after += 1;
  return text[after] === ","
    ? { from: after + 1, to: after + 1, insert: lines }
    : { from: anchor.end, to: anchor.end, insert: `,${lines.slice(0, -1)}` };
}

/** The options written out again, each on a line of its own. */
function rewriteLines(
  text: string,
  options: PresentationOptions,
  rewritten: (property: PresentationOption) => string | undefined,
  fresh: string[],
  checks: OptionPlan["checks"],
): OptionPlan {
  const object = options.object as NonNullable<PresentationOptions["object"]>;
  const indent = object.indent ?? "  ";
  const parts = [...(options.properties ?? []).map(rewritten).filter((part): part is string => part !== undefined), ...fresh];
  const closing = text.slice(text.lastIndexOf("\n", object.end - 1) + 1, object.end - 1);
  const insert = parts.length ? `{\n${parts.map((part) => `${indent}${part},`).join("\n")}\n${closing.trim() ? "" : closing}}` : "{}";
  return { edits: [{ from: object.start, to: object.end, insert }], checks };
}

/** Edits in order, those that meet joined, so they apply as one change. */
function merge(edits: OptionEdit[]): OptionEdit[] {
  const ordered = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
  return ordered.reduce<OptionEdit[]>((merged, edit) => {
    const previous = merged.at(-1);
    if (previous && edit.from <= previous.to) {
      previous.to = Math.max(previous.to, edit.to);
      previous.insert += edit.insert;
    } else {
      merged.push({ ...edit });
    }
    return merged;
  }, []);
}
