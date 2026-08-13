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

  rect("Anchor").as("anchor").position({ x: 100, y: 100 }).width(200).height(80);
  const sidecar = rect("Sidecar").as("sidecar").rightOf("anchor", 40).alignTop("anchor");
  const stacked = rect("Stacked").as("stacked").below("anchor", 30).alignLeft("anchor");
  const badge = circle("Badge").as("badge").centerOn("anchor").width(40);

  resolveAnchors(document.node);

  assert.equal(sidecar.node.styles.left, "340px");
  assert.equal(sidecar.node.styles.top, "100px");
  assert.equal(sidecar.node.styles.translate, undefined);

  assert.equal(stacked.node.styles.left, "100px");
  assert.equal(stacked.node.styles.top, "210px");
  assert.equal(stacked.node.styles.translate, undefined);

  assert.equal(badge.node.styles.left, "200px");
  assert.equal(badge.node.styles.top, "140px");
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

// Rows and columns nest, so a two-dimensional arrangement needs no coordinates either.
{
  const document = presentation("Nested flow test");
  slide("Matrix").canvas();

  at("matrix").column().gap(30).position({ x: 120, y: 120 });
  at("matrix/top").row().gap(24);
  rect("A").as("a").width(160).height(100);
  rect("B").as("b").width(160).height(100);
  at("matrix/bottom").row().gap(24);
  rect("C").as("c").width(160).height(100);
  at("matrix");
  const down = line().from("a").to("c");
  const across = line().from("a").to("b");

  resolveAnchors(document.node);

  assert.deepEqual(
    [down.node.props.x1, down.node.props.y1, down.node.props.x2, down.node.props.y2],
    [80, 100, 80, 130],
  );
  assert.deepEqual(
    [across.node.props.x1, across.node.props.y1, across.node.props.x2, across.node.props.y2],
    [160, 50, 184, 50],
  );
}

// A grid resolves by column count, so a matrix needs no nested containers.
{
  const document = presentation("Grid flow test");
  slide("Grid").canvas();

  at("cells").grid(2).gap(20).width(520).position({ x: 100, y: 100 });
  rect("A").as("a").height(120);
  rect("B").as("b").height(120);
  rect("C").as("c").height(120);
  const across = line().from("a").to("b");
  const down = line().from("a").to("c");

  resolveAnchors(document.node);

  // Two tracks of (520 - 20) / 2 = 250. A shape keeps its own 240px width and sits at
  // the start of its cell, so the second column still begins at 250 + 20.
  assert.deepEqual(
    [across.node.props.x1, across.node.props.y1, across.node.props.x2, across.node.props.y2],
    [240, 60, 270, 60],
  );
  // The third item starts the second row, below the tallest item of the first.
  assert.deepEqual(
    [down.node.props.x1, down.node.props.y1, down.node.props.x2, down.node.props.y2],
    [120, 120, 120, 140],
  );
}

// Explicit pixel tracks need no width of their own.
{
  const document = presentation("Grid tracks test");
  slide("Tracks").canvas();

  at("cells").grid("200px 300px").gap(40).position({ x: 0, y: 0 });
  rect("A").as("a").width(200).height(100);
  rect("B").as("b").width(300).height(100);
  const link = line().from("a").to("b");

  resolveAnchors(document.node);

  assert.deepEqual(
    [link.node.props.x1, link.node.props.y1, link.node.props.x2, link.node.props.y2],
    [200, 50, 240, 50],
  );
}

// Equal columns depend on the container's width, so it has to be declared.
{
  const document = presentation("Grid width test");
  slide("Grid").canvas();

  at("cells").grid(3).gap(20).position({ x: 0, y: 0 });
  rect("A").as("a").height(100);
  rect("B").as("b").height(100);
  line().from("a").to("b");

  assert.throws(
    () => resolveAnchors(document.node),
    /divides its width into 3 equal columns, so it needs \.width\(\.\.\.\)/,
  );
}

// A nested container cannot use align() or justify() unless it declares its size,
// because the container around it decides how large it is.
{
  const document = presentation("Nested alignment test");
  slide("Matrix").canvas();

  at("matrix").column().gap(20).position({ x: 0, y: 0 });
  at("matrix/row").row().gap(10).justify("center");
  rect("A").as("a");
  at("matrix");
  line().from("a").to("a");

  assert.throws(
    () => resolveAnchors(document.node),
    /sits inside another row or column, so its size is decided by that container/,
  );
}

