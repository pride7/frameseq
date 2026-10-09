import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { inspectSource } from "./frameseq-inspect.mjs";
import { documentStatements } from "./source-marks.mjs";
import { createStudioLanguage } from "./studio-language.mjs";

/** Pushed to the Studio whenever the slide document changes on disk, whoever changed it. */
export const studioSourceEvent = "frameseq:studio-source";

const maximumBody = 8 * 1024 * 1024;
const exportTimeout = 10 * 60_000;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".typ": "text/plain; charset=utf-8",
};

export const version = (text) => createHash("sha256").update(text).digest("hex").slice(0, 20);

const baseName = (entry) => basename(entry, extname(entry)).replace(/\.slides$/, "");

/**
 * What each export runs and where it writes. The locations are the CLI's own defaults, so a
 * file exported from the Studio lands exactly where `frameseq pdf` and the rest would put it.
 */
function exportPlan(format, entry, cwd) {
  const name = baseName(entry);
  const plans = {
    html: { label: "HTML site", args: ["build"], output: resolve(cwd, "dist"), directory: true },
    "html-single": {
      label: "Single HTML file",
      args: ["build", "--single-file"],
      output: resolve(cwd, "dist"),
      file: resolve(cwd, "dist", "index.html"),
    },
    pdf: { label: "PDF", args: ["pdf"], output: resolve(cwd, "output", "pdf", `${name}.pdf`) },
    pptx: { label: "PowerPoint", args: ["pptx"], output: resolve(cwd, "output", "pptx", `${name}.pptx`) },
    "pptx-flat": {
      label: "Flattened PowerPoint",
      args: ["pptx", "--flatten"],
      output: resolve(cwd, "output", "pptx", `${name}.pptx`),
    },
    typst: { label: "Typst", args: ["typst"], output: resolve(cwd, "output", "typst", `${name}.typ`) },
  };
  const plan = plans[format];
  if (!plan) return undefined;
  return { ...plan, file: plan.directory ? undefined : (plan.file ?? plan.output) };
}

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBody) {
      throw Object.assign(new Error("The request is too large."), { status: 413 });
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw Object.assign(new Error("The request is not JSON."), { status: 400 });
  }
}

function isLoopback(address = "") {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/**
 * The Studio's routes run before Vite checks the Host header, so they check it themselves. A
 * page on another domain that has been made to resolve to this computer, a DNS rebinding
 * attack, would otherwise count as the Studio's own origin. Only names that cannot be rebound
 * are accepted: localhost and literal addresses, the same rule Vite applies by default.
 */
function trustedHost(request) {
  const host = request.headers.host;
  if (!host) return false;
  let hostname;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
    || /^\[[0-9a-f:.]+\]$/i.test(hostname);
}

/** A browser names the page that sent a cross-origin request; the Studio only answers itself. */
function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

/** Run the FrameSeq CLI as a child, without the development server's own settings leaking in. */
function runCli(cliPath, args, cwd) {
  const environment = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !name.startsWith("FRAMESEQ_")));
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env: { ...environment, FORCE_COLOR: "0", NO_COLOR: "1" },
      windowsHide: true,
    });
    let log = "";
    const timer = setTimeout(() => {
      log += `\nStopped after ${Math.round(exportTimeout / 60_000)} minutes.`;
      child.kill();
    }, exportTimeout);
    child.stdout.on("data", (chunk) => { log += chunk.toString(); });
    child.stderr.on("data", (chunk) => { log += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({ code: 1, log: `${log}${error.message}\n` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code: code ?? 1, log });
    });
  });
}

function revealInFolder(path, directory) {
  const [command, args] = process.platform === "win32"
    ? ["explorer.exe", directory ? [path] : [`/select,${path}`]]
    : process.platform === "darwin"
      ? ["open", directory ? [path] : ["-R", path]]
      : ["xdg-open", [directory ? path : dirname(path)]];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.on("error", () => undefined);
  child.unref();
}

