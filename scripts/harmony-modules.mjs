import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import ts from "typescript";
import { parseBibtex } from "./bibtex.mjs";
import { applySourceEdits, markEdits, sourceMarks, statementEdits } from "./source-marks.mjs";

export function inside(folder, file) {
  const path = relative(folder, file);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith("../") && !path.startsWith("..\\"));
}

/** Check the real paths too: a link inside the document must not expose another directory. */
export async function allowedFile(path, roots) {
  const actual = await realpath(path);
  for (const root of roots) {
    try {
      if (inside(await realpath(root), actual) && (await stat(actual)).isFile()) return actual;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error("This file is outside the presentation and templates folders.");
}

async function modulePath(path) {
  for (const candidate of [path, `${path}.ts`, `${path}.js`, resolve(path, "index.ts"), resolve(path, "index.js")]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  throw new Error(`Cannot find the imported file: ${path}`);
}

// An .fsq presentation is TypeScript under FrameSeq's own extension.
const scripts = new Set([".ts", ".fsq", ".js", ".mjs"]);
const assets = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".bmp", ".woff", ".woff2", ".ttf"]);

/** Compile a document on the device with TypeScript's JavaScript compiler, without native tools. */
export async function compileHarmonyModule({ file, roots, commands, revision, document = false, watch = () => {} }) {
  const path = await allowedFile(file, roots);
  watch(path);
  const extension = extname(path).toLowerCase();
  const urlFor = (route, target) => `${route}?file=${encodeURIComponent(target)}&v=${encodeURIComponent(revision)}`;
  if (assets.has(extension)) return `export default ${JSON.stringify(urlFor("/__frameseq/asset", path))};`;
  const source = await readFile(path, "utf8");
  if (extension === ".bib") return `export default ${JSON.stringify(parseBibtex(source))};`;
  if (extension === ".json") return `export default ${JSON.stringify(JSON.parse(source))};`;
  if (extension === ".css") return `const style = document.createElement("style"); style.textContent = ${JSON.stringify(source)}; document.head.append(style);`;
  if (!scripts.has(extension)) throw new Error(`This edition cannot import ${extension} files.`);
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  if (parsed.parseDiagnostics.length) {
    throw new Error(ts.flattenDiagnosticMessageText(parsed.parseDiagnostics[0].messageText, "\n"));
  }
  // Resolve imports before transforming, including re-exports and literal dynamic imports.
  const imports = new Map();
  const record = (node) => {
    if (!node || !ts.isStringLiteralLike(node) || imports.has(node.text)) return;
    imports.set(node.text, undefined);
  };
  const scan = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && !node.importClause?.isTypeOnly) record(node.moduleSpecifier);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0])) {
        throw new Error("This edition requires a literal path in import().");
      }
      record(node.arguments[0]);
    }
    ts.forEachChild(node, scan);
  };
  scan(parsed);
  await Promise.all([...imports.keys()].map(async (name) => {
    if (name === "@pride7/frameseq") {
      imports.set(name, "/assets/framework.js");
    } else if (/^\.{1,2}\//.test(name)) {
      const target = await allowedFile(await modulePath(resolve(dirname(path), name)), roots);
      watch(target);
      imports.set(name, urlFor("/__frameseq/module", target));
    } else {
      throw new Error(`This edition supports FrameSeq and relative file imports; cannot import ${name}.`);
    }
  }));
  let marked = source;
  if (document) {
    marked = applySourceEdits(source, [
      ...sourceMarks(source, path.replaceAll("\\", "/")).flatMap(markEdits),
      ...statementEdits(source, path.replaceAll("\\", "/")),
    ]);
    const framework = '"/assets/framework.js"';
    const prelude = `import { markSource as __frameSeqMark, markStatement as __frameSeqStatement } from ${framework};\n`;
    const globals = /(?:from\s*|import\s*)["']@pride7\/frameseq["']/.test(source)
      ? ""
      : `import { ${commands.join(", ")}, getActivePresentation as __frameSeqSlides } from ${framework};\n`;
    marked = prelude + globals + marked + (globals && !/\bexport\s+default\b/.test(source) ? "\nexport default __frameSeqSlides();\n" : "");
  }
  return ts.transpileModule(marked, {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
    transformers: { before: [(context) => {
      const visit = (node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && imports.has(node.moduleSpecifier.text)) {
          const specifier = ts.factory.createStringLiteral(imports.get(node.moduleSpecifier.text));
          return ts.isImportDeclaration(node)
            ? ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, specifier, node.attributes)
            : ts.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, specifier, node.attributes);
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && imports.has(node.arguments[0]?.text)) {
          return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [ts.factory.createStringLiteral(imports.get(node.arguments[0].text))]);
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (node) => ts.visitNode(node, visit);
    }] },
  }).outputText;
}
