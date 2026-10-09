import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

/** Completions are filtered again in the editor; this only keeps a global list from flooding it. */
const maximumCompletions = 800;

const fallbackOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  moduleDetection: ts.ModuleDetectionKind.Force,
  strict: true,
  skipLibCheck: true,
};

const fileKey = (path) => {
  const normalized = path.replaceAll("\\", "/");
  return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
};

const text = (parts) => ts.displayPartsToString(parts ?? []);

function documentation(info) {
  return {
    signature: text(info.displayParts),
    documentation: text(info.documentation),
    tags: (info.tags ?? []).map((tag) => ({ name: tag.name, text: text(tag.text) })),
  };
}

/** Do the characters of the prefix appear, in order, in the name? The editor's own test. */
function matchesPrefix(name, prefix) {
  let cursor = 0;
  const lower = name.toLowerCase();
  for (const character of prefix.toLowerCase()) {
    cursor = lower.indexOf(character, cursor);
    if (cursor < 0) return false;
    cursor += 1;
  }
  return true;
}

/**
 * A TypeScript language service for the one slide document FrameSeq Studio edits.
 *
 * It reads the project the way an editor would, from the nearest tsconfig.json, so completions
 * and errors agree with what VS Code or `tsc` would say. The document itself is never read from
 * disk once the Studio has sent its text: the editor buffer is the version being analysed.
 */
