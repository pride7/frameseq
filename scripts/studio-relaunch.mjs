import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { appLayers, layerFile } from "./app-layers.mjs";

/**
 * Start the Studio again on the newer FrameSeq the app has installed, in place of this one: the
 * same presentation, in the same folder, on the same port, so the page that asked reloads into
 * it. The new server writes where this one did, as to the app's window and its log. It cannot
 * share the window's pipe that stops this one, since on Windows that pipe ends with this
 * process, and a read this process has waiting on it holds up another's start; it watches the
 * window's process instead. A version that does not come up is set aside, as
 * `frameseq update --revert` would, and this version starts again instead, so the window is
 * never left with nothing to show.
 *
 * The server this starts reads FRAMESEQ_STUDIO_RELAUNCHED, FRAMESEQ_STUDIO_PORT, and
 * FRAMESEQ_STUDIO_WINDOW_PID, so later versions keep reading them.
 */
export async function relaunchStudio({ server, app, packageRoot, args, failed = async () => undefined }) {
  const logger = server.config.logger;
  const port = studioPort(server);
  const layer = appLayers(app)[0];
  await server.close();
  const environment = {
    ...process.env,
    FRAMESEQ_STUDIO_RELAUNCHED: "1",
    FRAMESEQ_STUDIO_PORT: String(port),
    // The app's window started the first server; a server started again passes it on.
    ...(args.includes("--desktop") ? { FRAMESEQ_STUDIO_WINDOW_PID: process.env.FRAMESEQ_STUDIO_WINDOW_PID ?? String(process.ppid) } : {}),
    // With no console of its own, the new server starts its console programs hidden.
    FRAMESEQ_HIDE_CONSOLES: "1",
  };
  logger.info(`FrameSeq Studio: starting again on FrameSeq ${layer?.version ?? "as installed"}.`);
  const started = await serve(join(app, "scripts", "app-launch.mjs"), args, environment, port);
  if (started !== true) {
    const message = `FrameSeq ${layer?.version ?? ""} did not start: ${started}`;
    logger.error(`FrameSeq Studio: ${message}`);
    if (layer) await rm(join(layer.path, layerFile), { force: true }).catch(() => undefined);
    await failed(layer?.version, message).catch(() => undefined);
    await serve(join(packageRoot, "scripts", "frameseq.mjs"), args, environment, port);
  }
  process.exit(0);
}

/** The port the server listens on, which the Studio starts again on; undefined before it listens. */
export function studioPort(server) {
  const address = server.httpServer?.address();
  return address && typeof address === "object" ? address.port : undefined;
}

/**
 * Run a Studio server on its own, outliving this process, and wait until it answers: true, or
 * why it did not. It is detached so that this process's end does not take it along, as Node.js
 * ends the processes it started on Windows.
 */
function serve(cli, args, environment, port) {
  return new Promise((resolveServe) => {
    let settled = false;
    let timer;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveServe(result);
    };
    let child;
    try {
      child = spawn(process.execPath, [cli, ...args], {
        cwd: process.cwd(),
        env: environment,
        stdio: ["ignore", "inherit", "inherit"],
        detached: true,
        windowsHide: true,
      });
    } catch (error) {
      settle(error instanceof Error ? error.message : String(error));
      return;
    }
    child.once("error", (error) => settle(error.message));
    child.once("exit", (code) => settle(`it stopped with exit code ${code}.`));
    child.unref();
    timer = setTimeout(() => {
      child.kill();
      settle("it did not answer within three minutes.");
    }, 180_000);
    const ask = async () => {
      while (!settled) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 300));
        try {
          const response = await fetch(`http://localhost:${port}/__frameseq/studio/session`, { signal: AbortSignal.timeout(5000) });
          if (response.ok) settle(true);
        } catch {
          // Not listening yet.
        }
      }
    };
    void ask();
  });
}
