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

/** Classes whose padding comes from a theme token, so it is unknown before rendering. */
const themePadded = ["frameseq-card", "frameseq-region-card", "frameseq-grid-cell"];

interface FlowBox {
  padding: { top: number; left: number };
  inner: { width?: number; height?: number };
}

function paddingOf(node: FrameSeqNode, describe: () => string): FlowBox["padding"] {
  const shorthand = node.styles.padding;
  if (shorthand === undefined) {
    if (classList(node).some((name) => themePadded.includes(name))) {
      throw new AnchorError(
        `the padding of ${describe()} comes from the theme; call .padding(...) so its `
        + "contents can be resolved, or position them individually",
      );
    }
    return { top: 0, left: 0 };
  }

  const parts = shorthand.trim().split(/\s+/).map((part) => cssNumber(part));
  if (parts.some((part) => part === undefined)) {
    throw new AnchorError(`the padding of ${describe()} is not a pixel value`);
  }
  const [first, second = first] = parts as number[];
  return { top: first, left: second };
}

function sizeOf(node: FrameSeqNode): { width?: number; height?: number } {
  const defaults = shapeSizes[node.type];
  const width = cssNumber(node.styles.width) ?? defaults?.width;
  // A shape's stylesheet sets a minimum height, and a minimum always clamps an
  // explicit height, so a shorter declared height is not what the browser renders.
  const floor = cssNumber(node.styles.minHeight) ?? defaults?.height;
  const declared = cssNumber(node.styles.height)
    ?? (node.type === "circle" ? width : undefined);
  const height = declared === undefined
    ? floor
    : floor === undefined ? declared : Math.max(declared, floor);
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
  const parents = new Map<FrameSeqNode, FrameSeqNode>();
  const named = new Map<string, FrameSeqNode>();
  const placed: FrameSeqNode[] = [];
  const connectors: FrameSeqNode[] = [];

  const collect = (parent: FrameSeqNode, frame: FrameSeqNode): void => {
    for (const child of parent.children) {
      frames.set(child, frame);
      parents.set(child, parent);
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
  const flows = new Map<FrameSeqNode, Map<FrameSeqNode, Box>>();
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

  /**
   * Resolve the automatic layout of a row or column so its children can be anchored
   * without coordinates of their own. Only the part of flexbox that can be computed
   * exactly is supported; anything else fails instead of guessing a position that
   * the browser would then contradict.
   */
  /**
   * Resolve a grid whose track sizes are knowable: equal columns of a declared width,
   * or an explicit list of pixel tracks. Rows are as tall as their tallest item, and an
   * item without a size of its own fills its cell, which is what the browser does.
   */
  const gridLayout = (container: FrameSeqNode, label: () => string): Map<FrameSeqNode, Box> => {
    const gap = cssNumber(container.styles.gap);
    if (gap === undefined) {
      throw new AnchorError(
        `the gap of ${label()} comes from the theme; call .gap(...) so its contents can be resolved`,
      );
    }

    const padding = paddingOf(container, label);
    const template = (container.styles.gridTemplateColumns ?? "").trim();
    const declaredWidth = cssNumber(container.styles.width);
    const innerWidth = declaredWidth === undefined ? undefined : declaredWidth - padding.left * 2;

    let tracks: number[];
    const equalColumns = /^repeat\((\d+),\s*minmax\(0,\s*1fr\)\)$/.exec(template);
    if (equalColumns) {
      const count = Number(equalColumns[1]);
      if (innerWidth === undefined) {
        throw new AnchorError(
          `${label()} divides its width into ${count} equal columns, so it needs .width(...) `
          + "before its contents can be resolved",
        );
      }
      const track = (innerWidth - gap * (count - 1)) / count;
      tracks = Array.from({ length: count }, () => track);
    } else {
      const pixels = template.split(/\s+/).filter(Boolean).map((part) => cssNumber(part));
      if (pixels.length === 0 || pixels.some((value) => value === undefined)) {
        throw new AnchorError(
          `${label()} uses grid columns FrameSeq cannot resolve: "${template}". Use a column `
          + "count with .width(...), or tracks given in pixels",
        );
      }
      tracks = pixels as number[];
    }

    const children = container.children.filter((child) =>
      child.type !== "line" && child.styles.position !== "absolute");
    const boxes = children.map((child) => {
      if (child.styles.gridColumn !== undefined || child.styles.gridRow !== undefined) {
        throw new AnchorError(
          `${describe(child)} places itself in the grid, which FrameSeq cannot resolve; `
          + "give it .position({ x, y }) instead",
        );
      }
      const { width, height } = intrinsicSize(child);
      if (height === undefined) {
        throw new AnchorError(
          `the height of ${describe(child)} is unknown, so ${label()} cannot be resolved; `
          + "add .height(...)",
        );
      }
      return { width, height };
    });

    const rowHeights: number[] = [];
    for (const [index, box] of boxes.entries()) {
      const row = Math.floor(index / tracks.length);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, box.height);
    }

    const layout = new Map<FrameSeqNode, Box>();
    for (const [index, child] of children.entries()) {
      const column = index % tracks.length;
      const row = Math.floor(index / tracks.length);
      const x = padding.left
        + tracks.slice(0, column).reduce((total, track) => total + track, 0)
        + gap * column;
      const y = padding.top
        + rowHeights.slice(0, row).reduce((total, height) => total + height, 0)
        + gap * row;
      // Without a size of its own, an item stretches to fill its cell.
      layout.set(child, {
        x,
        y,
        width: boxes[index].width ?? tracks[column],
        height: child.styles.height === undefined ? rowHeights[row] : boxes[index].height,
      });
    }
    return layout;
  };

  const flowLayout = (container: FrameSeqNode): Map<FrameSeqNode, Box> => {
    const cached = flows.get(container);
    if (cached) return cached;

    const label = () => describe(container);
    if (container.styles.display === "grid") {
      const layout = gridLayout(container, label);
      flows.set(container, layout);
      return layout;
    }

    const direction = container.styles.flexDirection;
    if (container.styles.display !== "flex" || (direction !== "row" && direction !== "column")) {
      throw new AnchorError(
        `${label()} is not a row(), column(), or grid(), so the position of its contents is `
        + "unknown; give the object .position({ x, y }) or a placement",
      );
    }
    if (container.styles.flexWrap === "wrap") {
      throw new AnchorError(`${label()} wraps, so FrameSeq cannot resolve where its contents land`);
    }

    const parent = parents.get(container);
    const nested = Boolean(parent)
      && parent!.styles.display === "flex"
      && container.styles.position !== "absolute";

    const gap = cssNumber(container.styles.gap);
    if (gap === undefined) {
      throw new AnchorError(
        `the gap of ${label()} comes from the theme; call .gap(...) so its contents can be resolved`,
      );
    }

    const padding = paddingOf(container, label);
    const justify = container.styles.justifyContent ?? "flex-start";
    const align = container.styles.alignItems ?? "stretch";
    const row = direction === "row";
    // Connectors are taken out of flow by the stylesheet, not by an inline style.
    const children = container.children.filter((child) =>
      child.type !== "line" && child.styles.position !== "absolute");

    const crossAlignOf = (child: FrameSeqNode): string => {
      const self = child.styles.alignSelf;
      return self === undefined || self === "auto" ? align : self;
    };
    // selfAlign() measures the container's cross size the same way align() does, so it
    // needs the container to be as measurable as align() does.
    const selfAligned = children.some((child) => crossAlignOf(child) !== align);
    if (nested && (justify !== "flex-start" || align !== "stretch" || selfAligned)
      && (container.styles.width === undefined || container.styles.height === undefined)) {
      const used = justify !== "flex-start" || align !== "stretch"
        ? "align() or justify()"
        : "selfAlign()";
      throw new AnchorError(
        `${label()} sits inside another row or column, so its size is decided by that `
        + `container; give it .width(...) and .height(...) to use ${used} here`,
      );
    }
    if (!["flex-start", "center", "flex-end", "stretch"].includes(align)) {
      throw new AnchorError(`${label()} uses align("${align}"), which FrameSeq cannot resolve`);
    }
    for (const child of children) {
      const self = child.styles.alignSelf;
      if (self !== undefined
        && !["auto", "flex-start", "center", "flex-end", "stretch"].includes(self)) {
        throw new AnchorError(
          `${describe(child)} uses selfAlign("${self}"), which FrameSeq cannot resolve`,
        );
      }
    }

    const sizes = children.map((child) => {
      if (child.styles.flexGrow !== undefined && child.styles.flexGrow !== "0") {
        throw new AnchorError(
          `${describe(child)} uses grow(), so its size depends on the browser; `
          + "give it .width(...) and .height(...) and remove grow() to anchor it",
        );
      }
      const { width, height } = intrinsicSize(child);
      if (width === undefined || height === undefined) {
        const missing = width === undefined ? "width" : "height";
        throw new AnchorError(
          `the ${missing} of ${describe(child)} is unknown, so ${label()} cannot be resolved; `
          + `add .${missing}(...)`,
        );
      }
      return { width, height };
    });

    const mainOf = (size: { width: number; height: number }) => (row ? size.width : size.height);
    const crossOf = (size: { width: number; height: number }) => (row ? size.height : size.width);
    const declaredMain = cssNumber(row ? container.styles.width : container.styles.height);
    const declaredCross = cssNumber(row ? container.styles.height : container.styles.width);
    const usedMain = sizes.reduce((total, size) => total + mainOf(size), 0)
      + gap * Math.max(sizes.length - 1, 0);
    const innerMain = declaredMain === undefined
      ? usedMain
      : declaredMain - (row ? padding.left : padding.top) * 2;
    const innerCross = declaredCross === undefined
      ? sizes.reduce((largest, size) => Math.max(largest, crossOf(size)), 0)
      : declaredCross - (row ? padding.top : padding.left) * 2;

    const free = innerMain - usedMain;
    let cursor = row ? padding.left : padding.top;
    let between = gap;
    if (justify === "center") cursor += free / 2;
    else if (justify === "flex-end") cursor += free;
    else if (justify === "space-between" && sizes.length > 1) between += free / (sizes.length - 1);
    else if (justify !== "flex-start" && justify !== "normal") {
      throw new AnchorError(`${label()} uses justify("${justify}"), which FrameSeq cannot resolve`);
    }

    const layout = new Map<FrameSeqNode, Box>();
    for (const [index, child] of children.entries()) {
      const size = sizes[index];
      // selfAlign() overrides the container for one child; everything else follows align().
      const childAlign = crossAlignOf(child);
      // Under the default stretch, an item without its own cross size fills the line.
      const stretched = childAlign === "stretch"
        && (row ? child.styles.height : child.styles.width) === undefined;
      const cross = stretched ? innerCross : crossOf(size);
      let crossStart = row ? padding.top : padding.left;
      if (!stretched && childAlign === "center") crossStart += (innerCross - cross) / 2;
      else if (!stretched && childAlign === "flex-end") crossStart += innerCross - cross;

      layout.set(child, row
        ? { x: cursor, y: crossStart, width: size.width, height: cross }
        : { x: crossStart, y: cursor, width: cross, height: size.height });
      cursor += mainOf(size) + between;
    }

    flows.set(container, layout);
    return layout;
  };

  /** A row or column with no declared size is as large as the layout it produces. */
  function intrinsicSize(node: FrameSeqNode): { width?: number; height?: number } {
    const declared = sizeOf(node);
    if (declared.width !== undefined && declared.height !== undefined) return declared;
    if (node.styles.display !== "flex" && node.styles.display !== "grid") return declared;

    const layout = flowLayout(node);
    const padding = paddingOf(node, () => describe(node));
    let width = 0;
    let height = 0;
    for (const box of layout.values()) {
      width = Math.max(width, box.x + box.width);
      height = Math.max(height, box.y + box.height);
    }
    return {
      width: declared.width ?? width + padding.left,
      height: declared.height ?? height + padding.top,
    };
  }

  function boxOf(node: FrameSeqNode): ResolvedBox {
    const cached = boxes.get(node);
    if (cached) return cached;

    const frame = frameOrigin(frames.get(node) ?? slide);
    const { width, height } = intrinsicSize(node);
    let flowSize: { width: number; height: number } | undefined;
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
      if (left !== undefined && top !== undefined) {
        x = left;
        y = top;
      } else {
        const container = parents.get(node);
        if (!container || node.styles.position === "absolute") {
          throw new AnchorError(
            `${describe(node)} has no canvas coordinates; give it .position({ x, y }) `
            + `or a placement such as .rightOf(...)`,
          );
        }
        if (container.styles.display !== "flex" && container.styles.display !== "grid") {
          throw new AnchorError(
            `${describe(node)} has no canvas coordinates, and ${describe(container)} does not `
            + "place it either; give it .position({ x, y }), .anchor(...), or a placement",
          );
        }

        const placed = flowLayout(container).get(node);
        if (!placed) {
          throw new AnchorError(
            `${describe(node)} has no canvas coordinates; give it .position({ x, y }) `
            + `or a placement such as .rightOf(...)`,
          );
        }

        // A row or column can itself sit inside another one, so keep composing
        // offsets until a container with coordinates of its own is reached.
        if (frames.get(node) !== container) {
          const outer = boxOf(container);
          const nestedBox: ResolvedBox = {
            root: outer.root,
            x: outer.x + placed.x,
            y: outer.y + placed.y,
            width: placed.width,
            height: placed.height,
          };
          boxes.set(node, nestedBox);
          return nestedBox;
        }

        x = placed.x;
        y = placed.y;
        flowSize = { width: placed.width, height: placed.height };
      }
    }

    const box: ResolvedBox = {
      root: frame.root,
      x: frame.x + x,
      y: frame.y + y,
      width: flowSize?.width ?? width,
      height: flowSize?.height ?? height,
    };
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
