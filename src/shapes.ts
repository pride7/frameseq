import type { AnchorSide, FrameSeqNode } from "./core";
import type { ThemeColors } from "./theme";

/*
 * Diagram shapes and connectors as plain arithmetic. The browser, PowerPoint export, and Typst
 * export all draw from the outlines computed here, so a shape keeps one geometry everywhere.
 */

/** The outlines shape() can draw. Each one exports to PowerPoint as its native preset shape. */
export type ShapeKind =
  | "rect"
  | "rounded"
  | "pill"
  | "ellipse"
  | "circle"
  | "diamond"
  | "triangle"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "parallelogram"
  | "trapezoid"
  | "star"
  | "plus"
  | "cylinder"
  | "document"
  | "note"
  | "cube"
  | "cloud"
  | "callout"
  | "chevron"
  | "step"
  | "arrow-right"
  | "arrow-left"
  | "arrow-up"
  | "arrow-down"
  | "arrow-both";

interface ShapeInfo {
  /** The size a shape takes when its command states none. */
  width: number;
  height: number;
  /** The PowerPoint preset with the same outline. */
  pptx: string;
}

const shapeInfo: Record<ShapeKind, ShapeInfo> = {
  rect: { width: 200, height: 110, pptx: "rect" },
  rounded: { width: 200, height: 110, pptx: "roundRect" },
  pill: { width: 200, height: 76, pptx: "roundRect" },
  ellipse: { width: 200, height: 120, pptx: "ellipse" },
  circle: { width: 140, height: 140, pptx: "ellipse" },
  diamond: { width: 200, height: 140, pptx: "diamond" },
  triangle: { width: 170, height: 140, pptx: "triangle" },
  pentagon: { width: 150, height: 140, pptx: "pentagon" },
  hexagon: { width: 190, height: 120, pptx: "hexagon" },
  octagon: { width: 150, height: 150, pptx: "octagon" },
  parallelogram: { width: 210, height: 110, pptx: "parallelogram" },
  trapezoid: { width: 210, height: 110, pptx: "trapezoid" },
  star: { width: 150, height: 145, pptx: "star5" },
  plus: { width: 120, height: 120, pptx: "plus" },
  cylinder: { width: 160, height: 150, pptx: "can" },
  document: { width: 200, height: 130, pptx: "flowChartDocument" },
  note: { width: 200, height: 140, pptx: "foldedCorner" },
  cube: { width: 170, height: 150, pptx: "cube" },
  cloud: { width: 230, height: 150, pptx: "cloud" },
  callout: { width: 240, height: 120, pptx: "wedgeRoundRectCallout" },
  chevron: { width: 210, height: 90, pptx: "chevron" },
  step: { width: 210, height: 90, pptx: "homePlate" },
  "arrow-right": { width: 210, height: 100, pptx: "rightArrow" },
  "arrow-left": { width: 210, height: 100, pptx: "leftArrow" },
  "arrow-up": { width: 100, height: 170, pptx: "upArrow" },
  "arrow-down": { width: 100, height: 170, pptx: "downArrow" },
  "arrow-both": { width: 240, height: 100, pptx: "leftRightArrow" },
};

/** Every shape kind, in the order a gallery of them reads best. */
export const shapeKinds = Object.keys(shapeInfo) as ShapeKind[];

export function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === "string" && Object.hasOwn(shapeInfo, value);
}

/** An outline shape() draws by its kind, or "polygon", which polygon() draws through its corners. */
export type OutlineKind = ShapeKind | "polygon";

/** A polygon's corners, in pixels from any origin; the outline fills its box. */
export type PolygonPoints = Array<[number, number]>;

/** The box a polygon's corners span. */
function polygonExtent(points: PolygonPoints): { left: number; top: number; width: number; height: number } {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

/**
 * The size a shape of this kind takes when its command states none. A polygon is as large as the
 * corners it was given span.
 */
export function shapeSize(kind: OutlineKind, points?: PolygonPoints): { width: number; height: number } {
  if (kind === "polygon") {
    const extent = points && points.length > 0 ? polygonExtent(points) : { width: 1, height: 1 };
    return { width: Math.max(extent.width, 1), height: Math.max(extent.height, 1) };
  }
  const { width, height } = shapeInfo[kind];
  return { width, height };
}

/**
 * Whether a value is a list of at least three [x, y] corners that span some width and some
 * height, which is what polygon() can draw.
 */
export function polygonProblem(points: unknown): string | undefined {
  if (!Array.isArray(points)) return "polygon() expects its corners as a list of [x, y] pairs, such as [[0, 0], [120, 40], [0, 80]]";
  for (const [index, point] of points.entries()) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every((value) => typeof value === "number" && Number.isFinite(value))) {
      return `polygon() expects every corner as an [x, y] pair of numbers; corner ${index + 1} is ${JSON.stringify(point)}`;
    }
  }
  if (points.length < 3) return `polygon() needs at least three corners, not ${points.length}`;
  const extent = polygonExtent(points as PolygonPoints);
  if (extent.width === 0 || extent.height === 0) return "polygon() needs corners that span some width and some height, not a single line";
  return undefined;
}

