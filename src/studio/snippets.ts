import { snippetCompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { t } from "./i18n";
import { contentCode, contentKinds, insertName, type ContentKind } from "./insert";

/**
 * The same content the Insert gallery puts on a slide, offered in the editor as snippets: type
 * `typst`, `table`, or `chart` at the start of a line and pick the snippet to write the whole
 * object, with its sample words selected to be typed over. Writing code and inserting from the
 * gallery give the same source.
 */

/** The word that brings up each snippet: the command it writes. */
const triggers: Record<ContentKind, string> = {
  paragraph: "text",
  bullets: "bullets",
  steps: "steps",
  quote: "quote",
  code: "code",
  math: "math",
  typst: "typst",
  latex: "latex",
  image: "image",
  table: "table",
  chart: "chart",
  qr: "qr",
  icon: "icon",
};

/** A snippet template: braces are literal, and the words to type over become its one field. */
export function snippetTemplate(kind: ContentKind, quote: string): string {
  const content = contentCode(kind, { quote });
  const escape = (text: string): string => text.replace(/[{}]/g, (brace) => `\\${brace}`);
  // A picture's field is its path, which a person typing code knows; the gallery asks for it.
  const field = kind === "image"
    ? (() => {
      const line = content.lines[0];
      const from = line.indexOf("./images/picture.png");
      return { line: 0, from, to: from + "./images/picture.png".length };
    })()
    : content.select;
  return content.lines.map((line, index) => {
    if (!field || index !== field.line) return escape(line);
    return `${escape(line.slice(0, field.from))}\${${escape(line.slice(field.from, field.to))}}${escape(line.slice(field.to))}`;
  }).join("\n");
}

/** The quote the document writes its strings with. */
function documentQuote(text: string): string {
  return (text.match(/'/g)?.length ?? 0) > (text.match(/"/g)?.length ?? 0) ? "'" : '"';
}

/** Snippets for the start of a statement, where a new object can be written. */
export function snippetSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word || (!context.explicit && word.from === word.to)) return null;
  const line = context.state.doc.lineAt(context.pos);
  if (context.state.sliceDoc(line.from, word.from).trim()) return null;
  const quote = documentQuote(context.state.doc.toString());
  return {
    from: word.from,
    options: contentKinds.map((kind) => snippetCompletion(snippetTemplate(kind, quote), {
      label: triggers[kind],
      detail: `${insertName(kind)} · ${t.insert.snippet}`,
      info: t.insert.descriptions[kind],
      type: "snippet",
      boost: -1,
    })),
    validFor: /^\w*$/,
  };
}
