import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { inspectSource } from "./frameseq-inspect.mjs";
import { iconBodies } from "./icon-set.mjs";
import { isPresentationFile, presentationFileName, presentationTemplate, templateDeck } from "./presentation-file.mjs";
import { readSlides, slidesFileSuffix, slidesLabel } from "./slide-selection.mjs";
import { documentStatements } from "./source-marks.mjs";
import { writeDocument } from "./source-edits.mjs";
import {
  chooseWithDialog,
  defaultFolder,
  dialogsAvailable,
  forgetPresentation,
  importPicture,
  isDirectory,
  isFile,
  keepPicture,
  pictureExtensions,
  recentPresentations,
  rememberPresentation,
  rememberTemplateFolder,
} from "./studio-files.mjs";
import {
  createFromTemplate,
  deleteTemplate,
  findUserTemplate,
  saveTemplate,
  templateDirectory,
  templateNameProblem,
  userTemplates,
  writeTemplate,
} from "./user-templates.mjs";
import { createAssistant, maximumAttachment } from "./studio-assistant.mjs";
import { createStudioLanguage, setDiagnosticLanguage } from "./studio-language.mjs";
import { listStudio } from "./studio-instances.mjs";
import { attachTerminals, closeTerminals } from "./studio-terminal.mjs";
import { createUpdates } from "./studio-updates.mjs";

/** Pushed to the Studio whenever the slide document changes on disk, whoever changed it. */
export const studioSourceEvent = "frameseq:studio-source";
/** Pushed to the Studio to bring its window to the front, as opening its file again does. */
export const studioFocusEvent = "frameseq:studio-focus";

const maximumBody = 8 * 1024 * 1024;
const exportTimeout = 10 * 60_000;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".typ": "text/plain; charset=utf-8",
};

export const version = (text) => createHash("sha256").update(text).digest("hex").slice(0, 20);

const templatePreviewPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FrameSeq template</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/studio/template-preview.ts"></script>
  </body>
