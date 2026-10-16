#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSON5 from "json5";
import JSZip from "jszip";
import { iconPng } from "./app-icon.mjs";
import { inside } from "./harmony-modules.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const hapOutput = resolve(root, "output/harmony/hap");
export const hostLock = JSON.parse(await readFile(resolve(root, "harmony/host.lock.json"), "utf8"));
const toolchainLock = JSON.parse(await readFile(resolve(root, "harmony/toolchain.lock.json"), "utf8"));
const owner = "frameseq-hap-project";
const markerName = ".frameseq-hap.json";
const templateFiles = ["AppScope", "electron", "web_engine", "hvigor", "build-profile.json5", "hvigorfile.ts", "oh-package.json5", "oh-package-lock.json5"];
const applicationFiles = ["main.cjs", "preload.cjs", "harmony-runtime.json", "client/studio.html", "client/index.html", "client/assets/framework.js", "scripts/harmony-server.mjs", "examples/welcome.slides.ts"];

export function runTool(command, args, { cwd, env = {}, capture = false } = {}) {
  const environment = { ...process.env, ...env };
  let executable = command;
  let parameters = args;
  if (/\.[cm]?js$/i.test(command)) {
    executable = process.execPath;
    parameters = [command, ...args];
  } else if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    // Pass the path and arguments as data; never interpolate SDK paths into shell source.
    const script = '$ProgressPreference = "SilentlyContinue"; $frameseqArgs = @(ConvertFrom-Json $env:FRAMESEQ_TOOL_ARGS); & $env:FRAMESEQ_TOOL_COMMAND @frameseqArgs; exit $LASTEXITCODE';
    executable = join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    parameters = ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")];
    environment.FRAMESEQ_TOOL_COMMAND = command;
    environment.FRAMESEQ_TOOL_ARGS = JSON.stringify(args);
  }
  const result = spawnSync(executable, parameters, { cwd, env: environment, windowsHide: true, encoding: "utf8", stdio: capture ? "pipe" : "inherit", maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${basename(command)} failed (exit ${result.status}).${capture ? `\n${result.stderr || result.stdout}` : ""}`);
  return result.stdout?.trim() ?? "";
}

export async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function readJson(path) { return JSON5.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }

async function assertApplication(directory) {
  for (const name of applicationFiles) {
    if (!(await stat(join(directory, name))).isFile()) throw new Error(`Incomplete FrameSeq application: ${name}`);
  }
  const inspect = async (folder) => {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      if (item.isSymbolicLink() || /\.(node|exe|dll|so|dylib)$/i.test(item.name)) throw new Error(`The portable application contains a link or native module: ${join(folder, item.name)}`);
      if (item.isDirectory()) await inspect(join(folder, item.name));
    }
  };
  await inspect(directory);
}

export function versionCode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match || Number(match[2]) >= 1000 || Number(match[3]) >= 1000) throw new Error(`Cannot encode ${version} as a HarmonyOS versionCode.`);
  const code = Number(match[1]) * 1_000_000 + Number(match[2]) * 1000 + Number(match[3]);
  if (code < 1 || code > 2_147_483_647) throw new Error("HarmonyOS versionCode is outside its supported range.");
  return code;
}

async function assertArm64(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${path} must be a regular native binary, not a link.`);
  const file = await open(path, "r");
  const header = Buffer.alloc(64);
  try { await file.read(header, 0, header.length, 0); } finally { await file.close(); }
  if (header.subarray(0, 4).toString("hex") !== "7f454c46" || header[4] !== 2 || header[5] !== 1 || header.readUInt16LE(18) !== 183) {
    throw new Error(`${path} is not an ARM64 ELF binary. Fetch the actual HarmonyOS runtime, not Git LFS pointers or host binaries.`);
  }
}

export async function validateRuntime(directory, lock = hostLock) {
  for (const [name, expected] of Object.entries(lock.nativeLibraries)) {
    const path = resolve(directory, "electron/libs/arm64-v8a", name);
    await assertArm64(path);
    if (await sha256(path) !== expected) throw new Error(`${name} does not match the pinned HarmonyOS runtime checksum.`);
  }
  const resources = resolve(directory, "web_engine/src/main/resources/resfile");
  for (const name of lock.runtimeResources) {
    const info = await lstat(resolve(resources, name));
    if (!info.isFile() || info.isSymbolicLink() || info.size === 0) throw new Error(`Missing Electron resource: ${name}`);
  }
  await assertArm64(resolve(resources, "electron"));
}

