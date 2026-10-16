import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { configDirectory } from "./studio-files.mjs";

/**
 * The Studios running on this computer, so that opening a presentation, as a double-click on an
 * .fsq file does, shows the Studio that already has it open instead of starting a second one on
 * the same file, and fills a Studio still on its start page instead of opening another window.
 * Each Studio keeps a small file in the settings folder, named after its process, saying where it
 * listens; what it shows is asked of the Studio itself.
 */

const folder = () => join(configDirectory(), "studios");

const sameFile = (left, right) => (process.platform === "win32"
  ? resolve(left).toLowerCase() === resolve(right).toLowerCase()
  : resolve(left) === resolve(right));

/** Note this Studio as running on `port`; returns a function that takes the note away. */
export function listStudio({ port, desktop = false }) {
  const path = join(folder(), `${process.pid}.json`);
  const note = JSON.stringify({ pid: process.pid, port, desktop });
  mkdirSync(folder(), { recursive: true });
  writeFileSync(path, note, "utf8");
  return () => {
    // A restarted server notes its port again; only the note this one wrote is its to remove.
    try {
      if (readFileSync(path, "utf8") === note) rmSync(path, { force: true });
    } catch {
      // Already gone.
    }
  };
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process is there, but another user's.
    return error?.code === "EPERM";
  }
}

/** The Studios that answer, each with what it shows: `entry` is null on the start page. */
export async function runningStudios() {
  const names = await readdir(folder()).catch(() => []);
  const studios = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => {
    const path = join(folder(), name);
    let note;
    try {
      note = JSON.parse(await readFile(path, "utf8"));
    } catch {
      return undefined;
    }
    if (!Number.isInteger(note?.pid) || !Number.isInteger(note?.port) || !alive(note.pid)) {
      // Left behind by a Studio that stopped without warning.
      await rm(path, { force: true });
      return undefined;
    }
    try {
      const response = await fetch(`http://localhost:${note.port}/__frameseq/studio/session`, { signal: AbortSignal.timeout(2000) });
      const session = await response.json();
      if (typeof session?.token !== "string") return undefined;
      return { ...note, token: session.token, entry: typeof session.entry === "string" ? session.entry : null };
    } catch {
      return undefined;
    }
  }));
  return studios.filter(Boolean);
}

/**
 * The Studio to show `entry` in: one that has it open, or else one on its start page, which then
 * opens it. Undefined when there is none and a Studio of its own has to start.
 */
export async function studioFor(entry) {
  const studios = await runningStudios();
  return studios.find((studio) => studio.entry && sameFile(studio.entry, entry))
    ?? studios.find((studio) => studio.entry === null);
}

/** The title of the Studio's window once it shows `entry`, as its page sets it. */
export const studioTitle = (entry) => `${basename(entry)} · FrameSeq Studio`;

/** Ask a running Studio to come to the front, opening `entry` first when it is on its start page. */
export async function showInStudio(studio, entry) {
  try {
    const response = await fetch(`http://localhost:${studio.port}/__frameseq/studio/files/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-FrameSeq-Studio": studio.token },
      body: JSON.stringify({ path: entry }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
