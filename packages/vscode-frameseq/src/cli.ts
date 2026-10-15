import { access, realpath } from "node:fs/promises";
import { delimiter, dirname, join, sep } from "node:path";

export const notInstalledMessage = "FrameSeq is not installed for this deck. Install the FrameSeq app "
  + "from https://github.com/pride7/frameseq/releases/latest, which needs no Node.js, install it once with "
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

/** The CLI inside the FrameSeq app, from the folder its `frameseq` command lives in. */
function appCli(bin: string): string {
  return join(dirname(bin), "app", "scripts", "frameseq.mjs");
}

/**
 * The CLI of a global install, found from the `frameseq` command it put on the PATH, so the
 * extension runs the same FrameSeq a terminal would: an npm install, or the FrameSeq app, whose
 * command sits in its bin folder beside the app itself. npm is not asked: it masks anything in
 * its output that looks like a UUID, paths included.
 */
export async function globalCli(path = process.env.PATH ?? ""): Promise<string | undefined> {
  for (const directory of path.split(delimiter).filter(Boolean)) {
    if (process.platform === "win32") {
      if (!await exists(join(directory, "frameseq.cmd"))) continue;
      // npm writes its .cmd shim into the prefix, beside the node_modules it installed into.
      const cli = cliIn(join(directory, "node_modules"));
      if (await exists(cli)) return cli;
      if (await exists(appCli(directory))) return appCli(directory);
      continue;
    }
    // npm links bin/frameseq to the package's own script; the app links it to its launcher.
    try {
      const target = await realpath(join(directory, "frameseq"));
      if (target.endsWith(sep + join(...cliPath))) return target;
      if (await exists(appCli(dirname(target)))) return appCli(dirname(target));
    } catch {
      // Not in this directory.
    }
  }
  return undefined;
}

/**
 * The Node.js that runs a CLI: the FrameSeq app's own, beside the app, so a computer with only
 * the app needs no Node.js of its own; and otherwise `node` from the PATH.
 */
export async function runtimeFor(cli: string): Promise<string> {
  const root = dirname(dirname(dirname(cli)));
  if (!await exists(join(root, "app", "frameseq-bundle.json"))) return "node";
  const node = process.platform === "win32" ? join(root, "node", "node.exe") : join(root, "node", "bin", "node");
  return await exists(node) ? node : "node";
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
