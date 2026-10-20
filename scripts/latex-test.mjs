#!/usr/bin/env node

// LaTeX fragments compile through Tectonic's XDV output into plain SVG: a fragment's own packages
// load, colours and coloured fills keep their colour, TikZ draws its paths and shadings, black
// follows the slide's foreground colour, and two fragments on one slide keep their ids apart.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const fixture = resolve(packageRoot, "scripts", "fixtures", "latex.slides.ts");
const output = resolve(packageRoot, "tmp", "latex-test");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const build = spawnSync(process.execPath, [cli, "build", fixture, "--output", output, "--single-file"], {
  cwd: packageRoot,
  encoding: "utf8",
});
assert.equal(build.status, 0, build.stderr || build.stdout);
const html = (await readdir(output)).find((name) => name.endsWith(".html"));
assert.ok(html, "the build writes one HTML file");

const browser = await puppeteer.launch(puppeteerLaunchOptions());
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(output, html)).href);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");

  const fragments = await page.$$eval(".frameseq-latex > svg", (svgs) => svgs.map((svg) => ({
    fills: [...svg.querySelectorAll("[fill]")].map((element) => element.getAttribute("fill")),
    paths: svg.querySelectorAll("path:not(defs > path)").length,
    glyphs: svg.querySelectorAll("use").length,
    gradients: svg.querySelectorAll("linearGradient, radialGradient").length,
    ids: [...svg.querySelectorAll("[id]")].map((element) => element.id),
    references: [...svg.outerHTML.matchAll(/(?:url\(#|href="#)([^)"]+)/g)].map((match) => match[1]),
  })));
  assert.equal(fragments.length, 3);
  const [table, picture, circle] = fragments;

  // The fragment's own \usepackage lines load: siunitx's S column and xcolor's table option.
  assert.ok(table.glyphs > 20, "the table's words are drawn");
  assert.ok(table.fills.includes("#ff0000"), "\\textcolor keeps its red");
  // xcolor's gray is half black, so gray!15 is 92.5% white.
  assert.ok(table.fills.includes("#ececec"), "\\rowcolor keeps its grey fill");
  assert.ok(table.fills.includes("currentColor"), "black follows the slide's foreground colour");
  assert.ok(!table.fills.some((fill) => /^#0{3}(?:0{3})?$|^black$/.test(fill ?? "")), "no fill is fixed to black");

  // TikZ draws its paths, its shading, and its node's math.
  assert.ok(picture.paths >= 2, "the arrow and its tip are paths");
  assert.equal(picture.gradients, 1);
  assert.ok(picture.glyphs >= 2, "the edge label is drawn");
  assert.equal(circle.gradients, 1);

  // Every id is unique on the page, and every reference finds an id in its own fragment.
  const ids = fragments.flatMap((fragment) => fragment.ids);
  assert.equal(new Set(ids).size, ids.length, `ids repeat: ${ids.join(", ")}`);
  for (const fragment of fragments) {
    for (const reference of fragment.references) {
      assert.ok(fragment.ids.includes(reference), `${reference} is defined in its fragment`);
    }
  }
} finally {
  await browser.close();
}

console.log("LaTeX test passed: fragment packages, colours, coloured fills, TikZ paths and shadings, theme black, and unique ids.");
