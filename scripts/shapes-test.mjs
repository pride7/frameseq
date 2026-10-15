import assert from "node:assert/strict";
import {
  connectorMidpoint,
  line,
  polygonCorners,
  presentation,
  rect,
  resolveAnchors,
  resolveShapePaint,
  routeConnector,
  shape,
  shapeGeometry,
  shapeKinds,
  shapePreset,
  shapeSize,
  slide,
  themes,
  tonePaint,
} from "../lib/index.js";

// Every kind draws a closed outline that fills its box, with room for a label inside it.
{
  assert.equal(shapeKinds.length, 27);
  for (const kind of shapeKinds) {
    const { width, height } = shapeSize(kind);
    const geometry = shapeGeometry(kind, width, height, { strokeWidth: 2 });
    assert.equal(geometry.outline[0].op, "M", `${kind} starts with a move`);
    assert.equal(geometry.outline.at(-1).op, "Z", `${kind} is closed`);
    const xs = geometry.outline.filter((segment) => segment.op !== "Z").map((segment) => segment.x);
    const ys = geometry.outline.filter((segment) => segment.op !== "Z").map((segment) => segment.y);
    assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= width + 0.01, `${kind} stays within its width`);
    // A callout's tail points below its box, as PowerPoint's does.
    if (kind !== "callout") assert.ok(Math.max(...ys) <= height + 0.01, `${kind} stays within its height`);
    assert.ok(Math.min(...ys) >= 0, `${kind} starts below its top`);
    const { text } = geometry;
    assert.ok(text.width > 0 && text.height > 0, `${kind} has room for a label`);
    assert.ok(text.x >= 0 && text.y >= 0 && text.x + text.width <= width + 0.01 && text.y + text.height <= height + 0.01,
      `${kind} keeps its label inside its box`);
    assert.ok(shapePreset(kind), `${kind} has a PowerPoint preset`);
  }
  assert.equal(shapePreset("cylinder"), "can");
  assert.equal(shapePreset("diamond"), "diamond");
  assert.deepEqual(polygonCorners(shapeGeometry("diamond", 200, 100).outline), [[100, 0], [200, 50], [100, 100], [0, 50]]);
  assert.equal(polygonCorners(shapeGeometry("cylinder", 200, 100).outline), undefined, "a cylinder curves");
  // A diamond's label sits in its middle half.
  assert.deepEqual(shapeGeometry("diamond", 200, 100).text, { x: 50, y: 25, width: 100, height: 50 });
}

// A tone is a tint of its colour on a light theme, and a deeper one on a dark theme.
{
  const brightness = (hex) => [1, 3, 5].reduce((sum, at) => sum + Number.parseInt(hex.slice(at, at + 2), 16), 0);
  const light = tonePaint(themes.blank.colors, { color: "blue", style: "soft" });
  const dark = tonePaint(themes.midnight.colors, { color: "blue", style: "soft" });
  assert.ok(brightness(light.fill) > brightness(light.stroke), "a soft fill is lighter than its outline");
  assert.ok(brightness(light.fill) > brightness(light.text), "a soft label is darker than its fill");
  assert.ok(brightness(dark.fill) < brightness(dark.text), "on a dark theme the label is lighter than the fill");
  const solid = tonePaint(themes.blank.colors, { color: "blue", style: "solid" });
  assert.equal(solid.fill, "#2563eb");
  assert.equal(solid.text, "#ffffff");
  const outline = tonePaint(themes.blank.colors, { color: "#0f766e", style: "outline" });
  assert.equal(outline.fill, "#ffffff");
  assert.equal(outline.stroke, "#0f766e");
  const accent = tonePaint(themes.paper.colors, { color: "accent", style: "solid" });
  assert.equal(accent.fill, themes.paper.colors.accent);
}

// Shapes take part in placement with the size of their kind, and every shape gets its paint.
{
  const document = presentation({ title: "Shapes", theme: "midnight" });
  slide("Flow").canvas();
  shape("diamond", "Valid?").as("check").position({ x: 100, y: 100 });
  const store = shape("cylinder", "Store").as("store").rightOf("check", 100);
  const round = shape("circle").as("round").width(90).position({ x: 0, y: 400 });
  const box = rect("Box").as("box").tone("green", "outline").position({ x: 700, y: 400 });
  resolveAnchors(document.node);
  resolveShapePaint(document.node);
  // A diamond is 200 x 140, so the cylinder sits 100 past its right edge, centred on it.
  assert.equal(store.node.styles.left, "400px");
  assert.equal(store.node.styles.top, "170px");
  assert.ok(store.node.props.paint.fill.startsWith("#"), "an untoned shape is painted with the accent");
  assert.equal(box.node.props.paint.stroke, tonePaint(themes.midnight.colors, { color: "green", style: "outline" }).stroke);
  // A circle given only a width stays round.
  const resolved = line().from("round").to("box");
  resolveAnchors(document.node);
  assert.equal(resolved.node.props.y1, 445, "the circle's centre is half its width down");
  assert.equal(round.node.props.kind, "circle");
}