/** The PowerPoint preset that draws the same outline. */
export function shapePreset(kind: ShapeKind): string {
  return shapeInfo[kind].pptx;
}

export type Segment =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShapeGeometry {
  /** The outline, filled and stroked. */
  outline: Segment[];
  /** Faces drawn over the outline in a deeper shade of the fill, such as a cube's side. */
  shade?: Segment[];
  /** Strokes drawn over the outline with no fill, such as a cylinder's rim. */
  detail?: Segment[];
  /** Where the label sits, in the same coordinates as the outline. */
  text: TextBox;
}

/** Cubic Bézier control distance for a quarter of a circle. */
const kappa = 0.5522847498;

const round = (value: number): number => Math.round(value * 100) / 100;

class Path {
  readonly segments: Segment[] = [];

  move(x: number, y: number): this {
    this.segments.push({ op: "M", x, y });
    return this;
  }

  line(x: number, y: number): this {
    this.segments.push({ op: "L", x, y });
    return this;
  }

  cubic(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    this.segments.push({ op: "C", x1, y1, x2, y2, x, y });
    return this;
  }

  close(): this {
    this.segments.push({ op: "Z" });
    return this;
  }

  polygon(points: Array<[number, number]>): this {
    points.forEach(([x, y], index) => (index === 0 ? this.move(x, y) : this.line(x, y)));
    return this.close();
  }

  /**
   * A quarter of an ellipse, from one multiple of 90° to the next; angles grow clockwise, as
   * y grows downwards, so 0° is the right-hand point and 90° the bottom one.
   */
  quarter(cx: number, cy: number, rx: number, ry: number, from: number, to: number): this {
    const a = (from * Math.PI) / 180;
    const b = (to * Math.PI) / 180;
    const direction = Math.sign(to - from);
    const start = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
    const end = { x: cx + rx * Math.cos(b), y: cy + ry * Math.sin(b) };
    return this.cubic(
      start.x - direction * kappa * rx * Math.sin(a),
      start.y + direction * kappa * ry * Math.cos(a),
      end.x + direction * kappa * rx * Math.sin(b),
      end.y - direction * kappa * ry * Math.cos(b),
      end.x,
      end.y,
    );
  }

  /** Quarters from one angle to another, with no move to the start. */
  arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): this {
    const step = Math.sign(to - from) * 90;
    for (let angle = from; angle !== to; angle += step) this.quarter(cx, cy, rx, ry, angle, angle + step);
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number): this {
    this.move(cx + rx, cy);
    return this.arc(cx, cy, rx, ry, 0, 360).close();
  }

  roundedRect(x0: number, y0: number, x1: number, y1: number, radius: number): this {
    const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
    if (r === 0) return this.polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    return this.move(x0 + r, y0)
      .line(x1 - r, y0).quarter(x1 - r, y0 + r, r, r, -90, 0)
      .line(x1, y1 - r).quarter(x1 - r, y1 - r, r, r, 0, 90)
      .line(x0 + r, y1).quarter(x0 + r, y1 - r, r, r, 90, 180)
      .line(x0, y0 + r).quarter(x0 + r, y0 + r, r, r, 180, 270)
      .close();
  }
}

/** A cubic piece of a circular arc of up to 90°, with angles in radians. */
function arcPiece(cx: number, cy: number, r: number, a: number, b: number): Segment {
  const k = (4 / 3) * Math.tan((b - a) / 4);
  return {
    op: "C",
    x1: cx + r * (Math.cos(a) - k * Math.sin(a)),
    y1: cy + r * (Math.sin(a) + k * Math.cos(a)),
    x2: cx + r * (Math.cos(b) + k * Math.sin(b)),
    y2: cy + r * (Math.sin(b) - k * Math.cos(b)),
    x: cx + r * Math.cos(b),
    y: cy + r * Math.sin(b),
  };
}

/**
 * A cloud in a unit square: the outer arcs of overlapping circles, from the lower left round
 * clockwise. Computed once, then stretched to each cloud's box.
 */
