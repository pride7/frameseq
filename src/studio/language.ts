import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { linter, type Diagnostic } from "@codemirror/lint";
import { EditorSelection, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  EditorView,
  hoverTooltip,
  keymap,
  showTooltip,
  ViewPlugin,
  type Tooltip,
  type ViewUpdate,
} from "@codemirror/view";
import {
  call,
  type CompletionEntry,
  type Documentation,
  type HoverInfo,
  type LanguageDiagnostic,
  type SignatureHelp,
} from "./api";
import { nameCompletions, nameDefinition, nameHover, prepareNameRename, renameName } from "../source-names";
import { language, t } from "./i18n";
import { askText, element, toast } from "./ui";

/** TypeScript's element kinds, in the vocabulary CodeMirror's completion icons understand. */
const completionTypes: Record<string, string> = {
  function: "function",
  "local function": "function",
  method: "method",
  property: "property",
  getter: "property",
  setter: "property",
  var: "variable",
  let: "variable",
  "local var": "variable",
  parameter: "variable",
  const: "constant",
  class: "class",
  "local class": "class",
  interface: "interface",
  type: "type",
  "type parameter": "type",
  enum: "enum",
  "enum member": "enum",
  module: "namespace",
  "external module name": "namespace",
  keyword: "keyword",
  string: "text",
};

function documentationNode(info: Documentation): HTMLElement {
  const node = element("div", "studio-doc");
  if (info.signature) node.append(element("code", "studio-doc-signature", info.signature));
  if (info.documentation) node.append(element("p", "studio-doc-text", info.documentation));
  for (const tag of info.tags.slice(0, 6)) {
    const line = element("p", "studio-doc-tag");
    line.append(element("strong", "", `@${tag.name}`), document.createTextNode(tag.text ? ` ${tag.text}` : ""));
    node.append(line);
  }
  return node;
}

async function completionSource(context: CompletionContext): Promise<CompletionResult | null> {
  const word = context.matchBefore(/[\w$]*/);
  const before = context.state.sliceDoc(Math.max(0, context.pos - 1), context.pos);
  if (!context.explicit && (!word || word.from === word.to) && before !== ".") return null;
  // Inside a string or a comment, plain typing should stay plain typing.
  const node = context.tokenBefore(["String", "TemplateString", "LineComment", "BlockComment"]);
  if (node && !context.explicit) return null;

  const text = context.state.doc.toString();
  const prefix = word?.text ?? "";
  let entries: CompletionEntry[];
  try {
    const result = await call<{ entries: CompletionEntry[] }>("POST", "language/completions", {
      text,
      offset: context.pos,
      prefix,
    });
    entries = result.entries;
  } catch {
    return null;
  }
  if (context.aborted) return null;

  const options: Completion[] = entries.map((entry) => {
    const sort = Number.parseInt(entry.sortText, 10);
    const option: Completion = {
      label: entry.name,
      type: completionTypes[entry.kind] ?? "text",
      // TypeScript ranks with sortText, lower first; the editor boosts, higher first.
      boost: Number.isFinite(sort) ? Math.max(-99, 11 - sort) : 0,
      detail: entry.kindModifiers?.includes("deprecated") ? "deprecated" : undefined,
      apply: entry.insertText ?? entry.name,
      info: async () => {
        try {
          const { details } = await call<{ details?: Documentation }>("POST", "language/details", {
            text,
            offset: context.pos,
            name: entry.name,
            source: entry.source,
            data: entry.data,
          });
          return details ? documentationNode(details) : null;
        } catch {
          return null;
        }
      },
    };
    return option;
  });
  return {
    from: word?.from ?? context.pos,
    options,
    validFor: /^[\w$]*$/,
  };
}

export { completionSource };

const nameKinds: Record<string, string> = {
  object: "variable",
  region: "namespace",
  layout: "keyword",
  anchor: "enum",
};

/**
 * The names a string can hold where FrameSeq expects one: the objects and regions on the slide
 * in ref() and connectors, the regions the slide can visit in at(), and anchor sides after a dot.
 * TypeScript sees only a string there, so FrameSeq reads the slide itself.
 */
export function nameCompletionSource(context: CompletionContext): CompletionResult | null {
  const result = nameCompletions(context.state.doc.toString(), context.pos);
  if (!result || result.items.length === 0) return null;
  return {
    from: result.from,
    to: result.to,
    options: result.items.map((item): Completion => ({
      label: item.label,
      detail: item.detail,
      type: nameKinds[item.kind],
      boost: 20,
    })),
    validFor: /^[\w/-]*$/,
  };
}

/** What a name in a string refers to: the object or region, where it was named, how often it is used. */
export const nameHoverTooltip = hoverTooltip((view, position) => {
  const hover = nameHover(view.state.doc.toString(), position);
  if (!hover) return null;
  return {
    pos: hover.span.start,
    end: hover.span.end,
    above: true,
    create: () => {
      const node = element("div", "studio-doc");
      node.append(element("p", "studio-doc-text", hover.text));
      return { dom: node };
    },
  };
}, { hoverTime: 380 });

/** Jump from a name to the .as() or at() that defined it. */
export function goToNameDefinition(view: EditorView): boolean {
  const definition = nameDefinition(view.state.doc.toString(), view.state.selection.main.head);
  if (!definition) return false;
  view.dispatch({
    selection: EditorSelection.range(definition.start, definition.end),
    scrollIntoView: true,
    userEvent: "select",
  });
  return true;
}

