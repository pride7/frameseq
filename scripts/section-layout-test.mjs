import assert from "node:assert/strict";
import {
  card,
  gridSection,
  group,
  metric,
  presentation,
  slide,
  text,
} from "../lib/index.js";

function classes(node) {
  return typeof node.props.className === "string"
    ? node.props.className.split(/\s+/).filter(Boolean)
    : [];
}

const slides = presentation("Section layout test");
slide("Local grid");

const before = text("Before the grid");
const first = card("Declarative", "Readable source code");
const second = group(
  text("Portable").bold(),
  text("HTML, PDF and PPTX"),
).card();
const third = metric("3", "export formats");
const section = gridSection(3, first, second, third).gap(20);
const after = text("After the grid");

const page = slides.slides[0];
const body = page.children.find((node) => classes(node).includes("frameseq-slide-body"));
assert.ok(body, "The slide body should exist");
assert.deepEqual(body.children, [before.node, section.node, after.node]);
assert.equal(section.node.styles.display, "grid");
assert.equal(section.node.styles.gridTemplateColumns, "repeat(3, minmax(0, 1fr))");
assert.equal(section.node.styles.gap, "20px");
assert.deepEqual(section.node.children, [first.node, second.node, third.node]);
assert.ok(classes(first.node).includes("frameseq-card"));
assert.ok(classes(second.node).includes("frameseq-card"));
assert.ok(classes(third.node).includes("frameseq-metric"));
assert.equal(second.node.children.length, 2);
assert.equal(second.node.children[0].styles.fontWeight, "700");

section.columns("1fr 2fr 1fr");
assert.equal(section.node.styles.gridTemplateColumns, "1fr 2fr 1fr");
assert.throws(() => section.columns(0), /integer from 1 to 12/);
assert.throws(() => section.columns("  "), /cannot be empty/);

const repeated = text("Cannot appear twice");
assert.throws(
  () => gridSection(2, repeated, repeated),
  /same object more than once/,
);

slide("Incremental parent-child layout");

const panel = group()
  .card()
  .canvas()
  .width(520)
  .height(220)
  .clip();
const panelTitle = text("Local canvas")
  .parent(panel)
  .position({ x: 24, y: 20 });
const panelMetric = metric("63+", "papers")
  .parent(panel)
  .position({ x: 24, y: 82 });

const incrementalGrid = gridSection(2).gap(16);
const gridCardA = card("A", "First").parent(incrementalGrid);
const gridCardB = card("B", "Second").parent(incrementalGrid);

const nestedPage = slides.slides[1];
const nestedBody = nestedPage.children.find((node) =>
  classes(node).includes("frameseq-slide-body"));
assert.ok(nestedBody, "The nested slide body should exist");
assert.deepEqual(nestedBody.children, [panel.node, incrementalGrid.node]);
assert.deepEqual(panel.node.children, [panelTitle.node, panelMetric.node]);
assert.equal(panel.node.styles.position, "relative");
assert.equal(panel.node.styles.display, "block");
assert.equal(panel.node.styles.overflow, "hidden");
assert.equal(panelTitle.node.styles.position, "absolute");
assert.deepEqual(incrementalGrid.node.children, [gridCardA.node, gridCardB.node]);

const outer = group();
const inner = group().parent(outer);
assert.throws(() => outer.parent(inner), /cycle/);

const foreignSlide = slide("Different slide");
const foreignObject = text("Cannot move across slides");
assert.throws(() => foreignObject.parent(panel), /same slide/);
assert.throws(() => foreignSlide.parent(panel), /Only content objects/);

console.log("Section layout test passed: regrouping, incremental parents, local canvases, clipping, ordering, and validation.");
