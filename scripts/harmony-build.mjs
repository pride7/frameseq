#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, normalizePath } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { iconSet } from "./icon-set.mjs";
import { presentationTemplates, templateDeck } from "./presentation-file.mjs";
import { inside } from "./harmony-modules.mjs";
import { iconPng } from "./app-icon.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
export const harmonyOutput = resolve(root, "output/harmony/FrameSeq");

/** Build on the development computer; no Vite, esbuild or native npm module ships to the device. */
export async function buildHarmony() {
  const out = harmonyOutput;
  if (!inside(resolve(root, "output/harmony"), out)) throw new Error("Harmony build output is outside output/harmony.");
  const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const globals = await readFile(resolve(root, "src/globals.ts"), "utf8");
  const commands = [...globals.matchAll(/^\s*const (\w+): typeof /gm)].map((match) => match[1]);
  const framework = normalizePath(resolve(root, "src/index.ts"));
  const hot = normalizePath(resolve(root, "src/harmony/hot.ts"));
  const entrypoints = new Set(["src/main.ts", "src/studio/main.ts", "src/studio/template-preview.ts"].map((file) => normalizePath(resolve(root, file))));
  const templates = [];
  for (const template of presentationTemplates) {
    for (const language of ["en", "zh"]) {
      templates.push(`${JSON.stringify(`${template.id}:${language}`)}: () => { ${templateDeck(template.id, "", language)}\nreturn __frameSeqSlides(); }`);
    }
  }
  await build({
    root, configFile: false,
    define: { __FRAMESEQ_REMOTE_ENABLED__: "false" },
    plugins: [{
      name: "frameseq-harmony-client", enforce: "pre",
      resolveId(id) {
        if (id === "virtual:frameseq-entry") return { id: "/__frameseq/entry.js", external: true };
        if (id === "virtual:frameseq-templates" || id === "virtual:frameseq-icons") return `\0${id}`;
        if (id === "@pride7/frameseq") return framework;
      },
      load(id) {
        if (id === "\0virtual:frameseq-icons") return `globalThis.__frameseqIcons = ${JSON.stringify(iconSet())}; globalThis.__frameseqIconsComplete = true;`;
        if (id === "\0virtual:frameseq-templates") return `import { ${commands.join(", ")}, getActivePresentation as __frameSeqSlides } from ${JSON.stringify(framework)};\nexport const templates = { ${templates.join(",\n")} };`;
      },
      transform(source, id) {
        const path = normalizePath(id.split("?")[0]);
        if (path === normalizePath(resolve(root, "src/index.css"))) return `${source}\n@source "./";\n@source "../scripts/presentation-file.mjs";\n`;
        if (!path.startsWith(`${normalizePath(root)}/src/`)) return;
        let code = source.replaceAll("import.meta.hot", "globalThis.__frameseqHot");
        if (entrypoints.has(path)) code = `import ${JSON.stringify(hot)};\n${code}`;
        return { code, map: null };
      },
      transformIndexHtml(html) {
        return html.replace("<head>", '<head><script>addEventListener("error",function(e){if(window.__frameseqError)return;window.__frameseqError=String(e.message||e.error);window.__frameseqErrorStatement=window.__frameseqStatement},true);</script>');
      },
    }, tailwindcss()],
    build: {
      outDir: resolve(out, "client"), emptyOutDir: true, cssCodeSplit: false,
      rollupOptions: {
        input: { index: resolve(root, "index.html"), studio: resolve(root, "studio.html"), template: resolve(root, "harmony/template.html"), framework },
        preserveEntrySignatures: "strict",
        output: { entryFileNames: "assets/[name].js", chunkFileNames: "assets/[name]-[hash].js" },
      },
    },
  });
  await build({
    root, configFile: false, publicDir: false,
    build: {
      ssr: resolve(root, "scripts/harmony-server.mjs"), outDir: resolve(out, "scripts"), emptyOutDir: true, minify: false,
      rollupOptions: { output: { entryFileNames: "harmony-server.mjs" } },
    },
  });
  for (const name of ["typescript", "ws", "@iconify-json/lucide"]) {
    await cp(dirname(require.resolve(`${name}/package.json`)), resolve(out, "node_modules", name), { recursive: true });
  }
  await cp(resolve(root, "lib"), resolve(out, "lib"), { recursive: true });
  for (const name of ["main.cjs", "preload.cjs", "README.md", "host.lock.json", "toolchain.lock.json"]) await cp(resolve(root, "harmony", name), resolve(out, name));
  await cp(resolve(root, "LICENSE"), resolve(out, "LICENSE"));
  await writeFile(resolve(out, "icon.png"), iconPng(256));
  await mkdir(resolve(out, "examples"), { recursive: true });
  await cp(resolve(root, "harmony/example.slides.ts"), resolve(out, "examples/welcome.slides.ts"));
  await writeFile(resolve(out, "package.json"), `${JSON.stringify({ name: "frameseq-harmony-prototype", version: manifest.version, private: true, type: "module", main: "main.cjs", license: "MIT" }, null, 2)}\n`);
  await writeFile(resolve(out, "harmony-runtime.json"), `${JSON.stringify({ version: manifest.version, commands }, null, 2)}\n`);
  console.log(`\nHarmonyOS prototype: ${out}`);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildHarmony();
