#!/usr/bin/env node

import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import puppeteer from "puppeteer";
import { build as viteBuild, createServer, preview } from "vite";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configFile = resolve(packageRoot, "vite.config.ts");

function help() {
  console.log(`FrameSeq

Usage:
  frameseq dev [file]                 Preview a deck with hot reload
  frameseq build [file] [--output dir] Build a static HTML presentation
  frameseq pdf [file] [--output path] Export a deck to PDF
  frameseq new [file]                 Create a starter .slides.ts file

Examples:
  frameseq dev talk.slides.ts
  frameseq build talk.slides.ts
  frameseq pdf talk.slides.ts
  frameseq new quarterly.slides.ts`);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
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

async function createDeckFile(target) {
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

slide("First idea");
text("Explain the idea in one clear sentence.");
bullets(
  "First point",
  "Second point",
  "Third point",
);
`, "utf8");
  console.log(`Created ${target}`);
}

async function startDevelopmentServer(entry) {
  process.env.FRAMESEQ_ENTRY = entry;
  const server = await createServer({
    configFile,
    root: packageRoot,
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

async function buildHtml(entry, requestedOutput) {
  const buildDirectory = resolve(requestedOutput ?? resolve(process.cwd(), "dist"));
  process.env.FRAMESEQ_ENTRY = entry;
  process.env.FRAMESEQ_BUILD_DIR = buildDirectory;

  await viteBuild({ configFile, root: packageRoot });
  console.log(`HTML presentation built in ${buildDirectory}`);
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

  const browser = await puppeteer.launch({ headless: true });
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

const [, , command, file = "slides.ts"] = process.argv;

try {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
  } else if (command === "new") {
    await createDeckFile(resolve(process.cwd(), file));
  } else if (command === "dev" || command === "build" || command === "pdf") {
    const entry = resolve(process.cwd(), file);
    await ensureFile(entry);
    if (command === "dev") await startDevelopmentServer(entry);
    if (command === "build") await buildHtml(entry, option("--output"));
    if (command === "pdf") await exportPdf(entry, option("--output"));
  } else {
    help();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
