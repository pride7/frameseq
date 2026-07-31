import type {
  AnchorReference,
  AnchorSide,
  FrameSeqNode,
  PlacementStep,
} from "./core";

interface Point {
  x: number;
  y: number;
}

interface Box extends Point {
  width: number;
  height: number;
}

/** A box expressed in the coordinates of the frame it can be traced back to. */
interface ResolvedBox extends Point {
  root: FrameSeqNode;
  width?: number;
  height?: number;
}

interface FrameOrigin extends Point {
  root: FrameSeqNode;
}

/** A finished placement: CSS left/top plus the fraction of its own size to shift by. */
interface Placement {
  left: number;
  top: number;
  tx: number;
  ty: number;
}

const shapeSizes: Partial<Record<FrameSeqNode["type"], { width: number; height?: number }>> = {
  rect: { width: 240, height: 96 },
  circle: { width: 160 },
};

class AnchorError extends Error {}

function classList(node: FrameSeqNode): string[] {
  const className = node.props.className;
  return typeof className === "string" ? className.split(/\s+/).filter(Boolean) : [];
}

function cssNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function shift(fraction: number): string {
  return fraction === 0 ? "0" : `${round(fraction * 100)}%`;
}

/** Containers with a coordinate system of their own: canvas regions and positioned objects. */
function establishesFrame(node: FrameSeqNode): boolean {
  const position = node.styles.position;
  if (position && position !== "static") return true;
  return classList(node).includes("frameseq-layout-canvas");
}

function sizeOf(node: FrameSeqNode): { width?: number; height?: number } {
  const defaults = shapeSizes[node.type];
  const width = cssNumber(node.styles.width) ?? defaults?.width;
  const declaredHeight = cssNumber(node.styles.height) ?? cssNumber(node.styles.minHeight);
  const height = declaredHeight
    ?? (node.type === "circle" ? width : defaults?.height);
  return { width, height };
}