const unitCloud: Segment[] = (() => {
  const bumps: Array<[number, number, number]> = [
    [0.2, 0.62, 0.17],
    [0.23, 0.37, 0.15],
    [0.41, 0.25, 0.19],
    [0.63, 0.23, 0.2],
    [0.81, 0.39, 0.16],
    [0.82, 0.63, 0.16],
    [0.64, 0.77, 0.15],
    [0.42, 0.78, 0.15],
  ];
  const middle = { x: 0.5, y: 0.5 };
  /** Where two neighbouring circles cross, on the outer side of the cloud. */
  const crossing = ([x1, y1, r1]: number[], [x2, y2, r2]: number[]): { x: number; y: number } => {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
    const px = x1 + (a * (x2 - x1)) / d;
    const py = y1 + (a * (y2 - y1)) / d;
    const candidates = [
      { x: px + (h * (y2 - y1)) / d, y: py - (h * (x2 - x1)) / d },
      { x: px - (h * (y2 - y1)) / d, y: py + (h * (x2 - x1)) / d },
    ];
    const distance = (point: { x: number; y: number }): number => Math.hypot(point.x - middle.x, point.y - middle.y);
    return distance(candidates[0]) >= distance(candidates[1]) ? candidates[0] : candidates[1];
  };
  const segments: Segment[] = [];
  bumps.forEach((bump, index) => {
    const [cx, cy, r] = bump;
    const enter = crossing(bumps[(index + bumps.length - 1) % bumps.length], bump);
    const leave = crossing(bump, bumps[(index + 1) % bumps.length]);
    const from = Math.atan2(enter.y - cy, enter.x - cx);
    let to = Math.atan2(leave.y - cy, leave.x - cx);
    while (to <= from) to += Math.PI * 2;
    if (index === 0) segments.push({ op: "M", x: enter.x, y: enter.y });
    const pieces = Math.ceil((to - from) / (Math.PI / 2));
    for (let piece = 0; piece < pieces; piece += 1) {
      segments.push(arcPiece(cx, cy, r, from + ((to - from) * piece) / pieces, from + ((to - from) * (piece + 1)) / pieces));
    }
  });
  segments.push({ op: "Z" });
  // Stretch the cloud so its outline touches every side of the square.
  const xs: number[] = [];
  const ys: number[] = [];
  bumps.forEach(([cx, cy, r]) => {
    xs.push(cx - r, cx + r);
    ys.push(cy - r, cy + r);
  });
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return mapSegments(segments, (x, y) => [(x - left) / (right - left), (y - top) / (bottom - top)]);
})();

function mapSegments(segments: Segment[], map: (x: number, y: number) => [number, number]): Segment[] {
  return segments.map((segment) => {
    if (segment.op === "Z") return segment;
    const [x, y] = map(segment.x, segment.y);
    if (segment.op !== "C") return { op: segment.op, x, y };
    const [x1, y1] = map(segment.x1, segment.y1);
    const [x2, y2] = map(segment.x2, segment.y2);
    return { op: "C", x1, y1, x2, y2, x, y };
  });
}

/** A five-pointed star in a unit square, its points at the edges. */
const unitStar: Array<[number, number]> = (() => {
  const points: Array<[number, number]> = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = ((-90 + index * 36) * Math.PI) / 180;
    const radius = index % 2 === 0 ? 1 : 0.382;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  const width = Math.cos((18 * Math.PI) / 180) * 2;
  const top = -1;
  const bottom = Math.sin((54 * Math.PI) / 180);
  return points.map(([x, y]) => [(x + width / 2) / width, (y - top) / (bottom - top)]);
})();

export interface ShapeOptions {
  /** The outline's width, which is kept inside the box. */
  strokeWidth?: number;
  /** Corner radius of a rect or rounded rect. */
  radius?: number;
  /** A polygon's corners, stretched so that they span the box. */
  points?: PolygonPoints;
}

/**
 * The outline of a shape filling a box of the given size, with its label's room. Proportions
 * follow PowerPoint's preset shapes, so an exported shape keeps its look.
 */
