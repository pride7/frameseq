import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, normalizePath } from "vite";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const entry = resolve(process.env.FRAMESEQ_ENTRY ?? resolve(process.cwd(), "slides.ts"));
const buildDirectory = process.env.FRAMESEQ_BUILD_DIR ?? resolve(packageRoot, "dist");
const virtualEntry = "virtual:frameseq-entry";
const resolvedVirtualEntry = `\0${virtualEntry}`;
const normalizedEntry = normalizePath(entry);
const styleEntry = resolve(packageRoot, "src", "index.css");
const normalizedStyleEntry = normalizePath(styleEntry);
const tailwindSource = normalizePath(relative(dirname(styleEntry), dirname(entry)));
const tailwindExclusions = ["node_modules", "dist", "output", ".git"]
  .map((directory) => normalizePath(`${tailwindSource}/${directory}`));

const documentCommands = [
  "presentation",
  "slide",
  "text",
  "image",
  "code",
  "math",
  "bullets",
  "steps",
  "metric",
  "main",
  "left",
  "right",
  "cell",
  "gap",
  "px",
  "pt",
  "rem",
  "percent",
  "vw",
  "vh",
  "defineTheme",
  "themes",
];

export default defineConfig({
  root: packageRoot,
  plugins: [
    {
      name: "frameseq-entry",
      enforce: "pre",
      resolveId(id) {
        return id === virtualEntry ? resolvedVirtualEntry : undefined;
      },
      load(id) {
        if (id !== resolvedVirtualEntry) return undefined;
        return `export { default } from ${JSON.stringify(normalizedEntry)};`;
      },
      transform(source, id) {
        const normalizedId = normalizePath(id.split("?")[0]);
        if (normalizedId === normalizedStyleEntry) {
          const sourceDirectives = [
            `@source ${JSON.stringify(tailwindSource)};`,
            ...tailwindExclusions.map((source) => `@source not ${JSON.stringify(source)};`),
          ].join("\n");
          return {
            code: `${source}\n${sourceDirectives}\n`,
            map: null,
          };
        }
        if (normalizedId !== normalizedEntry) return undefined;

        const importsFramework = /(?:from\s*|import\s*)["']@pride7\/frameseq["']/.test(source);
        if (importsFramework) return undefined;

        const hasDefaultExport = /\bexport\s+default\b/.test(source);
        const prelude = `import { ${documentCommands.join(", ")}, getActivePresentation as __frameSeqDeck } from "@pride7/frameseq";\n`;
        const postlude = hasDefaultExport ? "" : "\nexport default __frameSeqDeck();\n";
        return { code: `${prelude}${source}${postlude}`, map: null };
      },
    },
    tailwindcss(),
  ],
  server: {
    open: true,
    fs: {
      allow: [packageRoot, dirname(entry)],
    },
  },
  build: {
    outDir: buildDirectory,
    emptyOutDir: true,
  },
});