// Elbows leave and enter square, go around what stands between, and keep to the corners they need.
{
  const start = { point: { x: 100, y: 100 }, side: "right", box: { x: 0, y: 60, width: 100, height: 80 } };
  const end = { point: { x: 500, y: 300 }, side: "left", box: { x: 500, y: 260, width: 100, height: 80 } };
  const points = routeConnector("elbow", start, end);
  assert.deepEqual(points[0], [100, 100]);
  assert.deepEqual(points.at(-1), [500, 300]);
  for (let index = 1; index < points.length; index += 1) {
    const [ax, ay] = points[index - 1];
    const [bx, by] = points[index];
    assert.ok(ax === bx || ay === by, "every leg is horizontal or vertical");
  }
  assert.ok(points[1][0] > 100 && points[1][1] === 100, "the first leg leaves to the right");
  assert.ok(points.at(-2)[0] < 500 && points.at(-2)[1] === 300, "the last leg arrives from the left");

  // A box standing across the way between them pushes the route around it.
  const wall = { x: 250, y: 0, width: 100, height: 500 };
  const around = routeConnector("elbow", start, end, [wall]);
  for (let index = 1; index < around.length; index += 1) {
    const [ax, ay] = around[index - 1];
    const [bx, by] = around[index];
    const crosses = ax === bx
      ? ax > wall.x && ax < wall.x + wall.width && Math.max(ay, by) > wall.y && Math.min(ay, by) < wall.y + wall.height
      : ay > wall.y && ay < wall.y + wall.height && Math.max(ax, bx) > wall.x && Math.min(ax, bx) < wall.x + wall.width;
    assert.ok(!crosses, `the route goes around the wall, not through it: ${JSON.stringify(around)}`);
  }

  // Facing sides almost level run straight across.
  const level = routeConnector(
    "elbow",
    { point: { x: 100, y: 100 }, side: "right", box: { x: 0, y: 60, width: 100, height: 80 } },
    { point: { x: 400, y: 108 }, side: "left", box: { x: 400, y: 58, width: 100, height: 100 } },
  );
  assert.deepEqual(level, [[100, 100], [400, 100]]);

  // A curve leaves and enters square, with its control points out along each side.
  const curve = routeConnector("curve", start, end);
  assert.equal(curve.length, 4);
  assert.equal(curve[1][1], 100);
  assert.ok(curve[1][0] > 100);
  assert.equal(curve[2][1], 300);
  assert.ok(curve[2][0] < 500);

  // An elbow's label sits in the middle of its longest leg.
  assert.deepEqual(connectorMidpoint("elbow", [[0, 0], [20, 0], [20, 200], [60, 200]]), { x: 20, y: 100 });
  assert.deepEqual(connectorMidpoint("straight", [[0, 0], [100, 0]]), { x: 50, y: 0 });
}

// A routed connector between named shapes resolves to its corners, clear of a third shape.
{
  const document = presentation("Routed");
  slide("Flow").canvas();
  shape("diamond", "Cached?").as("cached").position({ x: 100, y: 0 }).width(200).height(100);
  shape("rounded", "Run").as("run").position({ x: 80, y: 160 }).width(240).height(80);
  shape("pill", "Reply").as("reply").position({ x: 110, y: 300 }).width(180).height(60);
  const yes = line().from("cached.right").to("reply.right").route("elbow").arrow().label("yes");
  resolveAnchors(document.node);
  const points = yes.node.props.points;
  assert.ok(Array.isArray(points) && points.length >= 4, "an elbow has corners");
  const lane = Math.max(...points.map(([x]) => x));
  assert.ok(lane >= 320 + 24, `the route keeps clear of the box beneath, running at x = ${lane}`);
  const before = JSON.stringify(document.node);
  resolveAnchors(document.node);
  assert.equal(JSON.stringify(document.node), before, "resolving twice changes nothing");
}

// Mistakes are reported in words that say what to write instead.
{
  presentation("Errors");
  slide("Bad");
  assert.throws(() => shape("hexagonal"), /shape\(\) does not know "hexagonal"/);
  assert.throws(() => shape("rect").tone("blue", "glossy"), /tone\(\) expects the style/);
  assert.throws(() => line().route("zigzag"), /route\(\) expects "straight", "elbow", or "curve"/);
}

console.log("Shapes test passed: geometry, presets, tones, placement, routes, and labels.");
