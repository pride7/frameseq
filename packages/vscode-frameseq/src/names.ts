import * as vscode from "vscode";
import { isSlidesPath } from "./entry";
import {
  nameCompletions,
  nameDefinition,
  nameDiagnostics,
  nameHover,
  nameReferences,
  prepareNameRename,
  renameName,
  type TextSpan,
} from "./shared/source-names";

/**
 * The names a slide document gives with .as() and at() are strings to TypeScript. These
 * providers make them identifiers in the editor: completed where a name is expected, followed
 * to where they were given, renamed everywhere on their slide at once, and reported when they
 * refer to nothing. They read the same rules FrameSeq Studio does, from the shared module.
 */
const selector: vscode.DocumentSelector = [
  { language: "typescript", scheme: "file", pattern: "**/slides.ts" },
  { language: "typescript", scheme: "file", pattern: "**/*.slides.ts" },
];

function isDeck(document: vscode.TextDocument): boolean {
  return document.languageId === "typescript" && document.uri.scheme === "file" && isSlidesPath(document.uri.fsPath);
}

function range(document: vscode.TextDocument, span: TextSpan): vscode.Range {
  return new vscode.Range(document.positionAt(span.start), document.positionAt(span.end));
}

const completionKinds: Record<string, vscode.CompletionItemKind> = {
  object: vscode.CompletionItemKind.Variable,
  region: vscode.CompletionItemKind.Module,
  layout: vscode.CompletionItemKind.Keyword,
  anchor: vscode.CompletionItemKind.EnumMember,
};

export function registerNameFeatures(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("frameseq-names");
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const check = (document: vscode.TextDocument): void => {
    if (!isDeck(document)) return;
    diagnostics.set(document.uri, nameDiagnostics(document.getText()).map((item) => {
      const diagnostic = new vscode.Diagnostic(
        range(document, { start: item.start, end: Math.max(item.end, item.start + 1) }),
        item.message,
        item.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = "FrameSeq";
      diagnostic.code = "names";
      return diagnostic;
    }));
  };
  const schedule = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      check(document);
    }, 250));
  };

  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(check),
    vscode.workspace.onDidChangeTextDocument((event) => schedule(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
    { dispose: () => timers.forEach((timer) => clearTimeout(timer)) },

    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(document, position) {
        const result = nameCompletions(document.getText(), document.offsetAt(position));
        if (!result) return undefined;
        const replace = range(document, { start: result.from, end: result.to });
        const typed = new vscode.Range(replace.start, position);
        return result.items.map((item, index) => {
          const completion = new vscode.CompletionItem(item.label, completionKinds[item.kind]);
          completion.detail = item.detail;
          completion.range = { inserting: typed, replacing: replace };
          // Names first, in the order the slide gives them, above TypeScript's string suggestions.
          completion.sortText = `0${String(index).padStart(4, "0")}`;
          return completion;
        });
      },
    }, "\"", "'", "`", ".", "/"),

    vscode.languages.registerDefinitionProvider(selector, {
      provideDefinition(document, position) {
        const definition = nameDefinition(document.getText(), document.offsetAt(position));
        return definition ? new vscode.Location(document.uri, range(document, definition)) : undefined;
      },
    }),

    vscode.languages.registerReferenceProvider(selector, {
      provideReferences(document, position) {
        return nameReferences(document.getText(), document.offsetAt(position))
          .map((span) => new vscode.Location(document.uri, range(document, span)));
      },
    }),

    vscode.languages.registerDocumentHighlightProvider(selector, {
      provideDocumentHighlights(document, position) {
        return nameReferences(document.getText(), document.offsetAt(position))
          .map((span) => new vscode.DocumentHighlight(range(document, span)));
      },
    }),

    vscode.languages.registerRenameProvider(selector, {
      prepareRename(document, position) {
        const prepared = prepareNameRename(document.getText(), document.offsetAt(position));
        if ("error" in prepared) throw new Error(prepared.error);
        return { range: range(document, prepared.span), placeholder: prepared.name };
      },
      provideRenameEdits(document, position, newName) {
        const edits = renameName(document.getText(), document.offsetAt(position), newName.trim());
        if ("error" in edits) throw new Error(edits.error);
        const workspaceEdit = new vscode.WorkspaceEdit();
        for (const edit of edits) workspaceEdit.replace(document.uri, range(document, edit), edit.text);
        return workspaceEdit;
      },
    }),

    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        const hover = nameHover(document.getText(), document.offsetAt(position));
        return hover ? new vscode.Hover(hover.text, range(document, hover.span)) : undefined;
      },
    }),
  );

  for (const document of vscode.workspace.textDocuments) check(document);
}
