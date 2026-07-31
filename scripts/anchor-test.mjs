import assert from "node:assert/strict";
import {
  at,
  circle,
  line,
  presentation,
  rect,
  resolveAnchors,
  slide,
  text,
} from "../lib/index.js";

function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function named(document, name) {
  const found = findNode(document.node, (node) => node.props.name === name);
  assert.ok(found, `An object named "${name}" should exist`);
  return found;
}

// Connectors and relative placement on a single canvas.
{
  const document = presentation("Anchor test");
  slide("Pipeline").canvas();

  const encoder = rect("Encoder").as("enc")
    .position({ x: 80, y: 120 })
    .width(200)
    .height(100);
  const decoder = rect("Decoder").as("dec").rightOf("enc", 140);
  const loss = circle("Loss").as("loss").rightOf("dec", 60);
  const caption = text("shared vocabulary").as("caption").below("enc", 20);
  const forward = line().from("enc").to("dec").arrow("end");
  const explicit = line().from("loss.bottom").to("enc.bottom", { dy: 8 });

  resolveAnchors(document.node);

  // rightOf() keeps the vertical centre and shifts by half its own height.
  assert.equal(decoder.node.styles.left, "420px");
  assert.equal(decoder.node.styles.top, "170px");
  assert.equal(decoder.node.styles.translate, "0 -50%");
  assert.equal(decoder.node.styles.position, "absolute");

  // Default box of a rect is 240 x 96, of a circle 160 x 160.
  assert.equal(loss.node.styles.left, "720px");
  assert.equal(loss.node.styles.top, "170px");

  // A placed object needs no size of its own: CSS centres it with translate.
  assert.equal(caption.node.styles.left, "180px");
  assert.equal(caption.node.styles.top, "240px");
  assert.equal(caption.node.styles.translate, "-50% 0");

  // Automatic sides: the boxes sit side by side, so the connector leaves the right edge.
  assert.deepEqual(
    [forward.node.props.x1, forward.node.props.y1, forward.node.props.x2, forward.node.props.y2],
    [280, 170, 420, 170],
  );

  // Explicit sides plus an offset.
  assert.deepEqual(
    [explicit.node.props.x1, explicit.node.props.y1, explicit.node.props.x2, explicit.node.props.y2],
    [800, 250, 180, 228],
  );

  assert.equal(encoder.node.props.name, "enc");

  // Resolving the same document twice must not move anything.
  const before = JSON.stringify(document.node);
  resolveAnchors(document.node);
  assert.equal(JSON.stringify(document.node), before);
}

// alignTop() and alignLeft() change one axis only, and chain after another placement.
{
  const document = presentation("Alignment test");
  slide("Alignment").canvas();

  // The shape stylesheet keeps a rect at least 96px tall, so this one renders 96,
  // not 80, and every placement below it follows the rendered box.
  rect("Anchor").as("anchor").position({ x: 100, y: 100 }).width(200).height(80);
  const sidecar = rect("Sidecar").as("sidecar").rightOf("anchor", 40).alignTop("anchor");
  const stacked = rect("Stacked").as("stacked").below("anchor", 30).alignLeft("anchor");
  const badge = circle("Badge").as("badge").centerOn("anchor").width(40);

  resolveAnchors(document.node);

  assert.equal(sidecar.node.styles.left, "340px");
  assert.equal(sidecar.node.styles.top, "100px");
  assert.equal(sidecar.node.styles.translate, undefined);

  assert.equal(stacked.node.styles.left, "100px");
  assert.equal(stacked.node.styles.top, "226px");
  assert.equal(stacked.node.styles.translate, undefined);

  assert.equal(badge.node.styles.left, "200px");
  assert.equal(badge.node.styles.top, "148px");
  assert.equal(badge.node.styles.translate, "-50% -50%");
}

// A positioned group is a local coordinate system whose children still resolve globally.
{
  const document = presentation("Nested frame test");
  slide("Stages").canvas();

  at("stage").canvas().position({ x: 200, y: 60 }).width(400).height(300);
  rect("Inner").as("inner").position({ x: 20, y: 40 }).width(100).height(100);

  at("");
  const outer = rect("Outer").as("outer").position({ x: 700, y: 100 }).width(100).height(100);
  const link = line().from("inner").to("outer");

  resolveAnchors(document.node);

  // inner sits at 200 + 20, 60 + 40 in slide coordinates, and both boxes are 100 tall.
  assert.deepEqual(
    [link.node.props.x1, link.node.props.y1, link.node.props.x2, link.node.props.y2],
    [320, 150, 700, 150],
  );
  assert.equal(outer.node.styles.left, "700px");
}

// Errors are reported together, with the slide that caused them.
{
  const document = presentation("Error test");
  slide("Missing name").canvas();
  rect("Known").as("known").position({ x: 0, y: 0 });
  line().from("known").to("absent");

  assert.throws(
    () => resolveAnchors(document.node),
    (error) => /Slide 1 \("Missing name"\)/.test(error.message)
      && /no object is named "absent"/.test(error.message)
      && /named objects on this slide: known/.test(error.message),
  );
}

