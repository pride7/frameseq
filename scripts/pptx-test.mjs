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
const shapesPath = resolve(outputRoot, "shapes.pptx");
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

/** The first object whose name begins this way, since names end with an export number. */
function shapeXmlStarting(xml, prefix) {
  const nameIndex = xml.indexOf(`name="${prefix} `);
  assert.notEqual(nameIndex, -1, `Missing PowerPoint object ${prefix}`);
  return xml.slice(xml.lastIndexOf("<p:sp>", nameIndex), xml.indexOf("</p:sp>", nameIndex) + "</p:sp>".length);
}

function shapeXmlByName(xml, name) {
  const nameIndex = xml.indexOf(`name="${name}"`);
  assert.notEqual(nameIndex, -1, `Missing PowerPoint object ${name}`);
  const start = xml.lastIndexOf("<p:sp>", nameIndex);
  const end = xml.indexOf("</p:sp>", nameIndex);
  assert.notEqual(start, -1, `Missing start tag for PowerPoint object ${name}`);
  assert.notEqual(end, -1, `Missing end tag for PowerPoint object ${name}`);
  return xml.slice(start, end + "</p:sp>".length);
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
run(["pptx", "scripts/fixtures/pptx-shapes.slides.ts", "--output", shapesPath]);

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
assert.match(shapeXmlByName(partialBorderSlide, "FrameSeq chrome 1"), /anchor="b"/);

// Each shape() becomes PowerPoint's own preset, keeping its label, colours, dashes, and shadow.
const shapesSlide = await slideXml(await JSZip.loadAsync(await readFile(shapesPath)), 1);
const diamond = shapeXmlStarting(shapesSlide, "FrameSeq shape diamond");
assert.match(diamond, /prst="diamond"/);
assert.match(diamond, /Cached\?/);
assert.match(diamond, /<a:solidFill><a:srgbClr val="[0-9A-F]{6}"/);
const cylinder = shapeXmlStarting(shapesSlide, "FrameSeq shape cylinder");
assert.match(cylinder, /prst="can"/);
assert.match(cylinder, /<a:outerShdw/);
assert.match(shapeXmlStarting(shapesSlide, "FrameSeq shape cloud"), /prst="cloud"[\s\S]*prstDash val="dash"/);
assert.match(shapeXmlStarting(shapesSlide, "FrameSeq shape pill"), /prst="roundRect"/);
// A polygon() has no preset, so it is a freeform through its own four corners, still labelled.
const encoder = shapeXmlStarting(shapesSlide, "FrameSeq shape polygon");
assert.match(encoder, /<a:custGeom>[\s\S]*<a:moveTo>(?:[\s\S]*?<a:lnTo>){3}[\s\S]*?<a:close \/>[\s\S]*<\/a:custGeom>/);
assert.equal(encoder.match(/<a:lnTo>/g)?.length, 3);
assert.match(encoder, /<a:solidFill><a:srgbClr val="[0-9A-F]{6}"/);
assert.match(encoder, />Encoder</);
// A connector through stops is a path through them, and a junction is a small filled circle.
const stops = shapesSlide.split("</p:sp>").find((shape) => shape.includes('val="123456"'));
assert.ok(stops, "the connector through stops is exported");
assert.match(stops, /<a:custGeom>/);
assert.equal(stops.match(/<a:lnTo>/g)?.length, 3);
assert.match(stops, /<a:tailEnd type="triangle"\/>/);
// A panel's outline is a shape of its own, and its tag and title stay editable text.
assert.match(shapesSlide, />\(b\)</);
assert.match(shapesSlide, />Generator</);
// A rect() with no label keeps the small size it was given, and its dash beside a stroke().
const cell = shapeXmlStarting(shapesSlide, "FrameSeq rect");
assert.match(cell, /<a:ext cx="285750" cy="285750"\/>/);
assert.match(cell, /prstDash val="dash"/);
// Elbow and curved connectors are paths of their own, with arrowheads; straight ones stay lines.
assert.match(shapesSlide, /<a:custGeom>[\s\S]*?<a:lnTo>[\s\S]*?<\/a:custGeom>/);
assert.match(shapesSlide, /<a:cubicBezTo>/);
assert.match(shapesSlide, /<a:tailEnd type="triangle"\/>/);
assert.match(shapesSlide, /prst="line"/);
assert.match(shapeXmlStarting(shapesSlide, "FrameSeq line label"), />yes</);

// A run containing CJK text must carry a CJK typeface, not the Latin family
// that leads the stack, because PowerPoint stores one typeface per run.
const chineseSlide = await slideXml(partialBorder, 2);
assert.match(chineseSlide, /中文文本必须/);
const chineseTypeface = chineseSlide.match(/typeface="([^"]+)"/g) ?? [];
assert.ok(
  chineseTypeface.some((value) => /PingFang|YaHei|Noto Sans CJK|Noto Sans SC|Source Han|Songti|SimSun/i.test(value)),
  `A Chinese run should use a CJK typeface, found: ${chineseTypeface.join(", ")}`,
);

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

console.log("PPTX test passed: editable objects, native diagram shapes and connectors, partial borders, centered bullets, speaker notes, 16:9 sizing, and flattened slides.");
