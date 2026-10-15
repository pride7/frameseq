import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, join, relative } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";

/**
 * The Studio's assistant: Claude Code or Codex, whichever this computer has, run without a
 * terminal in the presentation's folder, with FrameSeq's MCP server so it can check and look at
 * the slides it edits. Each runs on its own login, so the Studio needs no key of its own.
 *
 * What the agent prints is turned into a few kinds of event, the same for both, which the page
 * draws as a conversation: its text, the tools it uses, the files it changes, and the end.
 */

const agentList = [
  { id: "claude", name: "Claude Code", command: "claude" },
  { id: "codex", name: "Codex", command: "codex" },
];

/** Folders a program installed for one user lands in, which a Studio opened from a menu may not have on its PATH. */
function searchPath() {
  const home = homedir();
  const extra = process.platform === "win32"
    ? [join(home, ".local", "bin"), process.env.APPDATA && join(process.env.APPDATA, "npm")]
    : [join(home, ".local", "bin"), join(home, ".claude", "local"), join(home, ".npm-global", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  return [...(process.env.PATH ?? "").split(delimiter), ...extra].filter(Boolean);
}

/**
 * How to start a program found on the PATH. An npm shim on Windows is a .cmd file, which Node.js
 * starts only through cmd.exe and its quoting; the script the shim runs is started instead.
 */
export function findCommand(name) {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const folder of searchPath()) {
    for (const extension of extensions) {
      const path = join(folder, `${name}${extension}`);
      if (!existsSync(path)) continue;
      if (process.platform === "win32" && extension === "") continue;
      if (/\.(cmd|bat)$/i.test(path)) {
        const shim = readFileSync(path, "utf8");
        const script = shim.match(/"%(?:~)?dp0%?\\([^"]+?\.(?:c|m)?js)"/i)?.[1];
        if (script && existsSync(join(folder, script))) return { command: process.execPath, prefix: [join(folder, script)], path };
        return { command: process.env.ComSpec ?? "cmd.exe", prefix: ["/d", "/s", "/c", path], path };
      }
      return { command: path, prefix: [], path };
    }
  }
  return undefined;
}

/** Stop a process and the ones it started, as an agent's MCP server and the browser that serves. */
function stopTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else child.kill("SIGTERM");
}

const guidance = (file) => `You are helping write a FrameSeq presentation in FrameSeq Studio. The presentation is ${file}, a TypeScript file written with FrameSeq's commands.

- Edit ${file} directly. The Studio reloads it and shows the result, and the user can undo your changes there.
- Use the frameseq MCP tools: guide (read it before writing FrameSeq for the first time), outline (find the lines of a slide), check (run it after every edit and fix what it reports), and screenshot (look at the slides you changed).
- Keep each change to what was asked. Do not create other files unless asked, and do not run shell commands.
- Answer briefly, in the language the user writes in, saying what you changed.`;

/** The user's request with what the Studio knows about where they are. */
function composePrompt({ text, context, file, first }) {
  const parts = [];
  if (first) parts.push(guidance(file), "");
  if (context?.slide) {
    const where = context.slide.lines ? ` (lines ${context.slide.lines[0]}-${context.slide.lines[1]})` : "";
    parts.push(`The user is looking at slide ${context.slide.index}${context.slide.label ? `, "${context.slide.label}"` : ""}${where}.`);
  }
  if (context?.selection?.text) {
    parts.push(`They selected lines ${context.selection.from}-${context.selection.to}:`, "```ts", context.selection.text, "```");
  }
  if (context?.problems?.length) {
    parts.push("The Studio currently reports:", ...context.problems.map((problem) => `- ${problem}`));
  }
  if (parts.length > 0) parts.push("", "Request:");
  parts.push(text);
  return parts.join("\n");
}

