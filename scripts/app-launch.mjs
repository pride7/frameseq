#!/usr/bin/env node

/**
 * How the FrameSeq app starts FrameSeq. Its launchers, shortcuts, and window run this, and it
 * runs the newest update installed for the app, or else the app's own FrameSeq; see
 * app-layers.mjs. An update replaces everything but this, so it stays this small.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chosenApp } from "./app-layers.mjs";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await import(pathToFileURL(join(chosenApp(app), "scripts", "frameseq.mjs")).href);
