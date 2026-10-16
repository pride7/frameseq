import { toneHues } from "./shapes";

/**
 * Words inside one text written bold, in italics, or in a colour of their own, marked as in
 * Markdown so the code stays plain to read and to write: `**bold**`, `*italic*`, and
 * `[words]{red}` for a colour, which is a tone such as `red` or `teal`, `accent`, or any CSS
 * colour such as `#e11d48`. Marks nest, as `[**42%**]{accent}`. Inline math, between `$` signs,
 * is left as it is, and `\*`, `\[`, `\]`, `\{`, and `\}` write the character itself.
 */
export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** The colour as written: a tone, `accent`, or a CSS colour. */
  color?: string;
}

const escapable = "*[]{}";

/** Where inline math that starts at `start` ends, just past its closing `$`, or -1. */
function mathEnd(text: string, start: number, end: number): number {
  if (text[start] !== "$" || text[start - 1] === "\\" || start + 1 >= end || text[start + 1] === "$") return -1;
  for (let index = start + 1; index < end; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === "$") return index + 1;
  }
  return -1;
}

/**
 * Where the mark that closes `marker` stands, or -1. A closing mark follows a character that is
 * not a space; bold inside italics is stepped over, and so is inline math.
 */
function closing(text: string, from: number, end: number, marker: "*" | "**"): number {
  if (from >= end || /\s/.test(text[from])) return -1;
  for (let index = from; index < end;) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    const math = mathEnd(text, index, end);
    if (math > 0) {
      index = math;
      continue;
    }
    if (marker === "**") {
      if (text.startsWith("**", index) && index > from && !/\s/.test(text[index - 1])) return index;
    } else if (text.startsWith("**", index)) {
      const inner = closing(text, index + 2, end, "**");
      index = inner > 0 ? inner + 2 : index + 2;
      continue;
    } else if (text[index] === "*" && index > from && !/\s/.test(text[index - 1])) {
      return index;
    }
    index += 1;
  }
  return -1;
}

