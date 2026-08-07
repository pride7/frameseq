#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer from "puppeteer";
import { createServer } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import {
  applyIncomingEdits,
  applyIncomingMove,
  readIncomingEdits,
  readIncomingMove,
  undoLastEdit,
} from "./source-edits.mjs";
import { sourceMarks } from "./source-marks.mjs";

/**
 * Wait for the development server to write the drag back to the slide document. A write
 * truncates before it fills, so a read can catch the file part way; only a content that two
 * reads agree on is reported.
 */
async function waitForChange(path, previous, attempts = 100) {
  let candidate;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await readFile(path, "utf8");
    if (current !== previous && current === candidate) return current;
    candidate = current;
    await delay(100);
  }
  throw new Error("The slide document was never rewritten");
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workingDirectory = resolve(packageRoot, "tmp", "source-edit-test");
const entry = resolve(workingDirectory, "slides.ts");

if (!workingDirectory.startsWith(resolve(packageRoot, "tmp"))) {
  throw new Error(`Unsafe source edit test path: ${workingDirectory}`);
}

const fixture = [
  'presentation({ title: "Layout editing" });',
  "",
  'slide("Diagram").canvas();',
  "",
  '// A comment and the surrounding formatting must survive a drag.',
  'rect("Encoder")',
  '  .as("encoder")',
  "  .position({ x: 80, y: 90 })",
  "  .width(240)",
  "  .height(120);",
  "",
  'text("Caption").position({ x: 80, y: 260 });',
  "",
  'text("Computed").position({ x: 40 + 40, y: 300 });',
  "",
  'text("Decimal").position({ x: 80.5, y: 300 }).width(160);',
  "",
  'for (const label of ["one", "two"]) rect(label).position({ x: 400, y: 90 }).width(120);',
  "",
  'slide("Flow");',
  "",
  'text("First");',
  'text("Second");',
  'text("Third");',
  "",
].join("\n");

// The server under test writes slide documents, so prove it never wandered off its fixture.
const demoDeck = resolve(packageRoot, "slides.ts");
const demoDeckBefore = await readFile(demoDeck, "utf8");

await rm(workingDirectory, { recursive: true, force: true });
await mkdir(workingDirectory, { recursive: true });
await writeFile(entry, fixture, "utf8");

function markFor(source, command) {
  return sourceMarks(source).find((mark) => source.slice(mark.start, mark.end).startsWith(command));
}

// Coordinates and sizes written as plain numbers are recorded with their exact text.
{
  const mark = markFor(fixture, 'rect("Encoder")');
  assert.deepEqual(Object.keys(mark.fields).sort(), ["height", "width", "x", "y"]);
  assert.equal(mark.fields.x.value, 80);
  assert.equal(mark.fields.y.value, 90);
  assert.equal(mark.fields.width.value, 240);
  assert.equal(fixture.slice(mark.fields.x.start, mark.fields.x.end), "80");
  assert.equal(mark.fields.x.text, "80");
}

// A computed coordinate has nothing a drag could rewrite, so no field is offered.
{
  const mark = markFor(fixture, 'text("Computed")');
  assert.equal(mark.fields?.x, undefined);
  assert.equal(mark.fields.y.value, 300);
}

// A malformed, overlapping, or oversized request is refused outright.
{
  const mark = markFor(fixture, 'rect("Encoder")');
  const x = mark.fields.x;
  assert.equal(readIncomingEdits(undefined), undefined);
  assert.equal(readIncomingEdits({ edits: [] }), undefined);
  assert.equal(readIncomingEdits({ edits: [{ start: 1, end: 0, expected: "8", value: 1 }] }), undefined);
  assert.equal(readIncomingEdits({ edits: [{ start: 0, end: 2, expected: "80", value: "12" }] }), undefined);
  assert.equal(readIncomingEdits({ edits: [{ start: 0, end: 2, expected: "80", value: Number.NaN }] }), undefined);
  // The expected text has to describe the range it claims to replace.
  assert.equal(readIncomingEdits({ edits: [{ start: 0, end: 2, expected: "800", value: 1 }] }), undefined);
  assert.equal(
    readIncomingEdits({
      edits: [
        { start: x.start, end: x.end, expected: x.text, value: 1 },
        { start: x.start, end: x.end, expected: x.text, value: 2 },
      ],
    }),
    undefined,
  );
  assert.ok(readIncomingEdits({ edits: [{ start: x.start, end: x.end, expected: x.text, value: 1 }] }));
}