async function templateSource(source, lock) {
  const directory = resolve(source ?? join(root, "tmp/harmony-host", lock.revision));
  if (!source && !existsSync(join(directory, ".git"))) {
    const environment = { GIT_LFS_SKIP_SMUDGE: "1" };
    await mkdir(dirname(directory), { recursive: true });
    runTool("git", ["clone", "--filter=blob:none", "--no-checkout", lock.repository, directory], { env: environment });
    runTool("git", ["-C", directory, "sparse-checkout", "init", "--cone"], { env: environment });
    runTool("git", ["-C", directory, "sparse-checkout", "set", "AppScope", "electron", "web_engine", "hvigor"], { env: environment });
    runTool("git", ["-C", directory, "-c", "core.autocrlf=false", "checkout", "--detach", lock.revision], { env: environment });
  }
  const revision = runTool("git", ["-C", directory, "rev-parse", "HEAD"], { capture: true });
  if (revision !== lock.revision) throw new Error(`The HAP host must be at ${lock.revision}, found ${revision}.`);
  try { await validateRuntime(directory, lock); } catch (error) {
    if (source) throw error;
    // An interrupted first download leaves pointers in our own cache. Resume it on the next run.
    runTool("git", ["-C", directory, "lfs", "pull", "--include=electron/libs/arm64-v8a/*", "--exclude="]);
    await validateRuntime(directory, lock);
  }
  return directory;
}

/** Never replace another project, a linked directory, or a locally edited signing profile. */
async function assertReplaceable(directory, allowedRoot) {
  const parent = await realpath(dirname(directory));
  if (!inside(await realpath(allowedRoot), parent) || resolve(directory) === resolve(allowedRoot)) throw new Error("The HAP output is outside its allowed workspace.");
  let info;
  try { info = await lstat(directory); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!info.isDirectory() || info.isSymbolicLink() || !inside(parent, await realpath(directory))) throw new Error("The HAP output must be a regular directory inside its output folder.");
  const marker = await readJson(join(directory, markerName)).catch(() => undefined);
  if (marker?.owner !== owner) throw new Error(`Refusing to replace an unrecognised project: ${directory}`);
  if (await sha256(join(directory, "build-profile.json5")) !== marker.profileSha256) throw new Error("The generated build profile was edited. Keep that project for signing, or move it aside before preparing again.");
}

async function labels(directory, label) {
  for (const locale of ["base", "en_US", "zh_CN"]) {
    const path = join(directory, "resources", locale, "element/string.json");
    if (!existsSync(path)) continue;
    const values = await readJson(path);
    for (const value of values.string ?? []) {
      if (["app_name", "EntryAbility_label", "EntryAbility_desc", "module_desc"].includes(value.name)) value.value = label;
    }
    await writeJson(path, values);
  }
}

