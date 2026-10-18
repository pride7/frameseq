/**
 * Smart guides for objects dragged on a slide, as a drawing program has them: an edge or the
 * middle of the object being moved or resized snaps to the edges and middles of the objects
 * around it and of the page, and a move also snaps to even spacing with its neighbours. All of
 * it is measured in the viewport's pixels, where the slide is drawn, scaled or not.
 */

/** A box on the page, in the viewport's pixels. */
export interface SnapBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * What a drag changes along one direction: the whole box moves, only its start (left or top)
 * edge or its end (right or bottom) edge moves, or nothing snaps that way.
 */
export type SnapEdge = "move" | "start" | "end" | "none";

/** A line two boxes line up on, drawn across both of them. */
export interface SnapGuide {
  /** "x" is a vertical line at x = `at`; "y" a horizontal one at y = `at`. */
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

/** A gap equal to another one, drawn from `from` to `to` along its axis, at `at` across it. */
export interface SnapGap {
  axis: "x" | "y";
  from: number;
  to: number;
  at: number;
}

export interface Snap {
  /** How far to move what the drag changes, along each direction. */
  dx: number;
  dy: number;
  guides: SnapGuide[];
  gaps: SnapGap[];
}

interface Axis {
  start: (box: SnapBox) => number;
  end: (box: SnapBox) => number;
  crossStart: (box: SnapBox) => number;
  crossEnd: (box: SnapBox) => number;
}

const axes: Record<"x" | "y", Axis> = {
  x: { start: (box) => box.left, end: (box) => box.right, crossStart: (box) => box.top, crossEnd: (box) => box.bottom },
  y: { start: (box) => box.top, end: (box) => box.bottom, crossStart: (box) => box.left, crossEnd: (box) => box.right },
};

/** The lines of a box along one direction: its start, its middle, and its end. */
const lines = (axis: Axis, box: SnapBox): number[] => [axis.start(box), (axis.start(box) + axis.end(box)) / 2, axis.end(box)];

/** Whether two boxes share some of their extent across the direction measured. */
const overlapAcross = (axis: Axis, a: SnapBox, b: SnapBox): boolean =>
  Math.min(axis.crossEnd(a), axis.crossEnd(b)) > Math.max(axis.crossStart(a), axis.crossStart(b));

/** A move along one direction that would line the box up or space it evenly. */
interface Candidate {
  delta: number;
  gaps: SnapGap[];
}

/**
 * Where a box moved along one direction could space itself evenly: midway between its nearest
 * neighbours on either side, or as far from one of them as two other objects in a row are apart.
 */
function spacingCandidates(axis: Axis, moving: SnapBox, peers: SnapBox[], threshold: number): Candidate[] {
  const row = peers.filter((peer) => overlapAcross(axis, peer, moving));
  const middle = (axis.start(moving) + axis.end(moving)) / 2;
  const size = axis.end(moving) - axis.start(moving);
  let before: SnapBox | undefined;
  let after: SnapBox | undefined;
  for (const peer of row) {
    if (axis.end(peer) <= axis.start(moving) + threshold && axis.end(peer) < middle) {
      if (!before || axis.end(peer) > axis.end(before)) before = peer;
    } else if (axis.start(peer) >= axis.end(moving) - threshold && axis.start(peer) > middle) {
      if (!after || axis.start(peer) < axis.start(after)) after = peer;
    }
  }
  /**
   * Where a gap is drawn across: three quarters into the part both boxes share, clear of the
   * guide through their middles that lining up often draws there too.
   */
  const across = (a: SnapBox, b: SnapBox): number =>
    Math.max(axis.crossStart(a), axis.crossStart(b)) * 0.25 + Math.min(axis.crossEnd(a), axis.crossEnd(b)) * 0.75;
  const candidates: Candidate[] = [];
  if (before && after && axis.start(after) - axis.end(before) > size) {
    const start = (axis.end(before) + axis.start(after) - size) / 2;
    const placed = shift(axis, moving, start - axis.start(moving));
    candidates.push({
      delta: start - axis.start(moving),
      gaps: [
        { axis: axisName(axis), from: axis.end(before), to: start, at: across(before, placed) },
        { axis: axisName(axis), from: start + size, to: axis.start(after), at: across(placed, after) },
      ],
    });
  }
  // The gaps between neighbours already in a row: no other object of the row lies between them.
  for (const first of peers) {
    for (const second of peers) {
      const gap = axis.start(second) - axis.end(first);
      if (first === second || gap <= 0 || !overlapAcross(axis, first, second)) continue;
      const between = peers.some((other) => other !== first && other !== second
        && overlapAcross(axis, other, first) && axis.start(other) >= axis.end(first) && axis.end(other) <= axis.start(second));
      if (between) continue;
      const existing: SnapGap = { axis: axisName(axis), from: axis.end(first), to: axis.start(second), at: across(first, second) };
      if (before) {
        const start = axis.end(before) + gap;
        const placed = shift(axis, moving, start - axis.start(moving));
        candidates.push({
          delta: start - axis.start(moving),
          gaps: [existing, { axis: axisName(axis), from: axis.end(before), to: start, at: across(before, placed) }],
        });
      }
      if (after) {
        const end = axis.start(after) - gap;
        const placed = shift(axis, moving, end - axis.end(moving));
        candidates.push({
          delta: end - axis.end(moving),
          gaps: [existing, { axis: axisName(axis), from: end, to: axis.start(after), at: across(placed, after) }],
        });
      }
    }
  }
  return candidates;
}

const axisName = (axis: Axis): "x" | "y" => (axis === axes.x ? "x" : "y");

/** The box moved along one direction. */
function shift(axis: Axis, box: SnapBox, delta: number): SnapBox {
  return axis === axes.x
    ? { ...box, left: box.left + delta, right: box.right + delta }
    : { ...box, top: box.top + delta, bottom: box.bottom + delta };
}

/** The box with what the drag changes along one direction moved. */
function apply(axis: Axis, box: SnapBox, edge: SnapEdge, delta: number): SnapBox {
  if (edge === "move") return shift(axis, box, delta);
  if (axis === axes.x) return edge === "start" ? { ...box, left: box.left + delta } : edge === "end" ? { ...box, right: box.right + delta } : box;
  return edge === "start" ? { ...box, top: box.top + delta } : edge === "end" ? { ...box, bottom: box.bottom + delta } : box;
}

/** The lines of the box the drag changes along one direction, which are the ones that snap. */
function movingLines(axis: Axis, box: SnapBox, edge: SnapEdge): number[] {
  if (edge === "move") return lines(axis, box);
  if (edge === "start") return [axis.start(box)];
  if (edge === "end") return [axis.end(box)];
  return [];
}

/** Snap along one direction, and say how far, and which gaps it evened. */
function snapAxis(
  axis: Axis,
  moving: SnapBox,
  edge: SnapEdge,
  targets: SnapBox[],
  peers: SnapBox[],
  threshold: number,
): Candidate | undefined {
  if (edge === "none") return undefined;
  let best: Candidate | undefined;
  const consider = (candidate: Candidate): void => {
    if (Math.abs(candidate.delta) > threshold) return;
    // Lining up wins a tie with spacing, which shows more than it needs to.
    if (!best || Math.abs(candidate.delta) < Math.abs(best.delta) - 0.01) best = candidate;
  };
  for (const from of movingLines(axis, moving, edge)) {
    for (const target of targets) for (const at of lines(axis, target)) consider({ delta: at - from, gaps: [] });
  }
  if (edge === "move") for (const candidate of spacingCandidates(axis, moving, peers, threshold)) consider(candidate);
  return best;
}

/** The lines the snapped box now shares with the objects around it and the page. */
function guidesFor(axis: Axis, box: SnapBox, edge: SnapEdge, targets: SnapBox[]): SnapGuide[] {
  const guides = new Map<number, SnapGuide>();
  for (const from of movingLines(axis, box, edge)) {
    for (const target of targets) {
      if (!lines(axis, target).some((at) => Math.abs(at - from) < 0.5)) continue;
      const key = Math.round(from * 2);
      const start = Math.min(axis.crossStart(box), axis.crossStart(target));
      const end = Math.max(axis.crossEnd(box), axis.crossEnd(target));
      const known = guides.get(key);
      guides.set(key, {
        axis: axisName(axis),
        at: from,
        from: Math.min(start, known?.from ?? start),
        to: Math.max(end, known?.to ?? end),
      });
    }
  }
  return [...guides.values()];
}

/**
 * Snap a box being dragged to the objects around it and to the page it is on, within
 * `threshold` pixels. `x` and `y` say what the drag changes along each direction.
 */
export function snapBox(
  moving: SnapBox,
  peers: SnapBox[],
  page: SnapBox | undefined,
  options: { x: SnapEdge; y: SnapEdge; threshold: number },
): Snap {
  const targets = page ? [...peers, page] : peers;
  const snapX = snapAxis(axes.x, moving, options.x, targets, peers, options.threshold);
  const snapY = snapAxis(axes.y, moving, options.y, targets, peers, options.threshold);
  const dx = snapX?.delta ?? 0;
  const dy = snapY?.delta ?? 0;
  const snapped = apply(axes.y, apply(axes.x, moving, options.x, dx), options.y, dy);
  return {
    dx,
    dy,
    guides: [
      ...(snapX ? guidesFor(axes.x, snapped, options.x, targets) : []),
      ...(snapY ? guidesFor(axes.y, snapped, options.y, targets) : []),
    ],
    gaps: [...(snapX?.gaps ?? []), ...(snapY?.gaps ?? [])],
  };
}