export function createAssistant({ cliPath, send }) {
  /** One conversation per Studio: the agent, its session, and everything it has said, for a page that reloads. */
  let conversation = { agent: undefined, session: undefined, events: [], file: undefined };
  let running;
  let stopped = false;
  let found;

  let startedAt = 0;
  const emit = (event) => {
    // Every request ends saying how long it took, whichever agent answered it.
    if (event.type === "done" && !event.seconds) event.seconds = Math.round((Date.now() - startedAt) / 1000);
    conversation.events.push(event);
    send(event);
  };

  function agents() {
    found ??= agentList.map((agent) => {
      const command = findCommand(agent.command);
      if (!command) return { id: agent.id, name: agent.name, available: false };
      const result = spawnSync(command.command, [...command.prefix, "--version"], { encoding: "utf8", timeout: 15_000, windowsHide: true });
      const version = `${result.stdout ?? ""}`.match(/\d+\.\d+(?:\.\d+)?/)?.[0];
      return { id: agent.id, name: agent.name, available: result.status === 0, version };
    });
    return found;
  }

  function state() {
    return {
      agents: agents(),
      conversation: { agent: conversation.agent, session: conversation.session, running: Boolean(running), events: conversation.events },
    };
  }

  /** The MCP server the agent starts: this FrameSeq, rendering in the Studio's own server. */
  const mcpArgs = (entry, preview) => [cliPath, "mcp", entry, ...(preview ? ["--preview", preview] : [])];

  async function claudeCommand({ entry, preview, prompt, session }) {
    const config = join(tmpdir(), `frameseq-assistant-${process.pid}.json`);
    await writeFile(config, JSON.stringify({ mcpServers: { frameseq: { command: process.execPath, args: mcpArgs(entry, preview) } } }), "utf8");
    return {
      args: [
        "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
        "--permission-mode", "acceptEdits",
        "--allowedTools", "Read", "Edit", "MultiEdit", "Write", "Glob", "Grep", "mcp__frameseq",
        "--disallowedTools", "Bash",
        "--strict-mcp-config", "--mcp-config", config,
        ...(session ? ["--resume", session] : []),
      ],
      input: prompt,
      cleanup: () => rm(config, { force: true }),
    };
  }

  function codexCommand({ entry, preview, prompt, session, folder }) {
    const settings = [
      "-c", `mcp_servers.frameseq.command=${JSON.stringify(process.execPath)}`,
      "-c", `mcp_servers.frameseq.args=${JSON.stringify(mcpArgs(entry, preview))}`,
    ];
    const options = ["--json", "--skip-git-repo-check", "-s", "workspace-write", "-C", folder, ...settings];
    return {
      args: session ? ["exec", "resume", ...options, session, "-"] : ["exec", ...options, "-"],
      input: prompt,
      cleanup: async () => undefined,
    };
  }

  /** Claude Code's stream-json lines, as the page's events. */
  function claudeReader() {
    const tools = new Map();
    const streamed = new Set();
    return (line) => {
      const event = JSON.parse(line);
      if (event.type === "system" && event.subtype === "init") {
        conversation.session = event.session_id;
        emit({ type: "session", id: event.session_id });
      } else if (event.type === "stream_event") {
        const delta = event.event?.delta;
        if (event.event?.type === "content_block_delta" && delta?.type === "text_delta" && delta.text) {
          streamed.add(event.api_message_id ?? event.event?.message?.id ?? "");
          emit({ type: "text", text: delta.text });
        }
      } else if (event.type === "assistant") {
        for (const block of event.message?.content ?? []) {
          if (block.type === "text" && block.text && !streamed.has(event.message?.id ?? "")) emit({ type: "text", text: block.text });
          if (block.type === "text") emit({ type: "break" });
          if (block.type === "tool_use" && block.name !== "ToolSearch") {
            tools.set(block.id, block);
            emit({ type: "tool", id: block.id, name: block.name, input: describeInput(block.name, block.input), status: "running" });
          }
        }
      } else if (event.type === "user") {
        for (const block of event.message?.content ?? []) {
          const tool = block.type === "tool_result" ? tools.get(block.tool_use_id) : undefined;
          if (!tool) continue;
          const failed = Boolean(block.is_error);
          emit({ type: "tool", id: tool.id, name: tool.name, input: describeInput(tool.name, tool.input), status: failed ? "failed" : "done" });
          if (!failed && ["Edit", "MultiEdit", "Write"].includes(tool.name) && tool.input?.file_path) emit({ type: "file", path: tool.input.file_path });
        }
      } else if (event.type === "result") {
        conversation.session = event.session_id ?? conversation.session;
        emit({
          type: "done",
          ok: !event.is_error,
          error: event.is_error ? `${event.result ?? event.subtype ?? ""}` : undefined,
          denied: (event.permission_denials ?? []).map((denial) => denial.tool_name),
        });
      }
    };
  }

  /** Codex's JSON events, as the page's events. */
  function codexReader() {
    let turn = false;
    return (line) => {
      const event = JSON.parse(line);
      const item = event.item;
      if (event.type === "thread.started") {
        conversation.session = event.thread_id;
        emit({ type: "session", id: event.thread_id });
      } else if (event.type === "turn.started") {
        turn = true;
      } else if (item?.type === "agent_message" && event.type === "item.completed") {
        emit({ type: "text", text: item.text });
        emit({ type: "break" });
      } else if (item?.type === "mcp_tool_call") {
        const status = event.type === "item.started" ? "running" : item.status === "failed" ? "failed" : "done";
        emit({ type: "tool", id: item.id, name: `mcp__${item.server}__${item.tool}`, input: describeInput(item.tool, item.arguments), status });
      } else if (item?.type === "command_execution") {
        const status = event.type === "item.started" ? "running" : item.exit_code === 0 ? "done" : "failed";
        emit({ type: "tool", id: item.id, name: "Command", input: `${item.command ?? ""}`.slice(0, 160), status });
      } else if (item?.type === "file_change") {
        const status = event.type === "item.started" ? "running" : item.status === "failed" ? "failed" : "done";
        const paths = (item.changes ?? []).map((change) => change.path);
        emit({ type: "tool", id: item.id, name: "Edit", input: paths.map((path) => basename(path)).join(", "), status });
        if (status === "done") for (const path of paths) emit({ type: "file", path });
      } else if (item?.type === "error" && turn) {
        emit({ type: "notice", text: item.message });
      } else if (event.type === "turn.completed") {
        emit({ type: "done", ok: true });
      } else if (event.type === "turn.failed") {
        emit({ type: "done", ok: false, error: event.error?.message ?? "" });
      }
    };
  }

  async function sendMessage({ agent, text, context, entry, preview }) {
    if (running) throw Object.assign(new Error("The assistant is still working on the last request."), { status: 409 });
    const chosen = agents().find((candidate) => candidate.id === agent && candidate.available);
    if (!chosen) throw Object.assign(new Error(`${agent} was not found on this computer.`), { status: 404 });
    const command = findCommand(agentList.find((candidate) => candidate.id === agent).command);
    // Another agent, or another presentation, starts a new conversation.
    if (conversation.agent !== agent || conversation.file !== entry) conversation = { agent, session: undefined, events: [], file: entry };
    const folder = dirname(entry);
    const file = relative(folder, entry) || basename(entry);
    const prompt = composePrompt({ text, context, file, first: !conversation.session });
    const plan = agent === "claude"
      ? await claudeCommand({ entry, preview, prompt, session: conversation.session })
      : codexCommand({ entry, preview, prompt, session: conversation.session, folder });

    emit({ type: "user", text, context: context?.summary });
    const child = spawn(command.command, [...command.prefix, ...plan.args], {
      cwd: folder,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    running = child;
    startedAt = Date.now();
    let stderr = "";
    let finished = false;
    const read = agent === "claude" ? claudeReader() : codexReader();
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (!line.trim()) return;
      try {
        read(line);
        if (conversation.events.at(-1)?.type === "done") finished = true;
      } catch {
        // A line that is not an event, such as a warning printed before the stream begins.
      }
    });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    child.stdin.on("error", () => undefined);
    child.stdin.end(plan.input);
    child.on("error", (error) => {
      if (!finished) emit({ type: "done", ok: false, error: error.message });
      finished = true;
    });
    child.on("close", (code) => {
      running = undefined;
      void plan.cleanup();
      if (!finished) emit({ type: "done", ok: false, error: stopped ? "" : (stderr.trim().split("\n").slice(-6).join("\n") || `${chosen.name} stopped with code ${code}.`), stopped });
      stopped = false;
      send({ type: "idle" });
    });
    return { started: true };
  }

  function stop() {
    if (!running) return;
    stopped = true;
    stopTree(running);
  }

  function reset() {
    stop();
    conversation = { agent: undefined, session: undefined, events: [], file: undefined };
  }

  return { state, send: sendMessage, stop, reset, refresh: () => { found = undefined; return agents(); }, close: stop };
}

/** A short line about what a tool was given: the file it reads or changes, or the slide it shows. */
function describeInput(name, input) {
  if (!input || typeof input !== "object") return "";
  if (typeof input.file_path === "string") return basename(input.file_path);
  if (typeof input.pattern === "string") return input.pattern;
  if (Array.isArray(input.slides)) return input.slides.join(", ");
  if (Number.isInteger(input.slide)) return String(input.slide);
  return "";
}