export function shapeGeometry(kind: OutlineKind, width: number, height: number, options: ShapeOptions = {}): ShapeGeometry {
  const inset = Math.max(options.strokeWidth ?? 0, 0) / 2;
  const x0 = inset;
  const y0 = inset;
  const x1 = Math.max(width - inset, x0 + 1);
  const y1 = Math.max(height - inset, y0 + 1);
  const w = x1 - x0;
  const h = y1 - y0;
  const ss = Math.min(w, h);
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  const path = new Path();
  let shade: Segment[] | undefined;
  let detail: Segment[] | undefined;
  /** The label's room as fractions of the box: left, top, right, bottom. */
  let room: [number, number, number, number] = [0, 0, 1, 1];
  const across = (distance: number): number => distance / w;
  const down = (distance: number): number => distance / h;

  switch (kind) {
    case "rect":
      path.roundedRect(x0, y0, x1, y1, options.radius ?? 0);
      break;
    case "rounded":
      path.roundedRect(x0, y0, x1, y1, options.radius ?? ss * 0.16667);
      break;
    case "pill":
      path.roundedRect(x0, y0, x1, y1, ss / 2);
      room = [across(ss * 0.2), 0, 1 - across(ss * 0.2), 1];
      break;
    case "ellipse":
    case "circle":
      path.ellipse(cx, cy, w / 2, h / 2);
      room = [0.146, 0.146, 0.854, 0.854];
      break;
    case "diamond":
      path.polygon([[cx, y0], [x1, cy], [cx, y1], [x0, cy]]);
      room = [0.25, 0.25, 0.75, 0.75];
      break;
    case "triangle":
      path.polygon([[cx, y0], [x1, y1], [x0, y1]]);
      room = [0.25, 0.48, 0.75, 1];
      break;
    case "pentagon":
      path.polygon([
        [cx, y0],
        [x1, y0 + h * 0.382],
        [x0 + w * 0.809, y1],
        [x0 + w * 0.191, y1],
        [x0, y0 + h * 0.382],
      ]);
      room = [0.19, 0.32, 0.81, 1];
      break;
    case "hexagon": {
      const off = Math.min(ss * 0.25, w / 2);
      path.polygon([[x0, cy], [x0 + off, y0], [x1 - off, y0], [x1, cy], [x1 - off, y1], [x0 + off, y1]]);
      room = [across(off * 0.6), 0.08, 1 - across(off * 0.6), 0.92];
      break;
    }
    case "octagon": {
      const cut = ss * 0.29289;
      path.polygon([
        [x0 + cut, y0], [x1 - cut, y0], [x1, y0 + cut], [x1, y1 - cut],
        [x1 - cut, y1], [x0 + cut, y1], [x0, y1 - cut], [x0, y0 + cut],
      ]);
      room = [across(cut * 0.45), down(cut * 0.45), 1 - across(cut * 0.45), 1 - down(cut * 0.45)];
      break;
    }
    case "parallelogram": {
      const off = Math.min(ss * 0.25, w / 2);
      path.polygon([[x0 + off, y0], [x1, y0], [x1 - off, y1], [x0, y1]]);
      room = [across(off * 0.8), 0, 1 - across(off * 0.8), 1];
      break;
    }
    case "trapezoid": {
      const off = Math.min(ss * 0.25, w / 2);
      path.polygon([[x0 + off, y0], [x1 - off, y0], [x1, y1], [x0, y1]]);
      room = [across(off * 0.7), 0, 1 - across(off * 0.7), 1];
      break;
    }
    case "star":
      path.polygon(unitStar.map(([x, y]) => [x0 + x * w, y0 + y * h]));
      room = [0.31, 0.38, 0.69, 0.76];
      break;
    case "plus": {
      const arm = ss * 0.25;
      path.polygon([
        [x0 + arm, y0], [x1 - arm, y0], [x1 - arm, y0 + arm], [x1, y0 + arm],
        [x1, y1 - arm], [x1 - arm, y1 - arm], [x1 - arm, y1], [x0 + arm, y1],
        [x0 + arm, y1 - arm], [x0, y1 - arm], [x0, y0 + arm], [x0 + arm, y0 + arm],
      ]);
      room = [across(arm), down(arm), 1 - across(arm), 1 - down(arm)];
      break;
    }
    case "cylinder": {
      const ry = Math.min(ss * 0.125, h / 4);
      path.move(x0, y0 + ry)
        .arc(cx, y0 + ry, w / 2, ry, 180, 360)
        .line(x1, y1 - ry)
        .arc(cx, y1 - ry, w / 2, ry, 0, 180)
        .close();
      shade = new Path().ellipse(cx, y0 + ry, w / 2, ry).segments;
      room = [0, down(ry * 2), 1, 1 - down(ry)];
      break;
    }
    case "document": {
      const edge = y0 + h * 0.80194;
      path.move(x0, y0).line(x1, y0).line(x1, edge)
        .cubic(x0 + w * 0.5, edge, x0 + w * 0.5, y0 + h * 1.1075, x0, y0 + h * 0.93389)
        .close();
      room = [0, 0, 1, 0.8];
      break;
    }
    case "note": {
      const fold = ss * 0.16667;
      path.polygon([[x0, y0], [x1, y0], [x1, y1 - fold], [x1 - fold, y1], [x0, y1]]);
      shade = new Path().polygon([[x1, y1 - fold], [x1 - fold * 0.8, y1 - fold * 0.8], [x1 - fold, y1]]).segments;
      room = [0, 0, 1, 1 - down(fold * 0.6)];
      break;
    }
    case "cube": {
      const depth = ss * 0.25;
      path.polygon([[x0, y0 + depth], [x0 + depth, y0], [x1, y0], [x1, y1 - depth], [x1 - depth, y1], [x0, y1]]);
      shade = new Path().polygon([[x1 - depth, y0 + depth], [x1, y0], [x1, y1 - depth], [x1 - depth, y1]]).segments;
      detail = new Path().move(x0, y0 + depth).line(x1 - depth, y0 + depth).line(x1, y0)
        .move(x1 - depth, y0 + depth).line(x1 - depth, y1).segments;
      room = [0, down(depth), 1 - across(depth), 1];
      break;
    }
    case "cloud":
      path.segments.push(...mapSegments(unitCloud, (x, y) => [x0 + x * w, y0 + y * h]));
      room = [0.16, 0.24, 0.84, 0.82];
      break;
    case "callout": {
      const r = ss * 0.16667;
      const tip: [number, number] = [x0 + w * 0.29167, y0 + h * 1.125];
      path.move(x0 + r, y0)
        .line(x1 - r, y0).quarter(x1 - r, y0 + r, r, r, -90, 0)
        .line(x1, y1 - r).quarter(x1 - r, y1 - r, r, r, 0, 90)
        .line(x0 + w * 0.3333, y1).line(...tip).line(x0 + w * 0.1667, y1)
        .line(x0 + r, y1).quarter(x0 + r, y1 - r, r, r, 90, 180)
        .line(x0, y0 + r).quarter(x0 + r, y0 + r, r, r, 180, 270)
        .close();
      break;
    }
    case "chevron": {
      const point = Math.min(ss * 0.5, w / 2);
      path.polygon([[x0, y0], [x1 - point, y0], [x1, cy], [x1 - point, y1], [x0, y1], [x0 + point, cy]]);
      room = [across(point), 0, 1 - across(point * 0.6), 1];
      break;
    }
    case "step": {
      const point = Math.min(ss * 0.5, w);
      path.polygon([[x0, y0], [x1 - point, y0], [x1, cy], [x1 - point, y1], [x0, y1]]);
      room = [0, 0, 1 - across(point * 0.6), 1];
      break;
    }
    case "arrow-right":
    case "arrow-left":
    case "arrow-up":
    case "arrow-down":
    case "arrow-both": {
      const vertical = kind === "arrow-up" || kind === "arrow-down";
      // Laid out pointing right along the long axis, then turned to face the way asked.
      const length = vertical ? h : w;
      const breadth = vertical ? w : h;
      const head = Math.min(ss * 0.5, kind === "arrow-both" ? length / 2 : length);
      const shaft = breadth * 0.25;
      const mid = breadth / 2;
      const right: Array<[number, number]> = kind === "arrow-both"
        ? [[0, mid], [head, 0], [head, mid - shaft], [length - head, mid - shaft], [length - head, 0], [length, mid],
          [length - head, breadth], [length - head, mid + shaft], [head, mid + shaft], [head, breadth]]
        : [[0, mid - shaft], [length - head, mid - shaft], [length - head, 0], [length, mid],
          [length - head, breadth], [length - head, mid + shaft], [0, mid + shaft]];
      const turn = ([u, v]: [number, number]): [number, number] => {
        if (kind === "arrow-left") return [x1 - u, y0 + v];
        if (kind === "arrow-down") return [x0 + v, y0 + u];
        if (kind === "arrow-up") return [x0 + v, y1 - u];
        return [x0 + u, y0 + v];
      };
      path.polygon(right.map(turn));
      const start = kind === "arrow-both" ? head * 0.6 : 0;
      const end = length - head * 0.6;
      room = vertical
        ? [0.25, (kind === "arrow-up" ? length - end : start) / length, 0.75, (kind === "arrow-up" ? length - start : end) / length]
        : [(kind === "arrow-left" ? length - end : start) / length, 0.25, (kind === "arrow-left" ? length - start : end) / length, 0.75];
      break;
    }
    case "polygon": {
      // The corners keep their proportions to one another and stretch to fill the box.
      const points = options.points ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
      const extent = polygonExtent(points);
      path.polygon(points.map(([x, y]) => [
        x0 + (extent.width > 0 ? ((x - extent.left) / extent.width) * w : 0),
        y0 + (extent.height > 0 ? ((y - extent.top) / extent.height) * h : 0),
      ]));
      break;
    }
  }

  const [left, top, right, bottom] = room;
  return {
    outline: path.segments,
    shade,
    detail,
    text: {
      x: x0 + w * left,
      y: y0 + h * top,
      width: w * (right - left),
      height: h * (bottom - top),
    },
  };
}

