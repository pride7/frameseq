import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, join, relative } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { configDirectory } from "./studio-files.mjs";

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

const claudeModels = ["fable", "opus", "sonnet", "haiku"];
const claudeEfforts = ["low", "medium", "high", "xhigh", "max"];
const safeValue = (value) => typeof value === "string" && /^[\w.:-]{1,80}$/.test(value) ? value : undefined;

/** Claude Code's own settings, for the model and effort a request uses when it names none. */
function claudeSettings() {
  const folder = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
  try {
    return JSON.parse(readFileSync(join(folder, "settings.json"), "utf8"));
  } catch {
    return {};
  }
}

/**
 * Ask Codex's app server, over JSON-RPC on its standard input and output, for what a request
 * cannot tell: the models this account has, the settings Codex uses by default, and how much
 * of the plan is used. Nothing here runs a model.
 */
async function askCodex(questions) {
  const command = findCommand("codex");
  if (!command) return {};
  const child = spawn(command.command, [...command.prefix, "app-server"], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
  const waiting = new Map();
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const message = JSON.parse(line);
      if (message.id !== undefined) waiting.get(message.id)?.(message);
    } catch {
      // Not a message of the protocol.
    }
  });
  let next = 1;
  const ask = (method, params = {}) => new Promise((resolveAnswer) => {
    const id = next++;
    waiting.set(id, (message) => resolveAnswer(message.result));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    setTimeout(() => resolveAnswer(undefined), 15_000);
  });
  child.on("error", () => undefined);
  child.stdin.on("error", () => undefined);
  try {
    await ask("initialize", { clientInfo: { name: "frameseq-studio", title: "FrameSeq Studio", version: "1" } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "initialized" })}\n`);
    const answers = {};
    for (const [name, method] of Object.entries(questions)) answers[name] = await ask(method);
    return answers;
  } finally {
    stopTree(child);
  }
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

  // ── Models, effort, speed, and how much of the plan is used ─────────────────────────────
  const usageFile = join(configDirectory(), "assistant-usage.json");
  /** What each agent last said of its limits; Claude Code says it only while it answers. */
  let usage = {};
  try {
    usage = JSON.parse(readFileSync(usageFile, "utf8"));
  } catch {
    // Nothing known yet.
  }
  const rememberUsage = (agent, value) => {
    usage[agent] = { ...usage[agent], ...value, at: Date.now() };
    void writeFile(usageFile, JSON.stringify(usage), "utf8").catch(() => undefined);
    send({ type: "usage", agent, usage: usage[agent] });
  };

  let codexCatalog;
  function codexOptions() {
    codexCatalog ??= askCodex({ models: "model/list", config: "config/read" }).then((answers) => {
      const models = (answers.models?.data ?? []).filter((model) => !model.hidden).map((model) => ({
        id: model.model ?? model.id,
        label: model.displayName ?? model.id,
        efforts: (model.supportedReasoningEfforts ?? []).map((effort) => effort.reasoningEffort),
        defaultEffort: model.defaultReasoningEffort,
        fast: (model.serviceTiers?.length ?? 0) > 0 || (model.additionalSpeedTiers ?? []).includes("fast"),
      }));
      if (models.length === 0) codexCatalog = undefined;
      const config = answers.config?.config ?? {};
      return { models, defaults: { model: config.model, effort: config.model_reasoning_effort, fast: config.service_tier === "fast" || config.service_tier === "priority" } };
    });
    return codexCatalog;
  }

  /** The models, efforts, and speed an agent offers, and the ones it uses unless told otherwise. */
  async function options(agent) {
    if (agent === "codex") return codexOptions();
    const settings = claudeSettings();
    const defaultModel = typeof settings.model === "string" ? settings.model : undefined;
    return {
      // Fast mode is Opus's, so it is offered with Opus and with a default that is Opus.
      models: claudeModels.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1), efforts: claudeEfforts, fast: id === "opus" })),
      defaults: { model: defaultModel, effort: settings.effortLevel, fast: settings.fastMode === true, fastByDefault: !defaultModel || /opus/i.test(defaultModel) },
    };
  }

  let codexUsageAt = 0;
  /** How much of the plan is used: Codex says so whenever it is asked, Claude Code as it answers. */
  async function readUsage(agent) {
    if (agent === "codex" && Date.now() - codexUsageAt > 20_000) {
      codexUsageAt = Date.now();
      const limits = (await askCodex({ limits: "account/rateLimits/read" })).limits?.rateLimits;
      if (limits) {
        rememberUsage("codex", {
          windows: [limits.primary, limits.secondary].filter(Boolean).map((window) => ({ minutes: window.windowDurationMins, used: (window.usedPercent ?? 0) / 100, resetsAt: window.resetsAt })),
          limited: Boolean(limits.rateLimitReachedType),
        });
      }
    }
    return usage[agent];
  }

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

  async function claudeCommand({ entry, preview, prompt, session, settings }) {
    const config = join(tmpdir(), `frameseq-assistant-${process.pid}.json`);
    await writeFile(config, JSON.stringify({ mcpServers: { frameseq: { command: process.execPath, args: mcpArgs(entry, preview) } } }), "utf8");
    return {
      args: [
        "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
        "--permission-mode", "acceptEdits",
        "--allowedTools", "Read", "Edit", "MultiEdit", "Write", "Glob", "Grep", "mcp__frameseq",
        "--disallowedTools", "Bash",
        "--strict-mcp-config", "--mcp-config", config,
        ...(safeValue(settings?.model) ? ["--model", settings.model] : []),
        ...(claudeEfforts.includes(settings?.effort) ? ["--effort", settings.effort] : []),
        // Said either way, so a fast mode turned on in Claude Code's own settings can be turned off here.
        ...(typeof settings?.fast === "boolean" ? ["--settings", JSON.stringify({ fastMode: settings.fast })] : []),
        ...(session ? ["--resume", session] : []),
      ],
      input: prompt,
      cleanup: () => rm(config, { force: true }),
    };
  }

  function codexCommand({ entry, preview, prompt, session, settings }) {
    // The sandbox is set as configuration, which `exec resume` takes as `exec` does; the
    // agent works in the folder it is started in.
    const options = [
      "--json", "--skip-git-repo-check",
      "-c", 'sandbox_mode="workspace-write"',
      "-c", `mcp_servers.frameseq.command=${JSON.stringify(process.execPath)}`,
      "-c", `mcp_servers.frameseq.args=${JSON.stringify(mcpArgs(entry, preview))}`,
      ...(safeValue(settings?.model) ? ["-m", settings.model] : []),
      ...(safeValue(settings?.effort) ? ["-c", `model_reasoning_effort=${JSON.stringify(settings.effort)}`] : []),
      ...(typeof settings?.fast === "boolean" ? ["-c", `service_tier=${JSON.stringify(settings.fast ? "fast" : "default")}`] : []),
    ];
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
      } else if (event.type === "rate_limit_event") {
        const info = event.rate_limit_info ?? {};
        const windows = Object.entries(info.unifiedWindows ?? {}).map(([id, window]) => ({
          minutes: id === "five_hour" ? 300 : id === "seven_day" ? 10_080 : undefined,
          used: window.utilization,
          resetsAt: window.resetsAt,
        }));
        rememberUsage("claude", {
          ...(windows.length > 0 ? { windows } : {}),
          limited: info.status !== undefined && info.status !== "allowed",
          ...(info.overageInUse !== undefined || info.isUsingOverage !== undefined ? { overage: Boolean(info.overageInUse || info.isUsingOverage) } : {}),
        });
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

  async function sendMessage({ agent, text, context, entry, preview, settings }) {
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
      ? await claudeCommand({ entry, preview, prompt, session: conversation.session, settings })
      : codexCommand({ entry, preview, prompt, session: conversation.session, settings });

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
      // Codex says nothing of its limits while it answers, so they are asked for afterwards.
      if (agent === "codex") {
        codexUsageAt = 0;
        void readUsage("codex").catch(() => undefined);
      }
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

  return {
    state,
    options,
    usage: readUsage,
    send: sendMessage,
    stop,
    reset,
    refresh: () => {
      found = undefined;
      codexCatalog = undefined;
      return agents();
    },
    close: stop,
  };
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