/** A colour span that opens at `start`: where its words end, its colour, and where it ends. */
function colourSpan(text: string, start: number, end: number): { close: number; color: string; end: number } | undefined {
  let depth = 0;
  for (let index = start + 1; index < end; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    const math = mathEnd(text, index, end);
    if (math > 0) {
      index = math - 1;
      continue;
    }
    if (text[index] === "[") depth += 1;
    if (text[index] !== "]") continue;
    if (depth > 0) {
      depth -= 1;
      continue;
    }
    if (index === start + 1 || text[index + 1] !== "{") return undefined;
    const brace = text.indexOf("}", index + 2);
    if (brace < 0 || brace >= end) return undefined;
    const color = text.slice(index + 2, brace).trim();
    return /^(?:#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i.test(color) ? { close: index, color, end: brace + 1 } : undefined;
  }
  return undefined;
}

function parse(text: string, start: number, end: number, style: Omit<RichRun, "text">, runs: RichRun[]): void {
  let words = "";
  const flush = (): void => {
    if (words) runs.push({ text: words, ...style });
    words = "";
  };
  for (let index = start; index < end;) {
    const character = text[index];
    if (character === "\\" && index + 1 < end) {
      // Other escapes, such as \$, are kept for the math they belong to.
      words += escapable.includes(text[index + 1]) ? text[index + 1] : text.slice(index, index + 2);
      index += 2;
      continue;
    }
    const math = mathEnd(text, index, end);
    if (math > 0) {
      words += text.slice(index, math);
      index = math;
      continue;
    }
    if (character === "*") {
      // Three stars open italics around bold, as `***both***` does.
      const bold = text.startsWith("**", index) && !text.startsWith("***", index);
      const marker = bold ? "**" : "*";
      const close = closing(text, index + marker.length, end, marker);
      if (close > 0) {
        flush();
        parse(text, index + marker.length, close, bold ? { ...style, bold: true } : { ...style, italic: true }, runs);
        index = close + marker.length;
        continue;
      }
    }
    if (character === "[") {
      const span = colourSpan(text, index, end);
      if (span) {
        flush();
        parse(text, index + 1, span.close, { ...style, color: span.color }, runs);
        index = span.end;
        continue;
      }
    }
    words += character;
    index += 1;
  }
  flush();
}

/** The runs a text's words make, each plain or bold, italic, or coloured, inline math kept whole. */
export function richRuns(text: string): RichRun[] {
  const runs: RichRun[] = [];
  parse(text, 0, text.length, {}, runs);
  return runs.length > 0 ? runs : [{ text: "" }];
}

/** Whether a text marks any of its words, so a writer can keep plain text plain. */
export function hasRichText(text: string): boolean {
  return richRuns(text).some((run) => run.bold || run.italic || run.color);
}

/** The CSS colour a run's colour stands for: a tone's hue, the theme's accent, or itself. */
export function richColor(color: string): string {
  if (color === "accent") return "var(--frameseq-accent)";
  if (color === "muted") return "var(--frameseq-muted)";
  return toneHues[color as keyof typeof toneHues] ?? color;
}

/**
 * Plain words, with the characters that would read as marks written as themselves: only where
 * they would, unless `all` asks for every one.
 */
function plain(words: string, all: boolean): string {
  const runs = richRuns(words);
  if (!all && runs.length === 1 && !runs[0].bold && !runs[0].italic && !runs[0].color && runs[0].text === words) return words;
  // Escaped outside inline math only, which keeps its own characters.
  let result = "";
  for (let index = 0; index < words.length;) {
    const math = mathEnd(words, index, words.length);
    if (math > 0) {
      result += words.slice(index, math);
      index = math;
      continue;
    }
    result += escapable.includes(words[index]) ? `\\${words[index]}` : words[index];
    index += 1;
  }
  return result;
}

/**
 * Write runs back as marked text: each colour as `[...]{colour}`, italics inside it, and bold
 * inside those, with the spaces at a run's edges kept outside its marks, where they belong.
 */
export function writeRichText(runs: RichRun[]): string {
  const joined = merged(runs, false);
  const written = writeRuns(joined, false);
  // Words that hold marks of their own at a run's edge, such as a bold "5*", read wrongly when
  // only the ambiguous ones are escaped; then every mark character in the words is.
  return same(merged(richRuns(written), true), merged(joined, true)) ? written : writeRuns(joined, true);
}

/**
 * Runs with the empty ones left out and the neighbours that look alike joined. With `spaces`,
 * the spaces at a marked run's edges, which look the same marked or not, count as plain.
 */
function merged(runs: RichRun[], spaces: boolean): RichRun[] {
  const pieces = !spaces ? runs : runs.flatMap((run): RichRun[] => {
    if (!run.bold && !run.italic && !run.color) return [run];
    const [, lead, body, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text) ?? ["", "", run.text, ""];
    return [{ text: lead }, { ...run, text: body }, { text: tail }];
  });
  const result: RichRun[] = [];
  for (const run of pieces) {
    if (!run.text) continue;
    const last = result.at(-1);
    if (last && Boolean(last.bold) === Boolean(run.bold) && Boolean(last.italic) === Boolean(run.italic) && last.color === run.color) {
      last.text += run.text;
    } else {
      result.push({ ...run });
    }
  }
  return result;
}

function same(left: RichRun[], right: RichRun[]): boolean {
  return left.length === right.length && left.every((run, index) => (
    run.text === right[index].text
    && Boolean(run.bold) === Boolean(right[index].bold)
    && Boolean(run.italic) === Boolean(right[index].italic)
    && run.color === right[index].color
  ));
}

function writeRuns(runs: RichRun[], all: boolean): string {
  const keys: Array<keyof Omit<RichRun, "text">> = ["color", "italic", "bold"];
  const write = (part: RichRun[], level: number): string => {
    if (level === keys.length) return plain(part.map((run) => run.text).join(""), all);
    const key = keys[level];
    let result = "";
    for (let index = 0; index < part.length;) {
      const value = part[index][key];
      let next = index;
      while (next < part.length && part[next][key] === value) next += 1;
      const inner = write(part.slice(index, next), level + 1);
      if (!value) {
        result += inner;
      } else {
        const lead = /^\s*/.exec(inner)?.[0] ?? "";
        const tail = /\s*$/.exec(inner.slice(lead.length))?.[0] ?? "";
        const body = inner.slice(lead.length, inner.length - tail.length);
        const marked = !body ? "" : key === "color" ? `[${body}]{${value}}` : key === "italic" ? `*${body}*` : `**${body}**`;
        result += `${lead}${marked}${tail}`;
      }
      index = next;
    }
    return result;
  };
  return write(runs, 0);
}
