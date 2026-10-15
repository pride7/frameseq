/**
 * The names a slide document gives its objects and regions, read from the text alone.
 *
 * `.as("encoder")` names an object and `at("cell0/now")` names a region; `ref()`, `group()`,
 * `gridSection()`, connectors, and relative placement refer to those names. They are strings
 * to TypeScript, which can neither complete nor check them, so an editor asks this module
 * instead. It has no dependencies, which lets FrameSeq Studio and the VS Code extension share
 * it, and it reads only what the document states literally: a name built at runtime is
 * something it knows it cannot see, and then it stays quiet rather than guess.
 *
 * It reads one more thing TypeScript accepts without a word: a formula in a quoted string whose
 * backslashes became escapes, such as "$\frac{1}{2}$".
 */

export type NameKind = "object" | "region";

/** A string in the document, by the offsets of its content (inside the quotes). */
export interface TextSpan {
  start: number;
  end: number;
}

export interface NameDefinition extends TextSpan {
  name: string;
  kind: NameKind;
  /** The command that made the object, such as `rect`, or `at` for a region. */
  command: string;
  /** Offset of that command, where hovering or jumping should land. */
  commandStart: number;
}

export interface NameReference extends TextSpan {
  /** The text of the string, such as "encoder.right". */
  text: string;
  /** The name the reference resolves, without an anchor side: "encoder". */
  name: string;
  /** The anchor side after the name, when a connector names one. */
  side?: string;
  /** The command or modifier the string is passed to, such as `ref` or `from`. */
  command: string;
}

/** A visit of at(): the path, and the segments it creates or reaches. */
export interface RegionVisit extends TextSpan {
  path: string;
}

export interface SlideNames {
  /** Where the slide's statements begin and end in the document. */
  start: number;
  end: number;
  definitions: NameDefinition[];
  references: NameReference[];
  visits: RegionVisit[];
  /** Regions the slide layout owns: main, left and right for split(), cells for grid(). */
  layoutRegions: string[];
  /** The slide's layout states split() or grid(), so its region names are known. */
  layout: { split: boolean; grid: number | "unknown" | undefined };
  /**
   * Something on the slide may name objects in a way the text does not show: a name built at
   * runtime, or a helper function called. Missing names are then not reported.
   */
  dynamic: boolean;
}

export interface NameDiagnostic extends TextSpan {
  severity: "error" | "warning";
  message: string;
}

export interface NameCompletion {
  label: string;
  /** What the name is, for the completion list. */
  detail: string;
  kind: "object" | "region" | "layout" | "anchor";
}

export interface NameEdit extends TextSpan {
  text: string;
}

export const anchorSideNames = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

const segmentPattern = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Calls whose every string argument is a name. */
const nameListCommands = new Set(["ref", "group"]);
/** Modifiers whose first argument is a name, optionally with an anchor side. */
const anchorModifiers = new Set(["from", "to"]);
/** Modifiers whose first argument is a name. */
const placementModifiers = new Set(["rightOf", "leftOf", "above", "below", "centerOn", "alignTop", "alignLeft"]);

/**
 * Everything a slide document may call without that call naming something unseen: FrameSeq's
 * own commands, and the common globals of TypeScript itself.
 */
const knownCalls = new Set([
  "presentation", "slide", "master", "placeholder", "note", "text", "image", "code", "math", "typst", "typstFile",
  "latex", "latexFile", "rect", "circle", "shape", "line", "bullets", "steps", "metric", "spacer",
  "group", "ref", "card", "gridSection", "main", "left", "right", "cell", "at", "gap",
  "table", "chart", "qr", "icon", "cite", "footnote", "references", "poster",
  "px", "pt", "mm", "rem", "percent", "vw", "vh", "defineTheme",
  "String", "Number", "Boolean", "Array", "Object", "Math", "JSON", "Date", "Map", "Set", "parseInt",
  "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "require",
  "if", "for", "while", "switch", "catch", "function", "return", "typeof", "import",
]);

type TokenType = "identifier" | "string" | "template" | "punctuation" | "other";

interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  /** For a string: its unescaped text, and whether it can be read statically. */
  text?: string;
  static?: boolean;
}

