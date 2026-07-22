#!/usr/bin/env node

import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import puppeteer from "puppeteer";
import { build as viteBuild, createServer, preview } from "vite";
import { exportPptx } from "./pptx-export.mjs";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configFile = resolve(packageRoot, "vite.config.ts");

function help() {
  console.log(`FrameSeq

Usage:
  frameseq dev [file] [--host] [--remote]
                                      Preview slides with hot reload
  frameseq build [file] [--output dir] [--single-file]
                                      Build a static HTML presentation
  frameseq pdf [file] [--output path] Export slides to PDF
  frameseq pptx [file] [--output path] [--flatten]
                                      Export an editable or flattened PowerPoint
  frameseq check [file] [--json] [--strict]
                                      Check the rendered layout
  frameseq new [file]                 Create a starter .slides.ts file

Examples:
  frameseq dev talk.slides.ts
  frameseq dev talk.slides.ts --host
  frameseq dev talk.slides.ts --remote
  frameseq build talk.slides.ts
  frameseq build talk.slides.ts --single-file
  frameseq pdf talk.slides.ts
  frameseq pptx talk.slides.ts
  frameseq pptx talk.slides.ts --flatten
  frameseq check talk.slides.ts
  frameseq new quarterly.slides.ts`);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positionalFile(args) {
  const optionsWithValues = new Set(["--output"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (optionsWithValues.has(argument)) {
      index += 1;
      continue;
    }
    if (!argument.startsWith("-")) return argument;
  }
  return "slides.ts";
}

async function ensureFile(path) {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`Slides file not found: ${path}`);
  }
}

function pdfName(entry) {
  const file = basename(entry, extname(entry));
  return `${file.replace(/\.slides$/, "")}.pdf`;
}

