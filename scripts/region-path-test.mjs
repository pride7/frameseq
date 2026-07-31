import assert from "node:assert/strict";
import {
  at,
  bullets,
  cell,
  line,
  main,
  presentation,
  rect,
  resolveAnchors,
  slide,
  text,
} from "../lib/index.js";

function classes(node) {
  return typeof node.props.className === "string"
    ? node.props.className.split(/\s+/).filter(Boolean)
    : [];
}

function body(slideNode) {
  const found = slideNode.children.find((node) => classes(node).includes("frameseq-slide-body"));
  assert.ok(found, "The slide body should exist");
  return found;
}

// Paths create their containers on the way and are revisitable.
{
  const document = presentation("Region path test");
  slide("Roadmap").grid(2);

  const now = at("cell0/now").card();
  text("Q3").eyebrow();
  bullets("Anchors", "Region paths");

  at("cell1/next");
  text("Q4").eyebrow();

  at("cell0/now");
  text("Merged into main").caption();

  const cells = body(document.slides[0]).children;
  assert.equal(cells.length, 2);
  assert.deepEqual(cells[0].children, [now.node]);
  assert.equal(now.node.children.length, 3, "Re-entering a path appends to the same region");
  assert.ok(classes(now.node).includes("frameseq-group"));
  assert.ok(classes(now.node).includes("frameseq-region-card"));
  assert.equal(now.node.props.name, "cell0/now");
  assert.equal(cells[1].children[0].props.name, "cell1/next");

  // at() returns the same region for the same path, and cell0 is the grid cell itself.
  assert.equal(at("cell0/now"), now);
  assert.equal(at("cell0").node, cells[0]);
  assert.equal(at("cell1").node, cell(1).node);
}

// Nesting goes as deep as the path, without indentation in the source.
{
  const document = presentation("Depth test");
  slide("Notes");

  at("notes").row().gap(24);
  at("notes/left");
  text("Left copy");
  at("notes/left/detail");
  text("Detail copy");
  at("notes/right");
  text("Right copy");

  const notes = body(document.slides[0]).children[0];
  assert.equal(notes.props.name, "notes");
  assert.equal(notes.styles.flexDirection, "row");
  assert.equal(notes.styles.gap, "24px");
  assert.equal(notes.children.length, 2);

  const [left, right] = notes.children;
  assert.equal(left.props.name, "notes/left");
  assert.equal(right.props.name, "notes/right");
  assert.equal(left.children.length, 2, "Copy and the nested region share the parent");
  assert.equal(left.children[1].props.name, "notes/left/detail");
  assert.equal(left.children[1].children.length, 1);
}

// main(), at("") and at("main") all address the slide's primary region.
{
  const document = presentation("Main region test");
  slide("Split").split("40:60");

  at("right");
  text("In the right column");
  at("");
  text("Back in the default region");
  at("main/aside");
  text("Nested under the default region");

  const [leftRegion, rightRegion] = body(document.slides[0]).children;
  assert.equal(rightRegion.children.length, 1);
  assert.equal(leftRegion.children.length, 2);
  assert.equal(leftRegion.children[1].props.name, "main/aside");
  assert.equal(main().node, leftRegion);
  assert.equal(at("main").node, leftRegion);
}

// A positioned region is a local coordinate system that connectors can anchor to.
{
  const document = presentation("Region anchor test");
  slide("Stages").canvas();

  at("stages").canvas().position({ x: 200, y: 60 }).width(400).height(300);
  rect("First").as("first").position({ x: 20, y: 40 }).width(100).height(100);

  at("");
  rect("Outside").as("outside").position({ x: 800, y: 100 }).width(120).height(100);
  const inner = line().from("first").to("outside");
  const edge = line().from("outside").to("stages");

  resolveAnchors(document.node);

  assert.deepEqual(
    [inner.node.props.x1, inner.node.props.y1, inner.node.props.x2, inner.node.props.y2],
    [320, 150, 800, 150],
  );
  // "stages" resolves as a box of its own: 400 x 300 at (200, 60).
  assert.deepEqual(
    [edge.node.props.x1, edge.node.props.y1, edge.node.props.x2, edge.node.props.y2],
    [800, 150, 600, 210],
  );
}

// Paths are scoped to their slide.
{
  const document = presentation("Scope test");
  slide("First");
  const firstNotes = at("notes");
  text("On the first slide");

  slide("Second");
  const secondNotes = at("notes");
  text("On the second slide");

  assert.notEqual(firstNotes.node, secondNotes.node);
  assert.equal(body(document.slides[0]).children[0].children.length, 1);
  assert.equal(body(document.slides[1]).children[0].children.length, 1);
}

// Invalid paths and missing layouts are reported where they are written.
{
  presentation("Path error test");
  slide("Errors");

  assert.throws(() => at("a//b"), /expects segments separated by "\/"/);
  assert.throws(() => at("2fast"), /expects segments separated by "\/"/);
  assert.throws(() => at("has space"), /expects segments separated by "\/"/);
  assert.throws(() => at("left"), /needs a split layout/);
  assert.throws(() => at("cell2"), /needs a grid with at least 3 cells/);

  slide("Grid errors").grid(2);
  assert.throws(() => at("cell5"), /needs a grid with at least 6 cells/);
  assert.doesNotThrow(() => at("cell1"));
}

console.log("region-path-test: all checks passed");
