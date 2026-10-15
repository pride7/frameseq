import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";

/** One-based line and column of a character offset. */
export function lineColumn(source, offset) {
  let line = 1;
  let lineStart = 0;
  const end = Math.min(Math.max(offset, 0), source.length);
  for (let index = 0; index < end; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
}

/** The line that caused a problem with the one before it, the way a compiler prints them. */
export function codeFrame(source, line) {
  const lines = source.split(/\r?\n/);
  const first = Math.max(line - 1, 1);
  const width = String(line).length;
  const rows = [];
  for (let number = first; number <= Math.min(line, lines.length); number += 1) {
    const marker = number === line ? ">" : " ";
    rows.push(`${marker} ${String(number).padStart(width)} | ${lines[number - 1]}`);
  }
  return rows.join("\n");
}

/**
 * The slide document stopped with an error before the deck could be drawn. Each problem names
 * the line it came from when the build recorded one, so the message reads like a compiler's.
 */
export class DocumentRunError extends Error {
  constructor(file, problems, frames = []) {
    const lines = problems.map((problem, index) => {
      const where = problem.source ? `${file}:${problem.source.line}:${problem.source.column}` : file;
      const frame = frames[index] ? `\n${frames[index]}` : "";
      return `${where}  error  ${problem.message}${frame}`;
    });
    super(lines.join("\n\n"));
    this.name = "DocumentRunError";
    this.file = file;
    this.problems = problems;
  }
}

/** A short path for messages: relative to where the command runs, or the file's own name. */
export function displayPath(entry) {
  return (relative(process.cwd(), entry) || basename(entry)).replaceAll("\\", "/");
}

/**
 * Locate what the page or the runtime reported against the slide document's text. A problem
 * arrives with character offsets: those of the command it concerns, or of the statement the
 * document was running when it threw.
 */
export async function locateProblems(entry, reported) {
  const source = await readFile(entry, "utf8").catch(() => "");
  const problems = [];
  const frames = [];
  for (const problem of reported) {
    const message = String(problem.message || "The slide document threw an error while it was being run.")
      .split("\n")
      .filter((line) => line.trim())
      .join("\n");
    if (source && Number.isInteger(problem.start)) {
      const location = lineColumn(source, problem.start);
      problems.push({ message, source: location });
      frames.push(codeFrame(source, location.line));
    } else {
      problems.push({ message });
      frames.push("");
    }
  }
  return new DocumentRunError(displayPath(entry), problems, frames);
}

/**
 * Prepare a page to report a document that cannot run. Call before navigating: the listener
 * has to be in place before the deck's scripts start, since an error thrown while the
 * document runs happens before anything else on the page.
 */
export async function watchDeck(page) {
  await page.evaluateOnNewDocument(() => {
    addEventListener("error", (event) => {
      if (window.__frameseqFailure) return;
      const error = event.error;
      const problems = Array.isArray(error?.problems) && error.problems.length > 0
        ? error.problems.map((problem) => ({
          message: String(problem.message ?? ""),
          start: problem.start,
          end: problem.end,
        }))
        : [{
          message: String(error?.message ?? event.message ?? ""),
          ...(window.__frameseqStatement ?? {}),
        }];
      window.__frameseqFailure = problems;
    }, true);
  });
}

/**
 * Wait for the deck on a page watched with watchDeck() to be ready, and throw a located
 * DocumentRunError at once when the document fails instead of waiting for a timeout.
 */
export async function deckReady(page, entry, timeout = 120_000) {
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true" || Boolean(window.__frameseqFailure),
    { timeout },
  );
  const failure = await page.evaluate(() => (
    document.documentElement.dataset.ready === "true" ? null : window.__frameseqFailure ?? null
  ));
  if (failure) throw await locateProblems(entry, failure);
}

/** The statement the runtime was running in this process when a server-side load threw. */
export function failedStatement() {
  const statement = globalThis.__frameseqStatement;
  return statement && Number.isInteger(statement.start) ? statement : undefined;
}

/** The problems a document error carries, or the one it is, with the statement it stopped in. */
export function reportedProblems(error) {
  if (Array.isArray(error?.problems) && error.problems.length > 0) return error.problems;
  return [{ message: error instanceof Error ? error.message : String(error), ...failedStatement() }];
}

/** A layout report for `frameseq check --json` that says why no layout could be checked. */
export function documentErrorReport(file, error) {
  const issues = error.problems.map((problem) => ({
    severity: "error",
    rule: "document-error",
    // Kept in the shape of a layout issue, so a reader of older reports finds the same fields.
    slide: { index: 0, label: "" },
    element: { type: "document", path: "", ...(problem.source ? { source: problem.source } : {}) },
    message: problem.message,
    ...(problem.source ? { source: problem.source } : {}),
    details: {},
    suggestions: ["Fix the error in the slide document; no slide could be checked until it runs."],
  }));
  return {
    version: 1,
    file,
    summary: { slides: 0, errors: issues.length, warnings: 0 },
    issues,
  };
}