export async function prepareHap({ source, appDirectory = resolve(root, "output/harmony/FrameSeq"), outputDirectory = hapOutput, lock = hostLock, allowedRoot = root } = {}) {
  const target = resolve(outputDirectory);
  await mkdir(dirname(target), { recursive: true });
  await assertReplaceable(target, allowedRoot);
  const app = await readJson(join(appDirectory, "package.json")).catch(() => { throw new Error("Build the application first with npm run harmony:build."); });
  if (app.name !== "frameseq-harmony-prototype" || app.main !== "main.cjs") throw new Error("The application directory is not a FrameSeq HarmonyOS build.");
  await assertApplication(appDirectory);
  const version = versionCode(app.version);
  const upstream = await templateSource(source, lock);
  const stage = await mkdtemp(join(dirname(target), "hap-stage-"));
  try {
    const archive = join(stage, "host.tar");
    runTool("git", ["-C", upstream, "archive", "--format=tar", `--output=${archive}`, lock.revision, ...templateFiles]);
    const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32/tar.exe") : "tar";
    runTool(tar, ["-xf", archive, "-C", stage]);
    await unlink(archive);
    // Hvigor emits CommonJS files. Do not inherit an enclosing Node project's ESM scope.
    await writeJson(join(stage, "package.json"), { private: true, type: "commonjs" });
    for (const name of Object.keys(lock.nativeLibraries)) await cp(join(upstream, "electron/libs/arm64-v8a", name), join(stage, "electron/libs/arm64-v8a", name));
    const application = resolve(stage, lock.appPath);
    if (!inside(stage, application)) throw new Error("The host's application path is outside the HAP project.");
    if (!inside(await realpath(stage), await realpath(application))) throw new Error("The host's application directory is linked outside the HAP project.");
    await rm(application, { recursive: true, force: true });
    await cp(appDirectory, application, { recursive: true });
    const noticeSource = await readFile(join(stage, "electron/src/main/ets/entryability/EntryAbility.ets"), "utf8");
    const notice = noticeSource.match(/^\s*(\/\*[\s\S]*?\*\/)/)?.[1];
    await writeFile(join(application, "FRAMESEQ-HOST-NOTICES.txt"), `HarmonyOS Electron host\n${lock.repository}\nRevision: ${lock.revision}\n\n${notice ?? "See the upstream host source for its copyright notices."}\n`);

    const scopePath = join(stage, "AppScope/app.json5");
    const scope = await readJson(scopePath);
    Object.assign(scope.app, { bundleName: lock.bundleName, vendor: lock.vendor, versionCode: version, versionName: app.version });
    await writeJson(scopePath, scope);
    const profilePath = join(stage, "build-profile.json5");
    const profile = await readJson(profilePath);
    delete profile.app.signingConfigs;
    for (const product of profile.app.products) {
      delete product.signingConfig;
      delete product.compatibleSdkVersionStage;
      product.compatibleSdkVersion = lock.compatibleSdkVersion;
      // Newer toolchains otherwise default targetSdkVersion to their bundled SDK.
      // Keep the pinned host's API behavior while compiling it with a newer SDK.
      product.targetSdkVersion = lock.targetSdkVersion;
    }
    await writeJson(profilePath, profile);
    for (const module of ["electron", "web_engine"]) {
      const modulePath = join(stage, module, "src/main/module.json5");
      const definition = await readJson(modulePath);
      definition.module.deviceTypes = lock.deviceTypes;
      // The template refers to a FormAbility it does not declare. Use the real entry ability.
      for (const permission of definition.module.requestPermissions ?? []) {
        if (permission.usedScene) permission.usedScene = { abilities: ["EntryAbility"], when: "inuse" };
      }
      await writeJson(modulePath, definition);
      await labels(join(stage, module, "src/main"), lock.label);
    }
    await labels(join(stage, "AppScope"), lock.label);
    for (const name of ["app_icon.png", "icon.png", "product_logo_32.png", "startIcon.png"]) {
      await writeFile(join(stage, "AppScope/resources/base/media", name), iconPng(name === "product_logo_32.png" ? 32 : 512));
    }
    await writeFile(join(stage, "FRAMESEQ-HOST.txt"), `FrameSeq Studio ${app.version}\nHost source: ${lock.repository}\nRevision: ${lock.revision}\nUpstream source notices are retained in the ArkTS files.\nThis project is unsigned; it has not passed HarmonyOS device validation.\n`);
    await writeJson(join(stage, markerName), { owner, schema: 1, revision: lock.revision, bundleName: lock.bundleName, version: app.version, appPath: lock.appPath, profileSha256: await sha256(profilePath) });
    await validateRuntime(stage, lock);
    // Recheck immediately before the only recursive replacement of an existing output.
    await assertReplaceable(target, allowedRoot);
    if (!inside(await realpath(dirname(target)), await realpath(stage))) throw new Error("The generated HAP project is outside its staging folder.");
    await rm(target, { recursive: true, force: true });
    await rename(stage, target);
  } catch (error) {
    if (inside(await realpath(dirname(target)), await realpath(stage))) await rm(stage, { recursive: true, force: true });
    throw error;
  }
  return target;
}

function findCommand(name, directories) {
  const extensions = process.platform === "win32" ? [".bat", ".cmd", ".exe", ".js", ""] : ["", ".js"];
  for (const directory of directories.filter(Boolean)) {
    for (const extension of extensions) {
      const path = resolve(directory, `${name}${extension}`);
      if (existsSync(path)) return path;
    }
  }
}

export function inspectToolchain({ tools, sdk, environment = process.env } = {}) {
  const localTools = join(root, "tmp/harmony-tools", toolchainLock.version, "command-line-tools");
  tools ??= environment.FRAMESEQ_HARMONY_TOOLS ?? (process.platform === "win32" && existsSync(join(localTools, "bin/hvigorw.bat")) ? localTools : undefined);
  sdk ??= environment.FRAMESEQ_HARMONY_SDK ?? environment.DEVECO_SDK_HOME;
  const base = tools ? resolve(tools) : undefined;
  const path = (environment.PATH ?? "").split(delimiter);
  const hvigor = findCommand("hvigorw", [...(base ? [join(base, "bin"), join(base, "hvigor/bin"), join(base, "tools/hvigor/bin")] : []), ...path]);
  const ohpm = findCommand("ohpm", [...(base ? [join(base, "bin"), join(base, "ohpm/bin"), join(base, "tools/ohpm/bin")] : []), ...path]);
  const sdkRoot = sdk ? resolve(sdk) : base && existsSync(join(base, "sdk")) ? join(base, "sdk") : undefined;
  const openharmony = sdkRoot && [join(sdkRoot, "default/openharmony"), join(sdkRoot, "openharmony"), sdkRoot].find((directory) => existsSync(join(directory, "ets/oh-uni-package.json")) && existsSync(join(directory, "toolchains/oh-uni-package.json")));
  const hms = sdkRoot && [join(sdkRoot, "default/hms"), join(sdkRoot, "hms"), ...(openharmony ? [join(dirname(openharmony), "hms")] : [])].find((directory) => ["uni-package.json", "oh-uni-package.json"].some((name) => existsSync(join(directory, "ets", name))));
  const javaHomes = [environment.JAVA_HOME, ...(base ? [join(base, "jbr"), join(base, "jdk")] : [])].filter(Boolean);
  const javaHome = javaHomes.find((directory) => findCommand("java", [join(directory, "bin")]));
  const java = findCommand("java", [...(javaHome ? [join(javaHome, "bin")] : []), ...path]);
  const hdc = findCommand("hdc", [...(openharmony ? [join(openharmony, "toolchains")] : []), ...path]);
  const missing = [!hvigor && "hvigorw", !ohpm && "ohpm", (!openharmony || !hms) && "HarmonyOS SDK (OpenHarmony toolchains and HMS kits)", !java && "Java"].filter(Boolean);
  return { ready: missing.length === 0, tools: base, sdk: sdkRoot, openharmony, hms, hvigor, ohpm, java, javaHome, hdc, missing, download: "https://developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos" };
}