export function createStudioLanguage({ entry, packageRoot }) {
  const entryKey = fileKey(entry);
  const configPath = ts.findConfigFile(dirname(entry), ts.sys.fileExists, "tsconfig.json");
  let options = fallbackOptions;
  let rootNames = [];
  let currentDirectory = dirname(entry);

  if (configPath) {
    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => undefined,
    });
    if (parsed) {
      options = parsed.options;
      rootNames = [...parsed.fileNames];
      currentDirectory = dirname(configPath);
    }
  }
  options = { ...options, noEmit: true };

  let entryName = rootNames.find((name) => fileKey(name) === entryKey);
  if (!entryName) {
    entryName = entry.replaceAll("\\", "/");
    rootNames.push(entryName);
  }

  let source = ts.sys.readFile(entry) ?? "";
  let sourceVersion = 0;

  const host = {
    getScriptFileNames: () => rootNames,
    getScriptVersion: (fileName) => {
      if (fileKey(fileName) === entryKey) return String(sourceVersion);
      try {
        return String(statSync(fileName).mtimeMs);
      } catch {
        return "0";
      }
    },
    getScriptSnapshot: (fileName) => {
      if (fileKey(fileName) === entryKey) return ts.ScriptSnapshot.fromString(source);
      const content = ts.sys.readFile(fileName);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => currentDirectory,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (compilerOptions) => ts.getDefaultLibFilePath(compilerOptions),
    fileExists: (fileName) => fileKey(fileName) === entryKey || ts.sys.fileExists(fileName),
    readFile: (fileName, encoding) => (
      fileKey(fileName) === entryKey ? source : ts.sys.readFile(fileName, encoding)
    ),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  // A deck kept outside any project that names the FrameSeq globals would otherwise report
  // every command as unknown. Add the declarations only when the program does not have them,
  // because the repository's own tsconfig already includes them from source.
  const program = service.getProgram();
  const packageKey = fileKey(packageRoot);
  const hasGlobals = program?.getSourceFiles().some((file) => {
    const key = fileKey(file.fileName);
    return key.startsWith(packageKey) && /\/globals\.(?:d\.)?ts$/.test(key);
  });
  if (!hasGlobals) {
    const declarations = [
      resolve(packageRoot, "lib", "globals.d.ts"),
      resolve(packageRoot, "src", "globals.ts"),
    ].find((path) => existsSync(path));
    if (declarations) rootNames.push(declarations.replaceAll("\\", "/"));
  }

  function update(next) {
    if (typeof next === "string" && next !== source) {
      source = next;
      sourceVersion += 1;
    }
  }

  /**
   * The FrameSeq globals are declared as `const slide: typeof import("./script").slide`, which
   * carries the function's type but not its documentation. Read the documentation from the
   * function the type names.
   */
  function aliasedDocumentation(symbol, checker, location) {
    if (!symbol) return undefined;
    const declaration = location ?? symbol.valueDeclaration;
    if (!declaration) return undefined;
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const target = type?.getSymbol();
    if (!target || target === symbol) return undefined;
    const documentation = text(target.getDocumentationComment(checker));
    if (!documentation) return undefined;
    return {
      documentation,
      tags: target.getJsDocTags(checker).map((tag) => ({ name: tag.name, text: text(tag.text) })),
    };
  }

  function withAliasDocumentation(result, find) {
    if (!result || result.documentation) return result;
    try {
      const program = service.getProgram();
      const checker = program?.getTypeChecker();
      if (!program || !checker) return result;
      const found = find(program, checker);
      return found ? { ...result, ...found } : result;
    } catch {
      return result;
    }
  }

  const severity = (category) => (
    category === ts.DiagnosticCategory.Error
      ? "error"
      : (category === ts.DiagnosticCategory.Warning ? "warning" : "info")
  );
  const diagnostic = (item) => ({
    from: item.start ?? 0,
    to: (item.start ?? 0) + (item.length ?? 0),
    severity: severity(item.category),
    message: ts.flattenDiagnosticMessageText(item.messageText, "\n"),
    code: item.code,
  });

  return {
    /** Syntax errors only: what decides whether a buffer is safe to hand to the preview. */
    syntax(next) {
      update(next);
      return service.getSyntacticDiagnostics(entryName).map(diagnostic);
    },

    diagnostics(next) {
      update(next);
      return [
        ...service.getSyntacticDiagnostics(entryName),
        ...service.getSemanticDiagnostics(entryName),
      ].map(diagnostic);
    },

    completions(next, offset, prefix = "") {
      update(next);
      const result = service.getCompletionsAtPosition(entryName, offset, {
        includeCompletionsWithInsertText: true,
        includeAutomaticOptionalChainCompletions: true,
      });
      if (!result) return { member: false, entries: [] };
      let entries = result.entries;
      if (entries.length > maximumCompletions) {
        entries = entries
          .filter((item) => matchesPrefix(item.name, prefix))
          .sort((a, b) => a.sortText.localeCompare(b.sortText))
          .slice(0, maximumCompletions);
      }
      return {
        member: result.isMemberCompletion,
        entries: entries.map((item) => ({
          name: item.name,
          kind: item.kind,
          kindModifiers: item.kindModifiers,
          sortText: item.sortText,
          insertText: item.insertText,
          replacementSpan: item.replacementSpan,
          source: item.source,
          data: item.data,
        })),
      };
    },

    details(next, offset, name, origin, data) {
      update(next);
      const details = service.getCompletionEntryDetails(
        entryName,
        offset,
        name,
        undefined,
        origin,
        undefined,
        data,
      );
      if (!details) return undefined;
      return withAliasDocumentation(documentation(details), (_program, checker) => (
        aliasedDocumentation(
          service.getCompletionEntrySymbol(entryName, offset, name, origin),
          checker,
        )
      ));
    },

    hover(next, offset) {
      update(next);
      const info = service.getQuickInfoAtPosition(entryName, offset);
      if (!info) return undefined;
      return {
        from: info.textSpan.start,
        to: info.textSpan.start + info.textSpan.length,
        ...withAliasDocumentation(documentation(info), (program, checker) => {
          const file = program.getSourceFile(entryName);
          const token = file && ts.getTokenAtPosition?.(file, info.textSpan.start);
          return token ? aliasedDocumentation(checker.getSymbolAtLocation(token), checker, token) : undefined;
        }),
      };
    },

    signature(next, offset) {
      update(next);
      const help = service.getSignatureHelpItems(entryName, offset, undefined);
      if (!help) return undefined;
      return {
        from: help.applicableSpan.start,
        to: help.applicableSpan.start + help.applicableSpan.length,
        argument: help.argumentIndex,
        selected: help.selectedItemIndex,
        items: help.items.map((item) => ({
          prefix: text(item.prefixDisplayParts),
          separator: text(item.separatorDisplayParts),
          suffix: text(item.suffixDisplayParts),
          documentation: text(item.documentation),
          parameters: item.parameters.map((parameter) => ({
            label: text(parameter.displayParts),
            documentation: text(parameter.documentation),
          })),
        })),
      };
    },

    /** Build the program before the first request asks for it, so the editor never waits long. */
    warm() {
      service.getSemanticDiagnostics(entryName);
    },
  };
}