/** Read a quoted string starting at `start`; returns its text and where it ends. */
function readQuoted(source: string, start: number): { end: number; text: string } {
  const quote = source[start];
  let index = start + 1;
  let text = "";
  while (index < source.length) {
    const character = source[index];
    if (character === quote) return { end: index + 1, text };
    if (character === "\n") break;
    if (character === "\\" && index + 1 < source.length) {
      const escaped = source[index + 1];
      text += ({ n: "\n", r: "\r", t: "\t" } as Record<string, string>)[escaped] ?? escaped;
      index += 2;
      continue;
    }
    text += character;
    index += 1;
  }
  return { end: index, text };
}

/** Read a template literal, including any `${...}` substitutions inside it. */
function readTemplate(source: string, start: number): { end: number; text: string; substituted: boolean } {
  let index = start + 1;
  let text = "";
  let substituted = false;
  while (index < source.length) {
    const character = source[index];
    if (character === "`") return { end: index + 1, text, substituted };
    if (character === "\\" && index + 1 < source.length) {
      text += source[index + 1];
      index += 2;
      continue;
    }
    if (character === "$" && source[index + 1] === "{") {
      substituted = true;
      index = skipCode(source, index + 2, "}");
      continue;
    }
    text += character;
    index += 1;
  }
  return { end: index, text, substituted };
}

/** Skip code up to and past the closing character, minding nested strings and braces. */
function skipCode(source: string, start: number, closing: string): number {
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const character = source[index];
    if (character === "'" || character === "\"") {
      index = readQuoted(source, index).end;
      continue;
    }
    if (character === "`") {
      index = readTemplate(source, index).end;
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      if (depth === 0 && closing === "}") return index + 1;
      depth -= 1;
    }
    index += 1;
  }
  return index;
}

/** Characters after which a slash begins a regular expression rather than a division. */
const regexPrecedents = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

/** Split the document into the tokens the name rules need, leaving out comments. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (character === "'" || character === "\"") {
      const read = readQuoted(source, index);
      // A string still being typed has no closing quote yet, and is read as far as it goes.
      tokens.push({ type: "string", value: source.slice(index, read.end), start: index, end: read.end, text: read.text, static: true });
      index = read.end;
      continue;
    }
    if (character === "`") {
      const read = readTemplate(source, index);
      tokens.push({ type: "template", value: source.slice(index, read.end), start: index, end: read.end, text: read.text, static: !read.substituted });
      index = read.end;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
      tokens.push({ type: "identifier", value: source.slice(start, index), start, end: index });
      continue;
    }
    if (character === "/") {
      const previous = tokens[tokens.length - 1];
      const startsRegex = !previous
        || (previous.type === "punctuation" && regexPrecedents.has(previous.value))
        || (previous.type === "identifier" && ["return", "typeof", "case", "in", "of"].includes(previous.value));
      if (startsRegex) {
        let cursor = index + 1;
        let inClass = false;
        while (cursor < source.length && source[cursor] !== "\n") {
          const current = source[cursor];
          if (current === "\\") cursor += 2;
          else {
            if (current === "[") inClass = true;
            else if (current === "]") inClass = false;
            else if (current === "/" && !inClass) break;
            cursor += 1;
          }
        }
        cursor += 1;
        while (cursor < source.length && /[a-z]/i.test(source[cursor])) cursor += 1;
        tokens.push({ type: "other", value: source.slice(index, cursor), start: index, end: cursor });
        index = cursor;
        continue;
      }
    }
    if (/[0-9]/.test(character)) {
      const start = index;
      while (index < source.length && /[0-9A-Za-z_.]/.test(source[index])) index += 1;
      tokens.push({ type: "other", value: source.slice(start, index), start, end: index });
      continue;
    }
    tokens.push({ type: "punctuation", value: character, start: index, end: index + 1 });
    index += 1;
  }
  return tokens;
}

/** For each opening parenthesis, bracket, or brace, the index of the token that closes it. */
function matchBrackets(tokens: Token[]): Map<number, number> {
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  const closers: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  tokens.forEach((token, index) => {
    if (token.type !== "punctuation") return;
    if (token.value === "(" || token.value === "[" || token.value === "{") stack.push(index);
    else if (token.value in closers) {
      // Unbalanced text, as while a line is being typed, closes whatever is open.
      while (stack.length > 0) {
        const open = stack.pop() as number;
        if (tokens[open].value === closers[token.value]) {
          pairs.set(open, index);
          break;
        }
      }
    }
  });
  return pairs;
}

interface Call {
  /** Index of the identifier token. */
  name: number;
  open: number;
  close: number | undefined;
  method: boolean;
  /** Argument token ranges, as [first, last] token indexes. */
  args: Array<[number, number]>;
}