</html>
`;

const baseName = (entry) => basename(entry, extname(entry)).replace(/\.slides$/, "");

/**
 * What each export runs and where it writes. The locations are the CLI's own defaults, so a
 * file exported from the Studio lands exactly where `frameseq pdf` and the rest would put it.
 * An export of some slides names them, as `--slides` does; HTML always has every slide.
 */
function exportPlan(format, entry, cwd, slides) {
  const name = `${baseName(entry)}${slidesFileSuffix(slides)}`;
  const some = slides ? ["--slides", slidesLabel(slides)] : [];
  const plans = {
    html: { label: "HTML site", args: ["build"], output: resolve(cwd, "dist"), directory: true, whole: true },
    "html-single": {
      label: "Single HTML file",
      args: ["build", "--single-file"],
      output: resolve(cwd, "dist"),
      file: resolve(cwd, "dist", "index.html"),
      whole: true,
    },
    pdf: { label: "PDF", args: ["pdf", ...some], output: resolve(cwd, "output", "pdf", `${name}.pdf`) },
    pptx: { label: "PowerPoint", args: ["pptx", ...some], output: resolve(cwd, "output", "pptx", `${name}.pptx`) },
    "pptx-flat": {
      label: "Flattened PowerPoint",
      args: ["pptx", "--flatten", ...some],
      output: resolve(cwd, "output", "pptx", `${name}.pptx`),
    },
    typst: { label: "Typst", args: ["typst", ...some], output: resolve(cwd, "output", "typst", `${name}.typ`) },
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

async function readBody(request, limit = maximumBody, tooLarge = "The request is too large.") {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      throw Object.assign(new Error(tooLarge), { status: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = (await readBody(request)).toString("utf8");
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

/** How long a Studio started to quit on close waits for its first window, and after its last. */
const firstWindowWait = 120_000;
const lastWindowGrace = 15_000;

/**
 * Stop the server once no page of it is open: the Studio window, its frames, a presenter
 * window. Every page holds the development server's socket, so the sockets are the count. The
 * count lives on the process, because opening another presentation restarts the server with a
 * fresh copy of this plugin while the page reloads into it.
 */
function quitWhenClosed(server) {
  const presence = globalThis[Symbol.for("frameseq.studio.presence")] ??= { pages: 0, timer: undefined };
  const stopLater = (delay, reason) => {
    clearTimeout(presence.timer);
    presence.timer = setTimeout(() => {
      if (presence.pages > 0) return;
      server.config.logger.info(reason);
      void server.close().finally(() => process.exit(0));
    }, delay);
  };
  if (presence.pages === 0 && !presence.timer) {
    stopLater(firstWindowWait, "FrameSeq Studio: no window opened, so the Studio stopped.");
  }
  server.ws.on("connection", (socket) => {
    presence.pages += 1;
    clearTimeout(presence.timer);
    presence.timer = undefined;
    socket.on("close", () => {
      presence.pages = Math.max(0, presence.pages - 1);
      if (presence.pages === 0) stopLater(lastWindowGrace, "FrameSeq Studio: the window closed, so the Studio stopped.");
    });
  });
}

const deckKey = (path) => (process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path));

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
/** What the presentation routes say, in the language of the page that asked. */
function fileMessages(language) {
  return language === "zh"
    ? {
      noTitle: "请给演示起一个标题。",
      noTemplate: (name) => `没有叫“${name}”的模板。`,
      fullFolder: "请用完整路径选择文件夹。",
      noFolder: (path) => `${path} 这个文件夹不存在。`,
      exists: (name) => `那个文件夹里已经有 ${name} 了。`,
      fullPath: "请给出幻灯片文档的完整路径。",
      notTs: "FrameSeq 演示是一个 .fsq 文件，比如 talk.fsq，也可以是 talk.slides.ts 这样的 .ts 文件。",
      noFile: (path) => `${path} 这个文件不存在。`,
      fullPicture: "请给出图片的完整路径。",
      notPicture: (extensions) => `只能插入这些格式的图片：${extensions}。`,
      emptyPicture: "粘贴的图片是空的。",
      templateName: {
        empty: "请给模板起个名字。",
        edges: "模板名称不能以空格或句点开头或结尾。",
        characters: "模板名称不能包含 \\ / : * ? \" < > | 这些字符。",
        reserved: "这个名字是系统保留的，请换一个。",
        long: "模板名称太长了。",
      },
      noOwnTemplate: (name) => `你的模板里没有“${name}”。`,
    }
    : {
      noTitle: "Give the presentation a title.",
      noTemplate: (name) => `There is no template named “${name}”.`,
      fullFolder: "Choose the folder by its full path.",
      noFolder: (path) => `There is no folder at ${path}.`,
      exists: (name) => `${name} already exists in that folder.`,
      fullPath: "Give the full path of the slide document.",
      notTs: "A FrameSeq presentation is an .fsq file, such as talk.fsq, or a .ts file such as talk.slides.ts.",
      noFile: (path) => `There is no file at ${path}.`,
      fullPicture: "Give the full path of the picture.",
      notPicture: (extensions) => `A picture must be one of ${extensions}.`,
      emptyPicture: "The pasted picture is empty.",
      templateName: {
        empty: "Give the template a name.",
        edges: "A template's name cannot begin or end with a space or a full stop.",
        characters: "A template's name cannot hold any of \\ / : * ? \" < > |.",
        reserved: "That name is kept by the system; choose another.",
        long: "That name is too long for a template.",
      },
      noOwnTemplate: (name) => `There is no template named “${name}” among yours.`,
    };
}

export function studioPlugin({
  entry,
  packageRoot,
  cliPath,
  enabled,
  allowRemote,
  phoneRemote = false,
  start = false,
  quitOnClose = false,
  remember = true,
  // Packaged editions can supply native dialogs and restrict features to their runtime.
  host = {},
}) {
  return {
    name: "frameseq-studio",
    /**
     * A deck that throws before the preview has started leaves nothing running that could say
     * why. Record the first error each page sees, and the statement the document was running
     * when it threw, so the Studio can read both from the frame.
     */
    transformIndexHtml(html, context) {
      if (!enabled || !context.server) return html;
      return [{
        tag: "script",
        injectTo: "head-prepend",
        children: "addEventListener(\"error\",function(e){if(window.__frameseqError)return;"
          + "window.__frameseqError=String(e.message||e.error);"
          + "window.__frameseqErrorStatement=window.__frameseqStatement},true);",
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
      let diagnosticLanguage = "en";
      const languageService = () => {
        language ??= createStudioLanguage({ entry, packageRoot });
        return language;
      };
      /**
       * TypeScript keeps the messages of a file it has checked, so a change of language starts
       * the service again rather than repeating messages in the language it had before.
       */
      const speak = (requested) => {
        const wanted = requested === "zh" ? "zh" : "en";
        if (wanted === diagnosticLanguage) return;
        diagnosticLanguage = wanted;
        setDiagnosticLanguage(wanted);
        language = undefined;
      };
      const frameseqVersion = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version;
      const updates = createUpdates({ packageRoot, current: frameseqVersion, daily: remember && host.updates !== false });
      // The assistant's events reach the page as they come, on the connection hot reload uses.
      const assistant = host.assistant === false ? undefined : createAssistant({ cliPath, send: (event) => server.ws.send("frameseq:assistant", event) });
      if (assistant) server.httpServer?.once("close", () => assistant.close());

      if (quitOnClose) quitWhenClosed(server);

      // A Studio someone works in is listed, so opening its file again shows it rather than a
      // second Studio on the same file; one a script runs is left out unless the script asks.
      if (remember || process.env.FRAMESEQ_STUDIO_LISTED === "1") {
        // One exit hook per process, however often the server restarts on another presentation.
        const listing = globalThis[Symbol.for("frameseq.studio.listing")] ??= { unlist: undefined, hooked: false };
        if (!listing.hooked) {
          listing.hooked = true;
          process.once("exit", () => listing.unlist?.());
        }
        let unlist;
        const list = () => {
          const address = server.httpServer?.address();
          if (!address || typeof address === "string") return;
          try {
            unlist = listStudio({ port: address.port, desktop: process.env.FRAMESEQ_STUDIO_DESKTOP === "1" });
            listing.unlist = unlist;
          } catch (error) {
            server.config.logger.warn(`FrameSeq Studio could not note that it runs: ${error instanceof Error ? error.message : error}`);
          }
        };
        if (server.httpServer?.listening) list();
        else server.httpServer?.once("listening", list);
        server.httpServer?.once("close", () => unlist?.());
      }

      // A shell runs whatever it is given, so only the Studio's own page on this computer gets one,
      // even when the Studio was started with --host.
      if (host.terminal !== false) attachTerminals(server, {
        cwd,
        packageRoot,
        allowed: (request, url) => !start
          && isLoopback(request.socket.remoteAddress)
          && trustedHost(request)
          && sameOrigin(request)
          && url.searchParams.get("token") === token,
      });

      const announce = async () => {
        try {
          const text = await readFile(entry, "utf8");
          server.ws.send(studioSourceEvent, { version: version(text) });
        } catch {
          server.ws.send(studioSourceEvent, { missing: true });
        }
      };
      if (!start) {
        server.watcher.add(entry);
        const onChange = (file) => {
          const key = process.platform === "win32" ? resolve(file).toLowerCase() : resolve(file);
          if (key === entryKey) void announce();
        };
        server.watcher.on("change", onChange);
        server.watcher.on("add", onChange);
        server.watcher.on("unlink", onChange);
        if (remember) void rememberPresentation(entry).catch(() => undefined);
      }

      /**
       * Show another presentation. The server restarts on it, the page reloads into it, and the
       * Studio works from its folder from then on, so its exports land beside it.
       */
      let choosing = false;
      let switching = false;
      const openPresentation = async (path) => {
        if (exporting) return [409, { error: "An export is still running. Open the presentation once it has finished." }];
        if (switching) return [409, { error: "Another presentation is already opening." }];
        switching = true;
        await rememberPresentation(path).catch(() => undefined);
        process.env.FRAMESEQ_ENTRY = path;
        delete process.env.FRAMESEQ_STUDIO_START;
        process.chdir(dirname(path));
        // The terminal's shells work in the folder being left, so they end with it.
        closeTerminals();
        // Answer first: the restart closes the connection this request arrived on.
        setTimeout(() => {
          server.restart().catch((error) => {
            server.config.logger.error(`FrameSeq Studio could not open ${path}: ${error instanceof Error ? error.message : error}`);
          }).finally(() => {
            // A restart that failed leaves this server running, ready to try again.
            switching = false;
          });
        }, 50);
        return { ok: true, path, name: basename(path) };
      };
      const currentFolder = () => defaultFolder(start ? undefined : entry);

      /**
       * Let the page load the person's templates, which the new-presentation dialog draws the
       * covers of, from wherever their folder is now.
       */
      const allowTemplates = () => {
        const allow = server.config.server.fs.allow;
        const folder = templateDirectory();
        try {
          if (Array.isArray(allow) && !allow.some((item) => deckKey(item) === deckKey(folder))) allow.push(folder);
        } catch {
          // A configuration that cannot grow keeps the folder it started with until the next start.
        }
      };
      allowTemplates();

      /**
       * Turn the phone remote on: the server starts again on the local network, with the relay
       * that carries a phone's steps to the slide show, and the page reloads. Only the person at
       * this computer may open it to the network.
       */
      const startPhoneRemote = (request) => {
        if (!isLoopback(request.socket.remoteAddress)) {
          return [403, { error: "Only the computer running the Studio can turn the phone remote on." }];
        }
        if (phoneRemote) return { ok: true };
        if (exporting) return [409, { error: "An export is still running. Turn the phone remote on once it has finished." }];
        if (switching) return [409, { error: "The Studio is already starting again." }];
        switching = true;
        process.env.FRAMESEQ_REMOTE = "1";
        // Answer first: the restart closes the connection this request arrived on.
        setTimeout(() => {
          server.restart().catch((error) => {
            delete process.env.FRAMESEQ_REMOTE;
            server.config.logger.error(`FrameSeq Studio could not turn the phone remote on: ${error instanceof Error ? error.message : error}`);
          }).finally(() => {
            switching = false;
          });
        }, 50);
        return { ok: true };
      };

      const routes = {
        "GET /session": async (_body, request) => {
          const shared = {
            token,
            start,
            quitOnClose,
            frameseq: frameseqVersion,
            dialogs: (Boolean(host.choose) || dialogsAvailable()) && isLoopback(request.socket.remoteAddress),
            terminal: host.terminal !== false && isLoopback(request.socket.remoteAddress),
            assistant: host.assistant !== false && isLoopback(request.socket.remoteAddress),
            phoneRemote,
            ...(host.exportFormats ? { exportFormats: host.exportFormats } : {}),
            ...(host.updates === false ? { updates: false } : {}),
            ...(host.phoneRemote === false ? { canPairPhone: false } : {}),
          };
          if (start) return { ...shared, entry: null, name: "FrameSeq Studio" };
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
            ...shared,
            entry,
            file: (relative(cwd, entry) || basename(entry)).replaceAll("\\", "/"),
            name: basename(entry),
            directory: cwd,
            version: version(text),
          };
        },

        // ── Presentations: the recent ones, opening one, and starting a new one ──────────
        "GET /files": async () => ({ recent: await recentPresentations(), folder: await currentFolder() }),

        // ── Updates: whether a newer FrameSeq is out, checked at most daily unless asked ──
        "GET /update": () => updates.status(),

        /**
         * Check now, install the latest version in the app, keep the daily check on or off, or
         * stop mentioning a version.
         */
        "POST /update": async (body) => {
          await updates.remember({ automatic: body.automatic, skip: body.skip });
          if (body.install === true) return updates.installLatest();
          return updates.status({ force: body.check === true });
        },

        /** Every icon icon() can show, by name, for the Studio's icon picker. */
        "GET /icons": async () => iconBodies(),

        /** Ask with the operating system's own dialog; the page asks for a path when there is none. */
        "POST /files/choose": async (body) => {
          if (choosing) return [409, { error: "A dialog is already open on this computer." }];
          choosing = true;
          try {
            const asked = typeof body.folder === "string" && isAbsolute(body.folder) && await isDirectory(body.folder)
              ? body.folder
              : await currentFolder();
            const kind = body.kind === "folder" || body.kind === "image" ? body.kind : "open";
            return await (host.choose ?? chooseWithDialog)(kind, asked);
          } finally {
            choosing = false;
          }
        },

        /**
         * Put a picture beside the presentation, so the slides carry it wherever the folder goes:
         * one already inside the folder is used where it is, and any other is copied into images/,
         * under a name of its own unless the same picture is already there.
         */
        "POST /assets/import": async (body) => {
          const path = typeof body.path === "string" ? body.path.trim() : "";
          const say = fileMessages(body.language);
          if (!path || !isAbsolute(path)) return [400, { error: say.fullPicture }];
          const source = resolve(path);
          const extension = extname(source).toLowerCase();
          if (!pictureExtensions.includes(extension)) return [400, { error: say.notPicture(pictureExtensions.join(" ")) }];
          if (!await isFile(source)) return [404, { error: say.noFile(source) }];
          return importPicture(entry, source);
        },

        /** A picture pasted onto a slide, sent as it is with its name in the address, kept in images/. */
        "POST /assets/paste": async (body, request) => {
          const query = new URL(request.url ?? "/", "http://studio.local").searchParams;
          const name = basename(query.get("name")?.trim() ?? "");
          const say = fileMessages(query.get("language"));
          if (!pictureExtensions.includes(extname(name).toLowerCase())) return [400, { error: say.notPicture(pictureExtensions.join(" ")) }];
          if (body.length === 0) return [400, { error: say.emptyPicture }];
          return keepPicture(entry, name, body);
        },

        "POST /files/open": async (body) => {
          const path = typeof body.path === "string" ? body.path.trim() : "";
          const say = fileMessages(body.language);
          if (!path || !isAbsolute(path)) return [400, { error: say.fullPath }];
          const target = resolve(path);
          if (!isPresentationFile(target)) return [400, { error: say.notTs }];
          if (!await isFile(target)) return [404, { error: say.noFile(target) }];
          if (!start && deckKey(target) === deckKey(entry)) return { ok: true, path: target, name: basename(target), current: true };
          return openPresentation(target);
        },

        /**
         * Come to the front, as when the presentation open here is opened again from outside,
         * such as by a double-click. On the start page, open it first.
         */
        "POST /files/show": async (body) => {
          const path = typeof body.path === "string" && body.path.trim() ? resolve(body.path.trim()) : undefined;
          if (path && !start && deckKey(path) !== deckKey(entry)) return [409, { error: "Another presentation is open in this Studio." }];
          if (path && start) {
            const say = fileMessages(body.language);
            if (!isPresentationFile(path)) return [400, { error: say.notTs }];
            if (!await isFile(path)) return [404, { error: say.noFile(path) }];
          }
          server.ws.send(studioFocusEvent, {});
          return path && start ? openPresentation(path) : { ok: true, current: true };
        },

        /** Write the chosen template under a file named after the title, then open it. */
        "POST /files/create": async (body) => {
          const title = typeof body.title === "string" ? body.title.trim() : "";
          const folder = typeof body.folder === "string" ? body.folder.trim() : "";
          const template = typeof body.template === "string" ? body.template : "blank";
          const say = fileMessages(body.language);
          if (!title) return [400, { error: say.noTitle }];
          // "user:name" is one of the person's own templates, kept in their templates folder.
          const own = template.startsWith("user:") ? await findUserTemplate(template.slice("user:".length)) : undefined;
          if (template.startsWith("user:") && !own) return [400, { error: say.noOwnTemplate(template.slice("user:".length)) }];
          if (!own && !presentationTemplate(template)) return [400, { error: say.noTemplate(template) }];
          if (!folder || !isAbsolute(folder)) return [400, { error: say.fullFolder }];
          if (!await isDirectory(folder)) return [404, { error: say.noFolder(resolve(folder)) }];
          const target = join(resolve(folder), presentationFileName(title));
          try {
            if (own) await createFromTemplate(own, target, title);
            else await writeFile(target, templateDeck(template, title, body.language === "zh" ? "zh" : "en"), { encoding: "utf8", flag: "wx" });
          } catch (error) {
            if (error?.code !== "EEXIST") throw error;
            return [409, { error: say.exists(basename(target)), path: target }];
          }
          return openPresentation(target);
        },

        // ── The person's own templates, kept in a folder of their own ───────────────────────
        "GET /templates": async () => ({
          folder: templateDirectory(),
          templates: (await userTemplates()).map(({ name, path, folder }) => ({ name, path, folder: Boolean(folder) })),
        }),

        /** Keep the open presentation as a template; one of the same name is replaced on request. */
        "POST /templates/save": async (body) => {
          if (start) return [409, { error: "No presentation is open." }];
          const name = typeof body.name === "string" ? body.name.trim() : "";
          const say = fileMessages(body.language);
          const problem = templateNameProblem(name);
          if (problem) return [400, { error: say.templateName[problem] }];
          const saved = await saveTemplate({ entry, name, overwrite: body.overwrite === true });
          if (saved.exists) return [409, { exists: true, path: saved.path }];
          return { ...saved, folder: templateDirectory() };
        },

        /** Keep a copy of a template FrameSeq ships among the person's own, to change as they like. */
        "POST /templates/copy": async (body) => {
          const id = typeof body.template === "string" ? body.template : "";
          const name = typeof body.name === "string" ? body.name.trim() : "";
          const say = fileMessages(body.language);
          if (!presentationTemplate(id)) return [400, { error: say.noTemplate(id) }];
          const problem = templateNameProblem(name);
          if (problem) return [400, { error: say.templateName[problem] }];
          const written = await writeTemplate({ name, source: templateDeck(id, "", body.language === "zh" ? "zh" : "en") });
          if (written.exists) return [409, { exists: true, path: written.path }];
          return written;
        },

        "POST /templates/delete": async (body) => {
          const template = typeof body.name === "string" ? await findUserTemplate(body.name) : undefined;
          if (!template) return [404, { error: fileMessages(body.language).noOwnTemplate(String(body.name ?? "")) }];
          await deleteTemplate(template);
          return { ok: true };
        },

        /** Show the templates folder, or one template in it, made first if it is not there yet. */
        "POST /templates/reveal": async (body) => {
          const template = typeof body.name === "string" ? await findUserTemplate(body.name) : undefined;
          if (template) {
            await (host.reveal ?? revealInFolder)(template.folder ?? template.path, Boolean(template.folder));
            return { ok: true };
          }
          await mkdir(templateDirectory(), { recursive: true });
          await (host.reveal ?? revealInFolder)(templateDirectory(), true);
          return { ok: true, folder: templateDirectory() };
        },

        /** Keep the templates in another folder from now on, or in the usual one again. */
        "POST /templates/folder": async (body) => {
          const path = typeof body.path === "string" ? body.path.trim() : "";
          const say = fileMessages(body.language);
          if (path && !isAbsolute(path)) return [400, { error: say.fullFolder }];
          if (path && !await isDirectory(path)) return [404, { error: say.noFolder(resolve(path)) }];
          await rememberTemplateFolder(path ? resolve(path) : undefined);
          allowTemplates();
          return { folder: templateDirectory() };
        },

        "POST /files/forget": async (body) => {
          if (typeof body.path === "string" && isAbsolute(body.path)) await forgetPresentation(resolve(body.path));
          return { recent: await recentPresentations() };
        },

        "POST /files/reveal": async () => {
          if (start) return [409, { error: "No presentation is open." }];
          await (host.reveal ?? revealInFolder)(entry, false);
          return { ok: true };
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
          if (current !== body.text) await writeDocument(entry, body.text);
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

        "POST /language/diagnostics": (body) => {
          speak(body.language);
          return { diagnostics: languageService().diagnostics(body.text) };
        },

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
          if (host.exportFormats && !host.exportFormats.includes(body.format)) return [501, { error: "This export format is not available in this edition of FrameSeq Studio." }];
          const reading = body.slides === undefined ? undefined : readSlides(String(body.slides));
          if (reading && !reading.slides) return [400, { error: "Those slides cannot be read." }];
          const plan = exportPlan(String(body.format ?? ""), entry, cwd, reading?.slides);
          if (!plan) return [400, { error: "Unknown export format." }];
          if (reading && plan.whole) return [400, { error: "An HTML export always has every slide." }];
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

        // ── The assistant: Claude Code or Codex, editing this presentation ───────────────
        "GET /assistant": () => assistant.state(),
        "POST /assistant/send": async (body) => {
          const text = typeof body.text === "string" ? body.text.trim() : "";
          if (!text) return [400, { error: "Write a request first." }];
          if (body.agent !== "claude" && body.agent !== "codex") return [400, { error: "Choose Claude Code or Codex." }];
          // The agent's FrameSeq tools render the slides in this server, which already has them.
          const preview = (server.resolvedUrls?.local?.[0] ?? "").replace(/\/$/, "") || undefined;
          const attachments = Array.isArray(body.attachments) ? body.attachments.filter((id) => typeof id === "string") : [];
          return assistant.send({ agent: body.agent, text, context: body.context, settings: body.settings, attachments, entry, preview });
        },
        /** A file for the next request, sent as it is with its name in the address; the agent reads it where it is kept. */
        "POST /assistant/attach": async (body, request) => {
          const name = new URL(request.url ?? "/", "http://studio.local").searchParams.get("name")?.trim();
          if (!name) return [400, { error: "The file has no name." }];
          return assistant.attach(name, body);
        },
        "POST /assistant/options": async (body) => {
          if (body.agent !== "claude" && body.agent !== "codex") return [400, { error: "Choose Claude Code or Codex." }];
          return assistant.options(body.agent);
        },
        "POST /assistant/usage": async (body) => {
          if (body.agent !== "claude" && body.agent !== "codex") return [400, { error: "Choose Claude Code or Codex." }];
          return { usage: (await assistant.usage(body.agent)) ?? null };
        },
        "POST /assistant/stop": () => {
          assistant.stop();
          return { ok: true };
        },
        "POST /assistant/new": () => {
          assistant.reset();
          return { ok: true };
        },
        "POST /assistant/refresh": () => ({ agents: assistant.refresh() }),
        "POST /phone-remote": (_body, request) => startPhoneRemote(request),
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

          // A template's cover for the new-presentation dialog: a page in a frame, which cannot
          // carry a header either. It shows what FrameSeq ships, or one of the person's own
          // templates, which the page loads from their templates folder.
          if (request.method === "GET" && url.pathname === "/template-preview") {
            const page = await server.transformIndexHtml(
              `/__frameseq/studio${url.pathname}${url.search}`,
              templatePreviewPage,
            );
            response.statusCode = 200;
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(page);
            return;
          }

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
          if ((url.pathname.startsWith("/assistant") && !assistant)
            || (url.pathname === "/update" && host.updates === false)
            || (url.pathname === "/phone-remote" && host.phoneRemote === false)
            || (url.pathname === "/export" && host.exportFormats?.length === 0)) {
            send(response, 501, { error: "This feature is not available in this edition of FrameSeq Studio." });
            return;
          }
          const files = url.pathname === "/files" || url.pathname.startsWith("/files/");
          // Opening files and showing dialogs belong to the person at this computer, even with --host.
          if (files && !isLoopback(request.socket.remoteAddress)) {
            send(response, 403, { error: "Presentations can only be opened on the computer running the Studio." });
            return;
          }
          // So do the coding agents the assistant runs.
          if (url.pathname.startsWith("/assistant") && !isLoopback(request.socket.remoteAddress)) {
            send(response, 403, { error: "The assistant only works on the computer running the Studio." });
            return;
          }
          // Like the files, updates belong to the computer the Studio was installed on.
          if (url.pathname === "/update" && !isLoopback(request.socket.remoteAddress)) {
            send(response, 403, { error: "Updates are checked on the computer running the Studio." });
            return;
          }
          // The start page's new-presentation dialog offers the person's own templates too.
          const templates = url.pathname === "/templates" || url.pathname.startsWith("/templates/");
          if (start && !files && !templates && url.pathname !== "/session" && url.pathname !== "/update") {
            send(response, 409, { error: "No presentation is open. Open or create one first." });
            return;
          }
          // A file attached for the assistant, or a pasted picture, arrives as it is, not as JSON.
          const body = request.method === "GET"
            ? {}
            : url.pathname === "/assistant/attach" || url.pathname === "/assets/paste"
              ? await readBody(request, maximumAttachment, `A file can be at most ${maximumAttachment / 1024 / 1024} MB.`)
              : await readJson(request);
          const result = await route(body, request);
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