/** SVG path data for segments. */
export function svgPath(segments: Segment[]): string {
  return segments.map((segment) => {
    switch (segment.op) {
      case "Z":
        return "Z";
      case "C":
        return `C ${round(segment.x1)} ${round(segment.y1)} ${round(segment.x2)} ${round(segment.y2)} ${round(segment.x)} ${round(segment.y)}`;
      default:
        return `${segment.op} ${round(segment.x)} ${round(segment.y)}`;
    }
  }).join(" ");
}

/** The corners of an outline made of straight edges alone, or undefined when it curves. */
export function polygonCorners(segments: Segment[]): Array<[number, number]> | undefined {
  const corners: Array<[number, number]> = [];
  for (const [index, segment] of segments.entries()) {
    if (segment.op === "C" || (segment.op === "M" && index > 0)) return undefined;
    if (segment.op !== "Z") corners.push([segment.x, segment.y]);
  }
  return corners;
}

// ── Colour ─────────────────────────────────────────────────────────────────────────────────

/** Named colours for tone(). "accent" follows the theme. */
export type ToneName =
  | "accent"
  | "blue"
  | "sky"
  | "teal"
  | "green"
  | "lime"
  | "amber"
  | "orange"
  | "red"
  | "pink"
  | "purple"
  | "indigo"
  | "gray";