/**
 * The server half of FrameSeq Studio: the slide document, a TypeScript language service for
 * it, its outline, and the CLI's exports, all behind one per-server token.
 *
 * Unlike the preview's own edit channel, which may only rewrite numbers, the Studio writes
 * whole documents. It therefore exists only when `frameseq studio` started the server, answers
 * only this machine unless that command was given --host, and refuses any request that another
 * page could have sent on the Studio's behalf.
 */
export function studioPlugin({ entry, packageRoot, cliPath, enabled, allowRemote }) {
  return {
    name: "frameseq-studio",
    /**
     * A deck that throws before the preview has started leaves nothing running that could say
     * why. Record the first error each page sees, so the Studio can read it from the frame.
     */
    transformIndexHtml(html, context) {
      if (!enabled || !context.server) return html;
      return [{
        tag: "script",
        injectTo: "head-prepend",
        children: "addEventListener(\"error\",function(e){window.__frameseqError=window.__frameseqError||String(e.message||e.error)},true);",
      }];
    },
    configureServer(server) {
      if (!enabled) {
        server.middlewares.use("/__frameseq/studio", (_request, response) => {
          send(response, 404, {
            error: "FrameSeq Studio is not running on this server. Start it with: frameseq studio <file>",
          });
        });
        return;
      }

      const token = randomBytes(24).toString("hex");
      const cwd = process.cwd();
      const entryKey = process.platform === "win32" ? entry.toLowerCase() : entry;
      const jobs = new Map();
      let exporting = false;
      let language;
      const languageService = () => {
        language ??= createStudioLanguage({ entry, packageRoot });
        return language;
      };

      const announce = async () => {
        try {
          const text = await readFile(entry, "utf8");
          server.ws.send(studioSourceEvent, { version: version(text) });
        } catch {
          server.ws.send(studioSourceEvent, { missing: true });
        }
      };
      server.watcher.add(entry);
      const onChange = (file) => {
        const key = process.platform === "win32" ? resolve(file).toLowerCase() : resolve(file);
        if (key === entryKey) void announce();
      };
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);

      const routes = {
        "GET /session": async () => {
          const text = await readFile(entry, "utf8");
          // Build the TypeScript program before the first completion needs it, but after the
          // frames have had their modules: building it holds up the server for a moment.
          setTimeout(() => {
            try {
              languageService().warm();
            } catch (error) {
              server.config.logger.warn(`FrameSeq Studio: ${error instanceof Error ? error.message : error}`);
            }
          }, 1500);
          return {
            token,
            entry,
            file: (relative(cwd, entry) || basename(entry)).replaceAll("\\", "/"),
            name: basename(entry),
            directory: cwd,
            version: version(text),
          };
        },

        "GET /source": async () => {
          const text = await readFile(entry, "utf8");
          return { text, version: version(text) };
        },

        /**
         * Write the editor's text. A save made against a document that changed on disk since the
         * editor last read it is refused, so an agent's or another editor's work is never lost.
         * An automatic save also refuses text that does not parse, which the preview could only
         * show as an error.
         */
        "PUT /source": async (body) => {
          if (typeof body.text !== "string") return [400, { error: "Missing text." }];
          if (body.checkSyntax === true) {
            const problems = languageService().syntax(body.analysisText ?? body.text);
            if (problems.length > 0) return { ok: false, syntax: problems };
          }
          const current = await readFile(entry, "utf8");
          if (body.force !== true && typeof body.base === "string" && version(current) !== body.base) {
            return { ok: false, conflict: true, version: version(current) };
          }
          if (current !== body.text) await writeFile(entry, body.text, "utf8");
          return { ok: true, version: version(body.text) };
        },

        // The outline, plus the top-level statements the preview names as each slide's origin.
        "POST /inspect": (body) => {
          if (typeof body.text !== "string") return [400, { error: "Missing text." }];
          return {
            ...inspectSource(entry, body.text, cwd),
            statements: documentStatements(body.text, entry),
          };
        },

        "POST /language/diagnostics": (body) => ({
          diagnostics: languageService().diagnostics(body.text),
        }),

        "POST /language/completions": (body) => (
          languageService().completions(body.text, Number(body.offset) || 0, String(body.prefix ?? ""))
        ),

        "POST /language/details": (body) => ({
          details: languageService().details(
            body.text,
            Number(body.offset) || 0,
            String(body.name ?? ""),
            typeof body.source === "string" ? body.source : undefined,
            body.data,
          ),
        }),

        "POST /language/hover": (body) => ({
          hover: languageService().hover(body.text, Number(body.offset) || 0),
        }),

        "POST /language/signature": (body) => ({
          signature: languageService().signature(body.text, Number(body.offset) || 0),
        }),

        "POST /export": async (body) => {
          const plan = exportPlan(String(body.format ?? ""), entry, cwd);
          if (!plan) return [400, { error: "Unknown export format." }];
          if (exporting) return [409, { error: "Another export is still running." }];
          exporting = true;
          const started = Date.now();
          try {
            const result = await runCli(cliPath, [...plan.args, entry, "--output", plan.output], cwd);
            const job = randomBytes(8).toString("hex");
            const path = plan.file ?? plan.output;
            if (result.code === 0) jobs.set(job, { path, directory: Boolean(plan.directory) });
            return {
              ok: result.code === 0,
              job: result.code === 0 ? job : undefined,
              label: plan.label,
              path,
              display: (relative(cwd, path) || basename(path)).replaceAll("\\", "/"),
              directory: Boolean(plan.directory),
              log: result.log,
              duration: Date.now() - started,
            };
          } finally {
            exporting = false;
          }
        },

        "POST /reveal": (body) => {
          const job = jobs.get(String(body.job ?? ""));
          if (!job) return [404, { error: "That export is not known to this server." }];
          revealInFolder(job.path, job.directory);
          return { ok: true };
        },
      };

      server.middlewares.use("/__frameseq/studio", (request, response) => {
        void (async () => {
          if (!allowRemote && !isLoopback(request.socket.remoteAddress)) {
            send(response, 403, { error: "FrameSeq Studio only answers this computer. Start it with --host to share it." });
            return;
          }
          if (!trustedHost(request) || !sameOrigin(request)) {
            send(response, 403, { error: "Cross-origin requests are refused." });
            return;
          }
          const url = new URL(request.url ?? "/", "http://studio.local");

          // Downloads are plain links, which cannot carry a header, so they name the token.
          if (request.method === "GET" && url.pathname === "/download") {
            const job = jobs.get(url.searchParams.get("job") ?? "");
            if (url.searchParams.get("token") !== token || !job || job.directory) {
              send(response, 404, { error: "That export is not available." });
              return;
            }
            const info = await stat(job.path);
            response.statusCode = 200;
            response.setHeader("Content-Type", contentTypes[extname(job.path).toLowerCase()] ?? "application/octet-stream");
            response.setHeader("Content-Length", String(info.size));
            response.setHeader("Content-Disposition", `attachment; filename="${basename(job.path).replace(/"/g, "")}"`);
            createReadStream(job.path).pipe(response);
            return;
          }

          const route = routes[`${request.method} ${url.pathname}`];
          if (!route) {
            send(response, 404, { error: "Unknown Studio request." });
            return;
          }
          if (url.pathname !== "/session" && request.headers["x-frameseq-studio"] !== token) {
            send(response, 403, { error: "The Studio session token is missing or out of date. Reload the page." });
            return;
          }
          const body = request.method === "GET" ? {} : await readJson(request);
          const result = await route(body);
          if (Array.isArray(result)) send(response, result[0], result[1]);
          else send(response, 200, result ?? {});
        })().catch((error) => {
          const status = typeof error?.status === "number" ? error.status : 500;
          if (status === 500) {
            server.config.logger.error(`FrameSeq Studio: ${error instanceof Error ? error.stack ?? error.message : error}`);
          }
          if (!response.headersSent) send(response, status, { error: error instanceof Error ? error.message : String(error) });
          else response.end();
        });
      });
    },
  };
}
