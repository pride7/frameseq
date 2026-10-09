import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintGutter, lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, RangeSet, StateEffect, StateField, type Range } from "@codemirror/state";
import {
  crosshairCursor,
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  gutter,
  GutterMarker,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { LanguageDiagnostic } from "./api";
import { completionSource, signatureHelp, typescriptHover, typescriptLinter } from "./language";

/**
 * Where slides begin in the editor. A loop or a helper call makes several slides from one
 * statement, so one mark can stand for a run of them.
 */
export interface SlideMark {
  /** The rendered slides the lines make, counted from 0. */
  indices: number[];
  line: number;
  endLine: number;
  label: string;
}

class SlideMarker extends GutterMarker {
  constructor(readonly indices: number[], readonly label: string) {
    super();
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof SlideMarker
      && other.label === this.label
      && other.indices.join() === this.indices.join();
  }

  override toDOM(): Node {
    const first = this.indices[0] + 1;
    const last = this.indices[this.indices.length - 1] + 1;
    const marker = document.createElement("span");
    marker.className = "cm-slide-marker";
    marker.textContent = first === last ? String(first) : `${first}–${last}`;
    marker.title = first === last
      ? `Slide ${first}: ${this.label} — click to preview`
      : `Slides ${first} to ${last}, made by this statement — click to preview`;
    return marker;
  }
}

const setSlideMarks = StateEffect.define<SlideMark[]>();
const setPreviewSlide = StateEffect.define<number | null>();

/** The slides' first lines, which follow every edit until the next outline replaces them. */
const slideMarks = StateField.define<{ marks: SlideMark[]; markers: RangeSet<GutterMarker> }>({
  create: () => ({ marks: [], markers: RangeSet.empty }),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(setSlideMarks)) continue;
      const doc = transaction.state.doc;
      const markers = effect.value
        .filter((mark) => mark.line >= 1 && mark.line <= doc.lines)
        .map((mark) => new SlideMarker(mark.indices, mark.label).range(doc.line(mark.line).from));
      return { marks: effect.value, markers: RangeSet.of(markers, true) };
    }
    return transaction.docChanged
      ? { marks: value.marks, markers: value.markers.map(transaction.changes) }
      : value;
  },
});

const previewBandLine = Decoration.line({ class: "cm-preview-slide" });
const previewBandStart = Decoration.line({ class: "cm-preview-slide cm-preview-slide-start" });

/** A quiet band beside the lines of the slide the preview is showing. */
const previewBand = StateField.define<{ index: number | null; decorations: DecorationSet }>({
  create: () => ({ index: null, decorations: Decoration.none }),
  update(value, transaction) {
    let index = value.index;
    let rebuild = false;
    for (const effect of transaction.effects) {
      if (effect.is(setPreviewSlide)) {
        index = effect.value;
        rebuild = true;
      }
      if (effect.is(setSlideMarks)) rebuild = true;
    }
    if (!rebuild) {
      return transaction.docChanged
        ? { index, decorations: value.decorations.map(transaction.changes) }
        : value;
    }
    const mark = index === null
      ? undefined
      : transaction.state.field(slideMarks).marks.find((candidate) => candidate.indices.includes(index));
    if (!mark) return { index, decorations: Decoration.none };
    const doc = transaction.state.doc;
    const ranges: Range<Decoration>[] = [];
    const last = Math.min(mark.endLine, doc.lines);
    // A slide's outline runs to the next slide, so trailing blank lines are left unmarked.
    let end = last;
    while (end > mark.line && doc.line(end).text.trim() === "") end -= 1;
    for (let line = mark.line; line <= end; line += 1) {
      ranges.push((line === mark.line ? previewBandStart : previewBandLine).range(doc.line(line).from));
    }
    return { index, decorations: Decoration.set(ranges) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/**
 * The editor takes every colour from the Studio's CSS variables, so one theme serves both the
 * light and the dark palette, and switching between them needs no new editor.
 */
const studioTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--studio-text)",
    backgroundColor: "var(--studio-editor)",
    fontSize: "13.5px",
  },
  ".cm-scroller": {
    fontFamily: "var(--studio-mono)",
    lineHeight: "1.6",
  },
  ".cm-content": { caretColor: "var(--studio-accent)", padding: "10px 0 40vh" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--studio-accent)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--studio-selection)",
  },
  ".cm-selectionMatch": { backgroundColor: "var(--studio-selection-match)" },
  ".cm-activeLine": { backgroundColor: "var(--studio-active-line)" },
  ".cm-gutters": {
    color: "var(--studio-gutter)",
    backgroundColor: "var(--studio-editor)",
    border: "none",
  },
  ".cm-activeLineGutter": { color: "var(--studio-gutter-active)", backgroundColor: "transparent" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 6px", minWidth: "32px" },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--studio-gutter)", cursor: "pointer" },
  ".cm-matchingBracket, .cm-nonmatchingBracket": {
    backgroundColor: "var(--studio-bracket)",
    outline: "1px solid var(--studio-bracket-border)",
  },
  ".cm-searchMatch": { backgroundColor: "var(--studio-search)", outline: "1px solid var(--studio-search-border)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--studio-search-selected)" },
  ".cm-tooltip": {
    border: "1px solid var(--studio-border-strong)",
    borderRadius: "8px",
    backgroundColor: "var(--studio-surface-raised)",
    color: "var(--studio-text)",
    boxShadow: "0 12px 32px var(--studio-shadow)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--studio-mono)",
    maxHeight: "18em",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "2px 10px 2px 6px", lineHeight: "1.55" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--studio-accent-soft)", color: "var(--studio-text)" },
  ".cm-completionIcon": { opacity: "0.75", width: "1.1em", paddingRight: "0.7em" },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--studio-accent)", fontWeight: "600" },
  ".cm-completionDetail": { color: "var(--studio-error)", fontStyle: "normal", marginLeft: "0.8em" },
  ".cm-tooltip.cm-completionInfo": { padding: "0", maxWidth: "460px" },
  ".cm-panels": { backgroundColor: "var(--studio-surface)", color: "var(--studio-text)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--studio-border-strong)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--studio-border-strong)" },
  ".cm-panel input, .cm-panel button": { color: "inherit", font: "inherit" },
  ".cm-textfield": {
    border: "1px solid var(--studio-border-strong)",
    borderRadius: "4px",
    backgroundColor: "var(--studio-editor)",
  },
  ".cm-button": {
    border: "1px solid var(--studio-border-strong)",
    borderRadius: "4px",
    backgroundImage: "none",
    backgroundColor: "var(--studio-surface-hover)",
  },
  ".cm-diagnostic": { padding: "6px 10px", borderLeftWidth: "3px" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--studio-error)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--studio-warning)" },
  ".cm-lintRange-error": {
    backgroundImage: "linear-gradient(45deg, transparent 65%, var(--studio-error) 80%, transparent 90%), linear-gradient(135deg, transparent 5%, var(--studio-error) 15%, transparent 25%)",
    backgroundSize: "6px 3px",
    backgroundRepeat: "repeat-x",
    backgroundPosition: "left bottom",
  },
  ".cm-lint-marker": { width: "0.8em", height: "0.8em" },
  ".cm-slide-gutter": { minWidth: "24px" },
  ".cm-slide-gutter .cm-gutterElement": { display: "flex", alignItems: "center", justifyContent: "center" },
  ".cm-preview-slide": { boxShadow: "inset 2px 0 0 var(--studio-band)" },
  ".cm-preview-slide-start": { backgroundColor: "var(--studio-band-start)" },
});

const studioHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], color: "var(--syntax-keyword)" },
  { tag: [tags.definitionKeyword, tags.modifier], color: "var(--syntax-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syntax-string)" },
  { tag: tags.regexp, color: "var(--syntax-regexp)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--syntax-number)" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--syntax-function)" },
  { tag: [tags.propertyName], color: "var(--syntax-property)" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--syntax-type)" },
  { tag: [tags.variableName], color: "var(--syntax-variable)" },
  { tag: [tags.definition(tags.variableName)], color: "var(--syntax-definition)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: "var(--syntax-operator)" },
  { tag: tags.escape, color: "var(--syntax-escape)" },
  { tag: tags.invalid, color: "var(--syntax-invalid)" },
]);

/** Tells CodeMirror's own defaults which palette the Studio is showing. */
const darkness = new Compartment();

export interface EditorOptions {
  doc: string;
  onUpdate: (update: ViewUpdate) => void;
  onSave: () => void;
  onDiagnostics: (diagnostics: LanguageDiagnostic[], text: string) => void;
  onSlideMarker: (index: number) => void;
  dark: boolean;
}

export function createEditor(parent: HTMLElement, options: EditorOptions): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        lineNumbers(),
        gutter({
          class: "cm-slide-gutter",
          markers: (view) => view.state.field(slideMarks).markers,
          domEventHandlers: {
            mousedown(view, line) {
              let index: number | undefined;
              view.state.field(slideMarks).markers.between(line.from, line.from, (_from, _to, marker) => {
                if (marker instanceof SlideMarker) index = marker.indices[0];
              });
              if (index === undefined) return false;
              options.onSlideMarker(index);
              return true;
            },
          },
        }),
        foldGutter(),
        lintGutter(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        indentUnit.of("  "),
        syntaxHighlighting(studioHighlight),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [completionSource], icons: true, activateOnTypingDelay: 60 }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        javascript({ typescript: true }),
        typescriptLinter(options.onDiagnostics),
        typescriptHover,
        signatureHelp,
        slideMarks,
        previewBand,
        studioTheme,
        darkness.of(EditorView.darkTheme.of(options.dark)),
        keymap.of([
          { key: "Mod-s", run: () => { options.onSave(); return true; }, preventDefault: true },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        // Slide text is prose, and a narrow editor beside the preview should not scroll sideways.
        EditorView.lineWrapping,
        EditorView.updateListener.of(options.onUpdate),
        EditorView.contentAttributes.of({ "aria-label": "Slide document" }),
      ],
    }),
  });
}

export function showSlideMarks(view: EditorView, marks: SlideMark[]): void {
  view.dispatch({ effects: setSlideMarks.of(marks) });
}

export function showPreviewSlide(view: EditorView, index: number | null): void {
  if (view.state.field(previewBand).index === index) return;
  view.dispatch({ effects: setPreviewSlide.of(index) });
}

export function currentSlideMarks(view: EditorView): SlideMark[] {
  return view.state.field(slideMarks).marks;
}

export function setEditorDarkness(view: EditorView, dark: boolean): void {
  view.dispatch({ effects: darkness.reconfigure(EditorView.darkTheme.of(dark)) });
}
