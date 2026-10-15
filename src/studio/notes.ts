import { ChangeSet, type ChangeDesc } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { minimalChange } from "./document";
import { t } from "./i18n";
import { element } from "./ui";

/** How a slide's notes are written in the code, so new text is written back the same way. */
export interface NotesForm {
  quote: string;
  /** A template literal written as a block: indented lines between lines of their own. */
  block?: { indent: string; closing: string };
}

const blockPattern = /^\n([\s\S]*)\n([ \t]*)$/;

function commonIndent(lines: string[]): string {
  let indent: string | undefined;
  for (const line of lines) {
    if (!line.trim()) continue;
    const own = /^[ \t]*/.exec(line)?.[0] ?? "";
    if (indent === undefined) indent = own;
    let shared = 0;
    while (shared < indent.length && shared < own.length && indent[shared] === own[shared]) shared += 1;
    indent = indent.slice(0, shared);
  }
  return indent ?? "";
}

/** Notes as a person reads them: a block written in the code loses its indentation. */
export function notesText(value: string): string {
  const block = blockPattern.exec(value);
  if (!block) return value;
  const lines = block[1].split("\n");
  const indent = commonIndent(lines);
  return lines.map((line) => line.slice(indent.length)).join("\n");
}

/** The text of a string literal written in the code, and how it is written. */
export function readNotes(code: string, value: string): { text: string; form: NotesForm } {
  const quote = code[0] === "'" || code[0] === "`" ? code[0] : "\"";
  const block = quote === "`" ? blockPattern.exec(value) : null;
  if (!block) return { text: value, form: { quote } };
  return {
    text: notesText(value),
    form: { quote, block: { indent: commonIndent(block[1].split("\n")), closing: block[2] } },
  };
}

/** A string literal holding the text, written in the given form. */
export function writeNotes(text: string, form: NotesForm): string {
  if (form.quote === "`") {
    const escape = (line: string): string => line.replace(/\\|`|\$\{/g, (match) => `\\${match}`);
    if (!form.block) return `\`${escape(text)}\``;
    const { indent, closing } = form.block;
    const lines = text.split("\n").map((line) => (line ? indent + escape(line) : ""));
    return `\`\n${lines.join("\n")}\n${closing}\``;
  }
  const json = JSON.stringify(text);
  if (form.quote === "\"") return json;
  // JSON's escapes, taken in pairs, with the quotes swapped.
  const body = json.slice(1, -1).replace(/\\(.)|'/g, (match, escaped) => (
    escaped === "\"" ? "\"" : match === "'" ? "\\'" : match
  ));
  return `'${body}'`;
}

/** What the notes pane shows for the slide in the preview, and where it may write. */
export interface NotesState {
  slide: number;
  text: string;
  /** Why the notes can only be read here; none when they can be edited. */
  reason?: string;
  /** The code that writes the notes, or the slide, to show on request. */
  source?: { from: number; to: number };
  /** The one string literal that holds the notes, in the editor. */
  literal?: { from: number; to: number; code: string; form: NotesForm };
  /** Where .notes() can be added to the slide() call when the slide has none. */
  insertAt?: number;
}

/**
 * The speaker notes of the slide in the preview, below it as in a slide editor. Typing rewrites
 * the string that holds them in the code, or adds .notes() to a slide that has none, as ordinary
 * undoable edits; notes made by code that cannot be rewritten that way are shown read-only.
 */
export class SpeakerNotes {
  private state: NotesState | undefined;
  private readonly field: HTMLTextAreaElement;
  /** Whether typing waits, as while the assistant edits the file. */
  private locked = false;

  constructor(
    private readonly body: HTMLElement,
    private readonly meta: HTMLElement,
    private readonly sourceButton: HTMLButtonElement,
    private readonly view: EditorView,
    private readonly revealSource: (range: { from: number; to: number }) => void,
  ) {
    this.field = element("textarea", "studio-notes-text");
    this.field.placeholder = t.notes.placeholder;
    this.field.setAttribute("aria-label", t.notes.title);
    this.field.spellcheck = true;
    this.field.readOnly = true;
    this.body.replaceChildren(this.field);
    this.field.addEventListener("input", () => this.write());
    this.field.addEventListener("blur", () => this.tidy());
    this.field.addEventListener("keydown", (event) => {
      // Escape hands the keys back to the slides, as in the preview.
      if (event.key === "Escape") this.field.blur();
    });
    this.sourceButton.addEventListener("click", () => {
      if (this.state?.source) this.revealSource(this.state.source);
    });
  }

