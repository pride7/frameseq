import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { studioPlugin } from "./studio-server.mjs";
import { templateDirectory } from "./user-templates.mjs";
import { applyIncomingEdits, applyIncomingMove, applyIncomingRemove, undoLastEdit } from "./source-edits.mjs";
import { allowedFile, compileHarmonyModule, inside } from "./harmony-modules.mjs";

const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf" };

/** The packaged Studio needs only Node built-ins, TypeScript and ws on the target device. */
export async function createHarmonyServer({ packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."), entry, host = {}, port = 0 } = {}) {
  const client = resolve(packageRoot, "client");
  const runtime = JSON.parse(await readFile(resolve(packageRoot, "harmony-runtime.json"), "utf8"));
  let document = entry ? resolve(entry) : undefined;
  let revision = 0;
  let middleware;
  let closed = false;
  let origin;
  const directories = new Map();
  const timers = new Map();
  const watcher = new EventEmitter();
  const events = new EventEmitter();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  const roots = () => [document ? dirname(document) : process.cwd(), templateDirectory()];
  const send = (event, data) => {
    const message = JSON.stringify({ event, data });
    for (const socket of sockets.clients) if (socket.readyState === WebSocket.OPEN) socket.send(message);
  };
  const ws = { on: (...args) => events.on(...args), send };

  watcher.add = (file) => {
    const path = resolve(file);
    const folder = dirname(path);
    if (directories.has(folder)) {
      directories.get(folder).files.add(path);
      return;
    }
    const files = new Set([path]);
    const handle = watch(folder, (_event, name) => {
      const targets = name ? [resolve(folder, String(name))] : [...files];
      for (const target of targets) {
        if (!files.has(target)) continue;
        clearTimeout(timers.get(target));
        timers.set(target, setTimeout(() => {
          timers.delete(target);
          if (closed) return;
          watcher.emit("change", target);
          send("frameseq:entry", ++revision);
        }, 60));
      }
    });
    handle.on("error", (error) => console.error(`FrameSeq file watcher: ${error.message}`));
    directories.set(folder, { files, handle });
  };
  const resetWatchers = () => {
    for (const { handle } of directories.values()) handle.close();
    for (const timer of timers.values()) clearTimeout(timer);
    directories.clear();
    timers.clear();
    watcher.removeAllListeners();
  };
  const respond = (response, status, type, content) => {
    response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" });
    response.end(content);
  };
  const serveFile = async (response, file, allowed) => {
    const path = await allowedFile(file, allowed);
    respond(response, 200, mime[extname(path).toLowerCase()] ?? "application/octet-stream", await readFile(path));
  };
  const server = createServer((request, response) => {
    void (async () => {
      if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) {
        respond(response, 403, "text/plain", "Cross-origin requests are refused.");
        return;
      }
      const url = new URL(request.url, origin);
      if (url.pathname.startsWith("/__frameseq/studio")) {
        if (url.pathname === "/__frameseq/studio/template-preview") {
          await serveFile(response, resolve(client, "harmony/template.html"), [client]);
          return;
        }
        request.url = request.url.slice("/__frameseq/studio".length) || "/";
        middleware(request, response);
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        respond(response, 405, "text/plain", "Method not allowed.");
        return;
      }
      if (url.pathname === "/__frameseq/source-info") {
        respond(response, 200, "application/json", JSON.stringify({ entry: document?.replaceAll("\\", "/") }));
        return;
      }
      if (["/__frameseq/entry.js", "/__frameseq/module"].includes(url.pathname) || url.pathname.startsWith("/@fs/")) {
        const file = url.pathname === "/__frameseq/entry.js" ? document : url.pathname.startsWith("/@fs/") ? decodeURIComponent(url.pathname.slice("/@fs".length)).replace(/^\/([A-Za-z]:\/)/, "$1") : url.searchParams.get("file");
        try {
          if (!file) throw new Error("No presentation is open.");
          const code = await compileHarmonyModule({ file, roots: roots(), commands: runtime.commands, revision: String(revision), document: file === document || url.searchParams.has("frameseq-template"), watch: watcher.add });
          respond(response, 200, "text/javascript", code);
        } catch (error) {
          send("vite:error", { err: { message: error.message, id: file } });
          respond(response, 200, "text/javascript", `throw new Error(${JSON.stringify(error.message)});`);
        }
        return;
      }
      if (url.pathname === "/__frameseq/asset") {
        await serveFile(response, url.searchParams.get("file"), roots());
        return;
      }
      const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const built = resolve(client, `.${pathname}`);
      if (!inside(client, built)) throw new Error("File is outside the application.");
      try {
        await serveFile(response, built, [client]);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        if (!document || pathname.startsWith("/assets/") || pathname.endsWith(".html")) throw error;
        const asset = resolve(dirname(document), `.${pathname}`);
        if (!mime[extname(asset).toLowerCase()] || scriptsOnly(asset)) throw new Error("This file cannot be served as an asset.");
        watcher.add(await allowedFile(asset, roots()));
        await serveFile(response, asset, roots());
      }
    })().catch((error) => {
      if (!response.headersSent) respond(response, error.code === "ENOENT" ? 404 : 403, "text/plain", error.code === "ENOENT" ? "File not found." : error.message);
      else response.destroy(error);
    });
  });
  server.on("upgrade", (request, socket, head) => {
    if (request.headers.host !== new URL(origin).host || request.headers.origin !== origin || new URL(request.url, origin).pathname !== "/__frameseq/hot") {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (clientSocket) => {
      clientSocket.on("error", () => {});
      clientSocket.on("message", (message) => {
        try {
          const { event, data } = JSON.parse(String(message));
          if (typeof event !== "string") return;
          events.emit(event, data, { send: (name, payload) => clientSocket.send(JSON.stringify({ event: name, data: payload })) });
        } catch { /* A malformed event does not affect the other pages. */ }
      });
    });
  });

  const configure = () => {
    resetWatchers();
    events.removeAllListeners();
    const shim = {
      config: { logger: console, server: { fs: { allow: roots() } } },
      resolvedUrls: { local: [`${origin}/`] },
      httpServer: server, watcher, ws,
      middlewares: { use: (_route, callback) => { middleware = callback; } },
      restart: async () => {
        document = resolve(process.env.FRAMESEQ_ENTRY);
        await stat(document);
        ++revision;
        configure();
        send("frameseq:reload");
      },
    };
    studioPlugin({ entry: document ?? resolve(process.cwd(), "slides.ts"), packageRoot, enabled: true, allowRemote: false, start: !document, host: { assistant: false, terminal: false, exportFormats: [], updates: false, phoneRemote: false, choose: async () => ({ unavailable: true }), ...host } }).configureServer(shim);
    const settle = (clientSocket, work, undo = false) => void work.then((result) => clientSocket.send("frameseq:apply-edit-result", { ...result, undo })).catch((error) => clientSocket.send("frameseq:apply-edit-result", { ok: false, reason: error.message, undo }));
    events.on("frameseq:apply-edit", (data, clientSocket) => { if (document) settle(clientSocket, data?.remove ? applyIncomingRemove(document, data) : data?.move ? applyIncomingMove(document, data) : applyIncomingEdits(document, data)); });
    events.on("frameseq:undo-edit", (_data, clientSocket) => { if (document) settle(clientSocket, undoLastEdit(document), true); });
  };
  await new Promise((done, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", done); });
  origin = `http://127.0.0.1:${server.address().port}`;
  try { configure(); } catch (error) { server.close(); throw error; }
  return {
    origin,
    async close() {
      closed = true;
      resetWatchers();
      for (const socket of sockets.clients) socket.terminate();
      await new Promise((done) => sockets.close(done));
      await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
    },
  };
}

function scriptsOnly(path) { return [".js", ".mjs", ".json", ".html"].includes(extname(path).toLowerCase()); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const instance = await createHarmonyServer({ entry: process.argv[2] });
  console.log(`Studio: ${instance.origin}/studio.html`);
  const close = () => { void instance.close().then(() => process.exit(0)); };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  process.stdin.once("end", close);
  process.stdin.resume();
}
