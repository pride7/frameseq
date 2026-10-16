import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { networkInterfaces, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import type { RunResult } from "node-tectonic";
import tailwindcss from "@tailwindcss/vite";
import ts from "typescript";
import { defineConfig, normalizePath, transformWithEsbuild, type ViteDevServer } from "vite";
// @ts-expect-error -- plain JavaScript so the marking rules can be tested on their own.
import { applySourceEdits, markEdits, sourceMarks, statementEdits } from "./scripts/source-marks.mjs";
// @ts-expect-error -- plain JavaScript so the write-back rules can be tested on their own.
import { applyIncomingEdits, applyIncomingMove, applyIncomingRemove, undoLastEdit } from "./scripts/source-edits.mjs";
// @ts-expect-error -- plain JavaScript, like the other server-side halves of the preview.
import { studioPlugin } from "./scripts/studio-server.mjs";
// @ts-expect-error -- plain JavaScript, shared with the script that writes the icon name type.
import { iconNamesIn, iconSet, namesIconsAtRuntime } from "./scripts/icon-set.mjs";
// @ts-expect-error -- plain JavaScript, so the parser can be tested on its own.
import { parseBibtex } from "./scripts/bibtex.mjs";
// @ts-expect-error -- plain JavaScript, shared with the CLI.
import { runsFromBundle } from "./scripts/browsers.mjs";
// @ts-expect-error -- plain JavaScript, shared with the Studio's server.
import { configDirectory } from "./scripts/studio-files.mjs";
// Plain JavaScript, shared with the CLI and the Studio's server.
import { presentationTemplates, templateDeck } from "./scripts/presentation-file.mjs";
// @ts-expect-error -- plain JavaScript, shared with the CLI and the Studio's server.
import { templateDirectory } from "./scripts/user-templates.mjs";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const entry = resolve(process.env.FRAMESEQ_ENTRY ?? resolve(process.cwd(), "slides.ts"));
const buildDirectory = process.env.FRAMESEQ_BUILD_DIR ?? resolve(packageRoot, "dist");
const virtualEntry = "virtual:frameseq-entry";
const resolvedVirtualEntry = `\0${virtualEntry}`;
const virtualIcons = "virtual:frameseq-icons";
const resolvedVirtualIcons = `\0${virtualIcons}`;
const virtualTemplates = "virtual:frameseq-templates";
const resolvedVirtualTemplates = `\0${virtualTemplates}`;
/** Replaced once every module has been read, with the icons the build turned out to need. */
const iconSetPlaceholder = "__FRAMESEQ_ICON_SET__";
const iconsCompletePlaceholder = "__FRAMESEQ_ICONS_COMPLETE__";
const frameworkPackage = "@pride7/frameseq";
const frameworkEntry = resolve(packageRoot, "lib", "index.js");
const normalizedEntry = normalizePath(entry);
const styleEntry = resolve(packageRoot, "src", "index.css");
const normalizedStyleEntry = normalizePath(styleEntry);
const pathKey = (path: string): string => {
  const normalized = normalizePath(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};
const entryPathKey = pathKey(normalizedEntry);
const styleEntryPathKey = pathKey(normalizedStyleEntry);
const remoteServerEnabled = process.env.FRAMESEQ_REMOTE === "1";
const openBrowser = process.env.FRAMESEQ_OPEN_BROWSER !== "0";
// The Studio writes whole documents, so it exists only when `frameseq studio` asked for it.
const studioEnabled = process.env.FRAMESEQ_STUDIO === "1";
const studioRemote = process.env.FRAMESEQ_STUDIO_REMOTE === "1";
const studioStart = studioEnabled && process.env.FRAMESEQ_STUDIO_START === "1";
// Tailwind finds the utilities a presentation uses in its folder. The start page has no
// presentation, only the covers of the person's templates, and the folder it started in may be
// a whole Documents folder, which took half a minute to scan before any cover could show.
const tailwindFolder = studioStart ? templateDirectory() : dirname(entry);
const tailwindSource = normalizePath(relative(dirname(styleEntry), tailwindFolder));
const tailwindExclusions = ["node_modules", "dist", "output", ".git"]
  .map((directory) => normalizePath(`${tailwindSource}/${directory}`));
/** Pre-bundled at startup so opening the Studio never triggers a dependency reload. */
const studioDependencies = [
  "@codemirror/autocomplete",
  "@codemirror/commands",
  "@codemirror/lang-javascript",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/merge",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/highlight",
  "@xterm/xterm",
  "@xterm/addon-fit",
  "@xterm/addon-web-links",
];
const remoteSyncEvent = "frameseq:remote-sync";
const sourceEditEvent = "frameseq:apply-edit";
const sourceUndoEvent = "frameseq:undo-edit";
const sourceEditResultEvent = "frameseq:apply-edit-result";
// Source marks only help the live preview, so a production build stays free of them.
let marksEnabled = false;
let serving = false;
/** Icon names a build has found in the project's modules, and whether one is built at runtime. */
const namedIcons = new Set<string>();
let iconsAtRuntime = false;

/**
 * Every template a new presentation can start from, in both languages, each as a function that
 * runs the template's text as a slide document runs and returns its slides. The Studio shows
 * their real covers from it before anything is written to disk.
 */
function templatesModule(): string {
  const runs = presentationTemplates.flatMap(({ id }) => (["en", "zh"] as const).map((language) => (
    `  ${JSON.stringify(`${id}:${language}`)}: () => {\n${templateDeck(id, "", language)}\nreturn __frameSeqSlides();\n},`
  )));
  return [
    `import ${JSON.stringify(virtualIcons)};`,
    `import { ${documentCommands.join(", ")}, getActivePresentation as __frameSeqSlides } from "@pride7/frameseq";`,
    `export const templates = {\n${runs.join("\n")}\n};`,
  ].join("\n");
}

/** A module the presentation itself wrote, as opposed to FrameSeq or a dependency. */
function projectModule(id: string): boolean {
  const path = normalizePath(id.split("?")[0]);
  return /\.(?:[cm]?[jt]sx?|fsq)$/i.test(path)
    && !path.includes("/node_modules/")
    && !path.startsWith("\0")
    && !pathKey(path).startsWith(pathKey(`${normalizePath(packageRoot)}/src/`))
    && !pathKey(path).startsWith(pathKey(`${normalizePath(packageRoot)}/lib/`));
}

function loopbackAddress(address = ""): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/**
 * What another computer may load from a Studio that shares only its slides, as it does for the
 * phone remote: FrameSeq's own files and the ones the slides load, which the phone's copy of the
 * slides needs, and nothing else from this computer's folders.
 */
function servedToNetwork(server: ViteDevServer, url = "/"): boolean {
  let path: string;
  try {
    path = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  } catch {
    return false;
  }
  if (path.startsWith("/__frameseq/")) return false;
  if (!path.startsWith("/@fs/")) return true;
  // "/@fs/D:/talks/photo.png" on Windows, "/@fs/home/me/talks/photo.png" elsewhere.
  const file = path.slice("/@fs".length).replace(/^\/(?=[A-Za-z]:)/, "");
  const inside = (folder: string) => {
    const within = relative(folder, resolve(file));
    return within === "" || (!within.startsWith("..") && !isAbsolute(within));
  };
  // A file the slides import has been transformed for a page; one Tailwind only scanned for
  // class names, as it does every file in the presentation's folder, has not.
  return inside(packageRoot)
    || inside(server.config.cacheDir)
    || [...server.moduleGraph.getModulesByFile(file) ?? []].some((module) => module.transformResult);
}

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
  "poster",
  "figure",
  "slide",
  "master",
  "placeholder",
  "note",
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
  "shape",
  "polygon",
  "junction",
  "cells",
  "line",
  "bullets",
  "steps",
  "metric",
  "spacer",
  "table",
  "chart",
  "qr",
  "icon",
  "cite",
  "footnote",
  "references",
  "group",
  "ref",
  "card",
  "gridSection",
  "main",
  "left",
  "right",
  "cell",
  "at",
  "gap",
  "px",
  "pt",
  "mm",
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

/** Where a document command sits in the entry file, found by scripts/source-marks.mjs. */
interface SourceMark {
  start: number;
  end: number;
  line: number;
  column: number;
}

/** One text edit on the entry file: a compiled fragment, or half of a source-mark wrapper. */
interface SourceEdit {
  start: number;
  end: number;
  /**
   * Orders edits that begin and end at the same offset: replacement, opening, closing, and the
   * announcement of a statement, which lands before all of them.
   */
  rank: 0 | 1 | 2 | 3;
  text: string;
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
      async resolveId(id, importer, options) {
        if (id === virtualEntry) return resolvedVirtualEntry;
        if (id === virtualIcons) return resolvedVirtualIcons;
        if (id === virtualTemplates) return resolvedVirtualTemplates;
        if (id !== frameworkPackage) return undefined;
        // A slide document outside any project has no node_modules of its own, so it uses the
        // FrameSeq that is serving it.
        const resolved = await this.resolve(id, importer, { ...options, skipSelf: true });
        return resolved ?? frameworkEntry;
      },
      async load(id) {
        if (id === resolvedVirtualIcons) {
          // A preview has every icon at hand, so any name works while the deck is written; a
          // build carries only the icons its modules name, filled in when the bundle is written.
          return serving
            ? `globalThis.__frameseqIcons = ${JSON.stringify(iconSet())};\nglobalThis.__frameseqIconsComplete = true;\n`
            : `globalThis.__frameseqIcons = ${iconSetPlaceholder};\nglobalThis.__frameseqIconsComplete = ${iconsCompletePlaceholder};\n`;
        }
        // A bibliography imported from a .bib file arrives as entries the runtime can cite.
        if (/\.bib$/i.test(id.split("?")[0])) {
          const path = id.split("?")[0];
          this.addWatchFile(path);
          return `export default ${JSON.stringify(parseBibtex(await readFile(path, "utf8")))};`;
        }
        if (id === resolvedVirtualTemplates) return templatesModule();
        if (id !== resolvedVirtualEntry) return undefined;
        return `export { default } from ${JSON.stringify(normalizedEntry)};`;
      },
      buildStart() {
        namedIcons.clear();
        iconsAtRuntime = false;
      },
      renderChunk(code) {
        if (!code.includes(iconSetPlaceholder)) return undefined;
        const icons = iconSet() as Record<string, string>;
        const included = iconsAtRuntime
          ? icons
          : Object.fromEntries([...namedIcons].sort().map((name) => [name, icons[name]]));
        return {
          code: code
            .replace(iconSetPlaceholder, JSON.stringify(included))
            .replace(iconsCompletePlaceholder, String(iconsAtRuntime)),
          map: null,
        };
      },
      configResolved(config) {
        serving = config.command === "serve";
        // The CLI builds its own throwaway copy to check or export, and marks it too, so an
        // error or a layout issue found there can name the line that caused it.
        marksEnabled = config.command === "serve" || process.env.FRAMESEQ_SOURCE_MARKS === "1";
      },
      configureServer(server) {
        // A Studio that is not shared answers this computer alone. With the phone remote on, the
        // local network reaches the server all the same, and may see the slides and follow them,
        // but not write them or read anything else.
        const sharesSlidesOnly = studioEnabled && !studioRemote;
        if (sharesSlidesOnly && remoteServerEnabled) {
          server.middlewares.use((request, response, next) => {
            if (loopbackAddress(request.socket.remoteAddress) || servedToNetwork(server, request.url)) {
              next();
              return;
            }
            response.statusCode = 403;
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.end("Only the slides are shared with the phone remote.");
          });
        }

        // Vite watches files with chokidar, which reports one change of a file in any 50 ms and
        // drops the rest, with no event once they stop. Written twice in quick succession, as when
        // the Studio keeps its own version just after another program wrote the file, the slide
        // document would go on being served as the first write: the preview and the slide rail
        // would show it, and the Studio would take it for what is on disk. So the document is read
        // when a change is reported and again once that window has passed, and a change chokidar
        // swallowed in between is reported after all.
        let recheck: ReturnType<typeof setTimeout> | undefined;
        let closed = false;
        const readEntry = () => readFile(entry, "utf8").catch(() => undefined);
        server.watcher.on("change", (file: string) => {
          if (pathKey(file) !== entryPathKey) return;
          const reported = readEntry();
          clearTimeout(recheck);
          recheck = setTimeout(() => {
            void Promise.all([reported, readEntry()]).then(([before, now]) => {
              if (!closed && now !== undefined && now !== before) server.watcher.emit("change", entry);
            });
          }, 100);
        });
        server.httpServer?.once("close", () => {
          closed = true;
          clearTimeout(recheck);
        });

        server.middlewares.use("/__frameseq/source-info", (request, response, next) => {
          if (request.method !== "GET") {
            next();
            return;
          }
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify({ entry: normalizedEntry }));
        });

        const settleEdit = (
          client: { send: (event: string, payload: unknown) => void },
          work: Promise<{ ok: boolean; reason?: string }>,
          undo = false,
        ): void => {
          void work.then((result) => {
            if (!result.ok && result.reason) server.config.logger.warn(`FrameSeq: ${result.reason}`);
            client.send(sourceEditResultEvent, result);
          }).catch((error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            server.config.logger.error(`FrameSeq could not write the slide document: ${reason}`);
            client.send(sourceEditResultEvent, { ok: false, undo, reason });
          });
        };

        const networkClients = new WeakSet<object>();
        if (sharesSlidesOnly) {
          server.ws.on("connection", (socket, request) => {
            if (!loopbackAddress(request.socket.remoteAddress)) networkClients.add(socket);
          });
        }
        const refused = { ok: false, reason: "Only the computer running FrameSeq Studio can change the slides." };

        server.ws.on(sourceEditEvent, (payload, client) => {
          if (networkClients.has(client.socket)) {
            client.send(sourceEditResultEvent, refused);
            return;
          }
          const request = payload as { move?: unknown; remove?: unknown } | null;
          settleEdit(client, request?.remove
            ? applyIncomingRemove(entry, payload)
            : request?.move
              ? applyIncomingMove(entry, payload)
              : applyIncomingEdits(entry, payload));
        });

        server.ws.on(sourceUndoEvent, (_payload, client) => {
          if (networkClients.has(client.socket)) {
            client.send(sourceEditResultEvent, { ...refused, undo: true });
            return;
          }
          settleEdit(client, undoLastEdit(entry), true);
        });

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
        if (!serving && projectModule(id)) {
          for (const name of iconNamesIn(source)) namedIcons.add(name);
          if (namesIconsAtRuntime(source)) iconsAtRuntime = true;
        }
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
        // A template of the person's own runs as a slide document too, for its cover in the Studio.
        const template = studioEnabled && /[?&]frameseq-template\b/.test(id);
        if (idPathKey !== entryPathKey && !template) return undefined;
        const document = template ? normalizedId : entry;

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
              const absolutePath = resolve(dirname(document), replacement.source);
              const relativePath = normalizePath(relative(dirname(document), absolutePath));
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
            const absolutePath = resolve(dirname(document), replacement.source);
            const relativePath = normalizePath(relative(dirname(document), absolutePath));
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

        const marks: SourceMark[] = marksEnabled && !template ? sourceMarks(source, normalizedEntry) : [];
        const edits: SourceEdit[] = [
          ...compiledReplacements.map((replacement) => ({
            start: replacement.start,
            end: replacement.end,
            rank: 0 as const,
            text: replacement.code,
          })),
          ...marks.flatMap((mark) => markEdits(mark) as SourceEdit[]),
          ...(marksEnabled && !template ? statementEdits(source, normalizedEntry) as SourceEdit[] : []),
        ];
        transformedSource = applySourceEdits(transformedSource, edits);

        const importsFramework = /(?:from\s*|import\s*)["']@pride7\/frameseq["']/.test(source);
        const typstImport = typstSourceReplacements.length > 0
          ? "import { typstSvg as __frameSeqTypstSvg } from \"@pride7/frameseq\";\n"
          : "";
        const latexImport = latexSourceReplacements.length > 0
          ? "import { latexSvg as __frameSeqLatexSvg } from \"@pride7/frameseq\";\n"
          : "";
        const markImport = marksEnabled
          ? "import { markSource as __frameSeqMark, markStatement as __frameSeqStatement } from \"@pride7/frameseq\";\n"
          : "";
        // First, so the icons are in place before any module of the deck asks for one.
        const iconImport = `import ${JSON.stringify(virtualIcons)};\n`;
        const internalImports = `${iconImport}${typstImport}${latexImport}${markImport}`;
        const hasDefaultExport = /\bexport\s+default\b/.test(source);
        const prelude = `import { ${documentCommands.join(", ")}, getActivePresentation as __frameSeqSlides } from "@pride7/frameseq";\n`;
        const postlude = hasDefaultExport ? "" : "\nexport default __frameSeqSlides();\n";
        const code = importsFramework
          ? `${internalImports}${transformedSource}`
          : `${internalImports}${prelude}${transformedSource}${postlude}`;
        // Vite compiles TypeScript by the file's extension, so an .fsq document, TypeScript all
        // the same, is compiled here.
        if (!/\.fsq$/i.test(document)) return { code, map: null };
        const compiled = await transformWithEsbuild(code, document, { loader: "ts", sourcemap: false });
        return { code: compiled.code, map: null };
      },
    },
    studioPlugin({
      entry,
      packageRoot,
      cliPath: resolve(packageRoot, "scripts", "frameseq.mjs"),
      enabled: studioEnabled,
      allowRemote: studioRemote,
      phoneRemote: studioEnabled && remoteServerEnabled,
      start: studioStart,
      quitOnClose: studioEnabled && process.env.FRAMESEQ_STUDIO_QUIT_ON_CLOSE === "1",
      remember: process.env.FRAMESEQ_STUDIO_WINDOW !== "0",
    }),
    tailwindcss(),
  ],
  optimizeDeps: studioEnabled ? { include: studioDependencies } : undefined,
  // The standalone app may be installed where its own folder is not for writing, so the
  // dependency cache lives with the rest of FrameSeq's per-user files.
  cacheDir: runsFromBundle() ? resolve(configDirectory(), "vite-cache") : undefined,
  server: {
    // The phone remote reaches the server over the local network.
    ...(remoteServerEnabled ? { host: true } : {}),
    open: openBrowser,
    fs: {
      // The Studio draws the covers of the person's own templates, kept in a folder of their own.
      allow: [packageRoot, dirname(entry), ...(studioEnabled ? [templateDirectory()] : [])],
    },
    // In a checkout, the app's builds and the Rust window's target folder are no source; on
    // Windows a watched folder cannot even be renamed, as the app's build does with its own.
    watch: {
      ignored: ["**/output/**", "**/desktop/target/**"],
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
