#!/usr/bin/env node

/**
 * The VS Code extension's TypeScript server plugin, driven through a real tsserver the way VS
 * Code's TypeScript extension drives it: `.fsq` documents opened without a script kind, plugin
 * configuration sent with `configurePlugin`, and one inferred project per project root.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = resolve(packageRoot, "packages", "vscode-frameseq");
const pluginName = "frameseq-typescript-plugin";
const tsserver = resolve(packageRoot, "node_modules", "typescript", "lib", "tsserver.js");
const builtGlobals = resolve(packageRoot, "lib", "globals.d.ts");
const sourceGlobals = resolve(packageRoot, "src", "globals.ts");

assert.ok(
  existsSync(join(extensionRoot, "node_modules", pluginName, "index.js")),
  "Compile the extension first: npm --prefix packages/vscode-frameseq run compile",
);
assert.ok(existsSync(builtGlobals), "Build the package first: npm run build:package");

/** tsserver names files with forward slashes; compare them the way the file system does. */
const key = (file) => {
  const name = file.replace(/\\/g, "/");
  return process.platform === "win32" || process.platform === "darwin" ? name.toLowerCase() : name;
};

class TsServer {
  constructor() {
    this.seq = 0;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.process = spawn(process.execPath, [
      tsserver,
      "--globalPlugins", pluginName,
      "--pluginProbeLocations", extensionRoot,
      "--useInferredProjectPerProjectRoot",
      "--disableAutomaticTypingAcquisition",
      "--locale", "en",
    ], { cwd: packageRoot, stdio: ["pipe", "pipe", "pipe"] });
    this.process.stdout.on("data", (chunk) => this.read(chunk));
    this.process.stderr.on("data", (chunk) => process.stderr.write(chunk));
    this.process.on("exit", (code) => {
      for (const { reject } of this.pending.values()) reject(new Error(`tsserver exited with ${code}`));
      this.pending.clear();
    });
  }

  /** Responses arrive framed by a Content-Length header that counts bytes, not characters. */
  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const length = Number(/Content-Length: (\d+)/.exec(this.buffer.subarray(0, headerEnd).toString())?.[1]);
      if (this.buffer.length < headerEnd + 4 + length) return;
      const message = JSON.parse(this.buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString("utf8"));
      this.buffer = this.buffer.subarray(headerEnd + 4 + length);
      if (message.type !== "response") continue;
      const waiting = this.pending.get(message.request_seq);
      if (!waiting) continue;
      this.pending.delete(message.request_seq);
      if (message.success) waiting.resolve(message.body);
      else waiting.reject(new Error(`${message.command}: ${message.message}`));
    }
  }

  request(command, args) {
    const seq = ++this.seq;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`tsserver did not answer ${command}`));
      }, 120_000);
      this.pending.set(seq, {
        resolve: (body) => { clearTimeout(timer); resolvePromise(body); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.process.stdin.write(`${JSON.stringify({ seq, type: "request", command, arguments: args })}\n`);
    });
  }

  close() {
    this.process.kill();
  }
}

const decks = resolve(packageRoot, "tmp", "vscode-typescript-plugin-test");
const outside = await mkdtemp(join(tmpdir(), "frameseq-typescript-plugin-"));
await rm(decks, { recursive: true, force: true });
const server = new TsServer();

/** Open a file as VS Code does for a language that is not TypeScript's own: with no script kind. */
async function open(file, content, projectRootPath = dirname(file)) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
  await server.request("open", { file, fileContent: content, projectRootPath });
}

async function errors(file) {
  const semantic = await server.request("semanticDiagnosticsSync", { file });
  const syntactic = await server.request("syntacticDiagnosticsSync", { file });
  return [...syntactic, ...semantic].map((item) => item.text);
}

async function programFiles(file) {
  const info = await server.request("projectInfo", { file, needFileNameList: true });
  return { kind: info.configFileName, files: new Set(info.fileNames.map(key)) };
}

const deckSource = [
  "presentation({ title: \"Plugin test\" });",
  "slide(\"One\");",
  "text(\"Hello\").lead();",
  "const wrong: number = \"s\";",
  "",
].join("\n");

