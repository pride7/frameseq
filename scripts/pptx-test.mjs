#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, rm, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import JSZip from "jszip";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(packageRoot, "tmp", "pptx-test");
const editablePath = resolve(outputRoot, "editable.pptx");
const flattenedPath = resolve(outputRoot, "flattened.pptx");
const partialBorderPath = resolve(outputRoot, "partial-border.pptx");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");

if (!outputRoot.startsWith(resolve(packageRoot, "tmp"))) {
  throw new Error(`Unsafe PPTX test path: ${outputRoot}`);
}

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`frameseq ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

async function slideXml(zip, index) {
  return zip.file(`ppt/slides/slide${index}.xml`)?.async("string") ?? "";
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

run(["pptx", "slides.ts", "--output", editablePath]);
run(["pptx", "slides.ts", "--flatten", "--output", flattenedPath]);
run([
  "pptx",
  "scripts/fixtures/pptx-partial-border.slides.ts",
  "--output",
  partialBorderPath,
]);

const editableBuffer = await readFile(editablePath);
const flattenedBuffer = await readFile(flattenedPath);
const partialBorderBuffer = await readFile(partialBorderPath);
assert.equal(editableBuffer.subarray(0, 2).toString(), "PK");
assert.equal(flattenedBuffer.subarray(0, 2).toString(), "PK");
assert.equal(partialBorderBuffer.subarray(0, 2).toString(), "PK");

const editable = await JSZip.loadAsync(editableBuffer);
const flattened = await JSZip.loadAsync(flattenedBuffer);
const partialBorder = await JSZip.loadAsync(partialBorderBuffer);
const slidePattern = /^ppt\/slides\/slide\d+\.xml$/;
const editableSlides = Object.keys(editable.files).filter((name) => slidePattern.test(name));
const flattenedSlides = Object.keys(flattened.files).filter((name) => slidePattern.test(name));
assert.equal(editableSlides.length, 8);
assert.equal(flattenedSlides.length, 8);

const firstSlide = await slideXml(editable, 1);
const secondSlide = await slideXml(editable, 2);
const thirdSlide = await slideXml(editable, 3);
const latexSlide = await slideXml(editable, 7);
const shapeSlide = await slideXml(editable, 8);
assert.match(firstSlide, /Build slides like building apps/);
assert.match(secondSlide, /Useful defaults/);
assert.match(secondSlide, /FrameSeq bullet/);
assert.doesNotMatch(secondSlide, />•</);
assert.match(thirdSlide, /FrameSeq marker/);
assert.match(thirdSlide, /algn="ctr"/);
assert.match(thirdSlide, /anchor="ctr"/);
assert.match(latexSlide, /FrameSeq latex/);
assert.match(latexSlide, /<p:pic>/);
assert.match(shapeSlide, /FrameSeq line/);
assert.match(shapeSlide, /prst="line"/);
assert.match(shapeSlide, /prst="ellipse"/);

const partialBorderSlide = await slideXml(partialBorder, 1);
assert.match(partialBorderSlide, /Underline title/);
assert.match(partialBorderSlide, /FrameSeq border-bottom/);
assert.match(partialBorderSlide, /FrameSeq border-top/);
assert.match(partialBorderSlide, /prst="line"/);

const notes = await Promise.all(
  Object.keys(editable.files)
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name))
    .map((name) => editable.file(name).async("string")),
);
assert.ok(notes.some((xml) => xml.includes(
  "Emphasize that source order replaces nested callbacks and layout boilerplate.",
)));

const presentationXml = await editable.file("ppt/presentation.xml").async("string");
const size = presentationXml.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
assert.ok(size);
assert.ok(Math.abs(Number(size[1]) / Number(size[2]) - 16 / 9) < 0.0001);

for (let index = 1; index <= flattenedSlides.length; index += 1) {
  const xml = await slideXml(flattened, index);
  assert.equal((xml.match(/<p:pic>/g) ?? []).length, 1);
}
assert.doesNotMatch(await slideXml(flattened, 1), /Build slides like building apps/);
const flattenedMedia = Object.keys(flattened.files)
  .filter((name) => /^ppt\/media\/image-\d+-\d+\.png$/.test(name));
assert.equal(flattenedMedia.length, 8);

console.log("PPTX test passed: editable objects, partial borders, centered bullets, speaker notes, 16:9 sizing, and flattened slides.");