// selfAlign() moves one child across the axis of its container, and the container's
// own align() still decides where every other child lands.
{
  const document = presentation("Self alignment test");
  slide("Column").canvas();

  at("column").column().gap(20).width(400).position({ x: 100, y: 50 });
  rect("Start").as("start").width(160).height(80);
  const middle = rect("Middle").as("middle").width(160).height(80).centerSelf();
  const end = rect("End").as("end").width(160).height(80).selfAlign("end");
  const connector = line().from("start").to("end");

  resolveAnchors(document.node);

  assert.equal(middle.node.styles.alignSelf, "center");
  assert.equal(end.node.styles.alignSelf, "flex-end");

  // The connector reports the resolved geometry: the first box keeps the start of the
  // 400px axis, and the last one ends at it, so the two are 80px apart horizontally.
  assert.deepEqual(
    [connector.node.props.x1, connector.node.props.y1,
      connector.node.props.x2, connector.node.props.y2],
    [160, 40, 240, 240],
  );
}

// A child cannot align itself inside a container whose size the browser decides.
{
  const document = presentation("Nested self alignment test");
  slide("Matrix").canvas();

  at("matrix").column().gap(20).position({ x: 0, y: 0 });
  at("matrix/row").row().gap(10);
  rect("A").as("a").centerSelf();
  at("matrix");
  line().from("a").to("a");

  assert.throws(
    () => resolveAnchors(document.node),
    /so its size is decided by that container; give it \.width\(\.\.\.\) and \.height\(\.\.\.\) to use selfAlign\(\) here/,
  );
}

// An alignment FrameSeq cannot resolve is reported against the object that asked for it.
{
  const document = presentation("Unknown self alignment test");
  slide("Column").canvas();

  at("column").column().gap(20).width(400).position({ x: 0, y: 0 });
  rect("A").as("a").width(100).height(80).style({ alignSelf: "space-between" });
  rect("B").as("b").width(100).height(80);
  line().from("a").to("b");

  assert.throws(
    () => resolveAnchors(document.node),
    /"a" uses selfAlign\("space-between"\), which FrameSeq cannot resolve/,
  );
}

// Padding does not have to be symmetric, and a row is spaced by the column gap while a
// column is spaced by the row gap.
{
  const document = presentation("Edges test");
  slide("Row").canvas();

  at("row").row().gap(10, 40).padding({ top: 12, left: 30, bottom: 4, right: 8 })
    .position({ x: 0, y: 0 });
  rect("First").as("first").width(100).height(60);
  rect("Second").as("second").width(100).height(60);
  const connector = line().from("first").to("second");

  at("");
  at("column").column().gap(10, 40).padding({ top: 25, left: 5 }).position({ x: 500, y: 0 });
  rect("Top").as("top").width(100).height(60);
  rect("Bottom").as("bottom").width(100).height(60);
  const vertical = line().from("top").to("bottom");

  resolveAnchors(document.node);

  // The row starts after the left padding and advances by the column gap, not the row gap.
  assert.deepEqual(
    [connector.node.props.x1, connector.node.props.y1,
      connector.node.props.x2, connector.node.props.y2],
    [130, 42, 170, 42],
  );
  // The column starts after its own top padding and advances by the row gap.
  assert.deepEqual(
    [vertical.node.props.x1, vertical.node.props.y1,
      vertical.node.props.x2, vertical.node.props.y2],
    [55, 85, 55, 95],
  );
}

// Every distribution the DSL accepts is placed rather than refused.
{
  const document = presentation("Distribution test");
  slide("Spread").canvas();

  at("evenly").row().gap(0).width(700).justify("space-evenly").position({ x: 0, y: 0 });
  rect("A").as("a").width(100).height(50);
  rect("B").as("b").width(100).height(50);
  const evenly = line().from("a").to("b");

  at("");
  at("around").row().gap(0).width(700).justify("space-around").position({ x: 0, y: 200 });
  rect("C").as("c").width(100).height(50);
  rect("D").as("d").width(100).height(50);
  const around = line().from("c").to("d");

  resolveAnchors(document.node);

  // Three equal spaces of 500 / 3 for space-evenly.
  assert.equal(Math.round(evenly.node.props.x1), Math.round(500 / 3 + 100));
  assert.equal(Math.round(evenly.node.props.x2), Math.round(500 / 3 * 2 + 100));
  // Half a share on the outside and a full share between for space-around.
  assert.equal(Math.round(around.node.props.x1), Math.round(125 + 100));
  assert.equal(Math.round(around.node.props.x2), Math.round(125 + 100 + 250));
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
    /"row" has no canvas coordinates, and a column does not place it either/,
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

// An explicit height releases the minimum a shape carries from the stylesheet,
// but an explicit minimum set first still wins.
{
  presentation("Shape height test");
  slide("Heights").canvas();

  const short = rect("Short").height(60);
  assert.equal(short.node.styles.height, "60px");
  assert.equal(short.node.styles.minHeight, "0px");

  const floored = rect("Floored").minHeight(120).height(60);
  assert.equal(floored.node.styles.minHeight, "120px");

  const unsized = rect("Unsized");
  assert.equal(unsized.node.styles.minHeight, undefined);
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