try {
  // VS Code's own options for files outside any tsconfig.
  await server.request("compilerOptionsForInferredProjects", {
    options: {
      module: "ESNext",
      moduleResolution: "Bundler",
      target: "ES2022",
      jsx: "react",
      allowImportingTsExtensions: true,
      strictNullChecks: true,
      strictFunctionTypes: true,
      sourceMap: true,
      allowJs: true,
      allowSyntheticDefaultImports: true,
      allowNonTsExtensions: true,
      resolveJsonModule: true,
    },
  });

  // (a) A deck with no FrameSeq around it is TypeScript, but the globals come only from the
  // global install the extension configures.
  const standalone = join(outside, "standalone", "talk.fsq");
  await open(standalone, deckSource);
  let reported = await errors(standalone);
  const installAbove = [dirname(standalone)].concat((() => {
    const parents = [];
    for (let directory = dirname(standalone); dirname(directory) !== directory; directory = dirname(directory)) {
      parents.push(dirname(directory));
    }
    return parents;
  })()).some((directory) => existsSync(join(directory, "node_modules", "@pride7", "frameseq", "lib", "globals.d.ts")));
  if (!installAbove) {
    assert.ok(reported.includes("Cannot find name 'slide'."), `An unconfigured standalone deck lacks the globals: ${reported}`);
  }
  assert.ok(
    reported.includes("Type 'string' is not assignable to type 'number'."),
    `An .fsq file must be checked as TypeScript: ${reported}`,
  );

  await server.request("configurePlugin", { pluginName, configuration: { globals: builtGlobals } });
  reported = await errors(standalone);
  assert.deepEqual(
    reported,
    ["Type 'string' is not assignable to type 'number'."],
    "A configured standalone deck reports its own type error and nothing else",
  );
  const standaloneProgram = await programFiles(standalone);
  assert.equal(standaloneProgram.kind.includes("inferredProject"), true, "A standalone deck is in an inferred project");
  assert.ok(standaloneProgram.files.has(key(builtGlobals)), "The configured globals are in the program");

  // (b) Completions and hovers come from the globals.
  const completionFile = join(outside, "standalone", "complete.fsq");
  await open(completionFile, "sli", join(outside, "standalone"));
  const completions = await server.request("completionInfo", { file: completionFile, line: 1, offset: 4 });
  assert.ok(completions.entries.some((entry) => entry.name === "slide"), "Completing sli offers slide");
  const hover = await server.request("quickinfo", { file: standalone, line: 2, offset: 2 });
  assert.match(hover.displayString, /slide/, "Hovering slide shows its type");
  assert.ok(hover.documentation, "Hovering slide shows its documentation");

  // (c) A deck in a project that installed FrameSeq uses that install, not the configured one:
  // both at once would redeclare every command.
  const installed = join(decks, "project", "node_modules", "@pride7", "frameseq");
  await mkdir(join(installed, "lib"), { recursive: true });
  for (const name of await readdir(resolve(packageRoot, "lib"))) {
    if (name.endsWith(".d.ts")) await cp(resolve(packageRoot, "lib", name), join(installed, "lib", name));
  }
  await mkdir(join(installed, "src"), { recursive: true });
  await cp(resolve(packageRoot, "src", "modules.d.ts"), join(installed, "src", "modules.d.ts"));
  const projectDeck = join(decks, "project", "decks", "kickoff.fsq");
  await open(projectDeck, deckSource, join(decks, "project"));
  assert.deepEqual(
    await errors(projectDeck),
    ["Type 'string' is not assignable to type 'number'."],
    "A deck in a project with FrameSeq installed gets that install's globals once",
  );
  const projectProgram = await programFiles(projectDeck);
  assert.ok(projectProgram.files.has(key(join(installed, "lib", "globals.d.ts"))), "The project's own install is used");
  assert.ok(!projectProgram.files.has(key(builtGlobals)), "The configured globals stay out of a project with its own");

  // A deck inside a checkout of the FrameSeq repository uses the repository's source.
  const checkoutDeck = join(decks, "checkout", "draft.fsq");
  await open(checkoutDeck, deckSource, join(decks, "checkout"));
  assert.deepEqual(
    await errors(checkoutDeck),
    ["Type 'string' is not assignable to type 'number'."],
    "A deck in the FrameSeq repository gets the source globals once",
  );
  const checkoutProgram = await programFiles(checkoutDeck);
  assert.ok(checkoutProgram.files.has(key(sourceGlobals)), "The repository's src/globals.ts is used");
  assert.ok(!checkoutProgram.files.has(key(builtGlobals)), "The built globals stay out beside the source");

  // (d) A plain TypeScript file outside any project is left as it was.
  const plain = join(outside, "plain", "script.ts");
  await open(plain, "slide(\"One\");\n");
  assert.ok((await errors(plain)).includes("Cannot find name 'slide'."), "A .ts file gets no FrameSeq globals");
  assert.ok(!(await programFiles(plain)).files.has(key(builtGlobals)));

  // Clearing the configuration takes the globals away from the standalone deck again.
  await server.request("configurePlugin", { pluginName, configuration: { globals: "" } });
  if (!installAbove) {
    assert.ok((await errors(standalone)).includes("Cannot find name 'slide'."), "Configuration changes are applied");
  }
} finally {
  server.close();
  await rm(decks, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
}

console.log("VS Code TypeScript plugin test passed: .fsq files are checked with the FrameSeq globals, once, and .ts files are left alone.");
