import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { linter, type Diagnostic } from "@codemirror/lint";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
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
import { element } from "./ui";

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

/**
 * TypeScript's errors for the document, underlined in the editor. The same list is handed to
 * the Problems panel, so both always describe the same text.
 */
export function typescriptLinter(onDiagnostics: (diagnostics: LanguageDiagnostic[], text: string) => void): Extension {
  return linter(async (view) => {
    const text = view.state.doc.toString();
    try {
      const { diagnostics } = await call<{ diagnostics: LanguageDiagnostic[] }>("POST", "language/diagnostics", { text });
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
