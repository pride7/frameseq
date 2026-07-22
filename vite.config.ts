import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { networkInterfaces, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import type { RunResult } from "node-tectonic";
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
const pathKey = (path: string): string => {
  const normalized = normalizePath(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};
const entryPathKey = pathKey(normalizedEntry);
const styleEntryPathKey = pathKey(normalizedStyleEntry);
const tailwindSource = normalizePath(relative(dirname(styleEntry), dirname(entry)));
const tailwindExclusions = ["node_modules", "dist", "output", ".git"]
  .map((directory) => normalizePath(`${tailwindSource}/${directory}`));
const remoteServerEnabled = process.env.FRAMESEQ_REMOTE === "1";
const openBrowser = process.env.FRAMESEQ_OPEN_BROWSER !== "0";
const remoteSyncEvent = "frameseq:remote-sync";

function networkOrigins(port: number, protocol: "http" | "https"): string[] {
  const origins = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (String(address.family) !== "IPv4" || address.internal) continue;
      origins.add(`${protocol}://${address.address}:${port}`);
    }
  }
  return [...origins].sort();
}

const documentCommands = [
  "presentation",
  "slide",
  "text",
  "image",
  "code",
  "math",
  "typst",
  "typstFile",
  "latex",
  "latexFile",
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
type TectonicRun = (
  args: string[],
  options?: { cwd?: string; timeout?: number; input?: string | Buffer },
) => Promise<RunResult>;
let tectonicRun: TectonicRun | undefined;
let tectonicVersion = "unknown";

const latexTemplate = "<!doctype html><html><body>{{ tduxContent | safe }}</body></html>";
const latexPreamble = String.raw`\documentclass[border=0pt]{standalone}
\usepackage{amsmath,amssymb}
\usepackage{booktabs,array,tabularx,multirow}
\usepackage{xcolor,graphicx}
\pagestyle{empty}`;

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

async function getTectonicRun(): Promise<TectonicRun> {
  if (tectonicRun) return tectonicRun;

  try {
    const module = await import("node-tectonic");
    tectonicRun = module.run;
    tectonicVersion = module.tectonicVersion;
    return tectonicRun;
  } catch (error) {
    throw new Error(
      "LaTeX content requires node-tectonic. "
      + "Install it with: npm install --save-dev node-tectonic",
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

interface LatexReplacement extends SourceReplacement {
  file: boolean;
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

function latexReplacements(source: string): LatexReplacement[] {
  const sourceFile = ts.createSourceFile(
    normalizedEntry,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const replacements: LatexReplacement[] = [];

  function visit(node: ts.Node): void {
    if (ts.isTaggedTemplateExpression(node)
      && ts.isIdentifier(node.tag)
      && node.tag.text === "latex") {
      if (!ts.isNoSubstitutionTemplateLiteral(node.template)) {
        throw new Error("latex tagged templates must be static; JavaScript interpolation is not supported yet");
      }
      replacements.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        source: node.template.rawText ?? node.template.text,
        label: "inline LaTeX fragment",
        file: false,
      });
      return;
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const [argument] = node.arguments;
      if (node.expression.text === "latex" && argument && ts.isStringLiteral(argument)) {
        replacements.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          source: argument.text,
          label: "inline LaTeX fragment",
          file: false,
        });
        return;
      }

      if (node.expression.text === "latexFile") {
        if (!argument || !ts.isStringLiteral(argument)) {
          throw new Error("latexFile() requires a static string path");
        }
        replacements.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          source: argument.text,
          label: "LaTeX file",
          file: true,
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

function latexError(result: RunResult, label: string): Error {
  const detail = result.stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Fontconfig error:"))
    .slice(-12)
    .join("\n");
  return new Error(`Could not compile ${label}${detail ? `:\n${detail}` : ""}`);
}

function latexDocument(fragment: string, templatePath: string): string {
  if (/\\documentclass\b|\\begin\s*\{document\}/.test(fragment)) {
    throw new Error(
      "latex() and latexFile() accept document-body fragments, not complete LaTeX documents",
    );
  }

  const normalizedTemplatePath = normalizePath(templatePath);
  return `${latexPreamble}
\\begin{document}
\\special{tdux:setTemplate ${normalizedTemplatePath}}
\\special{tdux:setOutputPath fragment.html}
${fragment}
\\special{tdux:provideSpecial font-css fonts.css}
\\special{tdux:emit}
\\end{document}
`;
}

async function inlineLatexFonts(css: string, directory: string): Promise<string> {
  let result = css;
  const assets = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)];

  for (const asset of assets) {
    const filename = asset[1];
    const extension = filename.split(".").pop()?.toLowerCase();
    const mime = extension === "ttf"
      ? "font/ttf"
      : extension === "woff"
        ? "font/woff"
        : extension === "woff2"
          ? "font/woff2"
          : "font/otf";
    const data = await readFile(resolve(directory, filename));
    result = result.replace(asset[0], `url("data:${mime};base64,${data.toString("base64")}")`);
  }

  return result;
}

function latexHtmlToSvg(html: string, fontCss: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]?.trim();
  if (!body) throw new Error("Tectonic produced no LaTeX fragment content");

  const canvasStyle = body.match(/class="canvas[^"]*"\s+style="([^"]+)"/i)?.[1];
  const width = Number.parseFloat(canvasStyle?.match(/\bwidth:\s*([\d.]+)rem/i)?.[1] ?? "");
  const height = Number.parseFloat(canvasStyle?.match(/\bheight:\s*([\d.]+)rem/i)?.[1] ?? "");
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Could not determine the dimensions of the compiled LaTeX fragment");
  }

  const padding = 2;
  const svgWidth = width + padding * 2;
  const svgHeight = height + padding * 2;
  const pixelBody = body
    .replace(/(-?\d+(?:\.\d+)?)rem\b/g, "$1px")
    .replace(/vertical-align:\s*[^;"]+;?/gi, "");
  const layoutCss = `
.frameseq-latex-root { box-sizing: border-box; color: currentColor; line-height: 0; overflow: visible; }
.frameseq-latex-root .canvas { position: relative; display: block !important; vertical-align: top !important; }
.frameseq-latex-root .ci,
.frameseq-latex-root .cr { position: absolute; display: block; box-sizing: border-box; }
.frameseq-latex-root .ci { line-height: 1; white-space: pre; font-synthesis: none; }
.frameseq-latex-root .cr { background: currentColor; }
`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" role="img" aria-label="Typeset LaTeX fragment">
<style>${fontCss}${layoutCss}</style>
<foreignObject x="0" y="0" width="${svgWidth}" height="${svgHeight}">
<div xmlns="http://www.w3.org/1999/xhtml" class="frameseq-latex-root" style="width:${svgWidth}px;height:${svgHeight}px;padding:${padding}px">${pixelBody}</div>
</foreignObject>
</svg>`;
}

async function compileLatex(fragment: string, label: string): Promise<string> {
  const run = await getTectonicRun();
  const cacheKey = createHash("sha256")
    .update(`frameseq-latex-v1\0${tectonicVersion}\0${fragment}`)
    .digest("hex");
  const cacheDirectory = resolve(tmpdir(), "frameseq-latex-cache-v1");
  const cachePath = resolve(cacheDirectory, `${cacheKey}.svg`);

  try {
    return await readFile(cachePath, "utf8");
  } catch {
    // A cache miss is expected on the first compile.
  }

  const buildDirectory = await mkdtemp(resolve(tmpdir(), "frameseq-latex-"));
  const templatePath = resolve(buildDirectory, "frameseq-template.html");
  const inputPath = resolve(buildDirectory, "fragment.tex");

  try {
    await writeFile(templatePath, latexTemplate, "utf8");
    await writeFile(inputPath, latexDocument(fragment, templatePath), "utf8");

    const result = await run([
      inputPath,
      "--outdir",
      buildDirectory,
      "--outfmt",
      "html",
      "--untrusted",
      "--chatter",
      "minimal",
    ], {
      cwd: dirname(entry),
      timeout: 120_000,
    });
    if (result.exitCode !== 0) throw latexError(result, label);

    const [html, rawFontCss] = await Promise.all([
      readFile(resolve(buildDirectory, "fragment.html"), "utf8"),
      readFile(resolve(buildDirectory, "fonts.css"), "utf8"),
    ]);
    const fontCss = await inlineLatexFonts(rawFontCss, buildDirectory);
    const svg = latexHtmlToSvg(html, fontCss);
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(cachePath, svg, "utf8");
    return svg;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Could not compile")) throw error;
    throw new Error(`Could not compile ${label}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  } finally {
    await rm(buildDirectory, { recursive: true, force: true });
  }
}

export default defineConfig({
  root: packageRoot,
  base: "./",
  define: {
    __FRAMESEQ_REMOTE_ENABLED__: JSON.stringify(remoteServerEnabled),
  },
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
      configureServer(server) {
        if (!remoteServerEnabled) return;

        server.middlewares.use("/__frameseq/remote-info", (request, response, next) => {
          if (request.method !== "GET") {
            next();
            return;
          }
          const address = server.httpServer?.address();
          const port = address && typeof address !== "string"
            ? address.port
            : (server.config.server.port ?? 5173);
          const protocol = server.config.server.https ? "https" : "http";
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify({ origins: networkOrigins(port, protocol) }));
        });

        server.ws.on(remoteSyncEvent, (payload) => {
          if (!payload || typeof payload !== "object") return;
          const envelope = payload as { session?: unknown; sender?: unknown; message?: unknown };
          if (typeof envelope.session !== "string"
            || envelope.session.length < 16
            || envelope.session.length > 128
            || typeof envelope.sender !== "string"
            || envelope.sender.length < 16
            || envelope.sender.length > 128
            || !envelope.message
            || typeof envelope.message !== "object") return;
          server.ws.send(remoteSyncEvent, payload);
        });
      },
      async transform(source, id) {
        const normalizedId = normalizePath(id.split("?")[0]);
        const idPathKey = pathKey(normalizedId);
        if (idPathKey === styleEntryPathKey) {
          const sourceDirectives = [
            `@source ${JSON.stringify(tailwindSource)};`,
            ...tailwindExclusions.map((source) => `@source not ${JSON.stringify(source)};`),
          ].join("\n");
          return {
            code: `${source}\n${sourceDirectives}\n`,
            map: null,
          };
        }
        if (idPathKey !== entryPathKey) return undefined;

        const typstSourceReplacements = typstReplacements(source);
        const latexSourceReplacements = latexReplacements(source);
        const compiledReplacements: Array<SourceReplacement & { code: string }> = [];
        let transformedSource = source;
        if (typstSourceReplacements.length > 0) {
          const compiler = await getTypstCompiler();
          compiledReplacements.push(...typstSourceReplacements.map((replacement) => {
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
          }));
        }

        for (const replacement of latexSourceReplacements) {
          let fragment = replacement.source;
          let sourceLabel = replacement.label;

          if (replacement.file) {
            const absolutePath = resolve(dirname(entry), replacement.source);
            const relativePath = normalizePath(relative(dirname(entry), absolutePath));
            if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith("../")) {
              throw new Error("latexFile() must point to a file inside the slide document directory");
            }
            this.addWatchFile(absolutePath);
            fragment = await readFile(absolutePath, "utf8");
            sourceLabel = replacement.source;
          }

          const svg = await compileLatex(fragment, sourceLabel);
          compiledReplacements.push({
            ...replacement,
            code: `__frameSeqLatexSvg(${JSON.stringify(svg)}, ${JSON.stringify(replacement.source)})`,
          });
        }

        for (const replacement of compiledReplacements.sort((a, b) => b.start - a.start)) {
          transformedSource = transformedSource.slice(0, replacement.start)
            + replacement.code
            + transformedSource.slice(replacement.end);
        }

        const importsFramework = /(?:from\s*|import\s*)["']@pride7\/frameseq["']/.test(source);
        const typstImport = typstSourceReplacements.length > 0
          ? "import { typstSvg as __frameSeqTypstSvg } from \"@pride7/frameseq\";\n"
          : "";
        const latexImport = latexSourceReplacements.length > 0
          ? "import { latexSvg as __frameSeqLatexSvg } from \"@pride7/frameseq\";\n"
          : "";
        const internalImports = `${typstImport}${latexImport}`;
        if (importsFramework) {
          return compiledReplacements.length > 0
            ? { code: `${internalImports}${transformedSource}`, map: null }
            : undefined;
        }

        const hasDefaultExport = /\bexport\s+default\b/.test(source);
        const prelude = `import { ${documentCommands.join(", ")}, getActivePresentation as __frameSeqSlides } from "@pride7/frameseq";\n`;
        const postlude = hasDefaultExport ? "" : "\nexport default __frameSeqSlides();\n";
        return { code: `${internalImports}${prelude}${transformedSource}${postlude}`, map: null };
      },
    },
    tailwindcss(),
  ],
  server: {
    open: openBrowser,
    fs: {
      allow: [packageRoot, dirname(entry)],
    },
  },
  preview: {
    open: false,
  },
  build: {
    outDir: buildDirectory,
    emptyOutDir: true,
  },
});