async function createSlidesFile(target) {
  try {
    await access(target, constants.F_OK);
    throw new Error(`Refusing to overwrite existing file: ${target}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Refusing")) throw error;
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `presentation("My Talk");

slide({ name: "Cover" }).cover();
text("Presentation title").hero();
text("A short description").subtitle();
text("Your name").author();

slide("First idea")
  .notes("Introduce the main idea and pause before the supporting points.");
text("Explain the idea in one clear sentence.");
bullets(
  "First point",
  "Second point",
  "Third point",
);
`, "utf8");
  console.log(`Created ${target}`);
}

async function startDevelopmentServer(entry, { hostEnabled = false, remoteEnabled = false } = {}) {
  process.env.FRAMESEQ_ENTRY = entry;
  if (remoteEnabled) process.env.FRAMESEQ_REMOTE = "1";
  else delete process.env.FRAMESEQ_REMOTE;
  const server = await createServer({
    configFile,
    root: packageRoot,
    server: hostEnabled ? { host: true } : undefined,
  });
  await server.listen();
  server.printUrls();

  const close = async () => {
    await server.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

function assetMimeType(path) {
  const types = {
    ".css": "text/css",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function resolveBuildAsset(buildDirectory, containingFile, url) {
  const cleanUrl = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  const assetPath = cleanUrl.startsWith("/")
    ? resolve(buildDirectory, cleanUrl.slice(1))
    : resolve(dirname(containingFile), cleanUrl);
  const relativePath = relative(buildDirectory, assetPath);
  if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`Single-file asset is outside the build directory: ${url}`);
  }
  return assetPath;
}

async function dataUrl(path) {
  const content = await readFile(path);
  return `data:${assetMimeType(path)};base64,${content.toString("base64")}`;
}

async function replaceAsync(source, pattern, replacement) {
  let output = "";
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    output += source.slice(cursor, match.index);
    output += await replacement(match);
    cursor = match.index + match[0].length;
  }
  return output + source.slice(cursor);
}

async function inlineCssAssets(css, cssPath, buildDirectory) {
  return replaceAsync(
    css,
    /url\(\s*(["']?)([^"')]+)\1\s*\)/g,
    async (match) => {
      const url = match[2];
      if (/^(?:data:|https?:|#)/i.test(url)) return match[0];
      const assetPath = resolveBuildAsset(buildDirectory, cssPath, url);
      return `url("${await dataUrl(assetPath)}")`;
    },
  );
}

async function buildFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await buildFiles(path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

async function inlineReferencedBuildAssets(html, htmlPath, buildDirectory) {
  let output = html;
  for (const path of await buildFiles(buildDirectory)) {
    if (path === htmlPath || [".css", ".js"].includes(extname(path).toLowerCase())) continue;
    const assetUrl = relative(buildDirectory, path).replaceAll("\\", "/");
    if (!output.includes(assetUrl)) continue;
    const embedded = await dataUrl(path);
    output = output
      .replaceAll(`./${assetUrl}`, embedded)
      .replaceAll(`/${assetUrl}`, embedded)
      .replaceAll(assetUrl, embedded);
  }
  return output;
}

async function createSingleFileBuild(buildDirectory) {
  const htmlPath = resolve(buildDirectory, "index.html");
  let html = await readFile(htmlPath, "utf8");

  html = await replaceAsync(
    html,
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
    async (match) => {
      const cssPath = resolveBuildAsset(buildDirectory, htmlPath, match[1]);
      const css = await inlineCssAssets(await readFile(cssPath, "utf8"), cssPath, buildDirectory);
      return `<style>${css.replaceAll("</style", "<\\/style")}</style>`;
    },
  );

  html = await replaceAsync(
    html,
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,
    async (match) => {
      const scriptPath = resolveBuildAsset(buildDirectory, htmlPath, match[2]);
      const script = (await readFile(scriptPath, "utf8")).replaceAll("</script", "<\\/script");
      const attributes = `${match[1]}${match[3]}`
        .replace(/\s+crossorigin(?:=["'][^"']*["'])?/gi, "");
      return `<script${attributes}>${script}</script>`;
    },
  );

  html = await replaceAsync(
    html,
    /<link\b[^>]*\brel=["']icon["'][^>]*>/gi,
    async (match) => {
      const href = match[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (!href || /^(?:data:|https?:)/i.test(href)) return match[0];
      const iconPath = resolveBuildAsset(buildDirectory, htmlPath, href);
      return match[0].replace(href, await dataUrl(iconPath));
    },
  );

  html = await inlineReferencedBuildAssets(html, htmlPath, buildDirectory);

  if (/<script\b[^>]*\bsrc=|<link\b[^>]*\brel=["']stylesheet["']/i.test(html)) {
    throw new Error("Single-file build still contains external script or stylesheet references");
  }

  await writeFile(htmlPath, html, "utf8");
  for (const entry of await readdir(buildDirectory, { withFileTypes: true })) {
    if (entry.name === "index.html") continue;
    await rm(resolve(buildDirectory, entry.name), { recursive: true, force: true });
  }
  return htmlPath;
}

async function buildHtml(entry, requestedOutput, singleFile = false) {
  const buildDirectory = resolve(requestedOutput ?? resolve(process.cwd(), "dist"));
  process.env.FRAMESEQ_ENTRY = entry;
  process.env.FRAMESEQ_BUILD_DIR = buildDirectory;

  await viteBuild({ configFile, root: packageRoot });
  if (singleFile) {
    const outputPath = await createSingleFileBuild(buildDirectory);
    console.log(`Single-file HTML presentation built at ${outputPath}`);
  } else {
    console.log(`HTML presentation built in ${buildDirectory}`);
  }
}

async function exportPdf(entry, requestedOutput) {
  const buildDirectory = resolve(process.cwd(), "tmp", "frameseq-build");
  process.env.FRAMESEQ_ENTRY = entry;
  process.env.FRAMESEQ_BUILD_DIR = buildDirectory;

  await viteBuild({ configFile, root: packageRoot });

  const server = await preview({
    configFile,
    root: packageRoot,
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: false,
    },
  });

  const address = server.httpServer.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Could not determine preview server address");
  }

  const defaultOutput = resolve(process.cwd(), "output", "pdf", pdfName(entry));
  const outputPath = resolve(requestedOutput ?? defaultOutput);
  await mkdir(dirname(outputPath), { recursive: true });

  const browser = await puppeteer.launch(puppeteerLaunchOptions());
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/?print=1`, {
      waitUntil: "networkidle0",
    });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMediaType("screen");

    const dimensions = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        width: Number.parseFloat(styles.getPropertyValue("--slide-width")),
        height: Number.parseFloat(styles.getPropertyValue("--slide-height")),
      };
    });

    await page.pdf({
      path: outputPath,
      width: `${dimensions.width}px`,
      height: `${dimensions.height}px`,
      printBackground: true,
      preferCSSPageSize: true,
    });
    console.log(`PDF exported to ${outputPath}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

function printLayoutReport(report) {
  console.log(`FrameSeq layout check: ${report.file}`);
  if (report.issues.length === 0) {
    console.log(`OK ${report.summary.slides} slides checked; no layout issues found.`);
    return;
  }

  for (const issue of report.issues) {
    console.log(`\n${issue.severity.toUpperCase()} Slide ${issue.slide.index} "${issue.slide.label}" [${issue.rule}]`);
    console.log(`  ${issue.message}`);
    console.log(`  Object: ${issue.element.type} ${issue.element.path}${issue.element.text ? ` "${issue.element.text}"` : ""}`);
    for (const suggestion of issue.suggestions) {
      console.log(`  Suggestion: ${suggestion}`);
    }
  }

  console.log(`\nChecked ${report.summary.slides} slides: ${report.summary.errors} errors, ${report.summary.warnings} warnings.`);
}

async function checkLayout(entry, { json = false, strict = false } = {}) {
  const buildDirectory = resolve(process.cwd(), "tmp", "frameseq-check");
  process.env.FRAMESEQ_ENTRY = entry;
  process.env.FRAMESEQ_BUILD_DIR = buildDirectory;

  await viteBuild({
    configFile,
    root: packageRoot,
    logLevel: "silent",
  });

  const server = await preview({
    configFile,
    root: packageRoot,
    logLevel: "silent",
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: false,
    },
  });

  const address = server.httpServer.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Could not determine layout-check preview server address");
  }

  const browser = await puppeteer.launch(puppeteerLaunchOptions());
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/?print=1`, {
      waitUntil: "networkidle0",
    });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate(() => document.fonts.ready);

    const results = await page.evaluate(() => {
      const tolerance = 1;
      const issues = [];
      const canvases = Array.from(document.querySelectorAll(".frameseq-slide"));
      const measurableTypes = new Set([
        "text",
        "image",
        "code",
        "equation",
        "typst",
        "rect",
        "circle",
      ]);
      const textTypes = new Set(["text", "code", "equation", "rect", "circle"]);
      const clippingValues = new Set(["hidden", "clip"]);

      const rounded = (value) => Math.round(value * 10) / 10;
      const excerpt = (element) => (element.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      const overflow = (inner, outer) => ({
        left: Math.max(0, outer.left - inner.left),
        right: Math.max(0, inner.right - outer.right),
        top: Math.max(0, outer.top - inner.top),
        bottom: Math.max(0, inner.bottom - outer.bottom),
      });
      const hasOverflow = (value) => Object.values(value).some((amount) => amount > tolerance);
      const contentBounds = (element) => {
        if (!element.textContent?.trim()) return element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const bounds = range.getBoundingClientRect();
        return bounds.width > 0 || bounds.height > 0
          ? bounds
          : element.getBoundingClientRect();
      };
      const sides = (value) => Object.entries(value)
        .filter(([, amount]) => amount > tolerance)
        .map(([side, amount]) => `${rounded(amount)}px on the ${side}`)
        .join(", ");

      canvases.forEach((canvas, slideIndex) => {
        const canvasBounds = canvas.getBoundingClientRect();
        const slide = {
          index: slideIndex + 1,
          label: canvas.dataset.frameseqSlideLabel || `Slide ${slideIndex + 1}`,
        };
        const nodes = Array.from(canvas.querySelectorAll("[data-frameseq-node]"));

        for (const element of nodes) {
          const type = element.dataset.frameseqNode ?? "unknown";
          if (type === "slide" || type === "line" || type === "spacer") continue;
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          if (style.display === "none" || style.visibility === "hidden"
            || bounds.width === 0 || bounds.height === 0) continue;
          if (!measurableTypes.has(type) && style.position !== "absolute") continue;

          const text = excerpt(element);
          const elementInfo = {
            type,
            path: element.dataset.frameseqPath ?? "unknown",
            text,
          };
          const visualBounds = textTypes.has(type) && text
            ? contentBounds(element)
            : bounds;
          const combinedBounds = {
            left: Math.min(bounds.left, visualBounds.left),
            right: Math.max(bounds.right, visualBounds.right),
            top: Math.min(bounds.top, visualBounds.top),
            bottom: Math.max(bounds.bottom, visualBounds.bottom),
          };
          const canvasOverflow = overflow(combinedBounds, canvasBounds);

          if (hasOverflow(canvasOverflow)) {
            issues.push({
              severity: "error",
              rule: "canvas-overflow",
              slide,
              element: elementInfo,
              message: `${type === "text" ? "Text" : "Object"} exceeds the slide canvas by ${sides(canvasOverflow)}.`,
              details: Object.fromEntries(
                Object.entries(canvasOverflow).map(([side, amount]) => [side, rounded(amount)]),
              ),
              suggestions: [
                "Move the object inward or reduce its width, height, or font size.",
              ],
            });
          }

          if (textTypes.has(type) && text) {
            let clipping = undefined;
            let clippingAncestor = element;
            while (clippingAncestor && clippingAncestor !== canvas) {
              const clippingStyle = getComputedStyle(clippingAncestor);
              const clipsX = clippingValues.has(clippingStyle.overflowX);
              const clipsY = clippingValues.has(clippingStyle.overflowY);
              if (clipsX || clipsY) {
                const ancestorBounds = clippingAncestor.getBoundingClientRect();
                const clipped = overflow(visualBounds, ancestorBounds);
                const relevant = {
                  left: clipsX ? clipped.left : 0,
                  right: clipsX ? clipped.right : 0,
                  top: clipsY ? clipped.top : 0,
                  bottom: clipsY ? clipped.bottom : 0,
                };
                if (hasOverflow(relevant)) {
                  clipping = relevant;
                  break;
                }
              }
              clippingAncestor = clippingAncestor.parentElement;
            }

            if (clipping) {
              issues.push({
                severity: "error",
                rule: "text-clipped",
                slide,
                element: elementInfo,
                message: `Text is clipped by ${sides(clipping)}.`,
                details: Object.fromEntries(
                  Object.entries(clipping).map(([side, amount]) => [side, rounded(amount)]),
                ),
                suggestions: [
                  "Increase the text box size, reduce the font size, or shorten the content.",
                ],
              });
            }

            if (!element.classList.contains("frameseq-list-marker")) {
              const fontSize = Number.parseFloat(style.fontSize);
              const heading = element.classList.contains("frameseq-slide-title")
                || element.classList.contains("frameseq-cover-title");
              const minimum = heading ? 24 : 14;
              if (Number.isFinite(fontSize) && fontSize < minimum) {
                issues.push({
                  severity: "warning",
                  rule: "font-too-small",
                  slide,
                  element: elementInfo,
                  message: `Font size ${rounded(fontSize)}px is below the recommended ${minimum}px minimum.`,
                  details: {
                    fontSize: rounded(fontSize),
                    recommendedMinimum: minimum,
                  },
                  suggestions: [
                    `Increase the font size to at least ${minimum}px.`,
                  ],
                });
              }
            }
          }
        }
      });

      return {
        canvas: {
          width: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--slide-width")),
          height: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--slide-height")),
        },
        slides: canvases.length,
        issues,
      };
    });

    const errors = results.issues.filter((issue) => issue.severity === "error").length;
    const warnings = results.issues.filter((issue) => issue.severity === "warning").length;
    const report = {
      version: 1,
      file: (relative(process.cwd(), entry) || basename(entry)).replaceAll("\\", "/"),
      canvas: results.canvas,
      summary: {
        slides: results.slides,
        errors,
        warnings,
      },
      issues: results.issues,
    };

    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printLayoutReport(report);
    }
    if (errors > 0 || (strict && warnings > 0)) process.exitCode = 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

const [, , command] = process.argv;
const file = positionalFile(process.argv.slice(3));

try {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
  } else if (command === "new") {
    await createSlidesFile(resolve(process.cwd(), file));
  } else if (command === "dev" || command === "build" || command === "pdf" || command === "pptx" || command === "check") {
    const entry = resolve(process.cwd(), file);
    await ensureFile(entry);
    if (command === "dev") {
      const remoteEnabled = process.argv.includes("--remote");
      const hostEnabled = process.argv.includes("--host") || remoteEnabled;
      await startDevelopmentServer(entry, { hostEnabled, remoteEnabled });
    }
    if (command === "build") {
      await buildHtml(entry, option("--output"), process.argv.includes("--single-file"));
    }
    if (command === "pdf") await exportPdf(entry, option("--output"));
    if (command === "pptx") {
      await exportPptx({
        entry,
        requestedOutput: option("--output"),
        flatten: process.argv.includes("--flatten"),
        packageRoot,
        configFile,
      });
    }
    if (command === "check") {
      await checkLayout(entry, {
        json: process.argv.includes("--json"),
        strict: process.argv.includes("--strict"),
      });
    }
  } else {
    help();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