function readCalls(tokens: Token[], pairs: Map<number, number>): Call[] {
  const calls: Call[] = [];
  tokens.forEach((token, index) => {
    if (token.type !== "identifier") return;
    const open = tokens[index + 1];
    if (!open || open.type !== "punctuation" || open.value !== "(") return;
    const previous = tokens[index - 1];
    const method = previous?.type === "punctuation" && previous.value === ".";
    // Declarations such as `function slide(` are not calls.
    if (!method && previous?.type === "identifier" && previous.value === "function") return;
    const close = pairs.get(index + 1);
    const args: Array<[number, number]> = [];
    const last = close ?? tokens.length;
    let first = index + 2;
    let cursor = first;
    while (cursor < last) {
      const current = tokens[cursor];
      if (current.type === "punctuation" && (current.value === "(" || current.value === "[" || current.value === "{")) {
        cursor = (pairs.get(cursor) ?? last) + 1;
        continue;
      }
      if (current.type === "punctuation" && current.value === ",") {
        if (cursor > first) args.push([first, cursor - 1]);
        first = cursor + 1;
      }
      cursor += 1;
    }
    if (last > first) args.push([first, last - 1]);
    calls.push({ name: index, open: index + 1, close, method, args });
  });
  return calls;
}

/** The single static string an argument consists of, if that is all it is. */
function staticString(tokens: Token[], argument: [number, number] | undefined): Token | undefined {
  if (!argument || argument[0] !== argument[1]) return undefined;
  const token = tokens[argument[0]];
  if ((token.type === "string" || token.type === "template") && token.static) return token;
  return undefined;
}

function contentSpan(token: Token): TextSpan {
  const closed = token.value.length >= 2 && token.value.endsWith(token.value[0]);
  return { start: token.start + 1, end: closed ? token.end - 1 : token.end };
}

/** The identifier a chain such as rect("A").fill("#fff").as("a") starts from. */
function chainRoot(tokens: Token[], opens: Map<number, number>, dot: number): number | undefined {
  let index = dot - 1;
  for (;;) {
    const token = tokens[index];
    if (!token) return undefined;
    if (token.type === "punctuation" && token.value === ")") {
      const open = opens.get(index);
      if (open === undefined) return undefined;
      index = open - 1;
      continue;
    }
    if (token.type === "template") {
      index -= 1;
      continue;
    }
    if (token.type !== "identifier") return undefined;
    const before = tokens[index - 1];
    if (before?.type === "punctuation" && before.value === ".") {
      index -= 2;
      continue;
    }
    return index;
  }
}

/** The modifiers chained directly onto a call, such as split() in slide("x").split("1:2"). */
function chainedMethods(tokens: Token[], pairs: Map<number, number>, call: Call): Array<{ name: string; args: Token[] }> {
  const methods: Array<{ name: string; args: Token[] }> = [];
  let index = (call.close ?? tokens.length) + 1;
  while (tokens[index]?.value === "." && tokens[index + 1]?.type === "identifier" && tokens[index + 2]?.value === "(") {
    const close = pairs.get(index + 2);
    methods.push({ name: tokens[index + 1].value, args: tokens.slice(index + 3, close ?? index + 3) });
    if (close === undefined) break;
    index = close + 1;
  }
  return methods;
}

function splitName(text: string): { name: string; side?: string } {
  const dot = text.indexOf(".");
  return dot < 0 ? { name: text } : { name: text.slice(0, dot), side: text.slice(dot + 1) };
}