  /** The slide whose notes are shown. */
  get slide(): number | undefined {
    return this.state?.slide;
  }

  /** The notes as they are shown, typing included. */
  get text(): string {
    return this.field.value;
  }

  show(next: NotesState): void {
    const previous = this.state;
    const typing = previous?.slide === next.slide && document.activeElement === this.field;
    if (previous && previous.slide !== next.slide) {
      const tidied = this.tidy();
      if (tidied) mapState(next, tidied);
    }
    this.state = next;
    // While the notes are typed, what was typed stands; only where it is written moves on.
    if (!typing || next.reason) this.field.value = next.text;
    this.field.readOnly = Boolean(next.reason) || this.locked;
    this.field.classList.toggle("is-read-only", Boolean(next.reason));
    this.meta.textContent = next.reason ?? "";
    this.meta.title = next.reason ?? "";
    this.sourceButton.hidden = !next.source;
  }

  lock(locked: boolean): void {
    this.locked = locked;
    this.field.readOnly = Boolean(this.state?.reason) || locked;
  }

  /** Carry the positions the notes are written at through a change to the editor's text. */
  map(changes: ChangeDesc): void {
    if (this.state) mapState(this.state, changes);
  }

  /** Whether the literal is still in the editor where it was last seen. */
  private literalHolds(): boolean {
    const literal = this.state?.literal;
    if (!literal) return false;
    const doc = this.view.state.doc;
    return literal.to <= doc.length && doc.sliceString(literal.from, literal.to) === literal.code;
  }

  private write(): void {
    const state = this.state;
    if (!state || state.reason || this.locked) return;
    const text = this.field.value;
    if (state.literal && this.literalHolds()) {
      const { from, code, form } = state.literal;
      const next = writeNotes(text, form);
      if (next === code) return;
      const change = minimalChange(code, next);
      this.view.dispatch({
        changes: { from: from + change.from, to: from + change.to, insert: change.insert },
        userEvent: "input.notes",
      });
      state.literal = { from, to: from + next.length, code: next, form };
    } else if (!state.literal && state.insertAt !== undefined && text) {
      const form: NotesForm = { quote: "\"" };
      const code = writeNotes(text, form);
      const at = state.insertAt;
      this.view.dispatch({ changes: { from: at, insert: `.notes(${code})` }, userEvent: "input.notes" });
      const from = at + ".notes(".length;
      state.literal = { from, to: from + code.length, code, form };
      state.source = { from, to: from + code.length };
      state.insertAt = undefined;
    }
  }

  /**
   * Once the notes are emptied and left, take away the call that held them, so a slide without
   * notes reads as one in the code too. Notes given as an option keep their empty string.
   */
  private tidy(): ChangeDesc | undefined {
    const state = this.state;
    if (!state?.literal || state.reason || this.field.value.trim() || !this.literalHolds()) return undefined;
    const { from, to } = state.literal;
    const doc = this.view.state.doc;
    const before = doc.sliceString(Math.max(0, from - 80), from);
    const after = doc.sliceString(to, Math.min(doc.length, to + 80));
    const chained = /\.\s*notes\s*\(\s*$/.exec(before);
    const closing = /^\s*\)/.exec(after);
    const line = doc.lineAt(from);
    let removed: { from: number; to: number } | undefined;
    if (chained && closing) {
      removed = { from: from - chained[0].length, to: to + closing[0].length };
    } else if (line.to >= to && /^\s*note\s*\(\s*$/.test(doc.sliceString(line.from, from))
      && /^\s*\)\s*;?\s*$/.test(doc.sliceString(to, line.to))) {
      // A note() statement on a line of its own goes with its line.
      removed = line.number < doc.lines
        ? { from: line.from, to: line.to + 1 }
        : { from: Math.max(0, line.from - 1), to: line.to };
    }
    if (!removed) return undefined;
    const changes = ChangeSet.of(removed, doc.length);
    this.view.dispatch({ changes, userEvent: "delete.notes" });
    state.literal = undefined;
    state.source = undefined;
    if (chained) state.insertAt = removed.from;
    return changes.desc;
  }
}

function mapState(state: NotesState, changes: ChangeDesc): void {
  if (state.literal) {
    state.literal = { ...state.literal, from: changes.mapPos(state.literal.from, 1), to: changes.mapPos(state.literal.to, -1) };
  }
  if (state.insertAt !== undefined) state.insertAt = changes.mapPos(state.insertAt, -1);
  if (state.source) state.source = { from: changes.mapPos(state.source.from, 1), to: changes.mapPos(state.source.to, -1) };
}
