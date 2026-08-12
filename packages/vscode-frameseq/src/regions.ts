export interface FrameSeqCursorCall {
  kind: "slide" | "at" | "main" | "left" | "right" | "cell";
  value?: string;
  offset: number;
  line: number;
  character: number;
}

export interface FrameSeqRegionReference {
  path: string;
  line: number;
  character: number;
  visits: number;
}

const cursorCommands = new Set(["slide", "at", "main", "left", "right", "cell"]);

function lineAndCharacter(source: string, offset: number): { line: number; character: number } {
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, character: offset - lineStart };
}

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function quotedArgument(source: string, openParen: number): string | undefined {
  let index = skipWhitespace(source, openParen + 1);
  const quote = source[index];
  if (quote !== '"' && quote !== "'") return undefined;
  index += 1;
  let result = "";
  while (index < source.length) {
    const character = source[index];
    if (character === quote) return result;
    if (character === "\\" && index + 1 < source.length) {
      const escaped = source[index + 1];
      const values: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        "\\": "\\",
        "\"": "\"",
        "'": "'",
      };
      result += values[escaped] ?? escaped;
      index += 2;
      continue;
    }
    result += character;
    index += 1;
  }
  return undefined;
}

function cellArgument(source: string, openParen: number): string | undefined {
  const start = skipWhitespace(source, openParen + 1);
  const match = /^\d+/.exec(source.slice(start));
  return match ? `cell${match[0]}` : undefined;
}

/**
 * Scan only the small set of calls that change FrameSeq's linear authoring cursor.
 * This deliberately ignores strings and comments, and keeps source offsets stable.
 */
export function frameSeqCursorCalls(source: string): FrameSeqCursorCall[] {
  const calls: FrameSeqCursorCall[] = [];
  let index = 0;
  let state: "code" | "line-comment" | "block-comment" | "single" | "double" | "template" = "code";

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (character === "\n") state = "code";
      index += 1;
      continue;
    }
    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        state = "code";
        index += 2;
      } else index += 1;
      continue;
    }
    if (state !== "code") {
      const closing = state === "single" ? "'" : (state === "double" ? '"' : "`");
      if (character === "\\") index += Math.min(2, source.length - index);
      else {
        if (character === closing) state = "code";
        index += 1;
      }
      continue;
    }

    if (character === "/" && next === "/") {
      state = "line-comment";
      index += 2;
      continue;
    }
    if (character === "/" && next === "*") {
      state = "block-comment";
      index += 2;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      state = character === "'" ? "single" : (character === '"' ? "double" : "template");
      index += 1;
      continue;
    }

    if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
      const name = source.slice(start, index);
      const previous = start > 0 ? source[start - 1] : "";
      const openParen = skipWhitespace(source, index);
      if (!cursorCommands.has(name) || previous === "." || source[openParen] !== "(") continue;

      let value: string | undefined;
      if (name === "at" || name === "slide") value = quotedArgument(source, openParen);
      if (name === "cell") value = cellArgument(source, openParen);
      const location = lineAndCharacter(source, start);
      calls.push({
        kind: name as FrameSeqCursorCall["kind"],
        value,
        offset: start,
        ...location,
      });
      continue;
    }
    index += 1;
  }
  return calls;
}

export function cursorRegionAt(source: string, offset: number): string | undefined {
  let region: string | undefined;
  let hasSlide = false;
  for (const call of frameSeqCursorCalls(source)) {
    if (call.offset > offset) break;
    if (call.kind === "slide") {
      hasSlide = true;
      region = "main";
    } else if (!hasSlide) continue;
    else if (call.kind === "at") region = call.value || "main";
    else if (call.kind === "main") region = "main";
    else if (call.kind === "left" || call.kind === "right") region = call.kind;
    else if (call.kind === "cell" && call.value) region = call.value;
  }
  return hasSlide ? region : undefined;
}

export function regionsForOffset(source: string, offset: number): FrameSeqRegionReference[] {
  const calls = frameSeqCursorCalls(source);
  let slideStart = -1;
  let slideEnd = source.length;
  for (const call of calls) {
    if (call.kind !== "slide") continue;
    if (call.offset <= offset) slideStart = call.offset;
    else if (slideStart >= 0) {
      slideEnd = call.offset;
      break;
    }
  }
  if (slideStart < 0) return [];

  const regions = new Map<string, FrameSeqRegionReference>();
  for (const call of calls) {
    if (call.offset < slideStart || call.offset >= slideEnd || call.kind !== "at" || !call.value) continue;
    const existing = regions.get(call.value);
    if (existing) existing.visits += 1;
    else regions.set(call.value, {
      path: call.value,
      line: call.line,
      character: call.character,
      visits: 1,
    });
  }
  return [...regions.values()];
}

export function selectionHasStructureBoundary(source: string): boolean {
  return frameSeqCursorCalls(source).length > 0;
}

export type FrameSeqPropertyKind = "number" | "string" | "boolean";

/** Format a tree-inspector value as a safe TypeScript literal. */
export function formatPropertyValue(
  kind: FrameSeqPropertyKind,
  expected: string,
  input: string,
): string | undefined {
  if (kind === "number") {
    const value = input.trim();
    return value && Number.isFinite(Number(value)) ? value : undefined;
  }
  if (kind === "boolean") {
    const value = input.trim();
    return value === "true" || value === "false" ? value : undefined;
  }

  const quote = expected[0];
  if (quote === "'") return `'${input.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (quote === "`") {
    return `\`${input
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${")}\``;
  }
  return JSON.stringify(input);
}