/** Read every slide's names. A document with no slide() yet has none. */
export function analyzeNames(source: string): SlideNames[] {
  const tokens = tokenize(source);
  const pairs = matchBrackets(tokens);
  const calls = readCalls(tokens, pairs);
  const opens = new Map<number, number>();
  for (const [open, closing] of pairs) opens.set(closing, open);
  // A master page holds names of its own, as a slide does.
  const boundaries = calls.filter((call) => !call.method && ["slide", "master", "presentation", "poster"].includes(tokens[call.name].value));
  const slides: SlideNames[] = [];

  for (const [position, boundary] of boundaries.entries()) {
    // A poster begins its own page, so it starts a slide as well as a presentation.
    if (tokens[boundary.name].value === "presentation") continue;
    const start = tokens[boundary.name].start;
    const end = boundaries[position + 1] ? tokens[boundaries[position + 1].name].start : source.length;
    const slide: SlideNames = {
      start,
      end,
      definitions: [],
      references: [],
      visits: [],
      layoutRegions: ["main"],
      layout: { split: false, grid: undefined },
      dynamic: false,
    };

    for (const method of chainedMethods(tokens, pairs, boundary)) {
      if (method.name === "split") slide.layout.split = true;
      if (method.name === "grid") {
        const count = method.args.length === 1 && /^\d+$/.test(method.args[0].value) ? Number(method.args[0].value) : undefined;
        slide.layout.grid = count ?? "unknown";
      }
    }
    if (slide.layout.split) slide.layoutRegions.push("left", "right");
    if (typeof slide.layout.grid === "number") {
      for (let cell = 0; cell < slide.layout.grid; cell += 1) slide.layoutRegions.push(`cell${cell}`);
    }

    const inside = calls.filter((call) => tokens[call.name].start >= start && tokens[call.name].start < end);
    for (const call of inside) {
      const name = tokens[call.name].value;
      if (!call.method) {
        if (name === "at") {
          const argument = staticString(tokens, call.args[0]);
          if (!argument) {
            if (call.args.length > 0) slide.dynamic = true;
            continue;
          }
          const span = contentSpan(argument);
          slide.visits.push({ path: argument.text ?? "", ...span });
          continue;
        }
        if (name === "cell") {
          const argument = call.args[0];
          const value = argument && argument[0] === argument[1] ? tokens[argument[0]].value : "";
          if (/^\d+$/.test(value) && !slide.layoutRegions.includes(`cell${value}`)) {
            slide.layoutRegions.push(`cell${value}`);
          }
          continue;
        }
        if (nameListCommands.has(name) || name === "gridSection") {
          const named = name === "gridSection" ? call.args.slice(1) : call.args;
          for (const argument of named) {
            const token = staticString(tokens, argument);
            if (!token) continue;
            slide.references.push({ text: token.text ?? "", name: token.text ?? "", command: name, ...contentSpan(token) });
          }
          continue;
        }
        if (!knownCalls.has(name)) slide.dynamic = true;
        continue;
      }

      if (name === "as") {
        const argument = staticString(tokens, call.args[0]);
        if (!argument) {
          slide.dynamic = true;
          continue;
        }
        const root = chainRoot(tokens, opens, call.name - 1);
        slide.definitions.push({
          name: argument.text ?? "",
          kind: "object",
          command: root === undefined ? "as" : tokens[root].value,
          commandStart: root === undefined ? tokens[call.name].start : tokens[root].start,
          ...contentSpan(argument),
        });
        continue;
      }
      if (anchorModifiers.has(name) || placementModifiers.has(name)) {
        const argument = staticString(tokens, call.args[0]);
        if (!argument) continue;
        const text = argument.text ?? "";
        const parts = anchorModifiers.has(name) ? splitName(text) : { name: text };
        slide.references.push({ text, ...parts, command: name, ...contentSpan(argument) });
      }
    }

    // Every prefix of a visited path is a region; the first segment may be one the layout owns.
    const seen = new Set<string>();
    for (const visit of slide.visits) {
      const segments = visit.path.split("/");
      if (!segments.every((segment) => segmentPattern.test(segment))) continue;
      let prefix = "";
      for (const [index, segment] of segments.entries()) {
        prefix = prefix ? `${prefix}/${segment}` : segment;
        if (index === 0 && isLayoutSegment(segment)) continue;
        if (seen.has(prefix)) continue;
        seen.add(prefix);
        const offset = visit.start + prefix.length - segment.length;
        slide.definitions.push({
          name: prefix,
          kind: "region",
          command: "at",
          commandStart: visit.start,
          start: visit.start,
          end: offset + segment.length,
        });
      }
    }
    slide.definitions.sort((a, b) => a.start - b.start);
    slides.push(slide);
  }
  return slides;
}

function isLayoutSegment(segment: string): boolean {
  return segment === "main" || segment === "left" || segment === "right" || /^cell\d+$/.test(segment);
}

function slideAt(slides: SlideNames[], offset: number): SlideNames | undefined {
  return slides.find((slide) => offset >= slide.start && offset <= slide.end);
}

/** Differ by at most two edits, for "did you mean" suggestions. */
function close(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length] <= 2;
}

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function describeDefinition(source: string, definition: NameDefinition): string {
  const line = lineOf(source, definition.commandStart);
  return definition.kind === "region"
    ? `region made by at() on line ${line}`
    : `${definition.command}() named on line ${line}`;
}