/** How a tone paints a shape: a tinted fill, a full-strength fill, or an outline. */
export type ToneStyle = "soft" | "solid" | "outline";

export const toneNames: readonly ToneName[] = [
  "accent", "blue", "sky", "teal", "green", "lime", "amber", "orange", "red", "pink", "purple", "indigo", "gray",
];

export const toneHues: Record<Exclude<ToneName, "accent">, string> = {
  blue: "#2563eb",
  sky: "#0284c7",
  teal: "#0d9488",
  green: "#16a34a",
  lime: "#65a30d",
  amber: "#d97706",
  orange: "#ea580c",
  red: "#dc2626",
  pink: "#db2777",
  purple: "#9333ea",
  indigo: "#4f46e5",
  gray: "#64748b",
};

type Rgb = [number, number, number];

function parseColor(value: string): Rgb | undefined {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16)) as Rgb;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return undefined;
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0")).join("")}`;
}

/** `amount` of the first colour over the second, as paint mixes. */
function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((index) => a[index] * amount + b[index] * (1 - amount)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The colours a shape is painted with once its tone has met the theme. */
export interface ShapePaint {
  fill: string;
  stroke: string;
  /** The label. */
  text: string;
  /** Faces drawn in a deeper shade, such as a cube's side or a cylinder's top. */
  shade: string;
}

export interface ToneSpec {
  color: string;
  style: ToneStyle;
}

/**
 * Paint for a tone against a theme: soft is a tint of the colour with a darker label, solid
 * fills with the colour itself, and outline draws the colour around the slide's background.
 * A dark theme gets lighter tints and labels, so the same document reads on either.
 */
export function tonePaint(colors: Pick<ThemeColors, "background" | "foreground" | "accent">, tone: ToneSpec): ShapePaint {
  const named = tone.color === "accent" ? colors.accent : toneHues[tone.color as Exclude<ToneName, "accent">];
  const source = named ?? tone.color;
  const base = parseColor(source);
  const background = parseColor(colors.background) ?? [255, 255, 255];
  const dark = luminance(background) < 0.35;
  const foreground = parseColor(colors.foreground) ?? (dark ? [248, 250, 252] : [17, 24, 39]);
  if (!base) {
    // A colour this module cannot read, such as a CSS variable, is used as it is.
    const surface = hex(background);
    return tone.style === "solid"
      ? { fill: source, stroke: source, text: hex(dark ? foreground : [255, 255, 255]), shade: source }
      : { fill: surface, stroke: source, text: hex(foreground), shade: surface };
  }
  const color = dark ? mix([255, 255, 255], base, 0.18) : base;
  const label = hex(mix(color, foreground, dark ? 0.3 : 0.42));
  switch (tone.style) {
    case "solid": {
      const onColor = luminance(color) > 0.45 ? [17, 24, 39] as Rgb : [255, 255, 255] as Rgb;
      return { fill: hex(color), stroke: hex(color), text: hex(onColor), shade: hex(mix([0, 0, 0], color, 0.2)) };
    }
    case "outline":
      return { fill: hex(background), stroke: hex(color), text: label, shade: hex(mix(color, background, dark ? 0.22 : 0.12)) };
    default:
      return {
        fill: hex(mix(color, background, dark ? 0.2 : 0.12)),
        stroke: hex(mix(color, background, dark ? 0.7 : 0.6)),
        text: label,
        shade: hex(mix(color, background, dark ? 0.34 : 0.26)),
      };
  }
}

/** Walk every slide and give each shape the paint its tone has against the theme. */
export function resolveShapePaint(root: FrameSeqNode): void {
  const theme = root.props.theme as { colors?: ThemeColors } | undefined;
  const colors = theme?.colors ?? { background: "#ffffff", foreground: "#111827", accent: "#2563eb" };
  const visit = (node: FrameSeqNode): void => {
    const tone = node.props.tone as ToneSpec | undefined;
    if (tone || node.type === "shape") {
      node.props.paint = tonePaint(colors, tone ?? { color: "accent", style: "soft" });
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  for (const page of Object.values((root.props.masters ?? {}) as Record<string, FrameSeqNode>)) visit(page);
}

// ── Connectors ─────────────────────────────────────────────────────────────────────────────

/** How a connector travels between its ends. */
export type LineRoute = "straight" | "elbow" | "curve";

interface Point {
  x: number;
  y: number;
}

export interface RouteBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RouteEnd {
  point: Point;
  /** The side of the object the connector leaves or enters by, when it is anchored. */
  side?: AnchorSide;
  /** The object the end is anchored to, which an elbow route keeps clear of. */
  box?: RouteBox;
}

/** The way out of an object through one of its sides. */
function outward(side: AnchorSide | undefined): Point | undefined {
  switch (side) {
    case "left": return { x: -1, y: 0 };
    case "right": return { x: 1, y: 0 };
    case "top": return { x: 0, y: -1 };
    case "bottom": return { x: 0, y: 1 };
    default: return undefined;
  }
}

/** For an end with no side, the axis that leads most directly towards the other end. */
function towards(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 };
  return { x: 0, y: Math.sign(dy) || 1 };
}

function simplify(points: Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.01 && Math.abs(last.y - point.y) < 0.01) continue;
    const before = kept[kept.length - 2];
    if (before && last && ((Math.abs(before.x - last.x) < 0.01 && Math.abs(last.x - point.x) < 0.01)
      || (Math.abs(before.y - last.y) < 0.01 && Math.abs(last.y - point.y) < 0.01))) {
      kept[kept.length - 1] = point;
      continue;
    }
    kept.push(point);
  }
  return kept;
}