async function hapFiles(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) files.push(...await hapFiles(path));
    else if (item.isFile() && item.name.endsWith(".hap")) files.push(path);
  }
  return files;
}

export async function buildHap({ outputDirectory = hapOutput, lock = hostLock, ...options } = {}) {
  const toolchain = inspectToolchain(options);
  if (!toolchain.ready) throw new Error(`Missing: ${toolchain.missing.join(", ")}.\nInstall the official Command Line Tools, then set FRAMESEQ_HARMONY_TOOLS and run npm run harmony:doctor.\n${toolchain.download}`);
  const directory = resolve(outputDirectory);
  const marker = await readJson(join(directory, markerName));
  if (marker.owner !== owner || marker.revision !== lock.revision) throw new Error("Prepare a pinned HAP project with npm run harmony:prepare first.");
  await validateRuntime(directory, lock);
  const environment = {
    DEVECO_SDK_HOME: toolchain.sdk,
    ...(toolchain.javaHome ? { JAVA_HOME: toolchain.javaHome } : {}),
    PATH: [dirname(toolchain.java), dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
  };
  runTool(toolchain.ohpm, ["install", "--all"], { cwd: directory, env: environment });
  runTool(toolchain.hvigor, ["assembleHap", "--mode", "module", "-p", "product=default", "-p", "module=electron@default", "-p", "buildMode=debug", "--no-daemon"], { cwd: directory, env: environment });
  const files = await hapFiles(join(directory, "electron/build/default/outputs"));
  if (!files.length) throw new Error("Hvigor returned without a HAP artifact.");
  const artifacts = [];
  for (const path of files) {
    let archive;
    try { archive = await JSZip.loadAsync(await readFile(path)); }
    catch { throw new Error(`${path} is not a valid HAP/ZIP archive.`); }
    const manifest = archive.file("module.json");
    if (!manifest) throw new Error(`${path} has no compiled module.json.`);
    const metadata = JSON.parse((await manifest.async("string")).replace(/^\uFEFF/, ""));
    if (metadata.app?.bundleName !== marker.bundleName) throw new Error(`${path} belongs to a different application.`);
    if (metadata.app.versionName !== marker.version || metadata.app.versionCode !== versionCode(marker.version)) throw new Error(`${path} has a different application version.`);
    for (const name of applicationFiles) {
      if (!archive.file(`resources/resfile/resources/app/${name}`)) throw new Error(`${path} is missing FrameSeq application resource: ${name}`);
    }
    for (const name of Object.keys(lock.nativeLibraries)) {
      if (!archive.file(`libs/arm64-v8a/${name}`)) throw new Error(`${path} is missing ARM64 runtime library: ${name}`);
    }
    artifacts.push({ path, sha256: await sha256(path), bytes: (await stat(path)).size });
  }
  await writeJson(join(directory, "frameseq-hap-artifacts.json"), { bundleName: marker.bundleName, version: marker.version, artifacts });
  return artifacts;
}

function options(args) {
  const value = (flag) => { const index = args.indexOf(flag); if (index < 0) return undefined; if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing value for ${flag}.`); return args[index + 1]; };
  return { source: value("--source"), tools: value("--tools"), sdk: value("--sdk") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const command = process.argv[2] ?? "doctor";
    const settings = options(process.argv.slice(3));
    if (command === "prepare") console.log(`HAP project: ${await prepareHap(settings)}`);
    else if (command === "doctor") {
      const report = inspectToolchain(settings);
      console.log(JSON.stringify(report, null, 2));
      if (!report.ready) process.exitCode = 1;
    } else if (command === "build") for (const artifact of await buildHap(settings)) console.log(`HAP: ${artifact.path}\nSHA-256: ${artifact.sha256}`);
    else throw new Error("Usage: harmony-hap.mjs prepare|doctor|build [--source directory] [--tools directory] [--sdk directory]");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