/** What is wrong with the names on each slide: missing names, repeated ones, and layout regions that do not exist. */
export function nameDiagnostics(source: string): NameDiagnostic[] {
  const diagnostics: NameDiagnostic[] = [];
  for (const slide of analyzeNames(source)) {
    const byName = new Map<string, NameDefinition>();
    for (const definition of slide.definitions) {
      const existing = byName.get(definition.name);
      if (!existing) {
        byName.set(definition.name, definition);
        continue;
      }
      // Revisiting a region is how at() is meant to be used; naming two objects alike is not.
      if (definition.kind === "object" || existing.kind === "object") {
        diagnostics.push({
          severity: "error",
          start: definition.start,
          end: definition.end,
          message: `Another object on this slide is already named "${definition.name}" (${describeDefinition(source, existing)}); names must be unique within a slide.`,
        });
      }
    }

    for (const visit of slide.visits) {
      const [first] = visit.path.split("/");
      if (!visit.path || !isLayoutSegment(first) || first === "main") continue;
      const owned = first === "left" || first === "right" ? slide.layout.split : slide.layout.grid !== undefined;
      if (!owned) {
        diagnostics.push({
          severity: "error",
          start: visit.start,
          end: visit.start + first.length,
          message: first === "left" || first === "right"
            ? `at("${first}") needs a split layout; call slide().split() first.`
            : `at("${first}") needs a grid layout; call slide().grid(columns) first.`,
        });
      }
    }

    if (slide.dynamic) continue;
    for (const reference of slide.references) {
      if (!reference.name) continue;
      if (reference.side !== undefined && !(anchorSideNames as readonly string[]).includes(reference.side)) {
        diagnostics.push({
          severity: "error",
          start: reference.start + reference.name.length + 1,
          end: reference.end,
          message: `"${reference.side}" is not an anchor. Use one of: ${anchorSideNames.join(", ")}.`,
        });
      }
      if (byName.has(reference.name)) continue;
      const suggestions = [...byName.keys()].filter((name) => close(name, reference.name));
      const known = [...byName.keys()];
      const hint = suggestions.length > 0
        ? ` Did you mean "${suggestions[0]}"?`
        : known.length > 0
          ? ` Names on this slide: ${known.join(", ")}.`
          : " Name an object with .as(), or a region with at().";
      diagnostics.push({
        severity: "error",
        start: reference.start,
        end: reference.start + reference.name.length,
        message: isLayoutSegment(reference.name)
          ? `"${reference.name}" is a layout region, which has no name of its own; name the object or region inside it.`
          : `No object or region on this slide is named "${reference.name}".${hint}`,
      });
    }
  }
  return diagnostics.sort((a, b) => a.start - b.start);
}

/** Where the cursor sits in a name string, and what that string is for. */
interface NamePosition {
  slide: SlideNames;
  role: "definition" | "reference" | "visit";
  span: TextSpan;
  text: string;
  command: string;
}

function namePosition(source: string, offset: number): NamePosition | undefined {
  const slides = analyzeNames(source);
  const slide = slideAt(slides, offset);
  if (!slide) return undefined;
  const within = (span: TextSpan): boolean => offset >= span.start && offset <= span.end;
  const reference = slide.references.find(within);
  if (reference) return { slide, role: "reference", span: reference, text: reference.text, command: reference.command };
  const visit = slide.visits.find(within);
  if (visit) return { slide, role: "visit", span: visit, text: visit.path, command: "at" };
  const definition = slide.definitions.find((item) => item.kind === "object" && within(item));
  if (definition) return { slide, role: "definition", span: definition, text: definition.name, command: "as" };
  return undefined;
}

/** The name under the cursor: a path is cut at the segment holding it, an anchor at its dot. */
function nameUnderCursor(position: NamePosition, offset: number): string | undefined {
  const local = offset - position.span.start;
  if (position.role === "definition") return position.text;
  const path = position.role === "reference" ? splitName(position.text).name : position.text;
  if (!path) return undefined;
  const next = path.indexOf("/", local);
  return next < 0 ? path : path.slice(0, next);
}

/**
 * Completions for a name string the cursor is in: the names on the slide where a name is
 * expected, the regions the slide can visit inside at(), and anchor sides after "name.".
 */