{
  const document = presentation("Duplicate test");
  slide("Duplicates").canvas();
  rect("First").as("box").position({ x: 0, y: 0 });
  rect("Second").as("box").position({ x: 0, y: 200 });

  assert.throws(
    () => resolveAnchors(document.node),
    /two objects are named "box"/,
  );
}

{
  const document = presentation("Cycle test");
  slide("Cycle").canvas();
  rect("A").as("a").rightOf("b");
  rect("B").as("b").rightOf("a");

  assert.throws(() => resolveAnchors(document.node), /circular placement/);
}

{
  const document = presentation("Unpositioned test");
  slide("Flow").canvas();
  at("holder").canvas();
  rect("Hidden").as("hidden").position({ x: 10, y: 10 });

  at("");
  rect("Visible").as("visible").position({ x: 400, y: 10 });
  line().from("visible").to("hidden");

  assert.throws(
    () => resolveAnchors(document.node),
    /across a container without fixed coordinates/,
  );
}

{
  const document = presentation("Unknown size test");
  slide("Sizes").canvas();
  text("Free text").as("copy").position({ x: 40, y: 40 });
  rect("Node").as("node").rightOf("copy");

  assert.throws(
    () => resolveAnchors(document.node),
    /the width of "copy" is unknown/,
  );
}

// A row resolves its children so they need no coordinates of their own.
{
  const document = presentation("Flow layout test");
  slide("Row").canvas();

  at("stages").row().gap(80).position({ x: 80, y: 200 });
  rect("Parse").as("parse");
  rect("Build").as("build");
  const link = line().from("parse").to("build");

  resolveAnchors(document.node);

  // Default rect box is 240 x 96, so the second child starts at 240 + 80.
  assert.deepEqual(
    [link.node.props.x1, link.node.props.y1, link.node.props.x2, link.node.props.y2],
    [240, 48, 320, 48],
  );
}

// A column resolves along the other axis.
{
  const document = presentation("Column flow test");
  slide("Column").canvas();

  at("steps").column().gap(30).position({ x: 100, y: 100 });
  rect("First").as("first").height(120);
  rect("Second").as("second").height(120);
  const link = line().from("first").to("second");

  resolveAnchors(document.node);

  assert.deepEqual(
    [link.node.props.x1, link.node.props.y1, link.node.props.x2, link.node.props.y2],
    [120, 120, 120, 150],
  );
}

// Layouts that cannot be resolved exactly are reported instead of guessed.
{
  const document = presentation("Flow limits test");
  slide("Theme gap").canvas();
  at("row").row().position({ x: 0, y: 0 });
  rect("A").as("a");
  rect("B").as("b");
  line().from("a").to("b");

  assert.throws(() => resolveAnchors(document.node), /gap of "row" comes from the theme/);
}

{
  const document = presentation("Grow test");
  slide("Grow").canvas();
  at("row").row().gap(10).position({ x: 0, y: 0 });
  rect("A").as("a").grow();
  rect("B").as("b");
  line().from("a").to("b");

  assert.throws(() => resolveAnchors(document.node), /uses grow\(\)/);
}

{
  const document = presentation("Unpositioned container test");
  slide("Flow").canvas();
  at("row").row().gap(10);
  rect("A").as("a");
  rect("B").as("b");
  line().from("a").to("b");

  assert.throws(
    () => resolveAnchors(document.node),
    /is laid out by "row", which has no coordinates of its own/,
  );
}

{
  const document = presentation("Unknown child size test");
  slide("Text row").canvas();
  at("row").row().gap(10).position({ x: 0, y: 0 });
  text("Free text").as("copy");
  rect("B").as("b");
  line().from("copy").to("b");

  assert.throws(() => resolveAnchors(document.node), /the width of "copy" is unknown/);
}

// anchor() positions an object against its container without coordinates.
{
  const document = presentation("Anchor test");
  slide("Anchored").canvas();
  const centred = at("diagram").row().gap(20).anchor("center");
  const corner = at("legend").anchor("bottom-right", 40);

  assert.equal(centred.node.styles.left, "50%");
  assert.equal(centred.node.styles.top, "50%");
  assert.equal(centred.node.styles.translate, "-50% -50%");
  assert.equal(corner.node.styles.left, "calc(100% - 40px)");
  assert.equal(corner.node.styles.top, "calc(100% - 40px)");
  assert.equal(corner.node.styles.translate, "-100% -100%");
  assert.throws(() => rect("X").anchor("middle"), /does not know "middle"/);
}

// Names are validated where they are written.
{
  presentation("Validation test");
  slide("Validation").canvas();
  assert.throws(() => rect("Bad").as("2fast"), /expects a name/);
  assert.throws(() => line().from("enc.middle"), /does not know the anchor "middle"/);
  assert.throws(() => line().to("enc.right.left"), /does not know the anchor "right\.left"/);
}

console.log("anchor-test: all checks passed");
