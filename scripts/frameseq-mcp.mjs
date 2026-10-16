import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import process from "node:process";
import puppeteer from "puppeteer";
import { createServer } from "vite";
import { DocumentRunError, deckReady, displayPath, watchDeck } from "./document-errors.mjs";
import { inspectSlides } from "./frameseq-inspect.mjs";
import { collectLayoutIssues } from "./layout-rules.mjs";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import { createStudioLanguage } from "./studio-language.mjs";

/**
 * `frameseq mcp`: a Model Context Protocol server on standard input and output, so a coding
 * agent such as Claude Code or Codex sees a presentation as it renders, not only its source.
 * It outlines the slides, checks them as the Studio does (TypeScript, names, formulas, the
 * document's own errors, and the layout rules), shows a slide as a picture, and hands over
 * FrameSeq's guide.
 *
 * The slides render in a development server of its own, started on first use, or in a running
 * Studio's when `preview` names one, as the Studio's assistant does.
 */

// The protocol versions this server speaks, newest first; a client asking for another gets the newest.
const protocolVersions = ["2025-06-18", "2025-03-26", "2024-11-05"];
const maximumScreenshots = 6;
// Every tool only reads and renders, which lets an agent such as Codex call them without asking.
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const tools = [
  {
    name: "outline",
    annotations: readOnly,
    description: "List the presentation's slides: number, title, layout, the source lines that write each one, and how many objects it holds. Read it before editing, to find the lines of the slide you are asked about.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "check",
    annotations: readOnly,
    description: "Check the presentation as FrameSeq Studio does: TypeScript errors, names that refer to nothing, formulas in quoted strings whose backslashes became escapes, an error the document throws while it runs, and the layout rules (content beyond the canvas, clipped text, type too small, empty slides). Each finding gives its source line. Run it after every edit and fix what it reports.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "screenshot",
    annotations: readOnly,
    description: `Show slides as they render, as PNG pictures, to judge layout, balance, and legibility. Give one slide number, or several, at most ${maximumScreenshots}.`,
    inputSchema: {
      type: "object",
      properties: {
        slide: { type: "integer", minimum: 1, description: "The slide to show, counted from 1." },
        slides: { type: "array", items: { type: "integer", minimum: 1 }, maxItems: maximumScreenshots, description: "Several slides to show, counted from 1." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "guide",
    annotations: readOnly,
    description: "Read FrameSeq's authoring guide: how a presentation (an .fsq or .slides.ts file, both TypeScript) is written, its commands, layouts, text roles, and rules. Read it before writing FrameSeq for the first time.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export async function startMcpServer({ entry, packageRoot, configFile, preview }) {
  // Standard output carries the protocol alone; anything else a module prints goes to the log.
  console.log = (...args) => console.error(...args);
  console.info = console.log;
  const version = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")).version;
  let renderer;
  let language;
  let queue = Promise.resolve();

  /** The browser, and the server the slides render in, started on first use. */
  async function render() {
    renderer ??= (async () => {
      let server;
      let origin = preview?.replace(/\/+$/, "");
      if (!origin) {
        process.env.FRAMESEQ_ENTRY = entry;
        process.env.FRAMESEQ_SOURCE_MARKS = "1";
        process.env.FRAMESEQ_OPEN_BROWSER = "0";
        server = await createServer({ configFile, root: packageRoot, logLevel: "silent", server: { host: "127.0.0.1", hmr: false } });
        await server.listen();
        const address = server.httpServer.address();
        origin = `http://127.0.0.1:${address.port}`;
      }
      const browser = await puppeteer.launch(puppeteerLaunchOptions());
      const page = await browser.newPage();
      await watchDeck(page);
      return { origin, browser, page, server };
    })();
    return renderer;
  }

  /** The slides as the file now stands, all on one page, as printing lays them out. */
  async function renderedPage() {
    const { origin, page } = await render();
    await page.goto(`${origin}/?print=1`, { waitUntil: "networkidle0", timeout: 120_000 });
    await deckReady(page, entry);
    await page.evaluate(() => document.fonts.ready);
    return page;
  }

  async function outline() {
    const report = await inspectSlides(entry);
    const lines = [`${report.presentation?.title ?? "FrameSeq"}: ${report.slides.length} slide${report.slides.length === 1 ? "" : "s"} in ${displayPath(entry)}`];
    for (const slide of report.slides) {
      const lineRange = slide.source.endLine > slide.source.line ? `lines ${slide.source.line}-${slide.source.endLine}` : `line ${slide.source.line}`;
      lines.push(`${slide.index}. ${slide.label || "(untitled)"} [${slide.layout}] ${lineRange}, ${slide.objectCount} object${slide.objectCount === 1 ? "" : "s"}${slide.notes ? ", speaker notes" : ""}`);
    }
    return [{ type: "text", text: lines.join("\n") }];
  }

  async function check() {
    const source = await readFile(entry, "utf8");
    const lineOf = (offset) => source.slice(0, offset).split("\n").length;
    const sections = [];

    language ??= createStudioLanguage({ entry, packageRoot });
    const typescript = language.diagnostics(source).filter((item) => item.severity !== "info");
    sections.push(typescript.length === 0
      ? "TypeScript: no errors."
      : [`TypeScript: ${typescript.length} problem${typescript.length === 1 ? "" : "s"}`, ...typescript.map((item) => `  line ${lineOf(item.from)} (${item.severity}): ${item.message}`)].join("\n"));

    let page;
    try {
      page = await renderedPage();
    } catch (error) {
      if (!(error instanceof DocumentRunError)) throw error;
      sections.push(`The document throws while it runs, so no slide could be checked:\n${error.message}`);
      return [{ type: "text", text: sections.join("\n\n") }];
    }

    const { names, formulas } = await page.evaluate(async (text) => {
      const { formulaEscapes, nameDiagnostics } = await import("/src/source-names.ts");
      return { names: nameDiagnostics(text), formulas: formulaEscapes(text) };
    }, source).catch(() => ({ names: [], formulas: [] }));
    if (names.length > 0) {
      sections.push([`Names: ${names.length} problem${names.length === 1 ? "" : "s"}`, ...names.map((item) => `  line ${lineOf(item.start)} (${item.severity}): ${item.message}`)].join("\n"));
    }
    if (formulas.length > 0) {
      sections.push([`Formulas: ${formulas.length} problem${formulas.length === 1 ? "" : "s"}`, ...formulas.map((item) => `  line ${lineOf(item.start)} (warning): ${item.message}`)].join("\n"));
    }

    const results = await page.evaluate(collectLayoutIssues);
    if (results.issues.length === 0) {
      sections.push(`Layout: ${results.slides} slides checked, no problems.`);
    } else {
      const describe = (issue) => {
        const line = issue.element?.source?.line ?? issue.source?.line;
        const object = issue.element ? `${issue.element.type}${issue.element.text ? ` "${issue.element.text}"` : ""}` : "";
        return [
          `  slide ${issue.slide.index} "${issue.slide.label}"${line ? `, line ${line}` : ""} (${issue.severity}, ${issue.rule}): ${issue.message}${object ? ` [${object}]` : ""}`,
          ...issue.suggestions.map((suggestion) => `    suggestion: ${suggestion}`),
        ].join("\n");
      };
      sections.push([`Layout: ${results.issues.length} problem${results.issues.length === 1 ? "" : "s"} in ${results.slides} slides`, ...results.issues.map(describe)].join("\n"));
    }
    return [{ type: "text", text: sections.join("\n\n") }];
  }

  async function screenshot(input) {
    const wanted = [...new Set([...(input.slides ?? []), ...(input.slide ? [input.slide] : [])])];
    if (wanted.length === 0) throw new Error("Give the slide to show, such as { \"slide\": 1 }.");
    if (wanted.length > maximumScreenshots) throw new Error(`Show at most ${maximumScreenshots} slides at once.`);
    let page;
    try {
      page = await renderedPage();
    } catch (error) {
      if (error instanceof DocumentRunError) throw new Error(`The document throws while it runs, so there is nothing to show:\n${error.message}`);
      throw error;
    }
    const frames = await page.$$(".frameseq-slide-frame");
    // Titles come from the source, when it writes the slides one by one as they render.
    const written = (await inspectSlides(entry).catch(() => undefined))?.slides ?? [];
    const labels = written.length === frames.length ? written.map((slide) => slide.label) : [];
    const content = [];
    for (const number of wanted) {
      const frame = frames[number - 1];
      if (!frame) {
        content.push({ type: "text", text: `There is no slide ${number}; the presentation has ${frames.length}.` });
        continue;
      }
      const data = await frame.screenshot({ type: "png", encoding: "base64" });
      content.push({ type: "text", text: `Slide ${number} of ${frames.length}${labels[number - 1] ? `: ${labels[number - 1]}` : ""}` });
      content.push({ type: "image", data, mimeType: "image/png" });
    }
    return content;
  }

  async function guide() {
    return [{ type: "text", text: await readFile(join(packageRoot, "llms.txt"), "utf8") }];
  }

  const handlers = { outline, check, screenshot, guide };

  async function callTool(name, input) {
    const handler = handlers[name];
    if (!handler) return { isError: true, content: [{ type: "text", text: `There is no tool named ${name}.` }] };
    if (name !== "guide" && !existsSync(entry)) {
      return { isError: true, content: [{ type: "text", text: `There is no presentation at ${entry}.` }] };
    }
    try {
      return { content: await handler(input ?? {}) };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
    }
  }

  const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

  async function handle(message) {
    const { id, method, params } = message;
    if (method === "initialize") {
      const requested = params?.protocolVersion;
      return {
        protocolVersion: protocolVersions.includes(requested) ? requested : protocolVersions[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "frameseq", title: "FrameSeq", version },
        instructions: `FrameSeq presentation ${displayPath(entry)}. Read the guide tool before writing FrameSeq for the first time; use outline to find a slide's lines, and run check and screenshot after editing.`,
      };
    }
    if (method === "ping") return {};
    if (method === "tools/list") return { tools };
    if (method === "tools/call") {
      // One rendering page serves every call, so calls take turns.
      const result = queue.then(() => callTool(params?.name, params?.arguments));
      queue = result.catch(() => undefined);
      return result;
    }
    if (id === undefined) return undefined;
    throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }

  const input = createInterface({ input: process.stdin });
  input.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    // Notifications, such as notifications/initialized, need no answer.
    if (message.id === undefined || message.id === null) {
      void handle(message).catch(() => undefined);
      return;
    }
    handle(message).then(
      (result) => send({ id: message.id, result: result ?? {} }),
      (error) => send({ id: message.id, error: { code: error.code ?? -32603, message: error.message } }),
    );
  });

  const stop = async () => {
    const running = await renderer?.catch(() => undefined);
    await running?.browser.close().catch(() => undefined);
    await running?.server?.close().catch(() => undefined);
    process.exit(0);
  };
  input.on("close", () => void stop());
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
}
