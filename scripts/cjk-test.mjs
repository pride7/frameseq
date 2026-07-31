import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { build, preview } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "tmp", "cjk-smoke");
process.env.FRAMESEQ_ENTRY = resolve(packageRoot, "tests", "chinese.slides.ts");
process.env.FRAMESEQ_BUILD_DIR = outputDirectory;

await build({ configFile: resolve(packageRoot, "vite.config.ts") });

const server = await preview({
  configFile: resolve(packageRoot, "vite.config.ts"),
  preview: {
    host: "127.0.0.1",
    port: 4179,
    strictPort: true,
  },
});

/**
 * Missing CJK coverage renders every character as the same .notdef box, so two
 * different characters producing the same bitmap means the text is tofu.
 * Reading the rendered pixels also catches a font that resolves but draws nothing.
 */
function measureGlyphs(fontFamily, characters) {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  return characters.map((character) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = `56px ${fontFamily}`;
    context.textBaseline = "top";
    context.fillStyle = "#000";
    context.fillText(character, 6, 6);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

    let ink = 0;
    let signature = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] === 0) continue;
      ink += 1;
      signature = (signature * 31 + index * data[index]) % 2147483647;
    }
    return { character, ink, signature };
  });
}

const browser = await puppeteer.launch(puppeteerLaunchOptions());
const errors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900 });

  for (const [label, url] of [
    ["interactive", "http://127.0.0.1:4179/"],
    ["print", "http://127.0.0.1:4179/?print=1"],
  ]) {
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate(() => document.fonts.ready);

    const report = await page.evaluate((source) => {
      const measure = new Function(`return (${source})`)();
      const slide = document.querySelector(".frameseq-slide");
      const body = getComputedStyle(slide).fontFamily;
      const heading = getComputedStyle(document.querySelector(".frameseq-cover-title")
        ?? slide).fontFamily;
      return {
        body,
        heading,
        glyphs: measure(body, ["中", "文", "体", "あ"]),
        headingGlyphs: measure(heading, ["中", "文"]),
        // Two unassigned code points: no font anywhere covers them, so they
        // prove that this detector really does report identical tofu boxes.
        unassigned: measure(body, ["\u{ABCDE}", "\u{ABCD0}"]),
      };
    }, measureGlyphs.toString());

    for (const stack of [report.body, report.heading]) {
      assert.match(
        stack,
        /PingFang SC|Microsoft YaHei|Noto Sans CJK SC|Noto Sans SC|Source Han|Songti SC|SimSun|Noto Serif CJK SC/,
        `${label}: the resolved font stack has no CJK family: ${stack}`,
      );
    }

    for (const glyph of [...report.glyphs, ...report.headingGlyphs]) {
      assert.ok(
        glyph.ink > 0,
        `${label}: "${glyph.character}" rendered nothing; install a CJK font such as fonts-noto-cjk`,
      );
    }

    assert.equal(
      report.unassigned[0].signature,
      report.unassigned[1].signature,
      `${label}: the tofu detector is broken; unassigned code points must render identically`,
    );

    const [first, second] = report.glyphs;
    assert.notEqual(
      first.signature,
      second.signature,
      `${label}: "中" and "文" rendered identically, which means both are tofu boxes; `
      + "install a CJK font such as fonts-noto-cjk",
    );
    assert.notEqual(
      report.headingGlyphs[0].signature,
      report.headingGlyphs[1].signature,
      `${label}: heading text rendered as tofu boxes`,
    );
  }

  // Chinese text must also lay out as real text rather than collapsing.
  await page.goto("http://127.0.0.1:4179/", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  const coverTitle = await page.$eval(".frameseq-cover-title", (element) => ({
    text: element.textContent,
    width: element.getBoundingClientRect().width,
  }));
  assert.equal(coverTitle.text, "中文排版");
  assert.ok(coverTitle.width > 0, "The Chinese cover title should occupy space");

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}

console.log("CJK test passed: Chinese glyphs render in body, heading, and print mode without tofu.");