// A drag whose numbers no longer match the file is refused, leaving the document untouched.
{
  const mark = markFor(fixture, 'rect("Encoder")');
  const result = await applyIncomingEdits(entry, {
    edits: [{ start: mark.fields.x.start, end: mark.fields.x.end, expected: "99", value: 400 }],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /changed/);
  assert.equal(await readFile(entry, "utf8"), fixture);
}

// An accepted drag rewrites only the numbers it moved, character for character.
{
  const mark = markFor(fixture, 'rect("Encoder")');
  const { x, y } = mark.fields;
  const result = await applyIncomingEdits(entry, {
    edits: [
      { start: x.start, end: x.end, expected: x.text, value: 305.4 },
      { start: y.start, end: y.end, expected: y.text, value: 41.6 },
    ],
  });
  assert.equal(result.ok, true);

  const updated = await readFile(entry, "utf8");
  assert.equal(updated, fixture.replace("{ x: 80, y: 90 }", "{ x: 305, y: 42 }"));
  assert.match(updated, /\/\/ A comment and the surrounding formatting must survive a drag\./);
  // The rewritten file is still a slide document the marker understands.
  assert.equal(markFor(updated, 'rect("Encoder")').fields.x.value, 305);
}

// Resizing rewrites the size the same way, from the file as it now stands.
{
  const source = await readFile(entry, "utf8");
  const { width, height } = markFor(source, 'rect("Encoder")').fields;
  const result = await applyIncomingEdits(entry, {
    edits: [
      { start: width.start, end: width.end, expected: width.text, value: 300 },
      { start: height.start, end: height.end, expected: height.text, value: 96 },
    ],
  });
  assert.equal(result.ok, true);
  const updated = await readFile(entry, "utf8");
  assert.equal(updated, source.replace(".width(240)\n  .height(120)", ".width(300)\n  .height(96)"));
}

// Undo puts back the text that was there, not a number formatted afresh from it. The history
// belongs to a document, so these use their own file rather than the one dragged above.
{
  const undoEntry = resolve(workingDirectory, "undo.slides.ts");
  await writeFile(undoEntry, fixture, "utf8");
  const { x, y } = markFor(fixture, 'text("Decimal")').fields;
  assert.equal(x.text, "80.5");

  // Both numbers change width, which moves where the second one sits once the first is written.
  const applied = await applyIncomingEdits(undoEntry, {
    edits: [
      { start: x.start, end: x.end, expected: x.text, value: 1234 },
      { start: y.start, end: y.end, expected: y.text, value: 7 },
    ],
  });
  assert.equal(applied.ok, true);
  assert.equal(
    await readFile(undoEntry, "utf8"),
    fixture.replace("{ x: 80.5, y: 300 }).width(160)", "{ x: 1234, y: 7 }).width(160)"),
  );

  const undone = await undoLastEdit(undoEntry);
  assert.equal(undone.ok, true);
  assert.equal(
    await readFile(undoEntry, "utf8"),
    fixture,
    "Undo restores the file character for character",
  );

  // The history is one drag deep, and asking again is refused rather than guessed at.
  const empty = await undoLastEdit(undoEntry);
  assert.equal(empty.ok, false);
  assert.equal(empty.undo, true);
  assert.match(empty.reason, /nothing to undo/i);
}

// A drag that someone has since edited over cannot be undone, and the history is dropped.
{
  const staleEntry = resolve(workingDirectory, "stale.slides.ts");
  await writeFile(staleEntry, fixture, "utf8");
  const { x } = markFor(fixture, 'rect("Encoder")').fields;
  assert.equal((await applyIncomingEdits(staleEntry, {
    edits: [{ start: x.start, end: x.end, expected: x.text, value: 400 }],
  })).ok, true);

  const edited = (await readFile(staleEntry, "utf8")).replace("{ x: 400", "{ x: 401");
  await writeFile(staleEntry, edited, "utf8");
  const undone = await undoLastEdit(staleEntry);
  assert.equal(undone.ok, false);
  assert.match(undone.reason, /changed/);
  assert.equal(await readFile(staleEntry, "utf8"), edited, "A refused undo leaves the document alone");
  // Once the history no longer describes the file it is dropped rather than kept and misapplied.
  assert.match((await undoLastEdit(staleEntry)).reason, /nothing to undo/i);
}

// Only a command with whole lines of its own, in a run of its own, can trade places.
{
  const source = [
    'presentation({});',
    'slide("Flow");',
    'text("A");',
    'text("B"); text("C");',
    'left();',
    'text("D");',
    'group(ref("a"), ref("b"));',
    'text("E");',
    "",
  ].join("\n");
  const marks = sourceMarks(source);
  const of = (command) => marks.find((mark) => source.slice(mark.start, mark.end).startsWith(command));

  assert.ok(of('text("A")').statement, "A command on its own lines can be moved");
  assert.equal(of('text("B")').statement, undefined, "Two commands on a line have no lines of their own");
  assert.equal(of('text("C")').statement, undefined);
  assert.equal(of('slide("Flow")').statement, undefined, "A slide is not one object among neighbours");
  assert.equal(
    of('group(ref("a")').statement,
    undefined,
    "A call that collects the objects above it cannot be moved past them",
  );
  // A cursor move and a regrouping call each start a new run, so nothing crosses them.
  assert.equal(of('text("A")').region, of('text("D")').region - 1);
  assert.notEqual(of('text("D")').region, of('text("E")').region);
}

// A move request that would land inside the lines it is moving is refused.
{
  const block = { start: 100, end: 120, expected: "x".repeat(20) };
  assert.equal(readIncomingMove(undefined), undefined);
  assert.equal(readIncomingMove({ move: { ...block, at: 110 } }), undefined);
  assert.equal(readIncomingMove({ move: { ...block, expected: "short", at: 10 } }), undefined);
  assert.equal(readIncomingMove({ move: { ...block, at: -1 } }), undefined);
  assert.ok(readIncomingMove({ move: { ...block, at: 40 } }));
}

// Moving a command carries its comment lines with it and leaves the rest of the file alone.
{
  const moveEntry = resolve(workingDirectory, "move.slides.ts");
  const source = [
    "presentation({});",
    'slide("Flow");',
    'text("First");',
    "// a note about the second",
    'text("Second");  // and one beside it',
    'text("Third");',
    "",
  ].join("\n");
  await writeFile(moveEntry, source, "utf8");
  const second = sourceMarks(source)
    .find((mark) => source.slice(mark.start, mark.end).startsWith('text("Second")')).statement;
  const first = sourceMarks(source)
    .find((mark) => source.slice(mark.start, mark.end).startsWith('text("First")')).statement;

  const asMove = (statement, at) => ({
    move: { start: statement.start, end: statement.end, expected: statement.text, at },
  });
  const moved = await applyIncomingMove(moveEntry, asMove(second, first.start));
  assert.equal(moved.ok, true);
  assert.equal(await readFile(moveEntry, "utf8"), [
    "presentation({});",
    'slide("Flow");',
    "// a note about the second",
    'text("Second");  // and one beside it',
    'text("First");',
    'text("Third");',
    "",
  ].join("\n"));

  const undone = await undoLastEdit(moveEntry);
  assert.equal(undone.ok, true);
  assert.equal(await readFile(moveEntry, "utf8"), source, "Undo puts a move back exactly");

  // Dropping a command where it already sits changes nothing and records nothing to undo.
  assert.equal((await applyIncomingMove(moveEntry, asMove(second, second.end))).ok, true);
  assert.equal(await readFile(moveEntry, "utf8"), source);
  assert.match((await undoLastEdit(moveEntry)).reason, /nothing to undo/i);
}

// End to end: dragging an object in the browser rewrites the slide document on disk.
await writeFile(entry, fixture, "utf8");
process.env.FRAMESEQ_ENTRY = entry;

const server = await createServer({
  configFile: resolve(packageRoot, "vite.config.ts"),
  root: packageRoot,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 4175, strictPort: false, open: false },
});
await server.listen();

