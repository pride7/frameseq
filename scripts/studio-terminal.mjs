import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { release } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";
import { WebSocketServer } from "ws";
import { installedApp } from "./app-layers.mjs";
import { runsFromBundle } from "./browsers.mjs";

/** Where the Studio's terminal connects, beside the Studio's own routes. */
export const terminalPath = "/__frameseq/studio/terminal";

const require = createRequire(import.meta.url);

/** What a shell printed last, replayed to a page that reloads while it runs. */
const replayLength = 256 * 1024;
/** How long a shell outlives its page, so a reload, such as a change of language, finds it again. */
const detachedLife = 30_000;
/** Output sent to the page and not yet drawn, beyond which the shell waits for the page. */
const highWater = 128 * 1024;
const lowWater = 16 * 1024;

/**
 * The shells live on the process, not on one copy of the Studio's plugin: a server that
 * restarts gives the page a fresh plugin, and the page should still find its shell.
 */
const registry = globalThis[Symbol.for("frameseq.studio.terminals")] ??= { sessions: new Map(), hooked: false };

/**
 * node-pty runs the shell in a pseudo-terminal, as a terminal program does, so editors, prompts,
 * and coding agents work in it. It is native code, so loading it can fail: no build for this
 * system, or Windows refusing an unsigned module. A failure is not remembered, so the next
 * terminal tries again.
 */
function loadPty() {
  try {
    return { spawn: require("@lydell/node-pty").spawn };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const pathKey = (environment) => Object.keys(environment).find((name) => name.toUpperCase() === "PATH") ?? "PATH";

function onPath(name, environment) {
  for (const folder of (environment[pathKey(environment)] ?? "").split(delimiter)) {
    if (folder && existsSync(join(folder, name))) return join(folder, name);
  }
  return undefined;
}

/**
 * The shell a terminal opens: PowerShell on Windows, the newer one when it is installed, as
 * Windows Terminal and VS Code choose; the person's own shell elsewhere. On macOS it is a login
 * shell, as in Terminal, so the PATH the profile sets is there even for an app opened from Finder.
 */
export function terminalShell(environment = process.env) {
  if (process.platform === "win32") {
    const pwsh = onPath("pwsh.exe", environment);
    if (pwsh) return { file: pwsh, args: ["-NoLogo"] };
    const root = environment.SystemRoot ?? environment.SYSTEMROOT ?? "C:\\Windows";
    const windows = join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    if (existsSync(windows)) return { file: windows, args: ["-NoLogo"] };
    return { file: environment.ComSpec ?? environment.COMSPEC ?? "cmd.exe", args: [] };
  }
  const fallback = process.platform === "darwin" ? "/bin/zsh" : "/bin/bash";
  const file = [environment.SHELL, fallback].find((candidate) => candidate && existsSync(candidate)) ?? "/bin/sh";
  return { file, args: process.platform === "darwin" ? ["-l"] : [] };
}

/** What `frameseq studio` sets for the server it starts, which a `frameseq` run in the terminal must not inherit. */
const serverSettings = /^FRAMESEQ_(ENTRY|BUILD_DIR|SOURCE_MARKS|OPEN_BROWSER|REMOTE|STUDIO(_.*)?)$/;

/**
 * The terminal's environment is the Studio's, less the settings of the server it runs in. In the
 * app, the app's own `frameseq` comes first on the PATH, so the terminal runs the FrameSeq the
 * Studio runs, whether or not the installer put it on the PATH.
 */
export function terminalEnvironment(packageRoot, environment = process.env) {
  const result = Object.fromEntries(Object.entries(environment)
    .filter(([name, value]) => value !== undefined && !serverSettings.test(name)));
  result.COLORTERM = "truecolor";
  // An update runs from a folder of its own; the command is still the app's.
  const bin = resolve(installedApp(packageRoot), "..", "bin");
  if (runsFromBundle(packageRoot) && existsSync(bin)) {
    const key = pathKey(result);
    result[key] = result[key] ? `${bin}${delimiter}${result[key]}` : bin;
  }
  return result;
}

/** On Windows the shell runs in ConPTY, whose line wrapping xterm.js follows once it knows. */
const ptyKind = process.platform === "win32"
  ? { backend: "conpty", buildNumber: Number(release().split(".")[2]) || undefined }
  : undefined;

const send = (socket, message) => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};

const size = (value, fallback) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 2 && number <= 1000 ? number : fallback;
};