export function nameCompletions(source: string, offset: number): { from: number; to: number; items: NameCompletion[] } | undefined {
  // The string may still be unterminated while it is typed, which the tokenizer tolerates.
  const position = namePosition(source, offset);
  if (!position) return undefined;
  const { slide, span, text, role } = position;
  if (role === "definition") return undefined;
  const typed = text.slice(0, offset - span.start);
  const items: NameCompletion[] = [];
  const definitions = slide.definitions;
  const unique = (list: NameCompletion[]): NameCompletion[] => {
    const seen = new Set<string>();
    return list.filter((item) => !seen.has(item.label) && seen.add(item.label));
  };

  if (role === "visit") {
    for (const region of slide.layoutRegions) items.push({ label: region, detail: "layout region", kind: "layout" });
    for (const definition of definitions) {
      if (definition.kind === "region") items.push({ label: definition.name, detail: describeDefinition(source, definition), kind: "region" });
    }
    return { from: span.start, to: span.end, items: unique(items) };
  }

  if (anchorModifiers.has(position.command) && typed.includes(".")) {
    const name = typed.slice(0, typed.indexOf("."));
    const from = span.start + name.length + 1;
    return {
      from,
      to: span.end,
      items: anchorSideNames.map((side) => ({ label: side, detail: `anchor on "${name}"`, kind: "anchor" as const })),
    };
  }
  for (const definition of definitions) {
    items.push({ label: definition.name, detail: describeDefinition(source, definition), kind: definition.kind });
  }
  return { from: span.start, to: span.end, items: unique(items) };
}

/** Where the name under the cursor is defined: the .as() that named it, or the at() that made it. */
export function nameDefinition(source: string, offset: number): NameDefinition | undefined {
  const position = namePosition(source, offset);
  if (!position) return undefined;
  const name = nameUnderCursor(position, offset);
  return position.slide.definitions.find((definition) => definition.name === name);
}

/** Every place on the slide that names the same object or region, its definition included. */
export function nameReferences(source: string, offset: number): TextSpan[] {
  const position = namePosition(source, offset);
  if (!position) return [];
  const name = nameUnderCursor(position, offset);
  if (!name) return [];
  return occurrences(position.slide, name).map(({ start, end }) => ({ start, end }));
}

