#!/usr/bin/env node
// A small Git host and stub SDK exercise project generation and build orchestration.
// The stubs never claim to compile ArkTS or produce a device-usable HAP.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import JSON5 from "json5";
import { buildHap, inspectToolchain, prepareHap, runTool, sha256, validateRuntime, versionCode } from "./harmony-hap.mjs";

const workspace = await mkdtemp(join(tmpdir(), "frameseq-hap-test-"));
const require = createRequire(import.meta.url);
const source = join(workspace, "host");
const appDirectory = join(workspace, "FrameSeq");
const outputDirectory = join(workspace, "generated/hap");
const appPath = "web_engine/src/main/resources/resfile/resources/app";
const write = async (path, content) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, typeof content === "object" && !Buffer.isBuffer(content) ? JSON.stringify(content) : content); };
const read = async (path) => JSON5.parse(await readFile(path, "utf8"));
const elf = Buffer.alloc(64);
elf.write("\x7fELF"); elf[4] = 2; elf[5] = 1; elf.writeUInt16LE(183, 18);

try {
  const values = { string: [{ name: "app_name", value: "Demo" }, { name: "EntryAbility_label", value: "Demo" }, { name: "button_ok", value: "OK" }] };
  await write(join(source, "AppScope/app.json5"), { app: { bundleName: "old.bundle", vendor: "example", versionName: "1.0.0", versionCode: 1 } });
  await write(join(source, "AppScope/resources/base/element/string.json"), values);
  await write(join(source, "AppScope/resources/base/media/app_icon.png"), "old icon");
  for (const module of ["electron", "web_engine"]) {
    await write(join(source, module, "src/main/module.json5"), { module: { name: module, deviceTypes: ["tablet", "2in1"], requestPermissions: [{ name: "ohos.permission.READ_PASTEBOARD", usedScene: { abilities: ["FormAbility"], when: "always" } }] } });
    for (const locale of ["base", "en_US", "zh_CN"]) await write(join(source, module, `src/main/resources/${locale}/element/string.json`), values);
  }
  await write(join(source, "electron/src/main/ets/entryability/EntryAbility.ets"), "/* Fixture host copyright notice. */\nexport default class EntryAbility {}\n");
  const native = join(source, "electron/libs/arm64-v8a/libelectron.so");
  await write(native, elf);
  await write(join(source, "web_engine/src/main/resources/resfile/electron"), elf);
  await write(join(source, "web_engine/src/main/resources/resfile/resources.pak"), "fixture resource");
  await write(join(source, appPath, "old-demo.js"), "old demo");
  await write(join(source, "hvigor/hvigor-config.json5"), {});
  await write(join(source, "hvigorfile.ts"), "export default {};\n");
  await write(join(source, "oh-package.json5"), {});
  await write(join(source, "oh-package-lock.json5"), {});
  await write(join(source, "build-profile.json5"), '{app:{signingConfigs:[{name:"old-secret"}],products:[{name:"default",signingConfig:"old-secret",compatibleSdkVersionStage:"beta6"}]},modules:[]}');
  runTool("git", ["init", "--quiet", source]);
  runTool("git", ["-C", source, "-c", "core.autocrlf=false", "add", "."]);
  runTool("git", ["-C", source, "-c", "user.name=FrameSeq tests", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "test: create a HAP host fixture"]);
  const revision = runTool("git", ["-C", source, "rev-parse", "HEAD"], { capture: true });
  const lock = { revision, repository: "https://example.invalid/fixture", bundleName: "io.github.pride7.frameseq", vendor: "pride7", label: "FrameSeq Studio", compatibleSdkVersion: "5.0.3(15)", targetSdkVersion: "5.0.3(15)", deviceTypes: ["2in1"], appPath, nativeLibraries: { "libelectron.so": await sha256(native) }, runtimeResources: ["electron", "resources.pak"] };
  await write(join(appDirectory, "package.json"), { name: "frameseq-harmony-prototype", main: "main.cjs", version: "0.39.0" });
  for (const name of ["main.cjs", "preload.cjs", "harmony-runtime.json", "client/studio.html", "client/index.html", "client/assets/framework.js", "scripts/harmony-server.mjs", "examples/welcome.slides.ts"]) await write(join(appDirectory, name), "fixture");
  const settings = { source, appDirectory, outputDirectory, lock, allowedRoot: workspace };
  await prepareHap(settings);
  const scope = await read(join(outputDirectory, "AppScope/app.json5"));
  assert.equal(scope.app.bundleName, lock.bundleName);
  assert.equal(scope.app.versionCode, 39000);
  assert.equal(scope.app.versionName, "0.39.0");
  assert.equal((await read(join(outputDirectory, "package.json"))).type, "commonjs");
  const profile = await read(join(outputDirectory, "build-profile.json5"));
  assert.equal(profile.app.signingConfigs, undefined);
  assert.equal(profile.app.products[0].signingConfig, undefined);
  assert.equal(profile.app.products[0].compatibleSdkVersionStage, undefined);
  assert.equal(profile.app.products[0].compatibleSdkVersion, lock.compatibleSdkVersion);
  assert.equal(profile.app.products[0].targetSdkVersion, lock.targetSdkVersion);
  const entry = await read(join(outputDirectory, "electron/src/main/module.json5"));
  assert.deepEqual(entry.module.deviceTypes, ["2in1"]);
  assert.deepEqual(entry.module.requestPermissions[0].usedScene, { abilities: ["EntryAbility"], when: "inuse" });
  assert.ok((await readFile(join(outputDirectory, appPath, "main.cjs"), "utf8")).includes("fixture"));
  await assert.rejects(readFile(join(outputDirectory, appPath, "old-demo.js")), /ENOENT/);
  assert.ok((await readFile(join(outputDirectory, appPath, "FRAMESEQ-HOST-NOTICES.txt"), "utf8")).includes("Fixture host copyright"));
  const label = await read(join(outputDirectory, "electron/src/main/resources/zh_CN/element/string.json"));
  assert.equal(label.string.find((item) => item.name === "EntryAbility_label").value, lock.label);
  assert.equal(label.string.find((item) => item.name === "button_ok").value, "OK");
  assert.equal((await readFile(join(outputDirectory, "AppScope/resources/base/media/app_icon.png"))).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  await prepareHap(settings);
  console.log("✓ Pinned Git host, app replacement, metadata, unsigned profile, labels, icons and repeat generation");

  assert.equal(versionCode("1.2.3"), 1002003);
  assert.throws(() => versionCode("1.1000.0"));
  const original = await readFile(native);
  await writeFile(native, Buffer.from(original).fill(99, 40, 41));
  await assert.rejects(validateRuntime(source, lock), /checksum/);
  await writeFile(native, "version https://git-lfs.github.com/spec/v1\n");
  await assert.rejects(validateRuntime(source, lock), /ARM64 ELF/);
  await writeFile(native, original);
  const originalProfile = await readFile(join(outputDirectory, "build-profile.json5"));
  await writeFile(join(outputDirectory, "build-profile.json5"), `${originalProfile}\n// local signing setup\n`);
  await assert.rejects(prepareHap(settings), /build profile was edited/);
  await writeFile(join(outputDirectory, "build-profile.json5"), originalProfile);
  const foreign = join(workspace, "foreign");
  await write(join(foreign, "keep.txt"), "untouched");
  await assert.rejects(prepareHap({ ...settings, outputDirectory: foreign }), /unrecognised/);
  assert.equal(await readFile(join(foreign, "keep.txt"), "utf8"), "untouched");
  const linked = join(workspace, "linked");
  await symlink(foreign, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(prepareHap({ ...settings, outputDirectory: linked }), /regular directory/);
  assert.equal(await readFile(join(foreign, "keep.txt"), "utf8"), "untouched");
  console.log("✓ Runtime tampering and LFS pointers rejected; local profiles, foreign folders and links preserved");

  const tools = join(workspace, "Tool kit & 中文");
  const sdk = join(tools, "sdk");
  for (const part of ["ets", "toolchains"]) await write(join(sdk, `default/openharmony/${part}/oh-uni-package.json`), { apiVersion: 15 });
  await write(join(sdk, "default/hms/ets/uni-package.json"), { apiVersion: 26 });
  const javaHome = join(tools, "jbr");
  await write(join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java"), "fixture");
  for (const name of ["ohpm", "hvigorw"]) {
    const script = `const fs = require("node:fs"); const path = require("node:path");\n`
      + `fs.appendFileSync("tool-calls.jsonl", JSON.stringify({name:${JSON.stringify(name)}, args:process.argv.slice(2), sdk:process.env.DEVECO_SDK_HOME}) + "\\n");\n`
      + (name === "hvigorw" ? `if (fs.existsSync("fail-build")) process.exit(7); const out="electron/build/default/outputs/default"; fs.mkdirSync(out,{recursive:true});\n`
        + `if (fs.existsSync("bad-archive")) { fs.writeFileSync(path.join(out,"fixture-unsigned.hap"),Buffer.from([80,75,3,4,0,0])); process.exit(0); }\n`
        + `const JSZip = require(${JSON.stringify(require.resolve("jszip"))}); const zip = new JSZip(); zip.file("module.json", JSON.stringify({app:{bundleName:${JSON.stringify(lock.bundleName)},versionName:"0.39.0",versionCode:39000}}));\n`
        + `for (const name of ${JSON.stringify(["main.cjs", "preload.cjs", "harmony-runtime.json", "client/studio.html", "client/index.html", "client/assets/framework.js", "scripts/harmony-server.mjs", "examples/welcome.slides.ts"])}) { if (!fs.existsSync("omit-application") || name !== "main.cjs") zip.file("resources/resfile/resources/app/"+name,"fixture"); } zip.file("libs/arm64-v8a/libelectron.so", "fixture");\n`
        + `zip.generateAsync({type:"nodebuffer"}).then(data=>fs.writeFileSync(path.join(out,"fixture-unsigned.hap"),data));\n` : "");
    await write(join(tools, "bin", `${name}.js`), script);
    if (process.platform === "win32") await write(join(tools, "bin", `${name}.cmd`), `@"${process.execPath}" "%~dp0${name}.js" %*\r\n`);
  }
  const environment = { PATH: "", JAVA_HOME: javaHome };
  const report = inspectToolchain({ tools, environment });
  assert.equal(report.ready, true);
  assert.equal(report.sdk, sdk);
  const missing = inspectToolchain({ tools: join(workspace, "absent"), sdk: join(workspace, "absent-sdk"), environment: { PATH: "" } });
  assert.equal(missing.ready, false);
  assert.ok(missing.missing.includes("hvigorw") && missing.missing.includes("ohpm"));
  const artifacts = await buildHap({ outputDirectory, lock, tools, environment });
  assert.equal(artifacts.length, 1);
  assert.match(artifacts[0].sha256, /^[a-f0-9]{64}$/);
  const calls = (await readFile(join(outputDirectory, "tool-calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls[0].args, ["install", "--all"]);
  assert.ok(calls[1].args.includes("module=electron@default"));
  assert.equal(calls[1].sdk, sdk);
  await writeFile(join(outputDirectory, "fail-build"), "1");
  await assert.rejects(buildHap({ outputDirectory, lock, tools, environment }), /exit 7/);
  await rm(join(outputDirectory, "fail-build"));
  await writeFile(join(outputDirectory, "bad-archive"), "1");
  await assert.rejects(buildHap({ outputDirectory, lock, tools, environment }), /valid HAP\/ZIP/);
  await rm(join(outputDirectory, "bad-archive"));
  await writeFile(join(outputDirectory, "omit-application"), "1");
  await assert.rejects(buildHap({ outputDirectory, lock, tools, environment }), /missing FrameSeq application resource: main.cjs/);
  console.log("✓ SDK diagnostics, paths containing spaces and &, tool invocation, artifact records and failed-build propagation");
  console.log("HAP integration tests passed (stub tools; no HarmonyOS compilation or device validation).");
} finally {
  if (dirname(workspace) !== resolve(tmpdir()) || !workspace.startsWith(join(resolve(tmpdir()), "frameseq-hap-test-"))) throw new Error("Test cleanup is outside its temporary directory.");
  await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