function center(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function anchorPoint(box: Box, side: AnchorSide): Point {
  const x = side.endsWith("left")
    ? box.x
    : side.endsWith("right")
      ? box.x + box.width
      : box.x + box.width / 2;
  const y = side.startsWith("top")
    ? box.y
    : side.startsWith("bottom")
      ? box.y + box.height
      : box.y + box.height / 2;
  return { x, y };
}

/** Pick the edge that faces the other end of the connector. */
function facingSide(box: Box, towards: Point): AnchorSide {
  const middle = center(box);
  const dx = towards.x - middle.x;
  const dy = towards.y - middle.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function slideLabel(slide: FrameSeqNode, index: number): string {
  const name = slide.props.name ?? slide.props.title;
  return typeof name === "string" && name
    ? `Slide ${index + 1} ("${name}")`
    : `Slide ${index + 1}`;
}

function resolveSlide(slide: FrameSeqNode, label: string, problems: string[]): void {
  const frames = new Map<FrameSeqNode, FrameSeqNode>();
  const named = new Map<string, FrameSeqNode>();
  const placed: FrameSeqNode[] = [];
  const connectors: FrameSeqNode[] = [];

  const collect = (parent: FrameSeqNode, frame: FrameSeqNode): void => {
    for (const child of parent.children) {
      frames.set(child, frame);
      const name = child.props.name;
      if (typeof name === "string") {
        if (named.has(name)) {
          problems.push(
            `${label}: two objects are named "${name}"; names must be unique within a slide`,
          );
        } else {
          named.set(name, child);
        }
      }
      if (Array.isArray(child.props.place)) placed.push(child);
      if (child.type === "line" && (child.props.from || child.props.to)) connectors.push(child);
      collect(child, establishesFrame(child) ? child : frame);
    }
  };
  collect(slide, slide);

  if (placed.length === 0 && connectors.length === 0) return;

  const origins = new Map<FrameSeqNode, FrameOrigin>();
  const boxes = new Map<FrameSeqNode, ResolvedBox>();
  const placements = new Map<FrameSeqNode, Placement>();
  const resolving = new Set<FrameSeqNode>();

  const describe = (node: FrameSeqNode): string =>
    typeof node.props.name === "string" ? `"${node.props.name}"` : `a ${node.type}`;

  const knownNames = (): string => {
    const names = [...named.keys()];
    return names.length === 0
      ? "; this slide has no named objects yet"
      : `; named objects on this slide: ${names.join(", ")}`;
  };

  const frameOrigin = (frame: FrameSeqNode): FrameOrigin => {
    if (frame === slide) return { root: slide, x: 0, y: 0 };
    const cached = origins.get(frame);
    if (cached) return cached;

    // A frame laid out by the document flow has no build-time coordinates of its own,
    // so it becomes the root of its own coordinate space.
    const opaque: FrameOrigin = { root: frame, x: 0, y: 0 };
    origins.set(frame, opaque);
    if (frame.styles.position !== "absolute") return opaque;

    let origin: FrameOrigin;
    try {
      const box = boxOf(frame);
      origin = { root: box.root, x: box.x, y: box.y };
    } catch (error) {
      if (!(error instanceof AnchorError)) throw error;
      return opaque;
    }
    origins.set(frame, origin);
    return origin;
  };

  const targetBox = (
    node: FrameSeqNode,
    frame: FrameOrigin,
    target: string,
    usage: string,
  ): Box => {
    const found = named.get(target);
    if (!found) {
      throw new AnchorError(
        `${describe(node)} uses ${usage} but no object is named "${target}"${knownNames()}`,
      );
    }
    const box = boxOf(found);
    if (box.root !== frame.root) {
      throw new AnchorError(
        `${describe(node)} uses ${usage} across a container without fixed coordinates; `
        + `place both objects on the same canvas()`,
      );
    }
    if (box.width === undefined || box.height === undefined) {
      const missing = box.width === undefined ? "width" : "height";
      throw new AnchorError(
        `${describe(node)} uses ${usage} but the ${missing} of "${target}" is unknown; `
        + `add .${missing}(...) to "${target}"`,
      );
    }
    return { x: box.x - frame.x, y: box.y - frame.y, width: box.width, height: box.height };
  };

  const placementOf = (node: FrameSeqNode): Placement => {
    const cached = placements.get(node);
    if (cached) return cached;
    if (resolving.has(node)) {
      throw new AnchorError(`${describe(node)} takes part in a circular placement`);
    }
    resolving.add(node);
    try {
      const steps = node.props.place as PlacementStep[];
      const frame = frameOrigin(frames.get(node) ?? slide);
      let left = cssNumber(node.styles.left);
      let top = cssNumber(node.styles.top);
      let tx = 0;
      let ty = 0;

      for (const step of steps) {
        const usage = `.${step.relation}("${step.target}")`;
        const target = targetBox(node, frame, step.target, usage);
        switch (step.relation) {
          case "rightOf":
            left = target.x + target.width + step.gap;
            tx = 0;
            top = target.y + target.height / 2;
            ty = -0.5;
            break;
          case "leftOf":
            left = target.x - step.gap;
            tx = -1;
            top = target.y + target.height / 2;
            ty = -0.5;
            break;
          case "below":
            top = target.y + target.height + step.gap;
            ty = 0;
            left = target.x + target.width / 2;
            tx = -0.5;
            break;
          case "above":
            top = target.y - step.gap;
            ty = -1;
            left = target.x + target.width / 2;
            tx = -0.5;
            break;
          case "centerOn":
            left = target.x + target.width / 2;
            tx = -0.5;
            top = target.y + target.height / 2;
            ty = -0.5;
            break;
          case "alignTop":
            top = target.y;
            ty = 0;
            break;
          case "alignLeft":
            left = target.x;
            tx = 0;
            break;
        }
      }

      if (left === undefined || top === undefined) {
        const axis = left === undefined ? "horizontal" : "vertical";
        throw new AnchorError(
          `${describe(node)} has no ${axis} placement; alignTop() and alignLeft() set one axis, `
          + `so add .position({ x, y }) or another placement`,
        );
      }

      const placement: Placement = { left, top, tx, ty };
      placements.set(node, placement);
      return placement;
    } finally {
      resolving.delete(node);
    }
  };

  function boxOf(node: FrameSeqNode): ResolvedBox {
    const cached = boxes.get(node);
    if (cached) return cached;

    const frame = frameOrigin(frames.get(node) ?? slide);
    const { width, height } = sizeOf(node);
    let x: number;
    let y: number;

    if (Array.isArray(node.props.place)) {
      const placement = placementOf(node);
      if (placement.tx !== 0 && width === undefined) {
        throw new AnchorError(
          `the width of ${describe(node)} is unknown; add .width(...) so other objects can use it`,
        );
      }
      if (placement.ty !== 0 && height === undefined) {
        throw new AnchorError(
          `the height of ${describe(node)} is unknown; add .height(...) so other objects can use it`,
        );
      }
      x = placement.left + placement.tx * (width ?? 0);
      y = placement.top + placement.ty * (height ?? 0);
    } else {
      const left = cssNumber(node.styles.left);
      const top = cssNumber(node.styles.top);
      if (left === undefined || top === undefined) {
        throw new AnchorError(
          `${describe(node)} has no canvas coordinates; give it .position({ x, y }) `
          + `or a placement such as .rightOf(...)`,
        );
      }
      x = left;
      y = top;
    }

    const box: ResolvedBox = { root: frame.root, x: frame.x + x, y: frame.y + y, width, height };
    boxes.set(node, box);
    return box;
  }

  for (const node of placed) {
    try {
      const placement = placementOf(node);
      node.styles.position = "absolute";
      node.styles.left = `${round(placement.left)}px`;
      node.styles.top = `${round(placement.top)}px`;
      if (placement.tx === 0 && placement.ty === 0) delete node.styles.translate;
      else node.styles.translate = `${shift(placement.tx)} ${shift(placement.ty)}`;
    } catch (error) {
      if (!(error instanceof AnchorError)) throw error;
      problems.push(`${label}: ${error.message}`);
    }
  }

  for (const line of connectors) {
    try {
      const frame = frameOrigin(frames.get(line) ?? slide);
      const start = line.props.from as AnchorReference | undefined;
      const end = line.props.to as AnchorReference | undefined;
      const startBox = start
        ? targetBox(line, frame, start.target, `.from("${start.target}")`)
        : undefined;
      const endBox = end
        ? targetBox(line, frame, end.target, `.to("${end.target}")`)
        : undefined;

      const fixedStart = { x: Number(line.props.x1) || 0, y: Number(line.props.y1) || 0 };
      const fixedEnd = { x: Number(line.props.x2) || 0, y: Number(line.props.y2) || 0 };
      const startPoint = startBox
        ? anchorPoint(startBox, start?.side ?? facingSide(startBox, endBox ? center(endBox) : fixedEnd))
        : fixedStart;
      const endPoint = endBox
        ? anchorPoint(endBox, end?.side ?? facingSide(endBox, startBox ? center(startBox) : fixedStart))
        : fixedEnd;

      line.props.x1 = round(startPoint.x + (start?.dx ?? 0));
      line.props.y1 = round(startPoint.y + (start?.dy ?? 0));
      line.props.x2 = round(endPoint.x + (end?.dx ?? 0));
      line.props.y2 = round(endPoint.y + (end?.dy ?? 0));
    } catch (error) {
      if (!(error instanceof AnchorError)) throw error;
      problems.push(`${label}: ${error.message}`);
    }
  }
}

/**
 * Turn every named reference in the document into finished geometry: relative placements
 * become absolute coordinates and anchored connectors become plain line endpoints.
 * Running it twice on the same document produces the same result.
 */
export function resolveAnchors(root: FrameSeqNode): void {
  const problems: string[] = [];
  for (const [index, slide] of root.children.entries()) {
    resolveSlide(slide, slideLabel(slide, index), problems);
  }
  if (problems.length > 0) {
    throw new Error(`FrameSeq could not resolve every anchor:\n- ${problems.join("\n- ")}`);
  }
}