/** One shell, and the page that shows it, if one does. */
class TerminalSession {
  constructor(spawn, { shell, cwd, environment, cols, rows }) {
    this.id = randomBytes(12).toString("hex");
    this.shell = shell;
    this.replay = "";
    this.socket = undefined;
    this.timer = undefined;
    this.unseen = 0;
    this.paused = false;
    this.process = spawn(shell.file, shell.args, { name: "xterm-256color", cols, rows, cwd, env: environment });
    this.process.onData((data) => this.output(data));
    this.process.onExit(({ exitCode }) => this.ended(exitCode));
  }

  /** Show the shell in a page. A shell is shown in one page at a time; the newest one takes it. */
  attach(socket) {
    const previous = this.socket;
    this.socket = socket;
    if (previous && previous !== socket) previous.close(4000, "Opened in another window");
    clearTimeout(this.timer);
    this.unseen = 0;
    this.resume();
    // The replay's cursor movements assume the size the shell has now, which the page draws it at.
    send(socket, {
      type: "ready",
      id: this.id,
      shell: basename(this.shell.file),
      replay: this.replay,
      cols: this.process.cols,
      rows: this.process.rows,
      pty: ptyKind,
    });
    socket.on("message", (raw) => this.receive(raw));
    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.resume();
      this.timer = setTimeout(() => this.kill(), detachedLife);
    });
  }

  receive(raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message?.type === "input" && typeof message.data === "string") {
      this.process.write(message.data);
    } else if (message?.type === "resize") {
      try {
        this.process.resize(size(message.cols, this.process.cols), size(message.rows, this.process.rows));
      } catch {
        // The shell has just exited.
      }
    } else if (message?.type === "ack") {
      this.unseen = Math.max(0, this.unseen - (Number(message.count) || 0));
      if (this.unseen < lowWater) this.resume();
    } else if (message?.type === "kill") {
      this.kill();
    }
  }

  output(data) {
    this.replay += data;
    if (this.replay.length > 2 * replayLength) {
      // Start the replay on a line of its own, never in the middle of an escape sequence.
      const cut = this.replay.indexOf("\n", this.replay.length - replayLength);
      this.replay = this.replay.slice(cut < 0 ? -replayLength : cut + 1);
    }
    if (!this.socket) return;
    send(this.socket, { type: "output", data });
    this.unseen += data.length;
    if (!this.paused && this.unseen > highWater) {
      this.paused = true;
      this.process.pause();
    }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.process.resume();
  }

  ended(code) {
    clearTimeout(this.timer);
    registry.sessions.delete(this.id);
    if (!this.socket) return;
    send(this.socket, { type: "exit", code });
    this.socket.close(1000);
  }

  kill() {
    clearTimeout(this.timer);
    registry.sessions.delete(this.id);
    try {
      this.process.kill();
    } catch {
      // It had already exited.
    }
  }
}

/** End every shell, as when the Studio opens another presentation in another folder. */
export function closeTerminals() {
  for (const session of [...registry.sessions.values()]) session.kill();
}

/**
 * The Studio's terminal: a shell in the presentation's folder, shown by the page over a
 * WebSocket. A terminal runs anything its user types, so `allowed` decides who may open one, and
 * the Studio grants it only to its own page on this computer, even when started with --host.
 */
export function attachTerminals(server, { cwd, packageRoot, allowed }) {
  if (!registry.hooked) {
    registry.hooked = true;
    process.once("exit", closeTerminals);
  }
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });

  const open = (socket, url) => {
    const existing = registry.sessions.get(url.searchParams.get("id") ?? "");
    if (existing) {
      existing.attach(socket);
      return;
    }
    // A page picking up the shell it had before a reload starts none if that shell has gone.
    if (url.searchParams.get("attach") === "1") {
      send(socket, { type: "gone" });
      socket.close(1000);
      return;
    }
    const pty = loadPty();
    let session;
    try {
      if (!pty.spawn) throw new Error(pty.error);
      session = new TerminalSession(pty.spawn, {
        shell: terminalShell(),
        cwd,
        environment: terminalEnvironment(packageRoot),
        cols: size(url.searchParams.get("cols"), 80),
        rows: size(url.searchParams.get("rows"), 24),
      });
    } catch (error) {
      server.config.logger.warn(`FrameSeq Studio: the terminal could not start: ${error instanceof Error ? error.message : error}`);
      send(socket, { type: "error", message: error instanceof Error ? error.message : String(error) });
      socket.close(1000);
      return;
    }
    registry.sessions.set(session.id, session);
    session.attach(socket);
  };

  server.httpServer?.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://studio.local");
    if (url.pathname !== terminalPath) return;
    if (!allowed(request, url)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => open(client, url));
  });
}
