import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { configDirectory } from "./studio-files.mjs";

/**
 * The assistant's conversations about each presentation, kept in FrameSeq's own settings folder
 * rather than beside the presentation, so they never travel with it into a repository or to
 * someone it is shared with. Each conversation keeps what the page draws and the agent's session,
 * with which Claude Code or Codex carries it on where it left off.
 */

/** How many conversations a presentation keeps; the one used longest ago goes first. */
export const keptConversations = 20;

function historyFile(entry) {
  const path = resolve(entry);
  const key = createHash("sha256").update(process.platform === "win32" ? path.toLowerCase() : path).digest("hex").slice(0, 16);
  return join(configDirectory(), "assistant", `${key}.json`);
}

const isConversation = (value) => value && typeof value.id === "string" && Array.isArray(value.events);

/** A presentation's conversations, the one used last first. */
export function loadConversations(entry) {
  try {
    const data = JSON.parse(readFileSync(historyFile(entry), "utf8"));
    return (Array.isArray(data.conversations) ? data.conversations : []).filter(isConversation);
  } catch {
    return [];
  }
}

/** Writes to one file, one after another, so a later one never lands under an earlier one. */
const writing = new Map();

/**
 * Change a presentation's conversations as they are on disk now, so that two Studios open on it
 * keep each other's.
 */
function change(entry, edit) {
  const file = historyFile(entry);
  const next = (writing.get(file) ?? Promise.resolve()).then(async () => {
    const conversations = edit(loadConversations(entry))
      .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0))
      .slice(0, keptConversations);
    await mkdir(dirname(file), { recursive: true });
    const partial = `${file}.${process.pid}.tmp`;
    await writeFile(partial, JSON.stringify({ file: resolve(entry), conversations }), "utf8");
    await rename(partial, file);
  }).catch(() => undefined);
  writing.set(file, next);
  return next;
}

export const keepConversation = (entry, conversation) =>
  change(entry, (conversations) => [conversation, ...conversations.filter((other) => other.id !== conversation.id)]);

export const forgetConversation = (entry, id) =>
  change(entry, (conversations) => conversations.filter((other) => other.id !== id));

/**
 * The events worth keeping to draw a conversation again: the pieces an answer streamed in as,
 * joined, and only the last state of each tool it used.
 */
export function compactEvents(events) {
  const kept = [];
  const tools = new Map();
  for (const event of events) {
    const last = kept.at(-1);
    if (event.type === "session") continue;
    if (event.type === "text" && last?.type === "text") {
      kept[kept.length - 1] = { ...last, text: last.text + event.text };
    } else if (event.type === "tool" && tools.has(event.id)) {
      kept[tools.get(event.id)] = event;
    } else {
      if (event.type === "tool") tools.set(event.id, kept.length);
      kept.push(event);
    }
  }
  return kept;
}
