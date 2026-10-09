import { access, realpath } from "node:fs/promises";
import { delimiter, join, sep } from "node:path";

export const notInstalledMessage = "FrameSeq is not installed for this deck. Install it once with "
  + "`npm install --global @pride7/frameseq`, or add it to the project with "
  + "`npm install --save-dev @pride7/frameseq`.";

const cliPath = ["@pride7", "frameseq", "scripts", "frameseq.mjs"];

/** The FrameSeq CLI as npm installs it inside a node_modules directory. */
export function cliIn(nodeModules: string): string {
  return join(nodeModules, ...cliPath);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The CLI of a global install, found from the `frameseq` command it put on the PATH, so the
 * extension runs the same FrameSeq a terminal would. npm is not asked: it masks anything in its
 * output that looks like a UUID, paths included.
 */
export async function globalCli(path = process.env.PATH ?? ""): Promise<string | undefined> {
  for (const directory of path.split(delimiter).filter(Boolean)) {
    if (process.platform === "win32") {
      // npm writes its .cmd shim into the prefix, beside the node_modules it installed into.
      const cli = cliIn(join(directory, "node_modules"));
      if (await exists(join(directory, "frameseq.cmd")) && await exists(cli)) return cli;
      continue;
    }
    // npm links bin/frameseq to the package's own script.
    try {
      const target = await realpath(join(directory, "frameseq"));
      if (target.endsWith(sep + join(...cliPath))) return target;
    } catch {
      // Not in this directory.
    }
  }
  return undefined;
}

/**
 * The CLI that runs a deck: the project's own FrameSeq, the repository's when the deck is
 * inside it, and otherwise a global install, so a slide file needs no project around it.
 */
export async function findCli(
  root: string,
  global: () => Promise<string | undefined> = globalCli,
): Promise<string | undefined> {
  for (const candidate of [cliIn(join(root, "node_modules")), join(root, "scripts", "frameseq.mjs")]) {
    if (await exists(candidate)) return candidate;
  }
  return global();
}