const address = server.httpServer?.address();
if (!address || typeof address === "string") {
  await server.close();
  throw new Error("Could not determine source edit test server address");
}

const browser = await puppeteer.launch(puppeteerLaunchOptions());
const errors = [];

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");

  // An object placed by plain numbers can be moved; one placed by a computed value cannot.
  const editable = await page.evaluate(() => {
    const describe = (selector) => {
      const element = document.querySelector(selector);
      return element && {
        edit: element.dataset.frameseqEdit ? Object.keys(JSON.parse(element.dataset.frameseqEdit)).sort() : undefined,
        move: element.dataset.frameseqMove === "true",
        source: Boolean(element.dataset.frameseqSource),
      };
    };
    const repeated = [...document.querySelectorAll('.frameseq-rect')]
      .filter((element) => !element.dataset.frameseqName);
    return {
      encoder: describe('[data-frameseq-name="encoder"]'),
      repeated: repeated.map((element) => ({
        edit: element.dataset.frameseqEdit,
        source: Boolean(element.dataset.frameseqSource),
      })),
      computed: [...document.querySelectorAll(".frameseq-text")]
        .filter((element) => element.textContent === "Computed")
        .map((element) => describe(`[data-frameseq-path="${element.dataset.frameseqPath}"]`))[0],
    };
  });
  assert.deepEqual(editable.encoder.edit, ["height", "width", "x", "y"]);
  assert.equal(editable.encoder.move, true);
  assert.deepEqual(editable.computed.edit, ["y"]);
  assert.equal(editable.computed.move, false, "A computed coordinate cannot be dragged");
  assert.equal(editable.repeated.length, 2);
  for (const element of editable.repeated) {
    assert.equal(element.source, true, "A repeated command still leads back to its line");
    assert.equal(element.edit, undefined, "A command that renders twice offers no drag");
  }

  await page.click('[data-action="edit-toggle"]');
  assert.equal(
    await page.$eval('[data-action="edit-toggle"]', (button) => button.getAttribute("aria-pressed")),
    "true",
  );

  const scale = await page.evaluate(() => {
    const canvas = document.querySelector(".frameseq-slide-frame.is-active .frameseq-slide");
    const width = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--slide-width"),
    );
    return canvas.getBoundingClientRect().width / width;
  });
  assert.ok(scale > 0 && scale <= 1, `Unexpected canvas scale: ${scale}`);

  const box = await page.$eval('[data-frameseq-name="encoder"]', (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  // A click, or a press that barely moves, must leave the slide document alone.
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 2, box.y + 1);
  await page.mouse.up();
  await delay(500);
  assert.equal(
    await readFile(entry, "utf8"),
    fixture,
    "A press that does not travel far enough is not a drag",
  );

  const shiftX = 120;
  const shiftY = 60;
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + shiftX / 2, box.y + shiftY / 2);
  await page.mouse.move(box.x + shiftX, box.y + shiftY);
  await page.mouse.up();

  const changed = await waitForChange(entry, fixture);
  const moved = markFor(changed, 'rect("Encoder")').fields;
  const expectedX = Math.round(80 + shiftX / scale);
  const expectedY = Math.round(90 + shiftY / scale);
  // Within a pixel: the drag has to undo the canvas scale, not follow the screen distance.
  assert.ok(
    Math.abs(moved.x.value - expectedX) <= 1,
    `Expected x near ${expectedX} after the drag, found ${moved.x.value}`,
  );
  assert.ok(
    Math.abs(moved.y.value - expectedY) <= 1,
    `Expected y near ${expectedY} after the drag, found ${moved.y.value}`,
  );
  assert.equal(
    changed,
    fixture.replace("{ x: 80, y: 90 }", `{ x: ${moved.x.value}, y: ${moved.y.value} }`),
    "A drag must leave the rest of the slide document untouched",
  );

  // Writing the document reloads the preview, which draws the object where the source says.
  await page.waitForFunction(
    (left) => document.querySelector('[data-frameseq-name="encoder"]')?.style.left === left,
    {},
    `${moved.x.value}px`,
  );

  // Editing mode outlives the reload, so Ctrl+Z reaches the server that recorded the drag.
  assert.equal(
    await page.$eval('[data-action="edit-toggle"]', (button) => button.getAttribute("aria-pressed")),
    "true",
  );
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyZ");
  await page.keyboard.up("Control");
  assert.equal(await waitForChange(entry, changed), fixture, "Ctrl+Z puts the drag back");
  await page.waitForFunction(
    () => document.querySelector('[data-frameseq-name="encoder"]')?.style.left === "80px",
  );

  // An object in the document flow has no coordinates, so dragging it trades places instead.
  const activeSlide = () => page.evaluate(
    () => Number(document.querySelector(".frameseq-slide-frame.is-active")?.dataset.index),
  );
  for (let attempt = 0; attempt < 20 && await activeSlide() !== 1; attempt += 1) {
    await page.click('.frameseq-controls [data-action="next"]');
  }
  assert.equal(await activeSlide(), 1, "The preview should reach the flow slide");

  // Writing the document reloads the page, and a reload part way through a drag would drop it.
  await delay(500);
  const flow = await page.evaluate(() => [...document.querySelectorAll(
    ".frameseq-slide-frame.is-active [data-frameseq-statement]",
  )].map((element) => {
    const rect = element.getBoundingClientRect();
    return { label: element.textContent, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, top: rect.y };
  }));
  assert.deepEqual(flow.map((item) => item.label), ["First", "Second", "Third"]);

  await page.mouse.move(flow[2].x, flow[2].y);
  await page.mouse.down();
  await page.mouse.move(flow[1].x, flow[1].y);
  await page.mouse.move(flow[0].x, flow[0].top + 2);
  await page.waitForFunction(
    () => Boolean(document.querySelector(".frameseq-insertion-marker")),
    { timeout: 5_000 },
  ).catch(() => {
    throw new Error("A reorder should show where the object would land");
  });
  await page.mouse.up();

  const reordered = await waitForChange(entry, fixture);
  assert.equal(
    reordered,
    fixture.replace('text("First");\ntext("Second");\ntext("Third");', 'text("Third");\ntext("First");\ntext("Second");'),
    "Reordering moves the command's lines and leaves the rest of the document alone",
  );
  await page.waitForFunction(() => document.querySelector(
    ".frameseq-slide-frame.is-active [data-frameseq-statement]",
  )?.textContent === "Third");

  // An undo with nothing left that still describes the file is not a mismatch to redraw:
  // it must write nothing and leave the preview exactly as it stands.
  // Undo takes the reorder back first, which is the last thing that was written.
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyZ");
  await page.keyboard.up("Control");
  assert.equal(await waitForChange(entry, reordered), fixture);

  const settled = await page.evaluate(() => document.documentElement.dataset.ready);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyZ");
  await page.keyboard.up("Control");
  await delay(1_000);
  assert.equal(await readFile(entry, "utf8"), fixture);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ready), settled);

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}

assert.equal(
  await readFile(demoDeck, "utf8"),
  demoDeckBefore,
  "A drag must only ever rewrite the slide document the server was started on",
);

await rm(workingDirectory, { recursive: true, force: true });

console.log("Source edit test passed: drags rewrite only the numbers they moved, and stale ones are refused.");
