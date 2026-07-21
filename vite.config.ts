import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import tailwindcss from "@tailwindcss/vite";
import ts from "typescript";
import { defineConfig, normalizePath } from "vite";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const entry = resolve(process.env.FRAMESEQ_ENTRY ?? resolve(process.cwd(), "slides.ts"));
const buildDirectory = process.env.FRAMESEQ_BUILD_DIR ?? resolve(packageRoot, "dist");
const virtualEntry = "virtual:frameseq-entry";
const resolvedVirtualEntry = `\0${virtualEntry}`;
const normalizedEntry = normalizePath(entry);
const styleEntry = resolve(packageRoot, "src", "index.css");
const normalizedStyleEntry = normalizePath(styleEntry);
const tailwindSource = normalizePath(relative(dirname(styleEntry), dirname(entry)));
const tailwindExclusions = ["node_modules", "dist", "output", ".git"]
  .map((directory) => normalizePath(`${tailwindSource}/${directory}`));

const documentCommands = [
  "presentation",
  "slide",
  "text",
  "image",
  "code",
  "math",
  "typst",
  "typstFile",
  "rect",
  "circle",
  "line",
  "bullets",
  "steps",
  "metric",
  "main",
  "left",
  "right",
  "cell",
  "gap",
  "px",
  "pt",
  "rem",
  "percent",
  "vw",
  "vh",
  "defineTheme",
  "themes",
];

const typstPagePrelude = "#set page(width: auto, height: auto, margin: 0pt, fill: none)\n";
let typstCompiler: NodeCompiler | undefined;

async function getTypstCompiler(): Promise<NodeCompiler> {
  if (typstCompiler) return typstCompiler;

  try {
    const { NodeCompiler } = await import("@myriaddreamin/typst-ts-node-compiler");
    typstCompiler = NodeCompiler.create({ workspace: dirname(entry) });
    return typstCompiler;
  } catch (error) {
    throw new Error(
      "Typst content requires @myriaddreamin/typst-ts-node-compiler. "
      + "Install it with: npm install --save-dev @myriaddreamin/typst-ts-node-compiler",
      { cause: error },
    );
  }
}

interface SourceReplacement {
  start: number;
  end: number;
  source: string;
  label: string;
}

function typstReplacements(source: string): SourceReplacement[] {
  const sourceFile = ts.createSourceFile(
    normalizedEntry,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const replacements: SourceReplacement[] = [];

  function visit(node: ts.Node): void {
    if (ts.isTaggedTemplateExpression(node)
      && ts.isIdentifier(node.tag)
      && node.tag.text === "typst") {
      if (!ts.isNoSubstitutionTemplateLiteral(node.template)) {
        throw new Error("typst tagged templates must be static; JavaScript interpolation is not supported yet");
      }
      replacements.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        source: node.template.rawText ?? node.template.text,
        label: "inline Typst fragment",
      });
      return;
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const [argument] = node.arguments;
      if (node.expression.text === "typst" && argument && ts.isStringLiteral(argument)) {
        replacements.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          source: argument.text,
          label: "inline Typst fragment",
        });
        return;
      }

      if (node.expression.text === "typstFile") {
        if (!argument || !ts.isStringLiteral(argument)) {
          throw new Error("typstFile() requires a static string path");
        }
        replacements.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          source: argument.text,
          label: "Typst file",
        });
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return replacements;
}

function typstError(error: unknown, label: string): Error {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    const detail = error.message || code || error.name;
    return new Error(`Could not compile ${label}: ${detail}`, { cause: error });
  }
  return new Error(`Could not compile ${label}: ${String(error)}`);
}

export default defineConfig({
  root: packageRoot,
  plugins: [
    {
      name: "frameseq-entry",
      enforce: "pre",
      resolveId(id) {
        return id === virtualEntry ? resolvedVirtualEntry : undefined;
      },
      load(id) {
        if (id !== resolvedVirtualEntry) return undefined;
        return `export { default } from ${JSON.stringify(normalizedEntry)};`;
      },
      async transform(source, id) {
        const normalizedId = normalizePath(id.split("?")[0]);
        if (normalizedId === normalizedStyleEntry) {
          const sourceDirectives = [
            `@source ${JSON.stringify(tailwindSource)};`,
            ...tailwindExclusions.map((source) => `@source not ${JSON.stringify(source)};`),
          ].join("\n");
          return {
            code: `${source}\n${sourceDirectives}\n`,
            map: null,
          };
        }
        if (normalizedId !== normalizedEntry) return undefined;

        const replacements = typstReplacements(source);
        let transformedSource = source;
        if (replacements.length > 0) {
          const compiler = await getTypstCompiler();
          const compiledReplacements = replacements.map((replacement) => {
            let typstSource = `${typstPagePrelude}${replacement.source}`;
            let sourceLabel = replacement.label;

            if (replacement.label === "Typst file") {
              const absolutePath = resolve(dirname(entry), replacement.source);
              const relativePath = normalizePath(relative(dirname(entry), absolutePath));
              if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith("../")) {
                throw new Error("typstFile() must point to a file inside the slide document directory");
              }
              this.addWatchFile(absolutePath);
              typstSource = `${typstPagePrelude}#include ${JSON.stringify(relativePath)}\n`;
              sourceLabel = replacement.source;
            }

            try {
              const svg = compiler.plainSvg({ mainFileContent: typstSource });
              return {
                ...replacement,
                code: `__frameSeqTypstSvg(${JSON.stringify(svg)}, ${JSON.stringify(replacement.source)})`,
              };
            } catch (error) {
              throw typstError(error, sourceLabel);
            }
          });

          for (const replacement of compiledReplacements.sort((a, b) => b.start - a.start)) {
            transformedSource = transformedSource.slice(0, replacement.start)
              + replacement.code
              + transformedSource.slice(replacement.end);
          }
        }

        const importsFramework = /(?:from\s*|import\s*)["']@pride7\/frameseq["']/.test(source);
        const typstImport = replacements.length > 0
          ? "import { typstSvg as __frameSeqTypstSvg } from \"@pride7/frameseq\";\n"
          : "";
        if (importsFramework) {
          return replacements.length > 0
            ? { code: `${typstImport}${transformedSource}`, map: null }
            : undefined;
        }

        const hasDefaultExport = /\bexport\s+default\b/.test(source);
        const prelude = `import { ${documentCommands.join(", ")}, getActivePresentation as __frameSeqDeck } from "@pride7/frameseq";\n`;
        const postlude = hasDefaultExport ? "" : "\nexport default __frameSeqDeck();\n";
        return { code: `${typstImport}${prelude}${transformedSource}${postlude}`, map: null };
      },
    },
    tailwindcss(),
  ],
  server: {
    open: true,
    fs: {
      allow: [packageRoot, dirname(entry)],
    },
  },
  build: {
    outDir: buildDirectory,
    emptyOutDir: true,
  },
});
