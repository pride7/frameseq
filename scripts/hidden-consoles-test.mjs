#!/usr/bin/env node

// A Studio started in the background starts its child processes hidden on Windows: through
// node:child_process's functions and through bindings imported from it before, as Vite's are,
// with or without options, while a child that asks for a window keeps it. The functions still
// work, callbacks and promisified forms included.

import assert from "node:assert/strict";
import { ChildProcess, exec, execFile, execFileSync, execSync, spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { hideConsoles } from "./hidden-consoles.mjs";

const seen = [];
const start = ChildProcess.prototype.spawn;
ChildProcess.prototype.spawn = function recordingSpawn(options) {
  seen.push(Boolean(options.windowsHide));
  return start.call(this, options);
};

hideConsoles();

const node = process.execPath;
const quiet = ["-e", ""];
const finished = (child) => new Promise((resolveExit) => child.on("close", resolveExit));
const last = () => seen.at(-1);

// The bindings were imported before hideConsoles(), as Vite's are.
await finished(spawn(node, quiet));
assert.equal(last(), true, "spawn(command, args)");
await finished(spawn(node, quiet, { stdio: "ignore" }));
assert.equal(last(), true, "spawn(command, args, options)");
await finished(spawn(node, quiet, { windowsHide: false }));
assert.equal(last(), false, "a child that asks for a window keeps it");
await new Promise((done) => exec(`"${node}" -e ""`, () => done()));
assert.equal(last(), true, "exec(command, callback)");
await new Promise((done) => exec(`"${node}" -e ""`, { encoding: "utf8" }, () => done()));
assert.equal(last(), true, "exec(command, options, callback)");
const { stdout } = await promisify(exec)(`"${node}" -e "process.stdout.write('ok')"`);
assert.equal(stdout, "ok", "promisified exec still resolves to its output");
assert.equal(last(), true, "promisified exec");
await new Promise((done) => execFile(node, quiet, () => done()));
assert.equal(last(), true, "execFile(file, args, callback)");
// A program that needs no arguments to finish, as Node.js without any would wait for input.
const bare = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "hostname.exe") : "true";
await new Promise((done) => execFile(bare, () => done()));
assert.equal(last(), true, "execFile(file, callback)");
const promised = await promisify(execFile)(node, ["-e", "process.stdout.write('ok')"]);
assert.equal(promised.stdout, "ok");
assert.equal(last(), true, "promisified execFile");
assert.equal(spawnSync(node, quiet).status, 0);
assert.equal(last(), true, "spawnSync");
assert.equal(execFileSync(node, ["-e", "process.stdout.write('ok')"], { encoding: "utf8" }), "ok");
assert.equal(last(), true, "execFileSync");
execSync(`"${node}" -e ""`);
assert.equal(last(), true, "execSync");

ChildProcess.prototype.spawn = start;
console.log("Hidden consoles test passed: child processes start hidden through every function and earlier imports, unless they ask for a window.");
