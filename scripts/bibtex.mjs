/**
 * Read a BibTeX file into plain entries, so a slide document can `import refs from "./refs.bib"`
 * and cite from it. Each entry keeps its fields as text with LaTeX markup turned into the
 * characters it stands for; the runtime formats them into references.
 *
 * It reads what reference managers write: @type{key, field = {value} or "value" or a number},
 * with nested braces, @string abbreviations, and @comment or @preamble blocks, which are skipped.
 */

const accents = {
  "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù" },
  "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý", c: "ć", n: "ń", s: "ś", z: "ź", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú", Y: "Ý", C: "Ć", N: "Ń", S: "Ś", Z: "Ź" },
  "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û" },
  "\"": { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", y: "ÿ", A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü" },
  "~": { a: "ã", n: "ñ", o: "õ", A: "Ã", N: "Ñ", O: "Õ" },
  c: { c: "ç", C: "Ç", s: "ş", S: "Ş" },
  v: { c: "č", s: "š", z: "ž", e: "ě", r: "ř", n: "ň", C: "Č", S: "Š", Z: "Ž", E: "Ě", R: "Ř", N: "Ň" },
  u: { a: "ă", g: "ğ", A: "Ă", G: "Ğ" },
  H: { o: "ő", u: "ű", O: "Ő", U: "Ű" },
};
const symbols = { ss: "ß", o: "ø", O: "Ø", aa: "å", AA: "Å", ae: "æ", AE: "Æ", l: "ł", L: "Ł", i: "ı", oe: "œ", OE: "Œ" };

/** Turn LaTeX markup in a field into plain text: accents, escapes, dashes, and braces. */
export function latexText(value) {
  let text = String(value);
  text = text.replace(/\\([`'^"~])\s*\{?\s*\\?([A-Za-z])\s*\}?/g, (match, accent, letter) => accents[accent]?.[letter] ?? letter);
  text = text.replace(/\\([cvuH])\s*\{\s*([A-Za-z])\s*\}/g, (match, accent, letter) => accents[accent]?.[letter] ?? letter);
  text = text.replace(/\\(ss|aa|AA|ae|AE|oe|OE|o|O|l|L|i)(?![A-Za-z])\s*/g, (match, name) => symbols[name] ?? name);
  text = text.replace(/\\([&%$#_{}])/g, "$1");
  text = text.replace(/\\(?:textit|textbf|emph|textrm|textsf|texttt|mathrm|url)\s*\{([^{}]*)\}/g, "$1");
  text = text.replace(/---/g, "—").replace(/--/g, "–").replace(/~/g, " ");
  text = text.replace(/[{}]/g, "");
  return text.replace(/\s+/g, " ").trim();
}

/** Read one field value starting at `start`: a braced group, a quoted string, or a bare word. */
function readValue(source, start) {
  let index = start;
  while (/\s/.test(source[index] ?? "")) index += 1;
  const opening = source[index];
  if (opening === "{" || opening === "\"") {
    const closing = opening === "{" ? "}" : "\"";
    let depth = 0;
    let value = "";
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === "\\" && index + 1 < source.length) {
        value += character + source[index + 1];
        index += 2;
        continue;
      }
      if (character === "{") depth += 1;
      if (character === "}" && depth > 0) {
        depth -= 1;
        value += character;
        index += 1;
        continue;
      }
      if (character === closing && depth === 0) return { kind: "text", value, end: index + 1 };
      value += character;
      index += 1;
    }
    return { kind: "text", value, end: index };
  }
  const word = /^[^\s,#}]+/.exec(source.slice(index));
  return { kind: "word", value: word ? word[0] : "", end: index + (word ? word[0].length : 0) };
}

/** Read a value joined with `#`, expanding @string abbreviations and month names. */
function readConcatenated(source, start, strings) {
  let index = start;
  let text = "";
  for (;;) {
    const part = readValue(source, index);
    text += part.kind === "word" ? (strings[part.value.toLowerCase()] ?? part.value) : part.value;
    index = part.end;
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (source[index] !== "#") return { value: text, end: index };
    index += 1;
  }
}

const months = {
  jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June",
  jul: "July", aug: "August", sep: "September", oct: "October", nov: "November", dec: "December",
};

/** Parse BibTeX text into entries keyed by citation key. */
export function parseBibtex(source) {
  const entries = {};
  const strings = { ...months };
  let index = 0;
  while (index < source.length) {
    const at = source.indexOf("@", index);
    if (at < 0) break;
    const header = /^@\s*([A-Za-z]+)\s*([{(])/.exec(source.slice(at));
    if (!header) {
      index = at + 1;
      continue;
    }
    const type = header[1].toLowerCase();
    index = at + header[0].length;
    if (type === "comment" || type === "preamble") {
      index = readValue(source, index - 1).end;
      continue;
    }
    if (type === "string") {
      const definition = /^\s*([A-Za-z][\w-]*)\s*=/.exec(source.slice(index));
      if (definition) {
        const value = readConcatenated(source, index + definition[0].length, strings);
        strings[definition[1].toLowerCase()] = value.value;
        index = value.end;
      }
      continue;
    }
    const key = /^\s*([^,\s]+)\s*,/.exec(source.slice(index));
    if (!key) continue;
    index += key[0].length;
    const fields = { type };
    for (;;) {
      while (/[\s,]/.test(source[index] ?? "")) index += 1;
      if (index >= source.length || source[index] === "}" || source[index] === ")") {
        index += 1;
        break;
      }
      const name = /^([A-Za-z][\w:-]*)\s*=/.exec(source.slice(index));
      if (!name) {
        // Not a field: skip to the end of the entry rather than misread the rest of the file.
        const close = source.indexOf("\n@", index);
        index = close < 0 ? source.length : close;
        break;
      }
      const value = readConcatenated(source, index + name[0].length, strings);
      fields[name[1].toLowerCase()] = latexText(value.value);
      index = value.end;
    }
    entries[key[1]] = fields;
  }
  return entries;
}