/** Each string that names `name` or a region inside it, with the span of that name. */
function occurrences(slide: SlideNames, name: string): TextSpan[] {
  const spans: TextSpan[] = [];
  const nested = (text: string): boolean => text === name || text.startsWith(`${name}/`);
  for (const definition of slide.definitions) {
    if (definition.kind === "object" && definition.name === name) spans.push({ start: definition.start, end: definition.end });
  }
  for (const visit of slide.visits) {
    if (nested(visit.path)) spans.push({ start: visit.start, end: visit.start + name.length });
  }
  for (const reference of slide.references) {
    if (nested(reference.name)) spans.push({ start: reference.start, end: reference.start + name.length });
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Can the name under the cursor be renamed, and which part of the string would change? */
export function prepareNameRename(source: string, offset: number): { span: TextSpan; name: string } | { error: string } {
  const position = namePosition(source, offset);
  if (!position) return { error: "Place the cursor in a name given with .as() or at(), or a string that refers to one." };
  const name = nameUnderCursor(position, offset);
  if (!name) return { error: "There is no name here to rename." };
  const [first] = name.split("/");
  if (name === first && isLayoutSegment(first)) return { error: `"${name}" is a region the slide layout owns, and keeps its name.` };
  if (!position.slide.definitions.some((definition) => definition.name === name)) {
    return { error: `No object or region on this slide is named "${name}".` };
  }
  const { start } = position.span;
  return { span: { start, end: start + name.length }, name };
}

/**
 * The edits that rename a name throughout its slide: the .as() or at() that defines it, every
 * reference, and the paths of regions inside a renamed region.
 */
export function renameName(source: string, offset: number, replacement: string): NameEdit[] | { error: string } {
  const prepared = prepareNameRename(source, offset);
  if ("error" in prepared) return prepared;
  const position = namePosition(source, offset) as NamePosition;
  const { name } = prepared;
  const segments = replacement.split("/");
  if (!replacement || !segments.every((segment) => segmentPattern.test(segment))) {
    return { error: `"${replacement}" is not a name: use letters, digits, "_" and "-", starting with a letter, with "/" between region segments.` };
  }
  const isRegion = position.slide.definitions.some((definition) => definition.name === name && definition.kind === "region");
  if (isRegion) {
    // A region path keeps its parent: renaming "cell0/now" may change only its own segment.
    const parent = name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : "";
    if (parent && !replacement.startsWith(parent)) {
      return { error: `A region inside "${parent.slice(0, -1)}" keeps that parent; rename it to "${parent}…".` };
    }
  } else if (segments.length > 1) {
    return { error: "An object name is a single segment, without \"/\"." };
  }
  if (replacement !== name && position.slide.definitions.some((definition) => definition.name === replacement)) {
    return { error: `Something on this slide is already named "${replacement}".` };
  }
  return occurrences(position.slide, name).map((span) => ({ ...span, text: replacement }));
}

/** A short description of the name under the cursor, for a hover. */
export function nameHover(source: string, offset: number): { span: TextSpan; text: string } | undefined {
  const position = namePosition(source, offset);
  if (!position) return undefined;
  const name = nameUnderCursor(position, offset);
  if (!name) return undefined;
  const definition = position.slide.definitions.find((item) => item.name === name);
  const uses = position.slide.references.filter((reference) => reference.name === name).length;
  const visits = position.slide.visits.filter((visit) => visit.path === name).length;
  const span = { start: position.span.start, end: position.span.start + name.length };
  if (!definition) {
    const [first] = name.split("/");
    if (position.role === "visit" && isLayoutSegment(first) && name === first) {
      return { span, text: `Layout region "${name}" of this slide.` };
    }
    return position.slide.dynamic ? undefined : { span, text: `No object or region on this slide is named "${name}".` };
  }
  const parts = [`${definition.kind === "region" ? "Region" : "Object"} "${name}": ${describeDefinition(source, definition)}.`];
  if (definition.kind === "region" && visits > 1) parts.push(`Visited ${visits} times.`);
  if (uses > 0) parts.push(`Referred to ${uses === 1 ? "once" : `${uses} times`} on this slide.`);
  return { span, text: parts.join(" ") };
}

// ── Formulas in quoted strings ────────────────────────────────────────────────────────────

/** Inline math, `$...$`, as the renderer finds it in the words a slide shows. */
const inlineFormula = /(?<!\\)\$((?:\\.|[^$])+?)(?<!\\)\$/g;

/** Where inline math stands in a text: the ranges between its dollar signs. */
export function inlineFormulas(text: string): TextSpan[] {
  return [...text.matchAll(inlineFormula)].map((match) => ({
    start: (match.index as number) + 1,
    end: (match.index as number) + match[0].length - 1,
  }));
}

/** Commands whose strings are words a slide shows, where `$...$` renders as math. */
const wordCommands = new Set([
  "presentation", "slide", "title", "subtitle", "eyebrow", "author", "text", "lead", "caption",
  "quote", "bullets", "steps", "card", "metric", "footnote", "rect", "circle", "shape", "table",
]);
/** Commands whose string is one formula from end to end. */
const formulaCommands = new Set(["math"]);
/** Commands that also take a tagged template, which receives its text as written. */
const templateCommands = new Set(["text", "math"]);

export interface FormulaEscape {
  /** The string, quotes included. */
  start: number;
  end: number;
  /** The command the string is given to, such as `text`. */
  command: string;
  /** What lost its backslash, as written: `\frac`, `\alpha`, `\,`. */
  escapes: string[];
  /**
   * One edit that keeps what was written: the call as a tagged template, text`...`, when the
   * command takes one and the text can be one, and otherwise the backslashes doubled.
   */
  fix: { kind: "template" | "double"; start: number; end: number; text: string };
  message: string;
}

interface LostRun {
  /** Where the backslashes start in the string's content, and how many there are. */
  at: number;
  length: number;
  /** What was written, such as `\frac`. */
  escape: string;
}

/**
 * Formulas in quoted strings whose backslashes became escapes. In "..." a backslash starts an
 * escape, so "$\frac{1}{2}$" holds a form feed where \f was written and "$\alpha$" holds plain
 * "alpha"; TypeScript accepts both, and the slide shows a broken formula. A tagged template,
 * text`...` or math`...`, keeps backslashes as written. A doubled backslash, as in "\\frac", is
 * taken to be escaped on purpose, as is an escape that writes a character by its code.
 */
export function formulaEscapes(source: string): FormulaEscape[] {
  const tokens = tokenize(source);
  const pairs = matchBrackets(tokens);
  const found: FormulaEscape[] = [];
  for (const call of readCalls(tokens, pairs)) {
    const command = tokens[call.name].value;
    const whole = formulaCommands.has(command);
    if (!whole && !wordCommands.has(command)) continue;
    const last = call.close ?? tokens.length;
    for (let index = call.open + 1; index < last; index += 1) {
      const token = tokens[index];
      // A call among the arguments is read as a call of its own.
      if (token.type === "identifier" && tokens[index + 1]?.value === "(") {
        index = pairs.get(index + 1) ?? last;
        continue;
      }
      // A string still being typed has no closing quote yet.
      if (token.type !== "string" || token.value.length < 2 || !token.value.endsWith(token.value[0])) continue;
      const quote = token.value[0];
      const content = token.value.slice(1, -1);
      const lost = lostBackslashes(content, quote, whole);
      if (lost.length === 0) continue;
      const sole = !call.method && call.close !== undefined && call.args.length === 1
        && call.args[0][0] === index && call.args[0][1] === index;
      const body = templateCommands.has(command) && sole ? writtenText(content, lost) : undefined;
      const fix = body !== undefined && canBeTemplate(body)
        ? { kind: "template" as const, start: tokens[call.open].start, end: tokens[call.close as number].end, text: `\`${body}\`` }
        : { kind: "double" as const, start: token.start, end: token.end, text: `${quote}${doubled(content, lost)}${quote}` };
      const escapes = [...new Set(lost.map((run) => run.escape))];
      found.push({
        start: token.start,
        end: token.end,
        command,
        escapes,
        fix,
        message: `In a quoted string a backslash starts an escape, so ${escapes.join(", ")} ${escapes.length === 1 ? "does" : "do"} not reach the formula as written. `
          + (fix.kind === "template" ? `Write ${command}\`...\`, which keeps backslashes as written.` : "Double each backslash, as in \\\\frac."),
      });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * The runs of backslashes in a string's formulas that an escape takes apart: an odd run before
 * anything but a character code, the string's quote, or a line break.
 */
function lostBackslashes(content: string, quote: string, whole: boolean): LostRun[] {
  const spans = whole ? [{ start: 0, end: content.length }] : inlineFormulas(content);
  const lost: LostRun[] = [];
  for (const span of spans) {
    const runs = /\\+/g;
    runs.lastIndex = span.start;
    for (let run = runs.exec(content); run && run.index < span.end; run = runs.exec(content)) {
      const after = content.slice(run.index + run[0].length, run.index + run[0].length + 32);
      if (run[0].length % 2 === 0 || !after || after[0] === quote) continue;
      if (/^(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]+\}|[\r\n])/.test(after)) continue;
      lost.push({ at: run.index, length: run[0].length, escape: `\\${/^[A-Za-z]+/.exec(after)?.[0] ?? after[0]}` });
    }
  }
  return lost;
}

const simpleEscapes: Record<string, string> = {
  n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0", "\n": "",
};

/** The text the writer meant: the string's escapes read as JavaScript reads them, the lost runs as written. */
function writtenText(content: string, lost: LostRun[]): string {
  const kept = new Map(lost.map((run) => [run.at, run.length]));
  let text = "";
  let index = 0;
  while (index < content.length) {
    const run = kept.get(index);
    if (run !== undefined) {
      text += content.slice(index, index + run);
      index += run;
      continue;
    }
    if (content[index] !== "\\") {
      text += content[index];
      index += 1;
      continue;
    }
    const code = /^(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|u\{([0-9a-fA-F]{1,6})\})/.exec(content.slice(index + 1, index + 12));
    const point = code ? parseInt(code[1] ?? code[2] ?? code[3], 16) : Number.NaN;
    if (code && point <= 0x10ffff) {
      text += String.fromCodePoint(point);
      index += 1 + code[0].length;
      continue;
    }
    // A line continued with a backslash drops the whole break, CRLF included.
    const next = content[index + 1] ?? "";
    const skip = next === "\r" && content[index + 2] === "\n" ? 3 : 2;
    text += next === "\r" ? "" : (simpleEscapes[next] ?? next);
    index += skip;
  }
  return text;
}

/** Whether a text can be a tagged template's as it stands, the way the Studio writes one. */
function canBeTemplate(text: string): boolean {
  return !text.includes("`") && !text.includes("${") && !text.includes("\r") && !/(^|[^\\])(\\\\)*\\$/.test(text);
}

/** The string's content with each lost run of backslashes doubled. */
function doubled(content: string, lost: LostRun[]): string {
  let text = "";
  let index = 0;
  for (const run of lost) {
    text += content.slice(index, run.at) + "\\".repeat(run.length);
    index = run.at;
  }
  return text + content.slice(index);
}