/**
 * Whether a horizontal or vertical segment passes through the inside of a box, shrunk by the
 * margin; a negative margin asks whether it comes that close.
 */
function crosses(a: Point, b: Point, box: RouteBox | undefined, margin = 1): boolean {
  if (!box) return false;
  const left = box.x + margin;
  const right = box.x + box.width - margin;
  const top = box.y + margin;
  const bottom = box.y + box.height - margin;
  if (Math.abs(a.y - b.y) < 0.01) {
    return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
  }
  return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
}

/**
 * A right-angled route between two ends: out of the start's side, into the end's side, with as
 * few bends as keep it clear of its own objects and of the others on the canvas. Each candidate
 * runs along a lane, halfway between the ends or just past the edge of some object, and the
 * shortest that crosses nothing wins. Returns the corners, ends included.
 */
function elbowRoute(start: RouteEnd, end: RouteEnd, obstacles: RouteBox[]): Point[] {
  const out = outward(start.side) ?? towards(start.point, end.point);
  const into = outward(end.side) ?? towards(end.point, start.point);
  const clearance = 24;
  // Lanes run far enough from an object that a label centred on the line still clears it.
  const berth = 36;
  const s = start.point;
  const e = end.point;
  const own = [start.box, end.box].filter((box): box is RouteBox => Boolean(box));
  const others = obstacles.filter((box) => !own.some((mine) => (
    Math.abs(mine.x - box.x) < 0.5 && Math.abs(mine.y - box.y) < 0.5
    && Math.abs(mine.width - box.width) < 0.5 && Math.abs(mine.height - box.height) < 0.5
  )));
  // Ends that face each other almost level would only jog by a few pixels: run straight across
  // at the start's level instead, provided that still meets the far object's side.
  const facing = out.x * into.x + out.y * into.y < -0.99
    && (e.x - s.x) * out.x + (e.y - s.y) * out.y > clearance;
  if (facing) {
    const across = out.x !== 0 ? "y" : "x";
    const level = { ...e, [across]: s[across] };
    const room = end.box
      ? (across === "y"
        ? level.y >= end.box.y + 6 && level.y <= end.box.y + end.box.height - 6
        : level.x >= end.box.x + 6 && level.x <= end.box.x + end.box.width - 6)
      : true;
    if (Math.abs(e[across] - s[across]) <= 12 && room
      && !others.some((box) => crosses(s, level, box))) {
      return [s, level];
    }
  }
  const lanesX = new Set<number>([(s.x + e.x) / 2]);
  const lanesY = new Set<number>([(s.y + e.y) / 2]);
  for (const box of [...own, ...others]) {
    lanesX.add(box.x - berth).add(box.x + box.width + berth);
    lanesY.add(box.y - berth).add(box.y + box.height + berth);
  }

  let best: { points: Point[]; score: number } | undefined;
  // Leave a short straight stub at each end where there is room; close objects need none.
  for (const stub of [clearance, 0]) {
    const p = { x: s.x + out.x * stub, y: s.y + out.y * stub };
    const q = { x: e.x + into.x * stub, y: e.y + into.y * stub };
    const candidates: Point[][] = [[{ x: q.x, y: p.y }], [{ x: p.x, y: q.y }]];
    for (const x of lanesX) candidates.push([{ x, y: p.y }, { x, y: q.y }]);
    for (const y of lanesY) candidates.push([{ x: p.x, y }, { x: q.x, y }]);

    for (const bends of candidates) {
      const points = simplify([s, p, ...bends, q, e]);
      let score = points.length * 30;
      for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1];
        const b = points[index];
        score += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (own.some((box) => crosses(a, b, box))) score += 100_000;
        score += others.filter((box) => crosses(a, b, box)).length * 20_000;
        // Grazing an object reads as touching it, so a little more length buys some room.
        score += others.filter((box) => crosses(a, b, box, -(berth - 4))).length * 120;
        const before = points[index - 2];
        if (before && (b.x - a.x) * (a.x - before.x) + (b.y - a.y) * (a.y - before.y) < -0.01) score += 10_000;
      }
      // The first leg must leave the way the start faces, and the last arrive square to the side
      // the end faces, rather than running along it.
      const first = points[1];
      const last = points[points.length - 2];
      if (first && (first.x - s.x) * out.x + (first.y - s.y) * out.y <= 0.01) score += 10_000;
      if (last && (last.x - e.x) * into.x + (last.y - e.y) * into.y <= 0.01) score += 10_000;
      if (!best || score < best.score) best = { points, score };
    }
  }
  return best?.points ?? [s, e];
}

