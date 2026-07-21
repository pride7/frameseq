import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: resolve(packageRoot, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    outDir: resolve(packageRoot, "lib"),
    emptyOutDir: true,
  },
});