/** Rename a name everywhere on its slide in one undoable edit. */
export function renameNameAtCursor(view: EditorView): boolean {
  const text = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const prepared = prepareNameRename(text, head);
  if ("error" in prepared) {
    // Not every string is a name: anywhere else, F2 has nothing to do and says so only on a name.
    const onName = /No object|layout owns/.test(prepared.error);
    if (onName) toast(prepared.error, { tone: "warning", timeout: 4000 });
    return onName;
  }
  void askText({
    title: t.editor.rename,
    message: t.editor.renameMessage(prepared.name),
    value: prepared.name,
    confirm: t.editor.rename,
    validate: (value) => {
      if (value === prepared.name) return t.editor.renameEmpty;
      const edits = renameName(text, head, value);
      return "error" in edits ? edits.error : undefined;
    },
  }).then((value) => {
    if (!value || view.state.doc.toString() !== text) return;
    const edits = renameName(text, head, value);
    if ("error" in edits) return;
    view.dispatch({
      changes: edits.map((edit) => ({ from: edit.start, to: edit.end, insert: edit.text })),
      userEvent: "input.rename",
      scrollIntoView: true,
    });
    view.focus();
  });
  return true;
}

export const nameKeymap: Extension = keymap.of([
  { key: "F12", run: goToNameDefinition },
  { key: "F2", run: renameNameAtCursor },
]);

/**
 * TypeScript's errors for the document, underlined in the editor. The same list is handed to
 * the Problems panel, so both always describe the same text.
 */
export function typescriptLinter(onDiagnostics: (diagnostics: LanguageDiagnostic[], text: string) => void): Extension {
  return linter(async (view) => {
    const text = view.state.doc.toString();
    try {
      const { diagnostics } = await call<{ diagnostics: LanguageDiagnostic[] }>("POST", "language/diagnostics", { text, language });
      onDiagnostics(diagnostics, text);
      const length = view.state.doc.length;
      return diagnostics.map((item): Diagnostic => ({
        from: Math.min(item.from, length),
        to: Math.min(Math.max(item.to, item.from), length),
        severity: item.severity,
        message: item.message,
        source: `ts(${item.code})`,
      }));
    } catch {
      return [];
    }
  }, { delay: 280 });
}

export const typescriptHover = hoverTooltip(async (view, position) => {
  const text = view.state.doc.toString();
  try {
    const { hover } = await call<{ hover?: HoverInfo }>("POST", "language/hover", { text, offset: position });
    if (!hover || !hover.signature) return null;
    return {
      pos: hover.from,
      end: hover.to,
      above: true,
      create: () => ({ dom: documentationNode(hover) }),
    };
  } catch {
    return null;
  }
}, { hoverTime: 380 });

const setSignature = StateEffect.define<Tooltip | null>();

const signatureField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSignature)) return effect.value;
    }
    if (value && transaction.docChanged) {
      return { ...value, pos: transaction.changes.mapPos(value.pos) };
    }
    return value;
  },
  provide: (field) => showTooltip.from(field),
});

function signatureNode(help: SignatureHelp): HTMLElement {
  const item = help.items[help.selected] ?? help.items[0];
  const node = element("div", "studio-signature");
  const code = element("code", "studio-signature-code");
  code.append(document.createTextNode(item.prefix));
  item.parameters.forEach((parameter, index) => {
    if (index > 0) code.append(document.createTextNode(item.separator));
    code.append(element(index === help.argument ? "strong" : "span", "", parameter.label));
  });
  code.append(document.createTextNode(item.suffix));
  if (help.items.length > 1) {
    node.append(element("span", "studio-signature-count", `${help.selected + 1}/${help.items.length}`));
  }
  node.append(code);
  const active = item.parameters[help.argument];
  const about = active?.documentation || item.documentation;
  if (about) node.append(element("p", "studio-doc-text", about));
  return node;
}

/** The parameters of the call being typed, shown above it the way an IDE does. */
const signaturePlugin = ViewPlugin.fromClass(class {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly view: EditorView) {}

  update(update: ViewUpdate): void {
    if (!update.docChanged && !update.selectionSet) return;
    const state = update.state;
    const head = state.selection.main.head;
    const before = state.sliceDoc(Math.max(0, head - 1), head);
    const typed = update.transactions.some((transaction) => transaction.isUserEvent("input.type"));
    const showing = state.field(signatureField) !== null;
    if ((typed && (before === "(" || before === ",")) || showing) this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), 110);
  }

  private async refresh(): Promise<void> {
    const state = this.view.state;
    const text = state.doc.toString();
    const head = state.selection.main.head;
    let help: SignatureHelp | undefined;
    try {
      ({ signature: help } = await call<{ signature?: SignatureHelp }>("POST", "language/signature", { text, offset: head }));
    } catch {
      help = undefined;
    }
    if (this.view.state.doc.toString() !== text) return;
    const tooltip: Tooltip | null = help && help.items.length > 0
      ? { pos: head, above: true, create: () => ({ dom: signatureNode(help) }) }
      : null;
    if (tooltip === null && this.view.state.field(signatureField) === null) return;
    this.view.dispatch({ effects: setSignature.of(tooltip) });
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
});

export const signatureHelp: Extension = [
  signatureField,
  signaturePlugin,
  keymap.of([{
    key: "Escape",
    run: (view) => {
      if (view.state.field(signatureField) === null) return false;
      view.dispatch({ effects: setSignature.of(null) });
      return true;
    },
  }]),
  EditorView.domEventHandlers({
    blur: (_event, view) => {
      if (view.state.field(signatureField) !== null) {
        setTimeout(() => view.dispatch({ effects: setSignature.of(null) }), 0);
      }
    },
  }),
];