/** The two control points of a curve that leaves and arrives square to its objects. */
function curveRoute(start: RouteEnd, end: RouteEnd): Point[] {
  const s = start.point;
  const e = end.point;
  const out = outward(start.side) ?? towards(s, e);
  const into = outward(end.side) ?? towards(e, s);
  const reach = Math.min(Math.max(Math.hypot(e.x - s.x, e.y - s.y) * 0.45, 40), 240);
  return [
    s,
    { x: s.x + out.x * reach, y: s.y + out.y * reach },
    { x: e.x + into.x * reach, y: e.y + into.y * reach },
    e,
  ];
}

/**
 * The points a connector is drawn through: the corners of an elbow, or a curve's ends with its
 * two control points between them. An elbow keeps clear of the obstacles where it can.
 * Coordinates are rounded to hundredths.
 */
export function routeConnector(
  route: LineRoute,
  start: RouteEnd,
  end: RouteEnd,
  obstacles: RouteBox[] = [],
): Array<[number, number]> {
  const points = route === "elbow"
    ? elbowRoute(start, end, obstacles)
    : route === "curve"
      ? curveRoute(start, end)
      : [start.point, end.point];
  return points.map((point) => [round(point.x), round(point.y)]);
}

/** SVG path data for a connector through its route's points. */
export function connectorPath(route: LineRoute, points: Array<[number, number]>): string {
  if (route === "curve" && points.length === 4) {
    const [s, c1, c2, e] = points;
    return `M ${s[0]} ${s[1]} C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${e[0]} ${e[1]}`;
  }
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

/** Halfway along a connector, where its label sits. */
export function connectorMidpoint(route: LineRoute, points: Array<[number, number]>): { x: number; y: number } {
  if (route === "curve" && points.length === 4) {
    const [s, c1, c2, e] = points;
    return {
      x: round((s[0] + 3 * c1[0] + 3 * c2[0] + e[0]) / 8),
      y: round((s[1] + 3 * c1[1] + 3 * c2[1] + e[1]) / 8),
    };
  }
  const lengths = points.slice(1).map(([x, y], index) => Math.hypot(x - points[index][0], y - points[index][1]));
  // An elbow's label belongs on a leg, not on a corner: the middle of its longest leg.
  if (route === "elbow" && lengths.length > 1) {
    const longest = lengths.indexOf(Math.max(...lengths));
    const [ax, ay] = points[longest];
    const [bx, by] = points[longest + 1];
    return { x: round((ax + bx) / 2), y: round((ay + by) / 2) };
  }
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    if (remaining <= length && length > 0) {
      const [ax, ay] = points[index];
      const [bx, by] = points[index + 1];
      return { x: round(ax + ((bx - ax) * remaining) / length), y: round(ay + ((by - ay) * remaining) / length) };
    }
    remaining -= length;
  }
  const [x, y] = points[points.length - 1] ?? [0, 0];
  return { x, y };
}

/** The direction a connector arrives in at its end, for drawing an arrowhead by hand. */
export function connectorHeading(points: Array<[number, number]>, at: "start" | "end"): { x: number; y: number } {
  const ordered = at === "end" ? points : [...points].reverse();
  const tip = ordered[ordered.length - 1];
  for (let index = ordered.length - 2; index >= 0; index -= 1) {
    const [x, y] = ordered[index];
    const length = Math.hypot(tip[0] - x, tip[1] - y);
    if (length > 0.01) return { x: (tip[0] - x) / length, y: (tip[1] - y) / length };
  }
  return { x: 1, y: 0 };
}
