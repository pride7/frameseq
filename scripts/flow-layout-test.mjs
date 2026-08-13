import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { build, preview } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

/**
 * FrameSeq resolves a row or column at build time so its children can be anchored
 * without coordinates. That calculation only holds if it agrees with what the browser
 * actually lays out, so this test measures the rendered boxes and checks every
 * connector endpoint against them. Print mode is used because it disables the canvas
 * scale transform and keeps every slide laid out.
 */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.FRAMESEQ_ENTRY = resolve(packageRoot, "tests", "flow-anchors.slides.ts");
process.env.FRAMESEQ_BUILD_DIR = resolve(packageRoot, "tmp", "flow-anchors");

await build({ configFile: resolve(packageRoot, "vite.config.ts") });

const server = await preview({
  configFile: resolve(packageRoot, "vite.config.ts"),
  preview: {
    host: "127.0.0.1",
    port: 4181,
    strictPort: true,
  },
});

const browser = await puppeteer.launch(puppeteerLaunchOptions());
const errors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:4181/?print=1", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await page.evaluate(() => document.fonts.ready);

  const measured = await page.evaluate(() => {
    const boxIn = (element, frame) => {
      const bounds = element.getBoundingClientRect();
      const origin = frame.getBoundingClientRect();
      return {
        x: bounds.left - origin.left,
        y: bounds.top - origin.top,
        width: bounds.width,
        height: bounds.height,
      };
    };

    return Array.from(document.querySelectorAll(".frameseq-line")).map((wrapper) => {
      const vector = wrapper.querySelector("line");
      // A connector is absolutely positioned, so its containing block is the frame
      // that its coordinates are expressed in.
      const frame = wrapper.offsetParent;
      const boxes = Array.from(frame.querySelectorAll("[data-frameseq-name]"))
        .map((element) => ({
          name: element.dataset.frameseqName,
          ...boxIn(element, frame),
        }));
      return {
        slide: wrapper.closest(".frameseq-slide")?.dataset.frameseqSlideLabel
          ?? wrapper.closest(".frameseq-slide-frame")?.dataset.index,
        points: {
          x1: Number(vector.getAttribute("x1")),
          y1: Number(vector.getAttribute("y1")),
          x2: Number(vector.getAttribute("x2")),
          y2: Number(vector.getAttribute("y2")),
        },
        boxes,
      };
    });
  });

  assert.equal(measured.length, 15, "Every connector in the fixture should be rendered");

  const tolerance = 1;
  const edgeDistance = (point, box) => {
    const insideX = point.x >= box.x - tolerance && point.x <= box.x + box.width + tolerance;
    const insideY = point.y >= box.y - tolerance && point.y <= box.y + box.height + tolerance;
    if (!insideX || !insideY) return Infinity;
    return Math.min(
      Math.abs(point.x - box.x),
      Math.abs(point.x - (box.x + box.width)),
      Math.abs(point.y - box.y),
      Math.abs(point.y - (box.y + box.height)),
    );
  };

  for (const connector of measured) {
    for (const [end, point] of [
      ["start", { x: connector.points.x1, y: connector.points.y1 }],
      ["end", { x: connector.points.x2, y: connector.points.y2 }],
    ]) {
      const nearest = connector.boxes
        .map((box) => ({ box, distance: edgeDistance(point, box) }))
        .sort((left, right) => left.distance - right.distance)[0];
      assert.ok(
        nearest && nearest.distance <= tolerance,
        `Slide ${connector.slide}: the ${end} of a connector is at `
        + `(${point.x}, ${point.y}), which is not on the edge of any rendered box. `
        + `Build-time layout disagrees with the browser. Boxes: `
        + connector.boxes.map((box) =>
          `${box.name} @ (${Math.round(box.x)}, ${Math.round(box.y)}) `
          + `${Math.round(box.width)}x${Math.round(box.height)}`).join("; "),
      );
    }
  }

  const named = new Map();
  for (const connector of measured) {
    for (const box of connector.boxes) named.set(box.name, box);
  }

  // A row starts at the container origin and advances by width plus gap.
  assert.deepEqual(
    [named.get("parse").x, named.get("build").x, named.get("render").x],
    [0, 320, 640],
  );
  assert.equal(named.get("parse").width, 240);

  // The centred column places each child by the widest one, and an explicit height
  // is rendered as asked, so the second child starts at 80 plus the 40px gap.
  assert.equal(named.get("wide").x, 0);
  assert.equal(named.get("wide").height, 80);
  assert.equal(named.get("narrow").x, 80);
  assert.equal(named.get("narrow").y, 120);

  // selfAlign() moves one child across the axis of a column that keeps its default
  // stretch, so its siblings stay at the start and the vertical rhythm is unchanged.
  assert.deepEqual(
    [named.get("s1").x, named.get("s2").x, named.get("s3").x],
    [0, 120, 240],
  );
  assert.deepEqual(
    [named.get("s1").y, named.get("s2").y, named.get("s3").y],
    [0, 110, 220],
  );

  // Stretch gives a child without its own height the height of the line.
  assert.equal(named.get("tall").height, 160);
  assert.equal(named.get("auto").height, 160);
  const stretchConnector = measured.find((connector) =>
    connector.boxes.some((box) => box.name === "tall"));
  assert.equal(stretchConnector.points.y1, 80);
  assert.equal(stretchConnector.points.y2, 80);

  // space-between spreads the free space of an explicit main size.
  assert.deepEqual(
    [named.get("left").x, named.get("middle").x, named.get("right").x],
    [0, 360, 720],
  );

  // The anchored group needs no coordinates, and its contents still resolve.
  assert.equal(named.get("a").x, 0);
  assert.equal(named.get("b").x, 260);

  // Nested containers compose: a row inside a column carries its own offset.
  assert.deepEqual([named.get("a1").x, named.get("a1").y], [0, 0]);
  assert.deepEqual([named.get("b1").x, named.get("b1").y], [184, 0]);
  assert.deepEqual([named.get("c1").x, named.get("c1").y], [0, 130]);
  assert.deepEqual([named.get("d1").x, named.get("d1").y], [184, 130]);

  // A column inside a row starts after the previous column plus the gap, and the
  // shorter column stretches to the height of the taller one without moving its child.
  assert.deepEqual([named.get("l1").x, named.get("l1").y], [0, 0]);
  assert.deepEqual([named.get("l2").x, named.get("l2").y], [0, 116]);
  assert.deepEqual([named.get("r1").x, named.get("r1").y], [188, 0]);

  // Asymmetric padding places the first child by the leading sides only, and the row
  // advances by the column gap rather than the row gap.
  assert.deepEqual([named.get("e1").x, named.get("e1").y], [44, 20]);
  assert.deepEqual([named.get("e2").x, named.get("e2").y], [44 + 150 + 36, 20]);

  // space-evenly splits the free space into one more share than there are items.
  const share = (720 - 160 * 2) / 3;
  assert.equal(Math.round(named.get("v1").x), Math.round(share));
  assert.equal(Math.round(named.get("v2").x), Math.round(share * 2 + 160));

  // A grid divides its declared width into equal tracks and starts a new row after
  // the column count, so the fourth item sits under the first.
  const track = (800 - 20 * 2) / 3;
  // A shape has a width of its own, so it keeps it and sits at the start of its cell
  // rather than filling the track.
  assert.equal(named.get("g1").width, 240);
  assert.deepEqual([named.get("g1").x, named.get("g1").y], [0, 0]);
  assert.equal(Math.round(named.get("g2").x), Math.round(track + 20));
  assert.equal(Math.round(named.get("g3").x), Math.round((track + 20) * 2));
  assert.deepEqual([named.get("g4").x, named.get("g4").y], [0, 140]);

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}

console.log("Flow layout test passed: build-time row and column geometry matches the browser.");
