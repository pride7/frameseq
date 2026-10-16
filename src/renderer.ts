import katex from "katex";
import QRCode from "qrcode";
import type {
  SlidesRootDefinition,
  FrameSeqNode,
  Length,
  PresentationFontOptions,
  SourceField,
  SourceSpan,
} from "./core";
import { paperCanvasUnits, resolvePrintUnits } from "./paper";
import { resolveAnchors } from "./anchors";
import { chartPalette, chartSvg, type ChartSpec } from "./chart";
import {
  connectorMidpoint,
  connectorPath,
  isShapeKind,
  resolveShapePaint,
  shapeGeometry,
  shapeSize,
  svgPath,
  type LineRoute,
  type OutlineKind,
  type PolygonPoints,
  type ShapeKind,
  type ShapePaint,
} from "./shapes";
import { themeCssVariables } from "./theme";
import { mountThumbnails } from "./thumbnails";
import { richColor, richRuns, writeRichText } from "./rich-text";
import type { RichRun } from "./rich-text";

const remoteSyncEvent = "frameseq:remote-sync";
const sourceEditEvent = "frameseq:apply-edit";
const sourceUndoEvent = "frameseq:undo-edit";
const sourceEditResultEvent = "frameseq:apply-edit-result";
const layoutEditingKey = "frameseq-layout-editing";
const layoutLockedKey = "frameseq-layout-locked";
const previewSelectionKey = "frameseq-preview-selection";
const notesScaleKey = "frameseq-presenter-notes-scale";
/**
 * Notes are read at a glance from a lectern, so the useful range runs from "fit a long
 * script on screen" to "readable from a step back". Discrete steps let a presenter reach
 * either end with a couple of clicks and know when they are there.
 */
const notesScaleSteps = [0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
const defaultNotesScaleIndex = notesScaleSteps.indexOf(1);
const localRemoteAvailable = __FRAMESEQ_REMOTE_ENABLED__ && Boolean(import.meta.hot);
/** Editing writes the slide document, so it only exists while a development server is serving. */
const localEditingAvailable = Boolean(import.meta.hot);

/**
 * Whether this page is FrameSeq Studio's own preview. There, as in a drawing program, objects
 * are selected, dragged, and typed into with no mode to enter first.
 */
function inStudioPreview(): boolean {
  return window.parent !== window && new URLSearchParams(location.search).get("frameseq-preview") === "studio";
}

/** A padlock, closed while the layout is locked and open while objects can be moved. */
function lockPicture(closed: boolean): string {
  const shackle = closed ? "M8 11V8a4 4 0 0 1 8 0v3" : "M8 11V8a4 4 0 0 1 7.6-1.8";
  return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="${shackle}"/></svg>`;
}

function applyStyles(element: HTMLElement, styles: Record<string, string>): void {
  Object.assign(element.style, styles);
}

/**
 * Write text into an element: words marked bold, in italics, or in a colour as spans of their
 * own, which say how they were marked for the editors and exports that read them back, and
 * inline math set by KaTeX.
 */
function appendTextWithInlineMath(element: HTMLElement, content: string): void {
  for (const run of richRuns(content)) {
    if (!run.bold && !run.italic && !run.color) {
      appendMath(element, run.text);
      continue;
    }
    const span = document.createElement("span");
    span.className = "frameseq-run";
    // Bolder than the text around it, so bold words in a heading still stand out.
    if (run.bold) {
      span.style.fontWeight = "bolder";
      span.dataset.bold = "true";
    }
    if (run.italic) {
      span.style.fontStyle = "italic";
      span.dataset.italic = "true";
    }
    if (run.color) {
      span.style.color = richColor(run.color);
      span.dataset.color = run.color;
    }
    appendMath(span, run.text);
    element.append(span);
  }
}

function appendMath(element: HTMLElement, content: string): void {
  const inlineMath = /(?<!\\)\$((?:\\.|[^$])+?)(?<!\\)\$/g;
  let cursor = 0;

  for (const match of content.matchAll(inlineMath)) {
    const index = match.index;
    element.append(document.createTextNode(
      content.slice(cursor, index).replaceAll("\\$", "$"),
    ));

    const formula = document.createElement("span");
    formula.className = "frameseq-inline-math";
    try {
      formula.innerHTML = katex.renderToString(match[1], {
        displayMode: false,
        throwOnError: false,
        output: "htmlAndMathml",
      });
    } catch (error) {
      formula.textContent = error instanceof Error ? error.message : String(error);
      formula.classList.add("frameseq-equation-error");
    }
    element.append(formula);
    cursor = index + match[0].length;
  }

  element.append(document.createTextNode(
    content.slice(cursor).replaceAll("\\$", "$"),
  ));
}

const svgNamespace = "http://www.w3.org/2000/svg";
let lineMarkerSequence = 0;

function renderLine(node: FrameSeqNode): HTMLElement {
  const element = document.createElement("div");
  const svg = document.createElementNS(svgNamespace, "svg");
  const route = (node.props.route as LineRoute | undefined) ?? "straight";
  const points = node.props.points as Array<[number, number]> | undefined;
  // A routed connector, or one through stops, is a path through its corners; a straight one
  // from end to end stays a plain line.
  const routed = Array.isArray(points) && points.length >= 2 && (route !== "straight" || points.length > 2);
  const vector = document.createElementNS(svgNamespace, routed ? "path" : "line");
  const stroke = String(node.props.stroke ?? "var(--frameseq-accent)");
  const strokeWidth = String(node.props.strokeWidth ?? "3px");
  const arrow = node.props.arrow;

  svg.setAttribute("aria-hidden", "true");
  if (routed) {
    vector.setAttribute("d", connectorPath(route, points));
    vector.setAttribute("fill", "none");
    vector.setAttribute("stroke-linejoin", "round");
    vector.dataset.frameseqRoute = route;
    vector.dataset.frameseqPoints = JSON.stringify(points);
  } else {
    vector.setAttribute("x1", String(node.props.x1));
    vector.setAttribute("y1", String(node.props.y1));
    vector.setAttribute("x2", String(node.props.x2));
    vector.setAttribute("y2", String(node.props.y2));
  }
  vector.setAttribute("stroke", stroke);
  vector.setAttribute("stroke-width", strokeWidth);
  vector.setAttribute("stroke-linecap", "round");
  if (node.props.dashed === true) {
    const width = Number.parseFloat(strokeWidth) || 3;
    vector.setAttribute("stroke-dasharray", `${Math.round(width * 3)} ${Math.round(width * 2.4)}`);
    vector.setAttribute("stroke-linecap", "butt");
  }

  if (arrow === "start" || arrow === "end" || arrow === "both") {
    lineMarkerSequence += 1;
    const markerId = `frameseq-arrow-${lineMarkerSequence}`;
    const definitions = document.createElementNS(svgNamespace, "defs");
    const marker = document.createElementNS(svgNamespace, "marker");
    const arrowhead = document.createElementNS(svgNamespace, "path");

    marker.id = markerId;
    marker.setAttribute("viewBox", "0 0 8 8");
    marker.setAttribute("refX", "7");
    marker.setAttribute("refY", "4");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("markerUnits", "strokeWidth");
    marker.setAttribute("orient", "auto-start-reverse");
    arrowhead.setAttribute("d", "M 0 0 L 8 4 L 0 8 Z");
    arrowhead.setAttribute("fill", stroke);
    marker.append(arrowhead);
    definitions.append(marker);
    svg.append(definitions);

    if (arrow === "start" || arrow === "both") {
      vector.setAttribute("marker-start", `url(#${markerId})`);
    }
    if (arrow === "end" || arrow === "both") {
      vector.setAttribute("marker-end", `url(#${markerId})`);
    }
  }

  svg.append(vector);
  element.append(svg);

  const label = node.props.label;
  if (typeof label === "string" && label) {
    const along: Array<[number, number]> = routed ? points : [
      [Number(node.props.x1) || 0, Number(node.props.y1) || 0],
      [Number(node.props.x2) || 0, Number(node.props.y2) || 0],
    ];
    const middle = connectorMidpoint(routed ? route : "straight", along);
    const caption = document.createElement("div");
    caption.className = "frameseq-line-label";
    caption.style.left = `${middle.x}px`;
    caption.style.top = `${middle.y}px`;
    appendTextWithInlineMath(caption, label);
    element.append(caption);
  }
  return element;
}

/**
 * Shapes are drawn at the size the browser gives them, so an outline follows a resize as the
 * layout editor drags it. One observer serves the deck mounted now.
 */
let shapeObserver: ResizeObserver | undefined;

interface ShapeDrawing {
  kind: OutlineKind;
  /** A polygon's corners. */
  points?: PolygonPoints;
  fill: string;
  stroke: string;
  strokeWidth: number;
  shade: string;
  dashed: boolean;
  radius?: number;
  width: number;
  height: number;
}

function drawShape(element: HTMLElement, fallback?: { width: number; height: number }): void {
  let drawing: ShapeDrawing;
  try {
    drawing = JSON.parse(element.dataset.frameseqDrawing ?? "") as ShapeDrawing;
  } catch {
    return;
  }
  const width = element.offsetWidth || fallback?.width || 0;
  const height = element.offsetHeight || fallback?.height || 0;
  // A slide that is not shown has no size, and keeps what it was drawn at until it appears.
  if (width < 1 || height < 1 || (width === drawing.width && height === drawing.height)) return;
  drawing.width = width;
  drawing.height = height;
  element.dataset.frameseqDrawing = JSON.stringify(drawing);

  const geometry = shapeGeometry(drawing.kind, width, height, {
    strokeWidth: drawing.strokeWidth,
    radius: drawing.radius,
    points: drawing.points,
  });
  const svg = element.querySelector<SVGSVGElement>(":scope > .frameseq-shape-outline");
  const label = element.querySelector<HTMLElement>(":scope > .frameseq-shape-label");
  if (!svg) return;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  const dash = drawing.dashed
    ? `${Math.round(drawing.strokeWidth * 3.2)} ${Math.round(drawing.strokeWidth * 2.4)}`
    : undefined;
  const path = (segments: typeof geometry.outline, fill: string): SVGPathElement => {
    const vector = document.createElementNS(svgNamespace, "path");
    vector.setAttribute("d", svgPath(segments));
    vector.setAttribute("fill", fill);
    vector.setAttribute("stroke", drawing.stroke);
    vector.setAttribute("stroke-width", String(drawing.strokeWidth));
    vector.setAttribute("stroke-linejoin", "round");
    if (dash) vector.setAttribute("stroke-dasharray", dash);
    return vector;
  };
  const body = path(geometry.outline, drawing.fill);
  body.classList.add("frameseq-shape-body");
  const paths = [body];
  if (geometry.shade) paths.push(path(geometry.shade, drawing.shade));
  if (geometry.detail) paths.push(path(geometry.detail, "none"));
  svg.replaceChildren(...paths);
  if (label) {
    label.style.left = `${geometry.text.x}px`;
    label.style.top = `${geometry.text.y}px`;
    label.style.width = `${geometry.text.width}px`;
    label.style.height = `${geometry.text.height}px`;
  }
}

function pixels(value: unknown): number | undefined {
  const match = typeof value === "string" ? /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim()) : null;
  return match ? Number(match[1]) : undefined;
}

function renderShape(node: FrameSeqNode): HTMLElement {
  const element = document.createElement("div");
  const kind = node.props.kind as OutlineKind;
  const points = kind === "polygon" ? node.props.points as PolygonPoints : undefined;
  const paint = node.props.paint as ShapePaint | undefined;
  const defaults = shapeSize(kind, points);
  const width = pixels(node.styles.width) ?? defaults.width;
  const height = pixels(node.styles.height) ?? (kind === "circle" ? width : defaults.height);
  // The node's own styles are applied after these and win wherever they state a size.
  element.style.width = `${defaults.width}px`;
  element.style.height = kind === "circle" && node.styles.width && !node.styles.height
    ? node.styles.width
    : `${defaults.height}px`;
  element.dataset.frameseqShape = kind;
  const drawing: ShapeDrawing = {
    kind,
    points,
    fill: String(node.props.fill ?? paint?.fill ?? "var(--frameseq-surface)"),
    stroke: String(node.props.stroke ?? paint?.stroke ?? "var(--frameseq-border)"),
    strokeWidth: pixels(node.props.strokeWidth) ?? 2,
    shade: String(paint?.shade ?? node.props.fill ?? "var(--frameseq-surface-strong)"),
    dashed: node.props.dashed === true,
    radius: pixels(node.styles.borderRadius),
    width: 0,
    height: 0,
  };
  element.dataset.frameseqDrawing = JSON.stringify(drawing);
  if (paint && !node.styles.color) element.style.color = paint.text;

  const svg = document.createElementNS(svgNamespace, "svg");
  svg.classList.add("frameseq-shape-outline");
  svg.setAttribute("aria-hidden", "true");
  if (node.props.shadow === true) svg.classList.add("has-shadow");
  const label = document.createElement("div");
  label.className = "frameseq-shape-label";
  const text = node.props.label;
  if (typeof text === "string" && text) appendTextWithInlineMath(label, text);
  else element.setAttribute("aria-hidden", "true");
  element.append(svg, label);
  drawShape(element, { width, height });
  shapeObserver?.observe(element);
  return element;
}

/** Paint a rect() or circle() that asks for a tone, a shadow, or a dashed outline. */
function paintBox(element: HTMLElement, node: FrameSeqNode): void {
  const paint = node.props.paint as ShapePaint | undefined;
  if (paint) {
    if (!node.styles.background) element.style.background = paint.fill;
    if (!node.styles.borderColor) element.style.borderColor = paint.stroke;
    if (!node.styles.color) element.style.color = paint.text;
  }
  if (node.props.dashed === true) element.style.borderStyle = "dashed";
  if (node.props.shadow === true) element.classList.add("has-shadow");
}

function renderTable(node: FrameSeqNode): HTMLElement {
  const table = document.createElement("table");
  const rows = (node.props.rows as string[][] | undefined) ?? [];
  const header = Number(node.props.header ?? 0);
  const align = (node.props.align as string[] | undefined) ?? [];
  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (node.props.striped === true) table.classList.add("is-striped");
  const section = (tag: "thead" | "tbody", from: number, to: number): void => {
    if (to <= from) return;
    const group = document.createElement(tag);
    for (const row of rows.slice(from, to)) {
      const line = document.createElement("tr");
      for (let column = 0; column < columns; column += 1) {
        const cell = document.createElement(tag === "thead" ? "th" : "td");
        if (tag === "thead") cell.scope = "col";
        cell.style.textAlign = align[column] ?? "left";
        appendTextWithInlineMath(cell, row[column] ?? "");
        line.append(cell);
      }
      group.append(line);
    }
    table.append(group);
  };
  section("thead", 0, header);
  section("tbody", header, rows.length);
  return table;
}

/** A QR code as vector squares with a quiet zone, dark on light so any phone can read it. */
function renderQr(node: FrameSeqNode): HTMLElement {
  const element = document.createElement("div");
  const text = String(node.props.text ?? "");
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", `QR code: ${text}`);
  try {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
    const quiet = 2;
    const size = modules.size + quiet * 2;
    let path = "";
    for (let row = 0; row < modules.size; row += 1) {
      for (let column = 0; column < modules.size; column += 1) {
        if (modules.data[row * modules.size + column]) path += `M${column + quiet} ${row + quiet}h1v1h-1z`;
      }
    }
    element.innerHTML = `<svg xmlns="${svgNamespace}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
  } catch (error) {
    element.textContent = error instanceof Error ? error.message : String(error);
    element.classList.add("frameseq-qr-error");
  }
  return element;
}

function renderIcon(node: FrameSeqNode): HTMLElement {
  const element = document.createElement("span");
  const name = String(node.props.name ?? "");
  const svg = typeof node.props.svg === "string"
    ? node.props.svg
    : (globalThis as { __frameseqIcons?: Record<string, string> }).__frameseqIcons?.[name];
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", name);
  if (svg) element.innerHTML = svg;
  else {
    element.textContent = name;
    element.classList.add("frameseq-icon-missing");
  }
  return element;
}

/**
 * Shrink an object's text until the object holds it, between `minimum` and its own size. Every
 * size inside scales by the same factor, so a list or a card keeps its proportions; math scales
 * with the text around it. An earlier fit is undone first, since fonts that have arrived since
 * may measure differently.
 */
function fitElement(element: HTMLElement, minimum: number, widthOnly = false, tooWide?: () => boolean): void {
  const targets = [element, ...element.querySelectorAll<HTMLElement>("*")]
    .filter((target) => target instanceof HTMLElement && !target.closest(".katex"));
  for (const target of targets) {
    if (target.dataset.frameseqFitSize === undefined) continue;
    target.style.fontSize = target.dataset.frameseqFitSize;
    delete target.dataset.frameseqFitSize;
  }
  const overflows = (): boolean => (tooWide ? tooWide() : element.scrollWidth > element.clientWidth + 1)
    || (!widthOnly && element.scrollHeight > element.clientHeight + 1);
  if (!overflows()) return;
  const sizes = targets.map((target) => Number.parseFloat(getComputedStyle(target).fontSize) || 16);
  for (const target of targets) target.dataset.frameseqFitSize = target.style.fontSize;
  const apply = (scale: number): void => targets.forEach((target, index) => {
    target.style.fontSize = `${Math.round(sizes[index] * scale * 100) / 100}px`;
  });
  let low = minimum;
  let high = 1;
  apply(low);
  if (overflows()) return;
  for (let step = 0; step < 8; step += 1) {
    const middle = (low + high) / 2;
    apply(middle);
    if (overflows()) high = middle;
    else low = middle;
  }
  apply(low);
}

function drawChart(element: HTMLElement): void {
  let spec: ChartSpec;
  try {
    spec = JSON.parse(element.dataset.frameseqChart ?? "") as ChartSpec;
  } catch {
    return;
  }
  const style = getComputedStyle(element);
  const variable = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  element.innerHTML = chartSvg(spec, {
    width: element.clientWidth,
    height: element.clientHeight,
    fontSize: Number.parseFloat(style.fontSize) || 18,
    foreground: variable("--frameseq-foreground", "#111827"),
    muted: variable("--frameseq-muted", "#4b5563"),
    grid: variable("--frameseq-border", "#e5e7eb"),
    palette: [variable("--frameseq-accent", "#2563eb"), ...chartPalette],
  });
}

/**
 * Work that needs the slide laid out: fitting text to its room and drawing charts at their
 * size. A slide is laid out only while it is shown, so this runs as each one appears, again
 * once web fonts have arrived, and is safe to repeat.
 */
function settleCanvas(canvas: HTMLElement): void {
  for (const element of canvas.querySelectorAll<HTMLElement>(".frameseq-semantic-math, [data-frameseq-fit]:not(table)")) {
    const minimum = Number(element.dataset.frameseqFit ?? 0.5);
    fitElement(element, minimum, element.dataset.frameseqFit === undefined);
  }
  // A table grows past its region rather than overflowing inside itself, so it is measured
  // against the room its container has.
  for (const table of canvas.querySelectorAll<HTMLElement>("table.frameseq-table")) {
    const container = table.parentElement;
    if (!container) continue;
    const style = getComputedStyle(container);
    const room = (): number => container.clientWidth
      - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0);
    fitElement(table, Number(table.dataset.frameseqFit ?? 0.6), table.dataset.frameseqFit === undefined, () => table.offsetWidth > room() + 1);
  }
  for (const element of canvas.querySelectorAll<HTMLElement>("[data-frameseq-chart]")) drawChart(element);
  canvas.dataset.frameseqSettled = "true";
}

/** Settle canvases now, and again once the page's web fonts have loaded. */
function settleWhenReady(canvases: () => Array<HTMLElement | undefined>, signal: AbortSignal): void {
  for (const canvas of canvases()) if (canvas) settleCanvas(canvas);
  void document.fonts?.ready.then(() => {
    if (signal.aborted) return;
    for (const canvas of canvases()) if (canvas?.isConnected) settleCanvas(canvas);
  });
}

/** Source positions that produced more than one object, collected before rendering starts. */
const sharedSpans = new Set<number>();

function collectSharedSpans(node: FrameSeqNode, seen = new Set<number>()): void {
  const span = node.props.sourceSpan as SourceSpan | undefined;
  if (span) {
    if (seen.has(span.start)) sharedSpans.add(span.start);
    seen.add(span.start);
  }
  for (const child of node.children) collectSharedSpans(child, seen);
}

function renderNode(node: FrameSeqNode, nodePath = "0"): HTMLElement {
  let element: HTMLElement;

  switch (node.type) {
    case "text": {
      element = document.createElement("div");
      appendTextWithInlineMath(element, node.props.content as string);
      break;
    }
    case "image": {
      const image = document.createElement("img");
      image.src = node.props.src as string;
      image.alt = node.props.alt as string;
      element = image;
      break;
    }
    case "code": {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = node.props.content as string;
      code.dataset.language = node.props.language as string;
      pre.append(code);
      element = pre;
      break;
    }
    case "equation": {
      element = document.createElement("div");
      try {
        element.innerHTML = katex.renderToString(node.props.content as string, {
          displayMode: node.props.displayMode as boolean,
          throwOnError: false,
          output: "htmlAndMathml",
        });
      } catch (error) {
        element.textContent = error instanceof Error ? error.message : String(error);
        element.classList.add("frameseq-equation-error");
      }
      break;
    }
    case "typst": {
      element = document.createElement("div");
      const svg = node.props.svg;
      if (typeof svg === "string" && svg.trim()) {
        element.innerHTML = svg;
      } else {
        element.textContent = "Typst content was not compiled. Use the FrameSeq CLI and install @myriaddreamin/typst-ts-node-compiler.";
        element.classList.add("frameseq-typst-error");
      }
      break;
    }
    case "latex": {
      element = document.createElement("div");
      const svg = node.props.svg;
      if (typeof svg === "string" && svg.trim()) {
        element.innerHTML = svg;
      } else {
        element.textContent = "LaTeX content was not compiled. Use the FrameSeq CLI and install node-tectonic.";
        element.classList.add("frameseq-latex-error");
      }
      break;
    }
    case "rect":
    case "circle": {
      element = document.createElement("div");
      const label = node.props.label;
      if (typeof label === "string" && label) {
        appendTextWithInlineMath(element, label);
      } else {
        element.setAttribute("aria-hidden", "true");
      }
      paintBox(element, node);
      break;
    }
    case "shape": {
      element = renderShape(node);
      break;
    }
    case "line": {
      element = renderLine(node);
      break;
    }
    case "table": {
      element = renderTable(node);
      break;
    }
    case "chart": {
      element = document.createElement("div");
      element.setAttribute("role", "img");
      const spec = node.props as unknown as ChartSpec;
      element.setAttribute("aria-label", `${spec.kind} chart: ${spec.labels.join(", ")}`);
      element.dataset.frameseqChart = JSON.stringify({
        kind: spec.kind,
        labels: spec.labels,
        series: spec.series,
        colors: spec.colors,
        unit: spec.unit,
        showValues: spec.showValues,
        legend: spec.legend,
        max: spec.max,
      } satisfies ChartSpec);
      break;
    }
    case "qr": {
      element = renderQr(node);
      break;
    }
    case "icon": {
      element = renderIcon(node);
      break;
    }
    default:
      element = document.createElement("div");
  }
  if (typeof node.props.fit === "number") element.dataset.frameseqFit = String(node.props.fit);

  element.classList.add(`frameseq-${node.type}`);
  element.dataset.frameseqNode = node.type;
  element.dataset.frameseqPath = nodePath;
  if (typeof node.props.name === "string") element.dataset.frameseqName = node.props.name;
  // The names an object depends on, so deleting the object they name can account for it.
  const refers = [
    ...(Array.isArray(node.props.place) ? (node.props.place as Array<{ target: string }>).map((step) => step.target) : []),
    ...[node.props.from, node.props.to].map((end) => (end as { target?: string } | undefined)?.target),
  ].filter((name): name is string => typeof name === "string");
  if (refers.length > 0) element.dataset.frameseqRefers = [...new Set(refers)].join(" ");
  const span = node.props.sourceSpan as SourceSpan | undefined;
  if (span) {
    element.dataset.frameseqSource = `${span.line}:${span.column}:${span.start}:${span.end}`;
    // A command in a loop or a helper renders several objects from one line, and a drag could
    // not say which of them to rewrite. Those objects still lead back to their source line.
    if (sharedSpans.has(span.start)) element.dataset.frameseqShared = "true";
    else {
      if (span.fields) {
        element.dataset.frameseqEdit = JSON.stringify(span.fields);
        if (span.fields.x && span.fields.y) element.dataset.frameseqMove = "true";
      }
      if (span.computed) element.dataset.frameseqComputed = JSON.stringify(span.computed);
      if (span.statement && span.region !== undefined) {
        element.dataset.frameseqStatement = JSON.stringify(span.statement);
        element.dataset.frameseqRegion = String(span.region);
      }
    }
  }
  const extraClassName = node.props.className;
  if (typeof extraClassName === "string") {
    element.classList.add(...extraClassName.split(/\s+/).filter(Boolean));
  }

  if (typeof node.props.step === "number") {
    element.classList.add("frameseq-step");
    element.dataset.step = String(node.props.step);
  }

  applyStyles(element, node.styles);
  for (const [index, child] of node.children.entries()) {
    element.append(renderNode(child, `${nodePath}.${index}`));
  }
  return element;
}

function maxStep(node: FrameSeqNode): number {
  const ownStep = typeof node.props.step === "number" ? node.props.step : 0;
  return Math.max(ownStep, ...node.children.map(maxStep), 0);
}

function hasClass(node: FrameSeqNode, className: string): boolean {
  const classes = typeof node.props.className === "string"
    ? node.props.className.split(/\s+/)
    : [];
  return classes.includes(className);
}

/**
 * Text the presentation's details write, such as its title on a cover. `field` names the
 * presentation() option it shows, so an editor can lead from it to that option.
 */
function titlePageItem(className: string, content: string, field?: string): HTMLElement {
  const element = document.createElement("div");
  element.className = `frameseq-text ${className}`;
  if (field) element.dataset.frameseqMeta = field;
  appendTextWithInlineMath(element, content);
  return element;
}

function addAutomaticTitlePage(canvas: HTMLElement, slides: SlidesRootDefinition): void {
  const hasManualContent = Array.from(canvas.children).some((child) => {
    const isEmptyBody = child.classList.contains("frameseq-slide-body")
      && child.children.length === 0
      && !child.textContent?.trim();
    return !isEmptyBody;
  });
  if (hasManualContent) return;

  canvas.replaceChildren();

  const titlePage = document.createElement("section");
  titlePage.className = "frameseq-auto-title-page";
  titlePage.append(titlePageItem("frameseq-cover-title", slides.title, "title"));
  if (slides.subtitle) {
    titlePage.append(titlePageItem("frameseq-cover-subtitle", slides.subtitle, "subtitle"));
  }

  const rule = document.createElement("div");
  rule.className = "frameseq-cover-rule";
  titlePage.append(rule);

  if (slides.author) {
    titlePage.append(titlePageItem("frameseq-cover-author", slides.author, "author"));
  }
  if (slides.institute) {
    titlePage.append(titlePageItem("frameseq-cover-institute", slides.institute, "institute"));
  }
  if (slides.date) {
    titlePage.append(titlePageItem("frameseq-cover-date", slides.date, "date"));
  }
  canvas.dataset.frameseqDetails = "cover";
  canvas.append(titlePage);
}

/**
 * The band a poster opens with: the title, and below it what the presentation says about who
 * made it. It takes its room from the page like any other object, so the content below it
 * shrinks to fit rather than sliding underneath.
 */
function addMetadataHeader(canvas: HTMLElement, slides: SlidesRootDefinition): void {
  const header = document.createElement("header");
  header.className = "frameseq-theme-header";
  header.append(titlePageItem("frameseq-theme-header-title", slides.title, "title"));
  if (slides.subtitle) header.append(titlePageItem("frameseq-theme-header-subtitle", slides.subtitle, "subtitle"));
  const credits = ([["author", slides.author], ["institute", slides.institute], ["date", slides.date]] as Array<[string, string | undefined]>)
    .filter((credit): credit is [string, string] => Boolean(credit[1]));
  if (credits.length > 0) {
    const line = document.createElement("div");
    line.className = "frameseq-theme-header-credits";
    for (const [field, credit] of credits) line.append(titlePageItem("frameseq-theme-header-credit", credit, field));
    header.append(line);
  }
  canvas.dataset.frameseqDetails = "header";
  canvas.classList.add("frameseq-has-header");
  canvas.prepend(header);
}

function addThemeChrome(
  canvas: HTMLElement,
  slide: FrameSeqNode,
  index: number,
  slides: SlidesRootDefinition,
): void {
  const chrome = slides.theme.chrome;
  const isCover = hasClass(slide, "frameseq-cover-slide");
  if (isCover && chrome.autoTitlePage) {
    addAutomaticTitlePage(canvas, slides);
  }
  if (isCover && !chrome.showOnCover) return;
  if (chrome.header) addMetadataHeader(canvas, slides);

  const title = typeof slide.props.title === "string" ? slide.props.title : undefined;
  if (chrome.titleBar && title) {
    const titleBar = document.createElement("header");
    titleBar.className = `frameseq-theme-title-bar is-${chrome.titleBarStyle}`;
    titleBar.textContent = title;
    canvas.classList.add("frameseq-has-title-bar");
    canvas.prepend(titleBar);
  }

  if (!chrome.footer) return;

  const footer = document.createElement("footer");
  footer.className = "frameseq-theme-footer";

  if (chrome.footerLayout === "title") {
    footer.classList.add("is-title-layout");

    const title = document.createElement("span");
    title.className = "frameseq-theme-footer-title";
    title.textContent = slides.title;

    const number = document.createElement("span");
    number.className = "frameseq-theme-footer-details";
    number.textContent = chrome.slideNumber ? `${index + 1} / ${slides.slides.length}` : "";

    footer.append(title, number);
    canvas.classList.add("frameseq-has-footer");
    canvas.append(footer);
    return;
  }

  const author = document.createElement("span");
  author.className = "frameseq-theme-footer-author";
  author.textContent = slides.author ?? slides.title;

  const institute = document.createElement("span");
  institute.className = "frameseq-theme-footer-institute";
  institute.textContent = slides.institute ?? "";

  const details = document.createElement("span");
  details.className = "frameseq-theme-footer-details";
  details.textContent = [
    slides.date,
    chrome.slideNumber ? `${index + 1} / ${slides.slides.length}` : undefined,
  ].filter(Boolean).join(" · ");

  footer.append(author, institute, details);
  canvas.classList.add("frameseq-has-footer");
  canvas.append(footer);
}

/**
 * The presentation's master pages. The slides may come from a FrameSeq built before masters, as
 * a project that pins an older version, or a library not rebuilt yet, makes them: that runtime
 * has no masters, which draws every slide as it always was.
 */
function mastersOf(slides: SlidesRootDefinition): Record<string, FrameSeqNode> {
  return (slides.masters as Record<string, FrameSeqNode> | undefined)
    ?? (slides.node.props.masters as Record<string, FrameSeqNode> | undefined)
    ?? {};
}

/** The master a slide is drawn on: the one it names, or "cover" for a cover and "content" otherwise. */
function slideMaster(slide: FrameSeqNode, slides: SlidesRootDefinition): { name: string; page: FrameSeqNode } | undefined {
  const asked = slide.props.master;
  if (asked === false) return undefined;
  const name = typeof asked === "string" ? asked : hasClass(slide, "frameseq-cover-slide") ? "cover" : "content";
  const page = mastersOf(slides)[name];
  return page ? { name, page } : undefined;
}

const masterFields = /\{(title|subtitle|author|institute|date|page|total|slide)\}/g;

/** A master object with {page}, {title}, and the other fields in its text filled in for one slide. */
function withFields(node: FrameSeqNode, values: Record<string, string>): FrameSeqNode {
  const fill = (value: unknown): unknown => (
    typeof value === "string" ? value.replace(masterFields, (_whole, key: string) => values[key] ?? "") : value
  );
  return {
    ...node,
    props: { ...node.props, content: fill(node.props.content), label: fill(node.props.label) },
    children: node.children.map((child) => withFields(child, values)),
  };
}

/** A length on the slide in canvas units, from pixels or a percentage of `whole`. */
function canvasUnits(value: string | undefined, whole: number): number | undefined {
  const match = value === undefined ? null : /^(-?\d*\.?\d+)(px|%)?$/.exec(value.trim());
  if (!match) return undefined;
  const number = Number(match[1]);
  return match[2] === "%" ? number * whole / 100 : number;
}

/** The rectangle a placeholder covers, or undefined when it was given no position. */
function placeholderBox(node: FrameSeqNode, slides: SlidesRootDefinition): { left: number; top: number; width: number; height: number } | undefined {
  const { canvasWidth: width, canvasHeight: height } = slides;
  const left = canvasUnits(node.styles.left, width);
  const top = canvasUnits(node.styles.top, height);
  if (left === undefined || top === undefined) return undefined;
  return {
    left,
    top,
    width: canvasUnits(node.styles.width, width) ?? width - left,
    height: canvasUnits(node.styles.height, height) ?? height - top,
  };
}

/** Typography a title, subtitle, or author placeholder passes to the text it holds. */
const placeholderTextStyles = [
  "color",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "textAlign",
  "textTransform",
] as const;

/** Give text the placeholder's typography wherever the slide did not set its own. */
function applyPlaceholderText(element: HTMLElement, styles: Record<string, string>): void {
  for (const property of placeholderTextStyles) {
    const value = styles[property];
    if (value && !element.style[property]) element.style[property] = value;
  }
}

/** The text of a slide that a title, subtitle, or author placeholder takes. */
function placeholderText(canvas: HTMLElement, role: string, cover: boolean): HTMLElement | null {
  if (role === "title") {
    return cover
      ? canvas.querySelector<HTMLElement>(".frameseq-cover-title")
      : canvas.querySelector<HTMLElement>(":scope > .frameseq-slide-title");
  }
  if (role === "subtitle") return canvas.querySelector<HTMLElement>(".frameseq-cover-subtitle");
  if (role === "author") return canvas.querySelector<HTMLElement>(".frameseq-cover-author");
  return null;
}

/**
 * Put a slide's own content where its master's placeholders say: everything it holds inside the
 * body placeholder, and its title, subtitle, or author in theirs.
 */
function fillPlaceholder(canvas: HTMLElement, node: FrameSeqNode, slides: SlidesRootDefinition, cover: boolean): void {
  const role = String(node.props.placeholder);
  const box = placeholderBox(node, slides);
  if (role === "body") {
    if (box) {
      const right = slides.canvasWidth - box.left - box.width;
      const bottom = slides.canvasHeight - box.top - box.height;
      canvas.style.padding = `${box.top}px ${right}px ${bottom}px ${box.left}px`;
    }
    for (const property of ["justifyContent", "alignItems", "textAlign"] as const) {
      if (node.styles[property]) canvas.style[property] = node.styles[property];
    }
    return;
  }

  const text = placeholderText(canvas, role, cover);
  if (!text) return;
  applyPlaceholderText(text, node.styles);
  if (!box) return;
  // The master takes over the title, so a theme's title bar would only say it a second time.
  if (role === "title") {
    canvas.querySelector(":scope > .frameseq-theme-title-bar")?.remove();
    canvas.classList.remove("frameseq-has-title-bar");
  }
  const holder = document.createElement("div");
  holder.className = "frameseq-placeholder-box";
  holder.dataset.frameseqPlaceholder = role;
  Object.assign(holder.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    justifyContent: node.styles.justifyContent ?? "center",
    alignItems: node.styles.alignItems ?? "stretch",
  });
  if (!text.style.margin) text.style.margin = "0";
  if (!text.style.maxWidth) text.style.maxWidth = "none";
  holder.append(text);
  canvas.append(holder);
}

/**
 * Draw the slide's master behind it, with its fields filled in for this slide, and move the
 * slide's content into the master's placeholders. The master's objects belong to the master,
 * so nothing on them leads to the source from here, and the slide's own objects stay on top.
 */
function addMaster(canvas: HTMLElement, slide: FrameSeqNode, index: number, slides: SlidesRootDefinition): void {
  const master = slideMaster(slide, slides);
  if (!master) return;
  const values: Record<string, string> = {
    title: slides.title,
    subtitle: slides.subtitle ?? "",
    author: slides.author ?? "",
    institute: slides.institute ?? "",
    date: slides.date ?? "",
    page: String(index + 1),
    total: String(slides.slides.length),
    slide: typeof slide.props.title === "string" ? slide.props.title : "",
  };
  const layer = document.createElement("div");
  layer.className = "frameseq-master-layer";
  layer.dataset.frameseqMaster = master.name;
  layer.setAttribute("aria-hidden", "true");
  applyStyles(layer, master.page.styles);
  const placeholders: FrameSeqNode[] = [];
  for (const [childIndex, child] of master.page.children.entries()) {
    if (typeof child.props.placeholder === "string") placeholders.push(child);
    else layer.append(renderNode(withFields(child, values), `${index}.master.${childIndex}`));
  }
  const sourceAttributes = ["source", "edit", "computed", "move", "statement", "region", "shared", "path", "refers"];
  for (const element of layer.querySelectorAll<HTMLElement>("[data-frameseq-source], [data-frameseq-path]")) {
    for (const name of sourceAttributes) delete element.dataset[`frameseq${name[0].toUpperCase()}${name.slice(1)}`];
  }
  canvas.classList.add("frameseq-has-master");
  canvas.dataset.frameseqMaster = master.name;
  canvas.prepend(layer);
  const cover = hasClass(slide, "frameseq-cover-slide");
  const writesTitle = (node: FrameSeqNode): boolean => (
    [node.props.content, node.props.label].some((value) => typeof value === "string" && value.includes("{title}"))
    || node.children.some(writesTitle)
  );
  if (cover && master.page.children.some(writesTitle)) layer.dataset.frameseqTitlePage = "true";
  for (const placeholder of placeholders) fillPlaceholder(canvas, placeholder, slides, cover);
}

/**
 * Whether FrameSeq's own controls on this page speak Chinese: as the address asks, which is how
 * FrameSeq Studio opens presenter view, its slide show, and the phone remote, or else as the page
 * around this one speaks, such as the Studio around its preview. Elsewhere they speak English.
 */
function speaksChinese(): boolean {
  const asked = new URLSearchParams(location.search).get("lang");
  if (asked) return asked === "zh";
  if (document.documentElement.lang.startsWith("zh")) return true;
  try {
    return window.parent !== window && window.parent.document.documentElement.lang.startsWith("zh");
  } catch {
    // A page around this one from another origin keeps its language to itself.
    return false;
  }
}

/** FrameSeq's own words on a slide page: presenter view, the phone remote, and the preview's controls. */
const englishWords = {
  presenterView: "Presenter view",
  laserTitle: "Toggle laser pointer (Ctrl+L)",
  laser: (on: boolean): string => (on ? "Laser: On" : "Laser: Off"),
  pause: "Pause",
  resume: "Resume",
  reset: "Reset",
  currentSlide: "Current slide",
  presenterDetail: "Presenter detail",
  notes: "Notes",
  nextSlide: "Next slide",
  next: "Next",
  speakerNotes: "Speaker notes",
  notesSmallerTitle: "Smaller notes text (-)",
  notesSmaller: "Smaller speaker notes text",
  notesLargerTitle: "Larger notes text (+)",
  notesLarger: "Larger speaker notes text",
  presenterControls: "Presenter controls",
  previous: "← Previous",
  nextButton: "Next →",
  goTo: "Go to",
  goToSlide: "Go to slide",
  simpleRemote: "Simple remote",
  phoneRemote: "Phone remote",
  fullScreenTitle: "Fill the whole screen with presenter view",
  fullScreen: "Full screen",
  exitFullScreen: "Exit full screen",
  endShowTitle: "End the slide show (Esc)",
  endShow: "End show",
  audienceView: "Open audience view",
  endOfPresentation: "End of presentation",
  end: "End",
  connecting: "Connecting…",
  remoteControls: "Remote controls",
  remoteHint: "Enable the laser, then drag across the slide preview.",
  connected: "Connected",
  waiting: "Waiting for presentation…",
  disconnected: "Disconnected",
  remoteUnavailable: "Local remote unavailable",
  invalidPairing: "Invalid pairing link",
  localNetwork: "Local network",
  pairTitle: "Pair a phone remote",
  close: "Close",
  pairHint: "Connect the phone and this computer to the same Wi-Fi, then scan the code.",
  preparing: "Preparing local address…",
  networkAddress: "Network address",
  copyLink: "Copy link",
  done: "Done",
  pairNote: "Keep the presentation server and this browser page open while presenting.",
  copyUnavailable: "Copy unavailable",
  copied: "Copied",
  copyFailed: "Copy failed",
  noPhoneLink: (reason?: string) => (reason ? `Could not create a phone link: ${reason}` : "Could not create a phone link."),
  arrange: "Arrange selected components",
  alignLeft: "Align left",
  alignCenter: "Align horizontal centres",
  alignRight: "Align right",
  alignTop: "Align top",
  alignMiddle: "Align vertical centres",
  alignBottom: "Align bottom",
  distributeHorizontal: "Distribute horizontally",
  distributeVertical: "Distribute vertically",
  bindRegion: "Bind region",
  selectedAt: (x: number, y: number, width: number, height: number) => `Selected · x ${x} · y ${y} · ${width} × ${height}`,
  selectedFlow: "Selected · flow item · drag to reorder",
  selectedComputed: (code: string) => `Selected · placed by the code: ${code}`,
  selectedLocked: "Selected · layout locked",
  locked: "locked",
  computedPosition: (code: string) => `Placed by the code (${code}), so a drag cannot move it`,
  computedSize: (code: string) => `Sized by the code (${code}), so a drag cannot resize it`,
  computedRotation: (code: string) => `Turned by the code (${code}), so a drag cannot turn it`,
  layoutLockedHint: "Layout locked · unlock it to move or resize objects",
  sharedObject: "Drawn by a loop or a helper with others like it, so a drag cannot move it",
  selectedDetail: (name: string) => `Selected · the presentation's ${name} · double-click to type it`,
  detailNames: { title: "title", subtitle: "subtitle", author: "author", institute: "institute", date: "date" },
  detailDeleted: "Selected · written in presentation(); clear it in Current slide",
  selectedMany: (count: number, label: string) => `${count} selected · ${label}`,
  regionDeleted: "Selected · a region is deleted in the source",
  insideAnother: "Selected · written inside another command; delete it in the source",
  placedByName: (count: number) => `Selected · ${count === 1 ? "another object is" : `${count} objects are`} placed by its name`,
  noLiteral: (axis: "x" | "y") => `Selected · no literal ${axis} coordinate`,
  slideNavigation: "Slide navigation",
  previousSlide: "Previous slide",
  previewZoom: "Preview zoom",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  fitTitle: "Fit slide to window",
  fit: "Fit",
  resetZoom: "Reset slide to 100%",
  pairRemote: "Pair phone remote",
  layoutEditing: "Toggle layout editing",
  layoutEditingTitle: "Drag objects to rewrite their coordinates (Escape to leave)",
  layoutLock: "Lock layout",
  layoutLockTitle: "Lock the layout: objects can still be selected and typed into, but not moved or resized",
  layoutUnlockTitle: "The layout is locked · click to move and resize objects again",
  openPresenter: "Open presenter view",
  canvas: "FrameSeq slide canvas",
  showEnd: "End of slide show. Click to exit.",
  noMasters: "This presentation has no master pages yet.",
  formatBar: "Format the selected words",
  formatBold: "Bold (Ctrl+B)",
  formatItalic: "Italic (Ctrl+I)",
  formatColour: (name: string) => `Colour: ${name}`,
  formatNoColour: "No colour of their own",
  formatColours: {
    accent: "accent", red: "red", orange: "orange", green: "green", teal: "teal", blue: "blue", purple: "purple", gray: "gray",
  } as Record<string, string>,
};

const chineseWords: typeof englishWords = {
  presenterView: "演讲者视图",
  laserTitle: "开关激光笔（Ctrl+L）",
  laser: (on) => (on ? "激光笔：开" : "激光笔：关"),
  pause: "暂停",
  resume: "继续",
  reset: "重置",
  currentSlide: "当前幻灯片",
  presenterDetail: "演讲者详情",
  notes: "备注",
  nextSlide: "下一页",
  next: "下一页",
  speakerNotes: "演讲者备注",
  notesSmallerTitle: "缩小备注文字（-）",
  notesSmaller: "缩小演讲者备注文字",
  notesLargerTitle: "放大备注文字（+）",
  notesLarger: "放大演讲者备注文字",
  presenterControls: "演讲者控制",
  previous: "← 上一页",
  nextButton: "下一页 →",
  goTo: "跳到",
  goToSlide: "跳到幻灯片",
  simpleRemote: "简易遥控",
  phoneRemote: "手机遥控",
  fullScreenTitle: "让演讲者视图铺满整个屏幕",
  fullScreen: "全屏",
  exitFullScreen: "退出全屏",
  endShowTitle: "结束放映（Esc）",
  endShow: "结束放映",
  audienceView: "打开观众视图",
  endOfPresentation: "演示结束",
  end: "结束",
  connecting: "正在连接…",
  remoteControls: "遥控按钮",
  remoteHint: "打开激光笔，然后在幻灯片预览上拖动。",
  connected: "已连接",
  waiting: "等待演示开始…",
  disconnected: "已断开",
  remoteUnavailable: "本地遥控不可用",
  invalidPairing: "配对链接无效",
  localNetwork: "局域网",
  pairTitle: "配对手机遥控",
  close: "关闭",
  pairHint: "让手机和这台电脑连上同一个 Wi-Fi，然后扫描二维码。",
  preparing: "正在准备局域网地址…",
  networkAddress: "网络地址",
  copyLink: "复制链接",
  done: "完成",
  pairNote: "演示期间，请让演示服务器和这个浏览器页面保持打开。",
  copyUnavailable: "无法复制",
  copied: "已复制",
  copyFailed: "复制失败",
  noPhoneLink: (reason) => (reason ? `无法生成手机链接：${reason}` : "无法生成手机链接。"),
  arrange: "排列选中的对象",
  alignLeft: "左对齐",
  alignCenter: "水平居中",
  alignRight: "右对齐",
  alignTop: "顶端对齐",
  alignMiddle: "垂直居中",
  alignBottom: "底端对齐",
  distributeHorizontal: "横向分布",
  distributeVertical: "纵向分布",
  bindRegion: "绑定到区域",
  selectedAt: (x, y, width, height) => `已选中 · x ${x} · y ${y} · ${width} × ${height}`,
  selectedFlow: "已选中 · 随版面排列 · 拖动可调整顺序",
  selectedComputed: (code) => `已选中 · 位置由代码决定：${code}`,
  selectedLocked: "已选中 · 布局已锁定",
  locked: "已锁定",
  computedPosition: (code) => `位置由代码算出（${code}），拖动改不了`,
  computedSize: (code) => `大小由代码算出（${code}），拖动改不了`,
  computedRotation: (code) => `旋转角度由代码算出（${code}），拖动改不了`,
  layoutLockedHint: "布局已锁定 · 解锁后才能移动或缩放对象",
  sharedObject: "它和同类对象由循环或辅助函数画出，拖动改不了",
  selectedDetail: (name) => `已选中 · 演示的${name} · 双击可修改`,
  detailNames: { title: "标题", subtitle: "副标题", author: "作者", institute: "单位", date: "日期" },
  detailDeleted: "已选中 · 它写在 presentation() 里，请在“当前页”里清空",
  selectedMany: (count, label) => `已选中 ${count} 个 · ${label}`,
  regionDeleted: "已选中 · 区域要在代码里删除",
  insideAnother: "已选中 · 它写在另一条命令里，请在代码里删除",
  placedByName: (count) => (count === 1 ? "已选中 · 另一个对象按它的名字定位" : `已选中 · ${count} 个对象按它的名字定位`),
  noLiteral: (axis) => `已选中 · 代码里没有写明 ${axis} 坐标`,
  slideNavigation: "幻灯片导航",
  previousSlide: "上一页",
  previewZoom: "预览缩放",
  zoomOut: "缩小",
  zoomIn: "放大",
  fitTitle: "适应窗口大小",
  fit: "适应",
  resetZoom: "恢复为 100%",
  pairRemote: "配对手机遥控",
  layoutEditing: "开关布局编辑",
  layoutEditingTitle: "拖动对象来改写它们的坐标（按 Esc 退出）",
  layoutLock: "锁定布局",
  layoutLockTitle: "锁定布局：对象仍可选中、改文字，但不能移动或缩放",
  layoutUnlockTitle: "布局已锁定 · 单击后可以重新移动和缩放对象",
  openPresenter: "打开演讲者视图",
  canvas: "FrameSeq 幻灯片画布",
  showEnd: "放映结束，单击鼠标退出。",
  noMasters: "这份演示还没有母版。",
  formatBar: "设置选中文字的格式",
  formatBold: "加粗（Ctrl+B）",
  formatItalic: "斜体（Ctrl+I）",
  formatColour: (name) => `颜色：${name}`,
  formatNoColour: "去掉单独设置的颜色",
  formatColours: {
    accent: "主题强调色", red: "红", orange: "橙", green: "绿", teal: "青", blue: "蓝", purple: "紫", gray: "灰",
  },
};

let chosenWords: typeof englishWords | undefined;

/** The words of this page's own controls, in the language `speaksChinese()` settles on. */
function words(): typeof englishWords {
  chosenWords ??= speaksChinese() ? chineseWords : englishWords;
  return chosenWords;
}

/** A master page's name as an editor shows it. */
function masterLabel(name: string): string {
  const chinese = speaksChinese();
  if (name === "cover") return chinese ? "封面母版" : "Cover master";
  if (name === "content") return chinese ? "内容页母版" : "Content master";
  return chinese ? `母版“${name}”` : `Master “${name}”`;
}

/** What a placeholder shows on its master page, so its box reads as what it will hold. */
function placeholderSample(role: string, master: string, slides: SlidesRootDefinition): { className: string; text: string } {
  const chinese = speaksChinese();
  const cover = master === "cover";
  if (role === "title") {
    return cover
      ? { className: "frameseq-cover-title", text: slides.title }
      : { className: "frameseq-slide-title", text: chinese ? "幻灯片标题" : "Slide title" };
  }
  if (role === "subtitle") return { className: "frameseq-cover-subtitle", text: slides.subtitle || (chinese ? "副标题" : "Subtitle") };
  if (role === "author") return { className: "frameseq-cover-author", text: slides.author || (chinese ? "作者" : "Author") };
  return { className: "frameseq-placeholder-label", text: chinese ? "正文" : "Body" };
}

/**
 * A master page as an editor shows it: its objects where they are drawn, its fields as written,
 * and each placeholder as a dashed box holding sample text in the placeholder's typography.
 */
function renderMasterCanvas(page: FrameSeqNode, index: number, slides: SlidesRootDefinition): HTMLElement {
  const name = String(page.props.masterPage);
  const canvas = renderNode(page, `master.${index}`);
  canvas.classList.add(name === "cover" ? "frameseq-cover-slide" : "frameseq-content-slide");
  canvas.dataset.frameseqMasterPage = name;
  canvas.dataset.frameseqSlideLabel = masterLabel(name);
  const statement = page.props.sourceStatement as { start: number; end: number } | undefined;
  if (statement) canvas.dataset.frameseqSlideStatement = `${statement.start}:${statement.end}`;
  const placeholders = page.children.filter((child) => typeof child.props.placeholder === "string");
  const boxes = canvas.querySelectorAll<HTMLElement>(":scope > .frameseq-placeholder");
  for (const [boxIndex, box] of boxes.entries()) {
    const node = placeholders[boxIndex];
    if (!node) continue;
    const role = String(node.props.placeholder);
    box.dataset.frameseqPlaceholder = role;
    const sample = placeholderSample(role, name, slides);
    const text = document.createElement("div");
    text.className = `frameseq-text frameseq-placeholder-sample ${sample.className}`;
    text.textContent = sample.text;
    if (role !== "body") applyPlaceholderText(text, node.styles);
    box.append(text);
  }
  canvas.setAttribute("role", "group");
  canvas.setAttribute("aria-roledescription", "master");
  canvas.setAttribute("aria-label", masterLabel(name));
  return canvas;
}

function slideLabel(slide: FrameSeqNode, index: number): string {
  const label = typeof slide.props.title === "string"
    ? slide.props.title
    : typeof slide.props.name === "string"
      ? slide.props.name
      : undefined;
  return label ?? `Slide ${index + 1}`;
}

function renderSlideCanvas(
  slide: FrameSeqNode,
  index: number,
  slides: SlidesRootDefinition,
): HTMLElement {
  const label = slideLabel(slide, index);
  const canvas = renderNode(slide, String(index));
  addThemeChrome(canvas, slide, index, slides);
  addMaster(canvas, slide, index, slides);
  canvas.dataset.frameseqSlideLabel = label;
  // The top-level statement that made the slide, which a loop or a helper shares between several.
  const statement = slide.props.sourceStatement as { start: number; end: number } | undefined;
  if (statement) canvas.dataset.frameseqSlideStatement = `${statement.start}:${statement.end}`;
  if (slide.props.allowEmpty === true) {
    canvas.dataset.frameseqAllowEmpty = "true";
  }
  canvas.setAttribute("role", "group");
  canvas.setAttribute("aria-roledescription", "slide");
  canvas.setAttribute(
    "aria-label",
    `${index + 1} of ${slides.slides.length}: ${label}`,
  );
  return canvas;
}

function scaleCanvas(canvas: HTMLElement, frame: HTMLElement, slides: SlidesRootDefinition): void {
  const frameWidth = frame.clientWidth;
  const frameHeight = frame.clientHeight;
  const scale = Math.min(frameWidth / slides.canvasWidth, frameHeight / slides.canvasHeight);
  canvas.style.left = `${(frameWidth - slides.canvasWidth) / 2}px`;
  canvas.style.top = `${(frameHeight - slides.canvasHeight) / 2}px`;
  canvas.style.transform = `scale(${scale})`;
}

/** Keep the visible audience page itself at the presentation ratio inside any browser pane. */
function fitAudienceFrame(
  frame: HTMLElement,
  host: HTMLElement,
  slides: SlidesRootDefinition,
  requestedScale?: number,
  edgeToEdge = false,
): number {
  // A slide show has no controls to leave room for, and fills the screen.
  const horizontalMargin = edgeToEdge ? 0 : 18;
  const topMargin = edgeToEdge ? 0 : 18;
  const controlsSpace = edgeToEdge ? 0 : 58;
  const availableWidth = Math.max(host.clientWidth - horizontalMargin * 2, 1);
  const availableHeight = Math.max(host.clientHeight - topMargin - controlsSpace, 1);
  const scale = Math.min(
    availableWidth / slides.canvasWidth,
    availableHeight / slides.canvasHeight,
  );
  const appliedScale = requestedScale ?? scale;
  const width = slides.canvasWidth * appliedScale;
  const height = slides.canvasHeight * appliedScale;

  frame.style.inset = "auto";
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.style.left = `${(host.clientWidth - width) / 2}px`;
  frame.style.top = `${topMargin + (availableHeight - height) / 2}px`;
  return appliedScale;
}

interface PresenterElements {
  shell: HTMLElement;
  currentHost: HTMLElement;
  nextFrame: HTMLElement;
  nextLabel: HTMLElement;
  notes: HTMLElement;
  notesSmaller: HTMLButtonElement;
  notesLarger: HTMLButtonElement;
  notesScaleValue: HTMLElement;
  currentLabel: HTMLElement;
  counter: HTMLElement;
  pageSelect: HTMLSelectElement;
  timer: HTMLElement;
  timerToggle: HTMLButtonElement;
  laserToggle: HTMLButtonElement;
  controls: HTMLElement;
}

interface RemoteElements {
  shell: HTMLElement;
  currentHost: HTMLElement;
  currentLabel: HTMLElement;
  counter: HTMLElement;
  status: HTMLElement;
  laserToggle: HTMLButtonElement;
  controls: HTMLElement;
}

type SyncMessage = {
  type: "request-state";
} | {
  type: "navigation";
  slide: number;
  step: number;
} | {
  type: "pointer";
  slide: number;
  x: number;
  y: number;
  visible: boolean;
} | {
  /** Presenter view beside a FrameSeq Studio slide show asks the show to end. */
  type: "end-show";
};

interface RemoteEnvelope {
  session: string;
  sender: string;
  message: SyncMessage;
}

function createPresenterView(
  target: HTMLElement,
  root: HTMLElement,
  slides: SlidesRootDefinition,
): PresenterElements {
  const pairedRemote = localRemoteAvailable
    && Boolean(new URLSearchParams(location.search).get("session"));
  // Beside FrameSeq Studio's slide show there is no audience view to open, only a show to end.
  const besideShow = new URLSearchParams(location.search).has("show");
  const w = words();
  const shell = document.createElement("main");
  shell.className = "frameseq-presenter";
  shell.dataset.mobilePanel = "notes";
  shell.innerHTML = `
    <header class="frameseq-presenter-header">
      <div>
        <div class="frameseq-presenter-kicker">${w.presenterView}</div>
        <div class="frameseq-presenter-title"></div>
      </div>
      <div class="frameseq-presenter-timer-group">
        <button type="button" data-action="laser-toggle" aria-pressed="false" title="${w.laserTitle}">${w.laser(false)}</button>
        <span class="frameseq-presenter-timer" aria-live="off">00:00</span>
        <button type="button" data-action="timer-toggle">${w.pause}</button>
        <button type="button" data-action="timer-reset">${w.reset}</button>
      </div>
    </header>
    <section class="frameseq-presenter-current" aria-label="${w.currentSlide}"></section>
    <aside class="frameseq-presenter-side">
      <div class="frameseq-presenter-mobile-tabs" role="tablist" aria-label="${w.presenterDetail}">
        <button type="button" role="tab" data-action="mobile-panel" data-panel="notes" aria-selected="true">${w.notes}</button>
        <button type="button" role="tab" data-action="mobile-panel" data-panel="next" aria-selected="false">${w.nextSlide}</button>
      </div>
      <section class="frameseq-presenter-next">
        <div class="frameseq-presenter-section-heading">
          <span>${w.next}</span>
          <span class="frameseq-presenter-next-label"></span>
        </div>
        <div class="frameseq-presenter-next-frame"></div>
      </section>
      <section class="frameseq-presenter-notes-panel">
        <div class="frameseq-presenter-section-heading">
          <span>${w.speakerNotes}</span>
          <span class="frameseq-presenter-notes-size">
            <button type="button" data-action="notes-smaller" title="${w.notesSmallerTitle}" aria-label="${w.notesSmaller}">A−</button>
            <span class="frameseq-presenter-notes-size-value" aria-live="off">100%</span>
            <button type="button" data-action="notes-larger" title="${w.notesLargerTitle}" aria-label="${w.notesLarger}">A+</button>
          </span>
        </div>
        <div class="frameseq-presenter-notes"></div>
      </section>
    </aside>
    <nav class="frameseq-presenter-controls" aria-label="${w.presenterControls}">
      <button type="button" data-action="previous">${w.previous}</button>
      <span class="frameseq-counter"></span>
      <button type="button" data-action="next">${w.nextButton}</button>
      <label>
        <span>${w.goTo}</span>
        <select class="frameseq-presenter-page-select" aria-label="${w.goToSlide}"></select>
      </label>
      ${localRemoteAvailable
        ? `<button type="button" data-action="${pairedRemote ? "remote-here" : "remote-pair"}">${pairedRemote ? w.simpleRemote : w.phoneRemote}</button>`
        : ""}
      ${document.fullscreenEnabled
        ? `<button type="button" data-action="presenter-fullscreen" aria-pressed="false" title="${w.fullScreenTitle}">${w.fullScreen}</button>`
        : ""}
      ${besideShow
        ? `<button type="button" data-action="end-show" title="${w.endShowTitle}">${w.endShow}</button>`
        : `<button type="button" data-action="audience">${w.audienceView}</button>`}
    </nav>
  `;

  const required = <T extends Element>(selector: string): T => {
    const element = shell.querySelector<T>(selector);
    if (!element) throw new Error(`Presenter view is missing ${selector}`);
    return element;
  };

  required<HTMLElement>(".frameseq-presenter-title").textContent = slides.title;
  const currentHost = required<HTMLElement>(".frameseq-presenter-current");
  currentHost.append(root);
  const pageSelect = required<HTMLSelectElement>(".frameseq-presenter-page-select");
  slides.slides.forEach((slide, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${slideLabel(slide, index)}`;
    pageSelect.append(option);
  });
  target.append(shell);

  return {
    shell,
    currentHost,
    nextFrame: required<HTMLElement>(".frameseq-presenter-next-frame"),
    nextLabel: required<HTMLElement>(".frameseq-presenter-next-label"),
    notes: required<HTMLElement>(".frameseq-presenter-notes"),
    notesSmaller: required<HTMLButtonElement>("[data-action='notes-smaller']"),
    notesLarger: required<HTMLButtonElement>("[data-action='notes-larger']"),
    notesScaleValue: required<HTMLElement>(".frameseq-presenter-notes-size-value"),
    currentLabel: required<HTMLElement>(".frameseq-presenter-title"),
    counter: required<HTMLElement>(".frameseq-counter"),
    pageSelect,
    timer: required<HTMLElement>(".frameseq-presenter-timer"),
    timerToggle: required<HTMLButtonElement>("[data-action='timer-toggle']"),
    laserToggle: required<HTMLButtonElement>("[data-action='laser-toggle']"),
    controls: required<HTMLElement>(".frameseq-presenter-controls"),
  };
}

function createRemoteView(
  target: HTMLElement,
  root: HTMLElement,
  slides: SlidesRootDefinition,
): RemoteElements {
  const w = words();
  const shell = document.createElement("main");
  shell.className = "frameseq-remote";
  shell.innerHTML = `
    <header class="frameseq-remote-header">
      <div>
        <div class="frameseq-remote-kicker">${w.phoneRemote}</div>
        <div class="frameseq-remote-title"></div>
      </div>
      <div class="frameseq-remote-header-actions">
        <div class="frameseq-remote-status is-waiting">${w.connecting}</div>
        <button type="button" data-action="presenter-here">${w.presenterView}</button>
      </div>
    </header>
    <section class="frameseq-remote-current" aria-label="${w.currentSlide}"></section>
    <div class="frameseq-remote-slide-label"></div>
    <nav class="frameseq-remote-controls" aria-label="${w.remoteControls}">
      <button type="button" data-action="previous">${w.previous}</button>
      <span class="frameseq-counter"></span>
      <button type="button" data-action="next">${w.nextButton}</button>
      <button type="button" class="frameseq-remote-laser" data-action="laser-toggle" aria-pressed="false">${w.laser(false)}</button>
    </nav>
    <p class="frameseq-remote-hint">${w.remoteHint}</p>
  `;

  const required = <T extends Element>(selector: string): T => {
    const element = shell.querySelector<T>(selector);
    if (!element) throw new Error(`Phone remote is missing ${selector}`);
    return element;
  };

  required<HTMLElement>(".frameseq-remote-title").textContent = slides.title;
  const currentHost = required<HTMLElement>(".frameseq-remote-current");
  currentHost.append(root);
  target.append(shell);

  return {
    shell,
    currentHost,
    currentLabel: required<HTMLElement>(".frameseq-remote-slide-label"),
    counter: required<HTMLElement>(".frameseq-counter"),
    status: required<HTMLElement>(".frameseq-remote-status"),
    laserToggle: required<HTMLButtonElement>("[data-action='laser-toggle']"),
    controls: required<HTMLElement>(".frameseq-remote-controls"),
  };
}

function createRemoteSession(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "[::1]";
}

function controllerUrl(origin: string, session: string): string {
  const source = new URL(location.href);
  const networkOrigin = new URL(origin);
  source.protocol = networkOrigin.protocol;
  source.host = networkOrigin.host;
  source.searchParams.delete("presenter");
  source.searchParams.delete("print");
  source.searchParams.set("remote", "1");
  source.searchParams.set("session", session);
  if (speaksChinese()) source.searchParams.set("lang", "zh");
  source.hash = "";
  return source.href;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const presentationFontVariables = [
  "--frameseq-body-font-size",
  "--frameseq-body-font-weight",
  "--frameseq-body-line-height",
  "--frameseq-heading-font-size",
  "--frameseq-heading-font-weight",
  "--frameseq-heading-line-height",
  "--frameseq-code-font-size",
  "--frameseq-code-font-weight",
  "--frameseq-code-line-height",
] as const;

function fontLength(value: Length): string {
  return typeof value === "number" ? `${value}px` : value;
}

function applyPresentationFont(font: PresentationFontOptions | undefined): void {
  const styles = document.documentElement.style;
  for (const variable of presentationFontVariables) {
    styles.removeProperty(variable);
  }
  if (!font) return;

  if (font.family !== undefined) {
    styles.setProperty("--frameseq-font-body", font.family);
    styles.setProperty("--frameseq-font-heading", font.family);
  }
  if (font.heading?.family !== undefined) {
    styles.setProperty("--frameseq-font-heading", font.heading.family);
  }
  if (font.code?.family !== undefined) {
    styles.setProperty("--frameseq-font-mono", font.code.family);
  }

  const values: Array<[string, string | undefined]> = [
    ["--frameseq-body-font-size", font.size === undefined ? undefined : fontLength(font.size)],
    ["--frameseq-body-font-weight", font.weight === undefined ? undefined : String(font.weight)],
    ["--frameseq-body-line-height", font.lineHeight === undefined ? undefined : String(font.lineHeight)],
    ["--frameseq-heading-font-size", font.heading?.size === undefined ? undefined : fontLength(font.heading.size)],
    ["--frameseq-heading-font-weight", font.heading?.weight === undefined ? undefined : String(font.heading.weight)],
    ["--frameseq-heading-line-height", font.heading?.lineHeight === undefined ? undefined : String(font.heading.lineHeight)],
    ["--frameseq-code-font-size", font.code?.size === undefined ? undefined : fontLength(font.code.size)],
    ["--frameseq-code-font-weight", font.code?.weight === undefined ? undefined : String(font.code.weight)],
    ["--frameseq-code-line-height", font.code?.lineHeight === undefined ? undefined : String(font.code.lineHeight)],
  ];
  for (const [name, value] of values) {
    if (value !== undefined) styles.setProperty(name, value);
  }
}

interface SourceTarget {
  line: number;
  column: number;
  start: number;
  end: number;
}

interface StoredPreviewSelection {
  slideIndex: number;
  targets: Array<Pick<SourceTarget, "line" | "column">>;
}

function readPreviewSelection(): StoredPreviewSelection | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(previewSelectionKey) ?? "null") as unknown;
    if (!value || typeof value !== "object") return undefined;
    const candidate = value as Partial<StoredPreviewSelection>;
    if (!Number.isInteger(candidate.slideIndex) || !Array.isArray(candidate.targets)) return undefined;
    const targets = candidate.targets.filter((target): target is Pick<SourceTarget, "line" | "column"> => (
      Boolean(target)
      && typeof target === "object"
      && Number.isInteger((target as { line?: unknown }).line)
      && Number.isInteger((target as { column?: unknown }).column)
    ));
    return targets.length > 0
      ? { slideIndex: candidate.slideIndex as number, targets }
      : undefined;
  } catch {
    return undefined;
  }
}

function storePreviewSelection(selection?: StoredPreviewSelection): void {
  try {
    if (selection) sessionStorage.setItem(previewSelectionKey, JSON.stringify(selection));
    else sessionStorage.removeItem(previewSelectionKey);
  } catch {
    // Selection persistence is a convenience; restricted storage must not break editing.
  }
}

const arrangeActions = [
  "align-left",
  "align-center",
  "align-right",
  "align-top",
  "align-middle",
  "align-bottom",
  "distribute-horizontal",
  "distribute-vertical",
] as const;

type ArrangeAction = (typeof arrangeActions)[number];

const orderActions = ["bring-to-front", "bring-forward", "send-backward", "send-to-back"] as const;

type OrderAction = (typeof orderActions)[number];

function parseSourceTarget(descriptor: string): SourceTarget | undefined {
  const [line, column, start, end] = descriptor.split(":").map(Number);
  if (![line, column, start, end].every((value) => Number.isFinite(value))) return undefined;
  return { line, column, start, end };
}

/** The slide document's path on the development server, asked for once and remembered. */
let entryPath: string | undefined;

async function slideEntryPath(): Promise<string | undefined> {
  if (entryPath === undefined) {
    try {
      const response = await fetch("/__frameseq/source-info", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { entry?: unknown };
      entryPath = typeof data.entry === "string" ? data.entry : "";
    } catch {
      entryPath = "";
    }
  }
  return entryPath || undefined;
}

/** Ask the editor to show the command that produced an object in the preview. */
async function revealSource(target: SourceTarget): Promise<void> {
  // Inside the Visual Studio Code preview the surrounding webview reaches the editor directly.
  if (window.parent !== window) {
    window.parent.postMessage({ type: "frameseq.reveal", ...target }, "*");
    return;
  }

  const entry = await slideEntryPath();
  if (!entry) return;
  const file = `${entry}:${target.line}:${target.column}`;
  await fetch(`/__open-in-editor?file=${encodeURIComponent(file)}`).catch(() => undefined);
}

/**
 * Alt-click any object in the live preview to open the line that wrote it. `startEditing` turns
 * layout editing on, which selecting an object from FrameSeq Studio's menu needs.
 */
function enableSourceReveal(
  root: HTMLElement,
  navigate?: (index: number) => void,
  signal?: AbortSignal,
  startEditing?: () => void,
): void {
  let focused: HTMLElement | undefined;
  const selected = new Set<HTMLElement>();
  let selectionSlideIndex: number | undefined;
  document.querySelectorAll(".frameseq-selection-toolbar, .frameseq-selection-coordinates")
    .forEach((element) => element.remove());
  const w = words();
  const selectionToolbar = document.createElement("div");
  selectionToolbar.className = "frameseq-selection-toolbar";
  selectionToolbar.innerHTML = `
    <span class="frameseq-selection-path"></span>
    <span class="frameseq-selection-tools" aria-label="${w.arrange}">
      <button type="button" data-action="align-left" title="${w.alignLeft}" aria-label="${w.alignLeft}">↤</button>
      <button type="button" data-action="align-center" title="${w.alignCenter}" aria-label="${w.alignCenter}">↔</button>
      <button type="button" data-action="align-right" title="${w.alignRight}" aria-label="${w.alignRight}">↦</button>
      <button type="button" data-action="align-top" title="${w.alignTop}" aria-label="${w.alignTop}">↥</button>
      <button type="button" data-action="align-middle" title="${w.alignMiddle}" aria-label="${w.alignMiddle}">↕</button>
      <button type="button" data-action="align-bottom" title="${w.alignBottom}" aria-label="${w.alignBottom}">↧</button>
      <button type="button" data-action="distribute-horizontal" title="${w.distributeHorizontal}" aria-label="${w.distributeHorizontal}">H⋯</button>
      <button type="button" data-action="distribute-vertical" title="${w.distributeVertical}" aria-label="${w.distributeVertical}">V⋮</button>
    </span>
    <button type="button" data-action="bind-region">${w.bindRegion}</button>
  `;
  document.body.append(selectionToolbar);
  const selectionCoordinates = document.createElement("div");
  selectionCoordinates.className = "frameseq-selection-coordinates";
  document.body.append(selectionCoordinates);
  let keyboardNudge: {
    elements: HTMLElement[];
    fields: SourceFields[];
    dx: number;
    dy: number;
    timer?: ReturnType<typeof setTimeout>;
  } | undefined;
  const focusCanvas = (): void => {
    root.focus({ preventScroll: true });
    setTimeout(() => root.focus({ preventScroll: true }), 0);
  };

  const clearFocused = (): void => {
    focused?.classList.remove("is-frameseq-source-focus");
    focused = undefined;
  };
  const clearSelection = (clearStored = true): void => {
    selected.forEach((element) => element.classList.remove("is-frameseq-selected"));
    selected.clear();
    selectionSlideIndex = undefined;
    if (clearStored) storePreviewSelection();
    selectionToolbar.classList.remove("is-visible");
    selectionCoordinates.classList.remove("is-visible");
    dispatchEvent(new CustomEvent("frameseq-selection-change"));
  };
  const showCoordinates = (element?: HTMLElement, override?: Record<string, number>): void => {
    if (!element || selected.size !== 1 || !selected.has(element)) {
      selectionCoordinates.classList.remove("is-visible");
      return;
    }
    const fields = parseSourceFields(element) ?? {};
    const box = element.getBoundingClientRect();
    const canvas = element.closest<HTMLElement>(".frameseq-slide");
    const scale = elementCanvasScale(element);
    const canvasBox = canvas?.getBoundingClientRect();
    const x = override?.x ?? fields.x?.value
      ?? (canvasBox ? (box.left - canvasBox.left) / scale : 0);
    const y = override?.y ?? fields.y?.value
      ?? (canvasBox ? (box.top - canvasBox.top) / scale : 0);
    const width = override?.width ?? fields.width?.value ?? box.width / scale;
    const height = override?.height ?? fields.height?.value ?? box.height / scale;
    const positioned = Boolean(fields.x && fields.y);
    const computed = parseSourceComputed(element) ?? {};
    const placedByCode = !positioned && (computed.x ?? computed.y);
    const locked = document.documentElement.classList.contains("frameseq-layout-locked");
    if (positioned) {
      const turn = override?.rotate ?? fields.rotate?.value;
      const at = `${w.selectedAt(Math.round(x), Math.round(y), Math.round(width), Math.round(height))}${turn ? ` · ${Math.round(turn)}°` : ""}`;
      selectionCoordinates.textContent = locked ? `${at} · ${w.locked}` : at;
    } else {
      selectionCoordinates.textContent = placedByCode ? w.selectedComputed(placedByCode) : locked ? w.selectedLocked : w.selectedFlow;
    }
    selectionCoordinates.classList.toggle("is-readonly", !positioned || locked);
    selectionCoordinates.style.left = `${Math.max(8, Math.min(innerWidth - 220, box.left))}px`;
    // Above the handle that turns the object, where it has one, so the label never covers it.
    const turnable = !locked && (Boolean(fields.rotate) || (inStudioPreview() && positioned));
    selectionCoordinates.style.top = `${Math.max(8, box.top - (turnable ? 60 : 32))}px`;
    selectionCoordinates.classList.add("is-visible");
  };
  const selectionLabel = (element: HTMLElement): string => {
    const parts = [...element.closest(".frameseq-slide")?.querySelectorAll<HTMLElement>("[data-frameseq-name]") ?? []]
      .filter((candidate) => candidate === element || candidate.contains(element))
      .map((candidate) => candidate.dataset.frameseqName as string);
    const own = element.dataset.frameseqName ?? element.dataset.frameseqNode ?? "component";
    if (parts.at(-1) !== own) parts.push(own);
    return parts.join(" / ");
  };
  const hasNestedSelection = (elements: HTMLElement[]): boolean => elements.some((element) => (
    elements.some((candidate) => candidate !== element && element.contains(candidate))
  ));
  const canArrange = (elements: HTMLElement[], axis: "x" | "y", minimum = 2): boolean => (
    elements.length >= minimum
    && !hasNestedSelection(elements)
    && elements.every((element) => Boolean(parseSourceFields(element)?.[axis]))
  );
  const updateArrangeButtons = (elements: HTMLElement[]): void => {
    const horizontal = canArrange(elements, "x");
    const vertical = canArrange(elements, "y");
    selectionToolbar.querySelectorAll<HTMLButtonElement>("[data-action^='align-']")
      .forEach((button) => {
        const action = button.dataset.action ?? "";
        button.disabled = action === "align-left" || action === "align-center" || action === "align-right"
          ? !horizontal
          : !vertical;
      });
    const distributeHorizontal = selectionToolbar.querySelector<HTMLButtonElement>(
      '[data-action="distribute-horizontal"]',
    );
    const distributeVertical = selectionToolbar.querySelector<HTMLButtonElement>(
      '[data-action="distribute-vertical"]',
    );
    if (distributeHorizontal) distributeHorizontal.disabled = !canArrange(elements, "x", 3);
    if (distributeVertical) distributeVertical.disabled = !canArrange(elements, "y", 3);
  };
  const notifySelection = (): void => {
    const elements = [...selected];
    const targets = elements
      .map((element) => parseSourceTarget(element.dataset.frameseqSource ?? ""))
      .filter((target): target is SourceTarget => Boolean(target));
    const frame = elements.at(-1)?.closest<HTMLElement>(".frameseq-slide-frame");
    const slideIndex = Number(frame?.dataset.index);
    selectionSlideIndex = Number.isInteger(slideIndex) ? slideIndex : undefined;
    if (selectionSlideIndex !== undefined && targets.length > 0) {
      storePreviewSelection({
        slideIndex: selectionSlideIndex,
        targets: targets.map(({ line, column }) => ({ line, column })),
      });
    } else {
      storePreviewSelection();
    }
    if (targets.length < 2) {
      selectionToolbar.classList.remove("is-visible");
      showCoordinates(elements[0]);
    } else {
      selectionCoordinates.classList.remove("is-visible");
      const primary = elements.at(-1) as HTMLElement;
      const path = selectionToolbar.querySelector<HTMLElement>(".frameseq-selection-path");
      if (path) path.textContent = w.selectedMany(targets.length, selectionLabel(primary));
      updateArrangeButtons(elements);
      selectionToolbar.classList.add("is-visible");
    }
    const bind = selectionToolbar.querySelector<HTMLButtonElement>('[data-action="bind-region"]');
    if (bind) bind.hidden = targets.length < 2;
    dispatchEvent(new CustomEvent("frameseq-selection-change"));
    if (window.parent !== window) {
      window.parent.postMessage({ type: "frameseq.select", targets }, "*");
    }
  };
  const focusSource = (message: unknown): void => {
    const request = message as {
      type?: unknown;
      line?: unknown;
      column?: unknown;
      name?: unknown;
      path?: unknown;
      slideIndex?: unknown;
      clear?: unknown;
    } | null;
    if (request?.type !== "frameseq.focus-source") return;

    if (request.clear === true) {
      clearFocused();
      return;
    }
    clearFocused();
    if (typeof request.slideIndex === "number") navigate?.(request.slideIndex - 1);

    const scope = root.querySelector<HTMLElement>(".frameseq-slide-frame.is-active") ?? root;
    let match: HTMLElement | undefined;
    if (typeof request.name === "string") {
      match = [...scope.querySelectorAll<HTMLElement>("[data-frameseq-name]")]
        .find((element) => element.dataset.frameseqName === request.name);
    } else if (typeof request.path === "string") {
      match = [...scope.querySelectorAll<HTMLElement>("[data-frameseq-path]")]
        .find((element) => element.dataset.frameseqPath === request.path);
    } else if (typeof request.line === "number") {
      const candidates = [...scope.querySelectorAll<HTMLElement>("[data-frameseq-source]")];
      match = candidates.find((element) => {
        const target = parseSourceTarget(element.dataset.frameseqSource ?? "");
        if (!target) return false;
        return target.line === request.line
          && (typeof request.column !== "number" || target.column === request.column);
      }) ?? candidates.find((element) => (
        parseSourceTarget(element.dataset.frameseqSource ?? "")?.line === request.line
      ));
    }
    if (!match) return;
    // The editor has moved on to another object, so the selection here does not come back to
    // claim it when the slide is next redrawn.
    if (selected.size > 0 && !selected.has(match)) clearSelection();
    focused = match;
    focused.classList.add("is-frameseq-source-focus");
    focused.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  addEventListener("message", (event) => focusSource(event.data), { signal });

  /**
   * Drag across the slide's empty part to draw a box, and select the objects wholly inside it,
   * as a drawing program does; Ctrl or Shift adds them to what is selected already. The click
   * that ends the drag selects nothing more.
   */
  let marquee: { pointerId: number; x: number; y: number; add: boolean; box?: HTMLElement } | undefined;
  let swallowClick = false;
  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.altKey || placingKind || typingSession || !(event.target instanceof Element)) return;
    if (!document.documentElement.classList.contains("frameseq-edit-mode")) return;
    const active = root.querySelector<HTMLElement>(".frameseq-slide-frame.is-active");
    if (!active?.contains(event.target)) return;
    const hit = event.target.closest<HTMLElement>("[data-frameseq-source]");
    if ((hit && !hit.classList.contains("frameseq-slide")) || event.target.closest("[data-frameseq-meta], .frameseq-edit-handle")) return;
    marquee = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, add: event.ctrlKey || event.metaKey || event.shiftKey };
  }, { signal });
  addEventListener("pointermove", (event) => {
    if (!marquee || event.pointerId !== marquee.pointerId) return;
    if (!marquee.box && Math.hypot(event.clientX - marquee.x, event.clientY - marquee.y) < dragThreshold) return;
    if (!marquee.box) {
      marquee.box = document.createElement("div");
      marquee.box.className = "frameseq-marquee";
      marquee.box.setAttribute("aria-hidden", "true");
      document.body.append(marquee.box);
      // The box follows the pointer past the slide's edge, and ends where the pointer is let go.
      try {
        root.setPointerCapture(event.pointerId);
      } catch {
        // Without capture, the box simply ends when the pointer comes back.
      }
    }
    Object.assign(marquee.box.style, {
      left: `${Math.min(marquee.x, event.clientX)}px`,
      top: `${Math.min(marquee.y, event.clientY)}px`,
      width: `${Math.abs(event.clientX - marquee.x)}px`,
      height: `${Math.abs(event.clientY - marquee.y)}px`,
    });
  }, { signal });
  const endMarquee = (event: PointerEvent): void => {
    if (!marquee || event.pointerId !== marquee.pointerId) return;
    const { box, add } = marquee;
    marquee = undefined;
    if (!box) return;
    const area = box.getBoundingClientRect();
    box.remove();
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    const active = root.querySelector<HTMLElement>(".frameseq-slide-frame.is-active");
    const inside = [...active?.querySelectorAll<HTMLElement>("[data-frameseq-source]") ?? []].filter((element) => {
      if (element.classList.contains("frameseq-slide") || element.closest(".frameseq-master-layer")) return false;
      const rect = element.getBoundingClientRect();
      return rect.width + rect.height > 0 && rect.left >= area.left && rect.top >= area.top
        && rect.right <= area.right && rect.bottom <= area.bottom;
    });
    // An object inside another one that is selected goes with it.
    const outermost = inside.filter((element) => !inside.some((other) => other !== element && other.contains(element)));
    clearFocused();
    if (!add) clearSelection();
    for (const element of outermost) {
      selected.add(element);
      element.classList.add("is-frameseq-selected");
    }
    focusCanvas();
    if (selected.size > 0) notifySelection();
  };
  addEventListener("pointerup", endMarquee, { signal });
  addEventListener("pointercancel", endMarquee, { signal });
  signal?.addEventListener("abort", () => marquee?.box?.remove(), { once: true });

  root.addEventListener("click", (event) => {
    if (event.button !== 0) return;
    // The click that ends drawing a selection box selects nothing more.
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    // A click in words being typed places the caret there.
    if (event.target instanceof Element && event.target.closest(".is-frameseq-typing")) return;
    // The presentation's details on a cover are selected like an object, and lead to presentation().
    const detail = inStudio && event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-frameseq-meta]")
      : null;
    if (detail) {
      event.preventDefault();
      event.stopPropagation();
      selectDetail(detail, event.altKey ? "reveal" : "select");
      return;
    }
    const element = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-frameseq-source]")
      : undefined;
    const target = element && parseSourceTarget(element.dataset.frameseqSource ?? "");
    if (!target) {
      clearFocused();
      if (document.documentElement.classList.contains("frameseq-edit-mode")) clearSelection();
      return;
    }
    if (!event.altKey && document.documentElement.classList.contains("frameseq-edit-mode")) {
      clearFocused();
      if (element.classList.contains("frameseq-slide")) {
        clearSelection();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) clearSelection();
      if (selected.has(element)) {
        selected.delete(element);
        element.classList.remove("is-frameseq-selected");
      } else {
        selected.add(element);
        element.classList.add("is-frameseq-selected");
      }
      focusCanvas();
      event.preventDefault();
      event.stopPropagation();
      notifySelection();
      return;
    }
    if (!event.altKey) {
      clearFocused();
      return;
    }
    clearFocused();
    focused = element;
    focused.classList.add("is-frameseq-source-focus");
    event.preventDefault();
    event.stopPropagation();
    void revealSource(target);
  });

  selectionToolbar.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("button[data-action]")
      : null;
    if (!button || button.disabled || selected.size < 2) return;
    focusCanvas();
    const targets = [...selected]
      .map((element) => parseSourceTarget(element.dataset.frameseqSource ?? ""))
      .filter((target): target is SourceTarget => Boolean(target));
    if (button.dataset.action === "bind-region" && window.parent !== window) {
      window.parent.postMessage({ type: "frameseq.bind-selection", targets }, "*");
      return;
    }
    arrangeSelected([...selected], button.dataset.action as ArrangeAction);
  });

  addEventListener("frameseq-editing-change", ((event: CustomEvent<boolean>) => {
    if (!event.detail) clearSelection();
  }) as EventListener, { signal });
  addEventListener("frameseq-slide-change", ((event: CustomEvent<number>) => {
    clearFocused();
    if (selectionSlideIndex !== undefined && selectionSlideIndex !== event.detail) clearSelection();
  }) as EventListener, { signal });
  const explain = (message: string): void => {
    selectionCoordinates.textContent = message;
    selectionCoordinates.classList.add("is-visible", "is-readonly");
  };
  /**
   * Delete the selected objects by removing the lines that write them, as a drawing program
   * deletes shapes. A connector that ends at one of them goes too, since it would point at
   * nothing; an object placed by one of their names keeps them, and says why.
   */
  const deleteSelected = (): void => {
    const elements = [...selected];
    if (elements.some((element) => element.dataset.frameseqMeta)) {
      explain(w.detailDeleted);
      return;
    }
    if (elements.some((element) => ["row", "column", "stack", "slide"].includes(element.dataset.frameseqNode ?? ""))) {
      explain(w.regionDeleted);
      return;
    }
    if (elements.some((element) => !parseSourceStatement(element))) {
      explain(w.insideAnother);
      return;
    }
    const names = new Set(elements.map((element) => element.dataset.frameseqName).filter(Boolean));
    const doomed = new Set(elements);
    const dependents: HTMLElement[] = [];
    const canvas = elements[0]?.closest<HTMLElement>(".frameseq-slide");
    for (const other of canvas?.querySelectorAll<HTMLElement>("[data-frameseq-refers]") ?? []) {
      if (doomed.has(other)) continue;
      const refers = (other.dataset.frameseqRefers ?? "").split(" ").some((name) => names.has(name));
      if (!refers) continue;
      if (other.dataset.frameseqNode === "line" && parseSourceStatement(other)) doomed.add(other);
      else dependents.push(other);
    }
    if (dependents.length > 0) {
      explain(w.placedByName(dependents.length));
      return;
    }
    const lines = new Map<number, SourceStatement>();
    for (const element of doomed) {
      const statement = parseSourceStatement(element) as SourceStatement;
      lines.set(statement.start, statement);
    }
    clearSelection();
    sendSourceRequest({
      remove: [...lines.values()]
        .sort((a, b) => a.start - b.start)
        .map(({ start, end, text }) => ({ start, end, expected: text })),
    });
  };

  /**
   * What FrameSeq Studio needs to know of the selection to offer what can be done with it: the
   * objects, the lines that write each one when it stands on its own, and how they can be
   * arranged and stacked.
   */
  const describeSelection = (): Record<string, unknown> => {
    const elements = [...selected];
    const frame = root.querySelector<HTMLElement>(".frameseq-slide-frame.is-active");
    const stacking = elements.length === 1 ? stackingPeers(elements[0]) : undefined;
    return {
      slideIndex: Number(frame?.dataset.index ?? -1),
      editing: document.documentElement.classList.contains("frameseq-edit-mode"),
      locked: document.documentElement.classList.contains("frameseq-layout-locked"),
      objects: elements.flatMap((element) => {
        const target = parseSourceTarget(element.dataset.frameseqSource ?? "");
        return target ? [{ target, statement: parseSourceStatement(element) }] : [];
      }),
      arrange: {
        x: canArrange(elements, "x"),
        y: canArrange(elements, "y"),
        distributeX: canArrange(elements, "x", 3),
        distributeY: canArrange(elements, "y", 3),
      },
      stacking: stacking && {
        layered: stacking.layered,
        backward: stacking.index > 0,
        forward: stacking.index < stacking.peers.length - 1,
      },
      // One of the presentation's details, such as a cover's title, selected alone.
      detail: elements.length === 1 ? elements[0].dataset.frameseqMeta : undefined,
    };
  };
  /**
   * Select one of the presentation's details on the slide, alone, so FrameSeq Studio shows its
   * setting; with `reveal`, Alt-clicked, the Studio shows where presentation() writes it.
   */
  const selectDetail = (element: HTMLElement, action: "select" | "reveal"): void => {
    clearFocused();
    clearSelection();
    selected.add(element);
    element.classList.add("is-frameseq-selected");
    const index = Number(element.closest<HTMLElement>(".frameseq-slide-frame")?.dataset.index);
    selectionSlideIndex = Number.isInteger(index) ? index : undefined;
    const field = element.dataset.frameseqMeta ?? "";
    explain(w.selectedDetail(w.detailNames[field as keyof typeof w.detailNames] ?? field));
    const box = element.getBoundingClientRect();
    selectionCoordinates.style.left = `${Math.max(8, Math.min(innerWidth - 220, box.left))}px`;
    selectionCoordinates.style.top = `${Math.max(8, box.top - 32)}px`;
    focusCanvas();
    window.parent.postMessage({ type: "frameseq.detail", field, action }, "*");
  };
  const inStudio = window.parent !== window
    && new URLSearchParams(location.search).get("frameseq-preview") === "studio";
  if (inStudio) {
    /**
     * A right-click opens the Studio's own menu, for the object under the pointer or for the
     * slide. An object not yet selected is selected first, alone, as a drawing program does,
     * which turns layout editing on; a right-click on the slide itself clears the selection.
     * Shift keeps the browser's own menu.
     */
    addEventListener("contextmenu", (event) => {
      // Words being typed keep the browser's own menu, with its spelling suggestions.
      if (event.shiftKey || (event.target instanceof Element && event.target.closest(".is-frameseq-typing"))) return;
      event.preventDefault();
      if (!(event.target instanceof Element) || !root.contains(event.target)) return;
      const active = root.querySelector<HTMLElement>(".frameseq-slide-frame.is-active");
      const hit = event.target.closest<HTMLElement>("[data-frameseq-source]");
      const object = hit && !hit.classList.contains("frameseq-slide") && active?.contains(hit) ? hit : undefined;
      const detail = event.target.closest<HTMLElement>("[data-frameseq-meta]");
      const onSlide = Boolean(event.target.closest(".frameseq-slide"));
      // The menu key gives no point; the menu then opens at the selection, or on the slide.
      // Control-click, which opens menus on a Mac, is the left button.
      const keyboard = event.button !== 2 && !event.ctrlKey;
      let { clientX: x, clientY: y } = event;
      clearFocused();
      if (object) {
        if (!selected.has(object)) {
          startEditing?.();
          clearSelection();
          selected.add(object);
          object.classList.add("is-frameseq-selected");
          notifySelection();
        }
      } else if (detail && active?.contains(detail) && !keyboard) {
        if (!selected.has(detail)) selectDetail(detail, "select");
      } else if (onSlide && !keyboard) {
        clearSelection();
      }
      if (keyboard || (!object && !onSlide)) {
        const anchor = [...selected].at(-1) ?? active?.querySelector<HTMLElement>(".frameseq-slide");
        const box = anchor?.getBoundingClientRect();
        if (box) {
          x = box.left + Math.min(box.width / 2, 24);
          y = box.top + Math.min(box.height / 2, 24);
        }
      }
      // A table's menu adds and takes away rows and columns at the cell it was opened on.
      const cellElement = object?.dataset.frameseqNode === "table" ? event.target.closest<HTMLTableCellElement>("th, td") : null;
      const cell = cellElement && object?.contains(cellElement)
        ? [[...object.querySelectorAll("tr")].indexOf(cellElement.parentElement as HTMLTableRowElement), cellElement.cellIndex]
        : undefined;
      window.parent.postMessage({ type: "frameseq.context-menu", x, y, keyboard, ...describeSelection(), ...(cell ? { cell } : {}) }, "*");
    }, { signal });
    // Copied or cut, the selected objects' code goes to the clipboard as text, so it can also be
    // pasted into the code or another program.
    const carryCode = (event: ClipboardEvent): void => {
      const statements = [...selected].map(parseSourceStatement);
      if (statements.length === 0 || !event.clipboardData || statements.some((statement) => !statement)) return;
      event.clipboardData.setData("text/plain", (statements as SourceStatement[])
        .sort((a, b) => a.start - b.start)
        .map(({ text }) => text.replace(/\r?\n$/, "").replace(/\r\n/g, "\n"))
        .join("\n"));
      event.preventDefault();
    };
    addEventListener("copy", carryCode, { signal });
    addEventListener("cut", carryCode, { signal });
    addEventListener("message", (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: unknown; action?: unknown } | null;
      if (data?.type !== "frameseq.selection-action" || typeof data.action !== "string") return;
      const elements = [...selected];
      if (elements.length === 0) return;
      if (data.action === "delete") deleteSelected();
      else if ((orderActions as readonly string[]).includes(data.action)) {
        if (elements.length === 1) orderObject(elements[0], data.action as OrderAction);
      } else if ((arrangeActions as readonly string[]).includes(data.action)) {
        arrangeSelected(elements, data.action as ArrangeAction);
      }
    }, { signal });
  }

  addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (focused || selected.size > 0)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearFocused();
      clearSelection();
      return;
    }
    // Copying, cutting, and duplicating the selected objects, and pasting copied ones, are
    // FrameSeq Studio's to do: it holds what was copied and writes the slide document.
    if (inStudio && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      const key = event.key.toLowerCase();
      const command = key === "c" ? "copy" : key === "x" ? "cut" : key === "d" ? "duplicate" : key === "v" ? "paste" : undefined;
      if (command && (command === "paste" || selected.size > 0)) {
        // Copying and cutting go on to the clipboard events, which carry the objects' code.
        if (command !== "copy" && command !== "cut") event.preventDefault();
        event.stopImmediatePropagation();
        window.parent.postMessage({ type: "frameseq.object-command", command, ...describeSelection() }, "*");
        return;
      }
    }
    if (!document.documentElement.classList.contains("frameseq-edit-mode")) return;
    if ((event.key === "Delete" || event.key === "Backspace") && selected.size > 0
      && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteSelected();
      return;
    }
    if (!event.key.startsWith("Arrow") || selected.size === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (document.documentElement.classList.contains("frameseq-layout-locked")) {
      explain(w.layoutLockedHint);
      return;
    }
    const axis = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y";
    const elements = [...selected];
    const fields = elements.map((element) => parseSourceFields(element) ?? {});
    if (fields.some((candidate) => !candidate[axis])) {
      selectionCoordinates.textContent = w.noLiteral(axis);
      selectionCoordinates.classList.add("is-visible", "is-readonly");
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -step : step;
    if (!keyboardNudge
      || keyboardNudge.elements.length !== elements.length
      || keyboardNudge.elements.some((element, index) => elements[index] !== element)) {
      if (keyboardNudge?.timer) clearTimeout(keyboardNudge.timer);
      keyboardNudge = { elements, fields, dx: 0, dy: 0 };
    }
    if (axis === "x") keyboardNudge.dx += delta;
    else keyboardNudge.dy += delta;
    for (const [index, element] of elements.entries()) {
      const source = fields[index];
      if (source.x) element.style.left = `${source.x.value + keyboardNudge.dx}px`;
      if (source.y) element.style.top = `${source.y.value + keyboardNudge.dy}px`;
    }
    showCoordinates(elements.length === 1 ? elements[0] : undefined, {
      x: (fields[0].x?.value ?? 0) + keyboardNudge.dx,
      y: (fields[0].y?.value ?? 0) + keyboardNudge.dy,
    });
    if (keyboardNudge.timer) clearTimeout(keyboardNudge.timer);
    keyboardNudge.timer = setTimeout(() => {
      const pending = keyboardNudge;
      keyboardNudge = undefined;
      if (!pending) return;
      const edits: IncomingSourceEdit[] = [];
      pending.fields.forEach((source) => {
        if (pending.dx && source.x) {
          const edit = arrangementEdit(source.x, source.x.value + pending.dx);
          if (edit) edits.push(edit);
        }
        if (pending.dy && source.y) {
          const edit = arrangementEdit(source.y, source.y.value + pending.dy);
          if (edit) edits.push(edit);
        }
      });
      if (edits.length > 0) sendSourceRequest({ edits });
    }, 140);
  }, { signal });
  addEventListener("frameseq-layout-preview", ((event: CustomEvent<{
    element: HTMLElement;
    values: Record<string, number>;
  }>) => {
    showCoordinates(event.detail.element, event.detail.values);
  }) as EventListener, { signal });
  /**
   * A drag that cannot change anything says why beside the object: the layout is locked, or its
   * code works out where it goes or how big it is. FrameSeq Studio offers the code too.
   */
  addEventListener("frameseq-layout-blocked", ((event: CustomEvent<{
    element: HTMLElement;
    reason: BlockedReason;
    code?: string;
  }>) => {
    const { element, reason, code = "" } = event.detail;
    explain(reason === "locked" ? w.layoutLockedHint
      : reason === "shared" ? w.sharedObject
        : reason === "size" ? w.computedSize(code)
          : reason === "rotation" ? w.computedRotation(code) : w.computedPosition(code));
    const box = element.getBoundingClientRect();
    selectionCoordinates.style.left = `${Math.max(8, Math.min(innerWidth - 220, box.left))}px`;
    selectionCoordinates.style.top = `${Math.max(8, box.top - 32)}px`;
    const target = parseSourceTarget(element.dataset.frameseqSource ?? "");
    if (inStudio && target) window.parent.postMessage({ type: "frameseq.drag-blocked", target, reason, code }, "*");
  }) as EventListener, { signal });

  const hint = (active: boolean): void => {
    document.documentElement.classList.toggle("frameseq-source-hint", active);
  };
  addEventListener("keydown", (event) => hint(event.altKey), { signal });
  addEventListener("keyup", (event) => hint(event.altKey), { signal });
  addEventListener("blur", () => hint(false), { signal });
  signal?.addEventListener("abort", () => {
    selectionToolbar.remove();
    selectionCoordinates.remove();
  }, { once: true });

  // A source edit hot-swaps the rendered deck (or reloads as a fallback). Restore the
  // source-backed selection so repeated arrow presses keep operating on the same component.
  setTimeout(() => {
    if (signal?.aborted) return;
    const stored = readPreviewSelection();
    if (!stored || !document.documentElement.classList.contains("frameseq-edit-mode")) return;
    const frame = root.querySelector<HTMLElement>(
      `.frameseq-slide-frame.is-active[data-index="${stored.slideIndex}"]`,
    );
    if (!frame) {
      storePreviewSelection();
      return;
    }
    const candidates = [...frame.querySelectorAll<HTMLElement>("[data-frameseq-source]")]
      .filter((element) => !element.classList.contains("frameseq-slide"));
    for (const storedTarget of stored.targets) {
      const element = candidates.find((candidate) => {
        if (selected.has(candidate)) return false;
        const target = parseSourceTarget(candidate.dataset.frameseqSource ?? "");
        return target?.line === storedTarget.line && target.column === storedTarget.column;
      });
      if (!element) continue;
      selected.add(element);
      element.classList.add("is-frameseq-selected");
    }
    if (selected.size === 0) {
      storePreviewSelection();
      return;
    }
    selectionSlideIndex = stored.slideIndex;
    notifySelection();
    // The keys go back to the canvas they were pressed on, but a redraw that lands while the
    // person has moved on, such as to the code around an embedded preview, leaves them there.
    if (document.hasFocus()) focusCanvas();
  }, 0);
}

type SourceFields = Record<string, SourceField>;

/** Requests to type an object's words, numbered across the redraws of one page. */
let typingSequence = 0;

/** Where an object's words are: the object, by where its command was written, and the part of it. */
interface WordsPlace {
  source: SourceTarget;
  part: Record<string, unknown>;
}

/**
 * The requests to type that wait for FrameSeq Studio's answer, with the element drawing the
 * words, to find them again in a slide drawn since. They outlive a redraw, which the answer may
 * come after.
 */
const typingAsked = new Map<number, WordsPlace & {
  host: HTMLElement;
  point?: { x: number; y: number };
  select: boolean;
  /** Asked again of a newer drawing, which is done once. */
  again: boolean;
}>();

/**
 * A double-click on a drawing older than the code, which the Studio could not place: it is asked
 * again of the drawing shown next, at the same line and column.
 */
let typingRetry: (WordsPlace & { select: boolean }) | undefined;

/** Words being typed on the slide, which go on being typed when the slide is drawn again. */
interface TypingSession extends WordsPlace {
  request: number;
  host: HTMLElement;
  /** What the element held before, which Escape puts back. */
  original: Node[];
  /** The words as the code writes them, which typing started from. */
  value: string;
  multiline: boolean;
  /** Whether the words may be bold, in italics, or coloured; code is typed as plain text. */
  rich: boolean;
  /** The words as typing read them back before anything was typed, which leave the code alone. */
  baseline: string;
  colours: TypedColours;
  stop: AbortController;
}

let typingSession: TypingSession | undefined;

/** Words handed to the Studio, shown as typed until the slide is drawn again, or put back if refused. */
const typingWritten = new Map<number, { host: HTMLElement; original: Node[] }>();

/** What a double-click on the slide does, as the latest drawing of it set up, and whether the page listens. */
let typingDoubleClick: ((event: MouseEvent) => void) | undefined;
let typingListening = false;

/** The colours the formatting bar offers words being typed, by the names the code writes them with. */
const formatColours = ["accent", "red", "orange", "green", "teal", "blue", "purple", "gray"];

/**
 * The colours words typed on the slide may show, as an element's style writes them and as the
 * browser works them out, each with the name the code gives it; and the colour of unmarked words.
 */
interface TypedColours {
  names: Map<string, string>;
  /** Each name's colour as the browser works it out, which the formatting bar applies. */
  shades: Map<string, string>;
  base: string;
}

/** The colours words typed into `host` may show: those `value` names first, then the formatting bar's. */
function typedColours(host: HTMLElement, value: string): TypedColours {
  const written = richRuns(value).flatMap((run) => run.color ? [run.color] : []);
  const probe = document.createElement("span");
  host.append(probe);
  const names = new Map<string, string>();
  const shades = new Map<string, string>();
  for (const name of [...written, ...formatColours]) {
    probe.style.color = "";
    probe.style.color = richColor(name);
    const declared = probe.style.color;
    if (!declared) continue;
    const shown = getComputedStyle(probe).color;
    if (!shades.has(name)) shades.set(name, shown);
    for (const key of [declared, shown]) if (!names.has(key)) names.set(key, name);
  }
  probe.style.color = "";
  const base = getComputedStyle(probe).color;
  probe.remove();
  return { names, shades, base };
}

/** Words as `typed` marks them, drawn to be typed: bold, italics, and colours shown, math as written. */
function drawTypedWords(host: HTMLElement, typed: string): void {
  host.replaceChildren(...richRuns(typed).map((run): Node => {
    const words = document.createTextNode(run.text);
    if (!run.bold && !run.italic && !run.color) return words;
    const span = document.createElement("span");
    if (run.bold) span.style.fontWeight = "bolder";
    if (run.italic) span.style.fontStyle = "italic";
    if (run.color) span.style.color = richColor(run.color);
    span.append(words);
    return span;
  }));
}

/** A colour as an element's style writes it, by the name the code gives it, or else in hex. */
function typedColour(declared: string, colours: TypedColours): string | undefined {
  if (declared === colours.base) return undefined;
  const named = colours.names.get(declared);
  if (named) return named;
  const parts = /^rgba?\(([^)]+)\)$/.exec(declared)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (!parts) return /^[a-z]+$/i.test(declared) ? declared : undefined;
  if (parts.length < 3 || parts.some(Number.isNaN)) return undefined;
  const hex = parts.slice(0, 3).map((part) => Math.round(part).toString(16).padStart(2, "0")).join("");
  const alpha = parts.length > 3 && parts[3] < 1 ? Math.round(parts[3] * 255).toString(16).padStart(2, "0") : "";
  return `#${hex}${alpha}`;
}

/**
 * Words typed on the slide, read back from what the browser made of them as marked text. Each
 * mark is the nearest one an element sets, so words no longer bold inside bold ones read as
 * plain. Only what elements write is read, which holds for a slide no longer shown.
 */
function readTypedWords(host: HTMLElement, colours: TypedColours, value: string): string {
  const runs: RichRun[] = [];
  const add = (text: string, marks: Omit<RichRun, "text">): void => {
    // The browser keeps a space it would otherwise drop as a no-break space, which the code never meant.
    const words = value.includes("\u00a0") ? text : text.replaceAll("\u00a0", " ");
    if (!words) return;
    runs.push({ text: words, ...(marks.bold ? { bold: true } : {}), ...(marks.italic ? { italic: true } : {}), ...(marks.color ? { color: marks.color } : {}) });
  };
  const walk = (node: Node, outer: Omit<RichRun, "text">): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      add((node as Text).data, outer);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      add("\n", outer);
      return;
    }
    // A line the browser wraps in a block of its own starts on a line of its own.
    if (node !== host && /^(?:DIV|P|LI)$/.test(node.tagName) && runs.length > 0 && !runs.at(-1)?.text.endsWith("\n")) add("\n", outer);
    const marks = { ...outer };
    if (node !== host) {
      const tag = node.tagName;
      const weight = node.style.fontWeight;
      if (tag === "B" || tag === "STRONG") marks.bold = true;
      if (weight) marks.bold = weight === "bold" || weight === "bolder" || Number(weight) >= 600;
      const slant = node.style.fontStyle;
      if (tag === "I" || tag === "EM") marks.italic = true;
      if (slant) marks.italic = slant === "italic" || slant.startsWith("oblique");
      let declared = node.style.color;
      if (!declared && tag === "FONT" && node.getAttribute("color")) {
        const probe = document.createElement("span");
        probe.style.color = node.getAttribute("color") ?? "";
        declared = probe.style.color;
      }
      if (declared) marks.color = typedColour(declared, colours);
    }
    for (const child of node.childNodes) walk(child, marks);
  };
  walk(host, {});
  // A line break at the very end is the browser's, holding the caret on an empty last line.
  const last = runs.at(-1);
  if (last?.text.endsWith("\n") && !value.endsWith("\n")) {
    last.text = last.text.slice(0, -1);
    if (!last.text) runs.pop();
  }
  return writeRichText(runs);
}

/**
 * The bar over words being typed that makes the selected ones bold, italic, or coloured, as in
 * PowerPoint. A press on it keeps the words focused, so their selection stays as it was.
 */
function formatBar(
  host: HTMLElement,
  colours: TypedColours,
  format: (command: string, value?: string) => void,
  signal: AbortSignal,
): void {
  const w = words();
  const bar = document.createElement("div");
  bar.className = "frameseq-type-toolbar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", w.formatBar);
  const place = (): void => {
    if (!host.isConnected) return;
    const box = host.getBoundingClientRect();
    const above = box.top - bar.offsetHeight - 10;
    bar.style.top = `${Math.round(above >= 4 ? above : box.bottom + 10)}px`;
    bar.style.left = `${Math.round(Math.max(4, Math.min(box.left, innerWidth - bar.offsetWidth - 4)))}px`;
  };
  const shown: Array<[HTMLButtonElement, string]> = [];
  const refresh = (): void => {
    for (const [item, command] of shown) item.setAttribute("aria-pressed", String(document.queryCommandState(command)));
  };
  const button = (title: string, className: string, act: () => void): HTMLButtonElement => {
    const item = document.createElement("button");
    item.type = "button";
    item.tabIndex = -1;
    item.className = className;
    item.title = title;
    item.setAttribute("aria-label", title);
    item.addEventListener("click", (event) => {
      event.preventDefault();
      act();
      refresh();
      place();
    });
    bar.append(item);
    return item;
  };
  const bold = button(w.formatBold, "is-bold", () => format("bold"));
  bold.textContent = "B";
  const italic = button(w.formatItalic, "is-italic", () => format("italic"));
  italic.textContent = "I";
  shown.push([bold, "bold"], [italic, "italic"]);
  // A theme whose accent is one of the tones offers that colour once, as its accent.
  const offered = new Set<string>();
  for (const name of formatColours) {
    const shade = colours.shades.get(name);
    if (!shade || offered.has(shade)) continue;
    offered.add(shade);
    const swatch = button(w.formatColour(w.formatColours[name] ?? name), "is-colour", () => format("foreColor", shade));
    swatch.style.setProperty("--frameseq-swatch", shade);
  }
  button(w.formatNoColour, "is-colour is-plain", () => format("foreColor", colours.base));
  // The bar is not part of the slide: a press on it neither moves the caret nor starts a drag.
  for (const type of ["pointerdown", "mousedown", "contextmenu"]) {
    bar.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }
  for (const type of ["pointerup", "click", "dblclick"]) bar.addEventListener(type, (event) => event.stopPropagation());
  document.body.append(bar);
  place();
  host.addEventListener("input", place, { signal });
  addEventListener("resize", place, { signal });
  addEventListener("scroll", place, { capture: true, signal });
  document.addEventListener("selectionchange", refresh, { signal });
  signal.addEventListener("abort", () => bar.remove(), { once: true });
}

/** Where a list's items, a table's cells, a card's title, or a metric's value are drawn. */
const wordParts =".frameseq-list-item, th, td, .frameseq-card-title, .frameseq-metric-value";

/**
 * Type an object's words on the slide itself, as in PowerPoint, in FrameSeq Studio's preview. A
 * double-click on them asks the Studio, which holds the code, whether and what to type: the words
 * then show as the code writes them, inline math as `$...$`, and Enter, Tab, or a click elsewhere
 * hands them back to be written. Escape puts the slide back as it was. A save draws the slide
 * again, and words being typed then carry on in the new drawing.
 */
function enableTyping(root: HTMLElement, signal: AbortSignal): void {
  // The slide on screen may be the last drawing while the next is laid out, so any slide counts.
  const objectOf = (target: Element): HTMLElement | undefined => {
    const object = target.closest<HTMLElement>("[data-frameseq-source]");
    return object && !object.classList.contains("frameseq-slide") && object.closest(".frameseq-slides") ? object : undefined;
  };

  /** The part of an object a point is in, as the Studio names it, and the element drawing its words. */
  const partAt = (object: HTMLElement, target: Element): { part: Record<string, unknown>; host: HTMLElement } => {
    const item = target.closest<HTMLElement>(".frameseq-list-item");
    if (item && object.contains(item)) {
      const items = [...object.querySelectorAll<HTMLElement>(".frameseq-list-item")];
      return { part: { item: items.indexOf(item) }, host: item.querySelector<HTMLElement>(".frameseq-list-copy") ?? item };
    }
    const cell = target.closest<HTMLTableCellElement>("th, td");
    if (cell && object.contains(cell)) {
      const rows = [...object.querySelectorAll("tr")];
      return { part: { cell: [rows.indexOf(cell.parentElement as HTMLTableRowElement), cell.cellIndex] }, host: cell };
    }
    const named: Array<[string, number]> = [
      [".frameseq-card-title", 0], [".frameseq-card-copy", 1], [".frameseq-metric-value", 0], [".frameseq-metric-label", 1],
    ];
    for (const [selector, argument] of named) {
      const part = target.closest<HTMLElement>(selector);
      if (part && object.contains(part)) return { part: { argument }, host: part };
    }
    const label = object.querySelector<HTMLElement>(":scope > .frameseq-shape-label");
    if (label) return { part: { label: true }, host: label };
    if (["rect", "circle"].includes(object.dataset.frameseqNode ?? "")) return { part: { label: true }, host: object };
    return { part: {}, host: object.querySelector<HTMLElement>(":scope > code") ?? object };
  };

  /** The object written at a line and column on the slide shown. */
  const objectAt = (line: number, column: number): HTMLElement | undefined => {
    const frame = root.querySelector<HTMLElement>(".frameseq-slide-frame.is-active");
    return [...frame?.querySelectorAll<HTMLElement>("[data-frameseq-source]") ?? []].find((candidate) => {
      if (candidate.classList.contains("frameseq-slide")) return false;
      const target = parseSourceTarget(candidate.dataset.frameseqSource ?? "");
      return target?.line === line && target.column === column;
    });
  };

  /** The element drawing a part of an object, in a slide drawn since the part was named. */
  const partOf = (object: HTMLElement, part: Record<string, unknown>): HTMLElement | undefined => {
    if (typeof part.item === "number") {
      const item = object.querySelectorAll<HTMLElement>(".frameseq-list-item")[part.item];
      return item?.querySelector<HTMLElement>(".frameseq-list-copy") ?? item;
    }
    if (Array.isArray(part.cell)) {
      const row = object.querySelectorAll("tr")[part.cell[0] as number];
      return row?.cells[part.cell[1] as number];
    }
    if (typeof part.argument === "number") {
      const [card, metric] = part.argument === 0
        ? [".frameseq-card-title", ".frameseq-metric-value"]
        : [".frameseq-card-copy", ".frameseq-metric-label"];
      return object.querySelector<HTMLElement>(card) ?? object.querySelector<HTMLElement>(metric) ?? undefined;
    }
    return partAt(object, object).host;
  };

  /** One of the presentation's details, such as a cover's title, as this drawing shows it. */
  const detailAt = (field: string): HTMLElement | undefined => root
    .querySelector<HTMLElement>(`.frameseq-slide-frame.is-active [data-frameseq-meta="${CSS.escape(field)}"]`) ?? undefined;

  /** The element drawing words, found again in this drawing: an object's part, or a detail. */
  const hostOf = (place: WordsPlace): HTMLElement | undefined => {
    if (typeof place.part.detail === "string") return detailAt(place.part.detail);
    const object = objectAt(place.source.line, place.source.column);
    return object && partOf(object, place.part);
  };

  const ask = (
    object: HTMLElement,
    target: Element,
    point: { x: number; y: number } | undefined,
    select: boolean,
    again = false,
  ): void => {
    const source = parseSourceTarget(object.dataset.frameseqSource ?? "");
    if (!source) return;
    const { part, host } = partAt(object, target);
    typingSequence += 1;
    typingAsked.set(typingSequence, { host, source, part, point, select, again });
    window.parent.postMessage({
      type: "frameseq.type-request",
      request: typingSequence,
      target: source,
      part,
      shared: object.dataset.frameseqShared === "true",
      asked: select,
    }, "*");
  };

  /** Ask to type one of the presentation's details, which presentation() writes. */
  const askDetail = (element: HTMLElement, point: { x: number; y: number } | undefined, select: boolean): void => {
    const field = element.dataset.frameseqMeta;
    if (!field) return;
    typingSequence += 1;
    const source = { line: 0, column: 0, start: 0, end: 0 };
    typingAsked.set(typingSequence, { host: element, source, part: { detail: field }, point, select, again: true });
    window.parent.postMessage({ type: "frameseq.type-request", request: typingSequence, detail: field, asked: select }, "*");
  };

  /** The words typed so far, as the code would write them. */
  const typedWords = (session: TypingSession): string => {
    if (session.rich) return readTypedWords(session.host, session.colours, session.value);
    const typed = session.host.innerText.replace(/\r\n?/g, "\n");
    // A line break at the very end is the browser's, holding the caret on an empty last line.
    return typed.endsWith("\n") && !session.value.endsWith("\n") ? typed.slice(0, -1) : typed;
  };

  /** Stop typing, and hand the words to the Studio when `commit` asks and they changed. */
  const finish = (commit: boolean): void => {
    const session = typingSession;
    if (!session) return;
    typingSession = undefined;
    session.stop.abort();
    const { host } = session;
    const value = typedWords(session);
    host.removeAttribute("contenteditable");
    host.classList.remove("is-frameseq-typing");
    getSelection()?.removeAllRanges();
    if (!commit || value === session.baseline) {
      host.replaceChildren(...session.original);
      return;
    }
    typingWritten.set(session.request, { host, original: session.original });
    window.parent.postMessage({ type: "frameseq.typed", request: session.request, value }, "*");
  };

  /** Make the element drawing an object's words editable, holding `typed`, with the caret or a selection in it. */
  const start = (
    host: HTMLElement,
    session: WordsPlace & { request: number; value: string; multiline: boolean; baseline?: string },
    typed: string,
    caret: { selectAll?: boolean; point?: { x: number; y: number } },
  ): void => {
    const original = [...host.childNodes];
    // Code is typed as it is written; other words show their bold, italics, and colours.
    const rich = !host.closest("code, pre");
    const colours = rich ? typedColours(host, session.value) : { names: new Map(), shades: new Map(), base: "" };
    // Nodes of their own: setting textContent would type into the text that Escape puts back.
    if (rich) drawTypedWords(host, typed);
    else host.replaceChildren(document.createTextNode(typed));
    host.classList.add("is-frameseq-typing");
    host.contentEditable = rich ? "true" : "plaintext-only";
    if (host.contentEditable !== "plaintext-only") host.contentEditable = "true";
    host.spellcheck = true;
    const stop = new AbortController();
    const typing: TypingSession = { ...session, host, original, stop, rich, colours, baseline: session.baseline ?? "" };
    // Marked words read back as the code writes them, which may differ in ways that do not show.
    typing.baseline = session.baseline ?? (rich ? typedWords(typing) : session.value);
    typingSession = typing;
    const { signal: listening } = stop;
    /** Mark the selected words, or the words about to be typed, as the browser does on its own. */
    const format = (command: string, value?: string): void => {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(command, false, value);
    };
    /** Start a new line: a line break where words may be marked, which keeps their marks apart. */
    const newLine = (): void => {
      if (rich) document.execCommand("insertLineBreak");
      else document.execCommand("insertText", false, "\n");
    };
    // The keys belong to the words being typed, not to the slide around them.
    host.addEventListener("keydown", (event) => {
      event.stopPropagation();
      const key = event.key.toLowerCase();
      const command = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey || (!session.multiline && !event.shiftKey)) finish(true);
        else newLine();
      } else if (event.key === "Tab" || (command && key === "s")) {
        event.preventDefault();
        finish(true);
      } else if (command && ["b", "i", "u"].includes(key)) {
        // Underlining has no mark in the code, so it is not offered.
        event.preventDefault();
        if (rich && key === "b") format("bold");
        if (rich && key === "i") format("italic");
      }
    }, { signal: listening });
    for (const type of ["keyup", "copy", "cut"]) host.addEventListener(type, (event) => event.stopPropagation(), { signal: listening });
    host.addEventListener("paste", (event) => {
      event.stopPropagation();
      event.preventDefault();
      // Pasted words come in plain, a line at a time, so no line becomes a block of its own.
      const lines = (event.clipboardData?.getData("text/plain") ?? "").replace(/\r\n?/g, "\n").split("\n");
      lines.forEach((line, index) => {
        if (index > 0) newLine();
        if (line) document.execCommand("insertText", false, line);
      });
    }, { signal: listening });
    host.addEventListener("drop", (event) => event.preventDefault(), { signal: listening });
    if (rich) formatBar(host, colours, format, listening);
    // A slide drawn again takes the element away, which is no reason to stop typing.
    host.addEventListener("blur", () => {
      if (host.isConnected) finish(true);
    }, { signal: listening });
    host.focus({ preventScroll: true });
    const range = document.createRange();
    const point = caret.selectAll ? undefined : caret.point;
    const at = point ? document.caretRangeFromPoint?.(point.x, point.y) : null;
    if (at && host.contains(at.startContainer)) {
      range.setStart(at.startContainer, at.startOffset);
      range.collapse(true);
    } else {
      range.selectNodeContents(host);
      if (!caret.selectAll) range.collapse(false);
    }
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  };

  const begin = (request: number, value: string, multiline: boolean, selectAll: boolean): void => {
    const waiting = typingAsked.get(request);
    typingAsked.delete(request);
    if (!waiting || typingSession) return;
    // The slide may have been drawn again while the Studio answered.
    const relocated = !waiting.host.isConnected;
    const host = relocated ? hostOf(waiting) : waiting.host;
    if (!host?.isConnected) return;
    const session = { request, value, multiline, source: waiting.source, part: waiting.part };
    start(host, session, value, { selectAll, point: relocated ? undefined : waiting.point });
  };

  /**
   * Carry words being typed into this drawing of the slide once it is shown, with what was typed
   * so far. A redraw is laid out out of sight first, and typing goes on in the old one until then.
   */
  const resume = (): void => {
    if (signal.aborted || !root.isConnected) return;
    if (root.closest('[aria-hidden="true"]')) {
      requestAnimationFrame(resume);
      return;
    }
    askAgain();
    const session = typingSession;
    if (!session || root.contains(session.host)) return;
    const host = hostOf(session);
    const typed = session.rich ? typedWords(session) : session.host.textContent ?? session.value;
    session.stop.abort();
    typingSession = undefined;
    if (host) start(host, session, typed, {});
  };
  requestAnimationFrame(resume);

  // The last drawing answers double-clicks until the next one is laid out, so they are heard
  // on the page, by whichever drawing came last, rather than by each drawing's own slides.
  typingDoubleClick = (event) => {
    // A polygon being drawn ends with a double-click, which is not a request to type.
    if (typingSession || placingKind || event.altKey || !(event.target instanceof Element)) return;
    const point = { x: event.clientX, y: event.clientY };
    const detail = event.target.closest<HTMLElement>("[data-frameseq-meta]");
    if (detail?.closest(".frameseq-slides")) {
      event.preventDefault();
      askDetail(detail, point, false);
      return;
    }
    const object = objectOf(event.target);
    if (!object) return;
    event.preventDefault();
    ask(object, event.target, point, false);
  };
  if (!typingListening) {
    typingListening = true;
    document.addEventListener("dblclick", (event) => typingDoubleClick?.(event));
  }

  /** Ask again, of this drawing, about a double-click the Studio could not place on an older one. */
  function askAgain(): void {
    const again = typingRetry;
    if (!again || typingSession || signal.aborted) return;
    typingRetry = undefined;
    const object = objectAt(again.source.line, again.source.column);
    const host = object && partOf(object, again.part);
    if (object && host) ask(object, host, undefined, again.select, true);
  }

  /**
   * Type into the object the Studio just wrote, or chose Edit text on, once it is shown: into
   * the part it names, such as a table's new cell, or else its first words.
   */
  const typeAt = (line: number, column: number, part?: Record<string, unknown>): void => {
    if (typingSession) return;
    const object = objectAt(line, column);
    if (!object) return;
    const named = part && Object.keys(part).length > 0 ? partOf(object, part) : undefined;
    ask(object, named ?? object.querySelector(wordParts) ?? object, undefined, true);
  };

  /** Type one of the presentation's details, as Edit text on it asks. */
  const typeDetail = (field: string): void => {
    const element = typingSession ? undefined : detailAt(field);
    if (element) askDetail(element, undefined, true);
  };

  addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data as Record<string, unknown> | null;
    if (!data || typeof data.type !== "string") return;
    const request = typeof data.request === "number" ? data.request : -1;
    if (data.type === "frameseq.type-begin") {
      begin(request, String(data.value ?? ""), data.multiline === true, data.selectAll === true);
    } else if (data.type === "frameseq.type-refused") {
      const waiting = typingAsked.get(request);
      typingAsked.delete(request);
      if (data.retry === true && waiting && !waiting.again) {
        typingRetry = { source: waiting.source, part: waiting.part, select: waiting.select };
        // Shown already, the newer drawing is asked at once; otherwise once it is shown.
        if (!waiting.host.isConnected && !root.closest('[aria-hidden="true"]')) askAgain();
      }
    } else if (data.type === "frameseq.typed-result") {
      const typed = typingWritten.get(request);
      typingWritten.delete(request);
      // Words the code could not take go back to what the slide said.
      if (typed && data.ok === false && typed.host.isConnected) typed.host.replaceChildren(...typed.original);
    } else if (data.type === "frameseq.type-at" && typeof data.line === "number" && typeof data.column === "number") {
      typeAt(data.line, data.column, data.part && typeof data.part === "object" ? data.part as Record<string, unknown> : undefined);
    } else if (data.type === "frameseq.type-detail" && typeof data.field === "string") {
      typeDetail(data.field);
    }
  }, { signal });
}

/**
 * A preview embedded in another page may be refused access to storage entirely, so neither
 * reading nor writing the editing flag is allowed to stop the deck from mounting.
 */
function readLayoutEditing(): boolean {
  try {
    return sessionStorage.getItem(layoutEditingKey) === "1";
  } catch {
    return false;
  }
}

function storeLayoutEditing(active: boolean): void {
  try {
    sessionStorage.setItem(layoutEditingKey, active ? "1" : "0");
  } catch {
    // The mode simply will not survive a reload.
  }
}

function readLayoutLocked(): boolean {
  try {
    return sessionStorage.getItem(layoutLockedKey) === "1";
  } catch {
    return false;
  }
}

function storeLayoutLocked(locked: boolean): void {
  try {
    sessionStorage.setItem(layoutLockedKey, locked ? "1" : "0");
  } catch {
    // The lock simply will not survive a reload.
  }
}

/**
 * The notes size is a lasting preference about a presenter's eyesight and lectern
 * distance, not a property of one deck, so it outlives the window that set it.
 */
function readNotesScaleIndex(): number {
  try {
    const index = notesScaleSteps.indexOf(Number(localStorage.getItem(notesScaleKey)));
    return index < 0 ? defaultNotesScaleIndex : index;
  } catch {
    return defaultNotesScaleIndex;
  }
}

function storeNotesScale(scale: number): void {
  try {
    localStorage.setItem(notesScaleKey, String(scale));
  } catch {
    // The size simply will not survive a reload.
  }
}

function parseSourceFields(element: HTMLElement): SourceFields | undefined {
  const descriptor = element.dataset.frameseqEdit;
  if (!descriptor) return undefined;
  try {
    return JSON.parse(descriptor) as SourceFields;
  } catch {
    return undefined;
  }
}

/** The coordinates and sizes an object's code works out, by name, with that code. */
function parseSourceComputed(element: HTMLElement): Record<string, string> | undefined {
  const descriptor = element.dataset.frameseqComputed;
  if (!descriptor) return undefined;
  try {
    return JSON.parse(descriptor) as Record<string, string>;
  } catch {
    return undefined;
  }
}

function elementCanvasScale(element: HTMLElement): number {
  const canvas = element.closest<HTMLElement>(".frameseq-slide");
  if (!canvas) return 1;
  return canvas.getBoundingClientRect().width / canvas.offsetWidth || 1;
}

function arrangementEdit(field: SourceField, value: number): IncomingSourceEdit | undefined {
  const rounded = Math.round(value);
  if (rounded === Math.round(field.value)) return undefined;
  return {
    start: field.start,
    end: field.end,
    expected: field.text,
    value: rounded,
  };
}

interface IncomingSourceEdit {
  start: number;
  end: number;
  expected: string;
  value: number;
}

/** Align or distribute positioned selections by rewriting only their literal x or y values. */
function arrangeSelected(elements: HTMLElement[], action: ArrangeAction): void {
  const horizontal = action === "align-left"
    || action === "align-center"
    || action === "align-right"
    || action === "distribute-horizontal";
  const axis = horizontal ? "x" : "y";
  if (elements.length < 2 || elements.some((element) => (
    elements.some((candidate) => candidate !== element && element.contains(candidate))
  ))) return;

  const items = elements.map((element) => ({
    element,
    field: parseSourceFields(element)?.[axis],
    box: element.getBoundingClientRect(),
    scale: elementCanvasScale(element),
  }));
  if (items.some((item) => !item.field)) return;

  const start = (item: typeof items[number]): number => horizontal ? item.box.left : item.box.top;
  const end = (item: typeof items[number]): number => horizontal ? item.box.right : item.box.bottom;
  const size = (item: typeof items[number]): number => horizontal ? item.box.width : item.box.height;
  const edits: IncomingSourceEdit[] = [];
  const moveStartTo = (item: typeof items[number], target: number): void => {
    const edit = arrangementEdit(item.field as SourceField, (item.field as SourceField).value
      + (target - start(item)) / item.scale);
    if (edit) edits.push(edit);
  };

  if (action === "distribute-horizontal" || action === "distribute-vertical") {
    if (items.length < 3) return;
    const ordered = [...items].sort((a, b) => start(a) - start(b));
    const first = start(ordered[0]);
    const last = end(ordered.at(-1) as typeof ordered[number]);
    const occupied = ordered.reduce((sum, item) => sum + size(item), 0);
    const gap = (last - first - occupied) / (ordered.length - 1);
    let cursor = first;
    ordered.forEach((item, index) => {
      if (index > 0 && index < ordered.length - 1) moveStartTo(item, cursor);
      cursor += size(item) + gap;
    });
  } else {
    const first = Math.min(...items.map(start));
    const last = Math.max(...items.map(end));
    const target = action === "align-left" || action === "align-top"
      ? first
      : (action === "align-right" || action === "align-bottom" ? last : (first + last) / 2);
    for (const item of items) {
      const itemTarget = action === "align-right" || action === "align-bottom"
        ? target - size(item)
        : (action === "align-center" || action === "align-middle" ? target - size(item) / 2 : target);
      moveStartTo(item, itemTarget);
    }
  }

  const unique = new Map(edits.map((edit) => [`${edit.start}:${edit.end}`, edit]));
  if (unique.size === edits.length && edits.length > 0) sendSourceRequest({ edits: [...unique.values()] });
}

/** How long an embedded preview waits for its host to say it applied a drag. */
const editReplyTimeout = 2_000;

/**
 * Ask for the numbers a drag changed to be rewritten. Only offsets and numbers travel: the
 * receiver formats them and refuses anything whose source text has moved on.
 *
 * An embedded preview asks its host rather than the development server, because the editor
 * around it can apply the same change as an undoable step. If no host answers, the preview
 * reloads rather than go on showing a position the slide document does not state.
 */
function sendSourceEdits(fields: SourceFields, values: Record<string, number>): void {
  const edits = Object.entries(values)
    .filter(([name]) => fields[name])
    .map(([name, value]) => ({
      start: fields[name].start,
      end: fields[name].end,
      expected: fields[name].text,
      value,
    }));
  if (edits.length > 0) sendSourceRequest({ edits });
}

/** Ask for a command's lines to be carried to another place among its neighbours. */
function sendSourceMove(statement: SourceStatement, at: number): void {
  sendSourceRequest({
    move: { start: statement.start, end: statement.end, expected: statement.text, at },
  });
}

function sendSourceRequest(request: Record<string, unknown>): void {
  if (window.parent === window) {
    import.meta.hot?.send(sourceEditEvent, request);
    return;
  }

  window.parent.postMessage({ type: "frameseq.edit", ...request }, "*");
  const reply = setTimeout(() => location.reload(), editReplyTimeout);
  addEventListener("message", function settle(event: MessageEvent<unknown>) {
    const message = event.data as { type?: unknown; ok?: unknown } | null;
    if (message?.type !== "frameseq.edit-result") return;
    removeEventListener("message", settle);
    clearTimeout(reply);
    if (message.ok === false) location.reload();
  });
}

interface SourceStatement {
  start: number;
  end: number;
  text: string;
}

function parseSourceStatement(element: HTMLElement): SourceStatement | undefined {
  const descriptor = element.dataset.frameseqStatement;
  if (!descriptor) return undefined;
  try {
    return JSON.parse(descriptor) as SourceStatement;
  } catch {
    return undefined;
  }
}

/**
 * The objects a command can trade places with: the ones beside it in the same container that
 * belong to the same run of the document, so that moving its lines moves only the object.
 */
function reorderSiblings(element: HTMLElement): HTMLElement[] {
  const region = element.dataset.frameseqRegion;
  const parent = element.parentElement;
  if (!region || !parent) return [];
  return [...parent.children].filter((child): child is HTMLElement => (
    child instanceof HTMLElement
    && child.dataset.frameseqRegion === region
    && Boolean(child.dataset.frameseqStatement)
  ));
}

/**
 * The objects an object stacks with, in the order they are written. One placed by coordinates is
 * drawn above those beside it that are placed so and written before it; one in the flow comes
 * after the neighbours in the flow written before it. Either way, moving its lines past theirs
 * moves it past them.
 */
function stackingPeers(element: HTMLElement): { peers: HTMLElement[]; index: number; layered: boolean } | undefined {
  if (!parseSourceStatement(element)) return undefined;
  const layered = (candidate: HTMLElement): boolean => ["absolute", "fixed"].includes(getComputedStyle(candidate).position);
  const own = layered(element);
  const peers = reorderSiblings(element).filter((sibling) => layered(sibling) === own);
  const index = peers.indexOf(element);
  return index < 0 ? undefined : { peers, index, layered: own };
}

/** Bring an object to the front or forward, or send it backward or to the back, by moving its lines. */
function orderObject(element: HTMLElement, action: OrderAction): void {
  const stacking = stackingPeers(element);
  const statement = parseSourceStatement(element);
  if (!stacking || !statement) return;
  const { peers, index } = stacking;
  const target = action === "bring-to-front" ? peers.length - 1
    : action === "bring-forward" ? index + 1
      : action === "send-backward" ? index - 1
        : 0;
  if (target === index || target < 0 || target >= peers.length) return;
  const landing = parseSourceStatement(peers[target]);
  if (landing) sendSourceMove(statement, target > index ? landing.end : landing.start);
}

/** Where the pointer sits among the neighbours, along whichever way they are laid out. */
function insertionIndex(boxes: DOMRect[], x: number, y: number): number {
  const spreadX = Math.max(...boxes.map((box) => box.x)) - Math.min(...boxes.map((box) => box.x));
  const spreadY = Math.max(...boxes.map((box) => box.y)) - Math.min(...boxes.map((box) => box.y));
  const vertical = spreadY >= spreadX;
  const pointer = vertical ? y : x;
  const middle = (box: DOMRect): number => (vertical ? box.y + box.height / 2 : box.x + box.width / 2);
  const index = boxes.findIndex((box) => pointer < middle(box));
  return index < 0 ? boxes.length : index;
}

type BlockedReason = "locked" | "position" | "size" | "rotation" | "shared";

interface LayoutDrag {
  element: HTMLElement;
  fields: SourceFields;
  /** "blocked" is a press on an object the drag cannot change, which says why once it moves. */
  mode: "move" | "resize" | "rotate" | "reorder" | "blocked";
  /** The side or corner a resize pulls, such as "e" or "nw". */
  side?: string;
  /** Where the object's middle is on the page, which it turns about. */
  centre?: { x: number; y: number };
  /**
   * Why a blocked drag changes nothing: the layout is locked, the code works the value out, or
   * one command in a loop or a helper drew the object and others like it.
   */
  blocked?: { reason: BlockedReason; code?: string };
  statement?: SourceStatement;
  siblings?: HTMLElement[];
  index?: number;
  target?: number;
  pointerId: number;
  captured: boolean;
  originX: number;
  originY: number;
  scale: number;
  moved: boolean;
  values: Record<string, number>;
  originBox: DOMRect;
  peerBoxes: DOMRect[];
}

/**
 * How far the pointer travels before a press counts as a drag. Writing the slide document
 * cannot be undone from the preview, so a stray click must never rewrite anything.
 */
const dragThreshold = 4;

/**
 * Trading an object's place in the flow moves its lines in the code, so a press has to travel
 * further before it counts as that: a click that wobbles must not reorder the slide.
 */
const reorderThreshold = 10;

/** The switches of layout editing: whether objects can be dragged, and whether the layout is locked. */
interface LayoutEditor {
  setEditing: (active: boolean) => void;
  setLocked: (locked: boolean) => void;
}

/** The sides and corners an object is resized by, as a drawing program puts its handles. */
const handleSides = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

/**
 * The sides an object can be resized from: the right with a width written as a number, the left
 * when its x is one too, the bottom with a height, the top when its y is one too, and a corner
 * where both of its sides can.
 */
function resizableSides(fields: SourceFields): Set<string> {
  const east = Boolean(fields.width);
  const west = east && Boolean(fields.x);
  const south = Boolean(fields.height);
  const north = south && Boolean(fields.y);
  const sides = new Set<string>();
  for (const [side, can] of [["e", east], ["w", west], ["s", south], ["n", north]] as const) if (can) sides.add(side);
  for (const corner of ["ne", "se", "sw", "nw"]) if (sides.has(corner[0]) && sides.has(corner[1])) sides.add(corner);
  return sides;
}

/**
 * Drag an object on a canvas slide to change the coordinates its command states, drag one of
 * the handles on its sides and corners to change its size, and the one above it to turn it.
 * Returns the switches that turn the mode on and off and lock the layout; a locked layout keeps
 * every object where it is, while it can still be selected.
 */
function createLayoutEditor(
  root: HTMLElement,
  canvasWidth: number,
  signal?: AbortSignal,
): LayoutEditor {
  const handles = handleSides.map((side) => {
    const handle = document.createElement("div");
    handle.className = `frameseq-edit-handle is-${side}`;
    handle.dataset.handle = side;
    handle.setAttribute("aria-hidden", "true");
    return handle;
  });
  const turner = document.createElement("div");
  turner.className = "frameseq-rotate-handle";
  turner.setAttribute("aria-hidden", "true");
  /** The object the handles are on. */
  let handled: HTMLElement | null = null;
  const removeHandles = (): void => {
    for (const handle of handles) handle.remove();
    turner.remove();
    handled = null;
  };
  let locked = false;
  const insertion = document.createElement("div");
  insertion.className = "frameseq-insertion-marker";
  insertion.setAttribute("aria-hidden", "true");
  const verticalGuide = document.createElement("div");
  verticalGuide.className = "frameseq-smart-guide is-vertical";
  const horizontalGuide = document.createElement("div");
  horizontalGuide.className = "frameseq-smart-guide is-horizontal";
  let editing = false;
  let drag: LayoutDrag | undefined;

  const clearSmartGuides = (): void => {
    verticalGuide.remove();
    horizontalGuide.remove();
  };

  function snapMove(
    current: LayoutDrag,
    x: number,
    y: number,
    disabled: boolean,
  ): { x: number; y: number } {
    clearSmartGuides();
    if (disabled || current.peerBoxes.length === 0) return { x, y };
    const canvas = current.element.closest<HTMLElement>(".frameseq-slide");
    const canvasBox = canvas?.getBoundingClientRect();
    if (!canvasBox) return { x, y };
    const movedLeft = current.originBox.left + (x - current.fields.x.value) * current.scale;
    const movedTop = current.originBox.top + (y - current.fields.y.value) * current.scale;
    const movingX = [movedLeft, movedLeft + current.originBox.width / 2, movedLeft + current.originBox.width];
    const movingY = [movedTop, movedTop + current.originBox.height / 2, movedTop + current.originBox.height];
    const peerX = current.peerBoxes.flatMap((box) => [box.left, box.left + box.width / 2, box.right]);
    const peerY = current.peerBoxes.flatMap((box) => [box.top, box.top + box.height / 2, box.bottom]);
    const closest = (moving: number[], peers: number[]): { delta: number; at: number } | undefined => {
      let best: { delta: number; at: number } | undefined;
      for (const from of moving) for (const at of peers) {
        const delta = at - from;
        if (Math.abs(delta) <= 6 && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at };
      }
      return best;
    };
    const snappedX = closest(movingX, peerX);
    const snappedY = closest(movingY, peerY);
    if (snappedX) {
      x += snappedX.delta / current.scale;
      verticalGuide.style.left = `${snappedX.at}px`;
      verticalGuide.style.top = `${canvasBox.top}px`;
      verticalGuide.style.height = `${canvasBox.height}px`;
      document.body.append(verticalGuide);
    }
    if (snappedY) {
      y += snappedY.delta / current.scale;
      horizontalGuide.style.top = `${snappedY.at}px`;
      horizontalGuide.style.left = `${canvasBox.left}px`;
      horizontalGuide.style.width = `${canvasBox.width}px`;
      document.body.append(horizontalGuide);
    }
    return { x, y };
  }

  /**
   * Draw where the object would land. The marker is placed against the viewport and lives
   * outside the slide, so it neither takes part in the layout it describes nor is scaled by it.
   */
  function showInsertion(siblings: HTMLElement[], target: number): void {
    const boxes = siblings.map((sibling) => sibling.getBoundingClientRect());
    if (boxes.length === 0) return;
    const spreadX = Math.max(...boxes.map((box) => box.x)) - Math.min(...boxes.map((box) => box.x));
    const vertical = (Math.max(...boxes.map((box) => box.y)) - Math.min(...boxes.map((box) => box.y))) >= spreadX;
    const before = boxes[Math.min(target, boxes.length - 1)];
    const after = target < boxes.length;

    if (vertical) {
      const left = Math.min(...boxes.map((box) => box.x));
      const right = Math.max(...boxes.map((box) => box.right));
      insertion.style.cssText = `left:${left}px;width:${right - left}px;`
        + `top:${(after ? before.top : before.bottom) - 1}px;height:2px;`;
    } else {
      const top = Math.min(...boxes.map((box) => box.y));
      const bottom = Math.max(...boxes.map((box) => box.bottom));
      insertion.style.cssText = `top:${top}px;height:${bottom - top}px;`
        + `left:${(after ? before.left : before.right) - 1}px;width:2px;`;
    }
    document.body.append(insertion);
  }

  /** The slide is drawn at a fixed size and scaled to the frame, so undo that scale. */
  function canvasScale(element: HTMLElement): number {
    const canvas = element.closest<HTMLElement>(".frameseq-slide");
    if (!canvas) return 1;
    return canvas.getBoundingClientRect().width / canvasWidth || 1;
  }

  /**
   * Put the handles on an object: one on each side and corner it can be resized from, and, in
   * FrameSeq Studio, which can write the turn, one above an object placed by coordinates to turn
   * it. Where the code works out the size or the turn, a handle shows as fixed, so the object says
   * why it does not follow.
   */
  const placeHandle = (element: HTMLElement | null): void => {
    const fields = element ? parseSourceFields(element) ?? {} : {};
    const computed = element ? parseSourceComputed(element) ?? {} : {};
    // Words being typed on the slide keep their element to themselves.
    if (!element || locked || element.closest(".is-frameseq-typing") || element.querySelector(".is-frameseq-typing")) {
      removeHandles();
      return;
    }
    const sides = resizableSides(fields);
    const fixed = sides.size === 0 && Boolean(computed.width || computed.height);
    const turns = Boolean(fields.rotate || computed.rotate) || (inStudioPreview() && Boolean(fields.x && fields.y));
    if (sides.size === 0 && !fixed && !turns) {
      removeHandles();
      return;
    }
    handled = element;
    for (const handle of handles) {
      const side = handle.dataset.handle ?? "";
      handle.classList.toggle("is-computed", fixed);
      if (fixed ? side === "se" : sides.has(side)) {
        if (handle.parentElement !== element) element.append(handle);
      } else {
        handle.remove();
      }
    }
    turner.classList.toggle("is-computed", Boolean(computed.rotate && !fields.rotate));
    if (!turns) turner.remove();
    else if (turner.parentElement !== element) element.append(turner);
  };
  /** The one object selected, which keeps its handle while the pointer is elsewhere. */
  const selectedOne = (): HTMLElement | null => {
    const chosen = root.querySelectorAll<HTMLElement>(".is-frameseq-selected");
    return chosen.length === 1 ? chosen[0] : null;
  };

  root.addEventListener("pointerover", (event) => {
    if (!editing || drag) return;
    const element = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-frameseq-edit], [data-frameseq-computed]")
      : null;
    if (element && element === handled) return;
    placeHandle(element ?? selectedOne());
  });
  addEventListener("frameseq-selection-change", () => {
    if (editing && !drag) placeHandle(selectedOne());
  }, { signal });

  root.addEventListener("pointerdown", (event) => {
    // Alt is the shortcut for opening the source, so it never starts a drag.
    if (!editing || event.button !== 0 || event.altKey || !(event.target instanceof Element)) return;
    // Words being typed on the slide take their own presses, to place the caret and select.
    if (event.target.closest(".is-frameseq-typing")) return;
    const grip = event.target.closest<HTMLElement>(".frameseq-edit-handle");
    const resizing = Boolean(grip);
    const turning = Boolean(event.target.closest(".frameseq-rotate-handle"));
    const region = event.shiftKey && !resizing && !turning
      ? event.target.closest<HTMLElement>(
        ":is(.frameseq-row,.frameseq-column,.frameseq-stack)[data-frameseq-name][data-frameseq-edit]",
      )
      : null;
    const element = region ?? (resizing || turning
      ? handled
      : event.target.closest<HTMLElement>("[data-frameseq-edit], [data-frameseq-computed], [data-frameseq-statement]"));
    // One command in a loop or a helper drew this and others like it, so no drag can say which to move.
    const shared = element ? undefined : event.target.closest<HTMLElement>("[data-frameseq-shared]:not(.frameseq-slide)");
    if (shared) {
      event.preventDefault();
      drag = {
        element: shared,
        fields: {},
        mode: "blocked",
        blocked: { reason: "shared" },
        pointerId: event.pointerId,
        captured: false,
        originX: event.clientX,
        originY: event.clientY,
        scale: 1,
        moved: false,
        values: {},
        originBox: shared.getBoundingClientRect(),
        peerBoxes: [],
      };
      return;
    }
    if (!element) return;

    const fields = parseSourceFields(element) ?? {};
    const computed = parseSourceComputed(element) ?? {};
    const statement = parseSourceStatement(element);
    const siblings = statement ? reorderSiblings(element) : [];
    // An object placed by coordinates is dragged to new ones; one in the document flow has
    // none to change, so dragging it trades its place with a neighbour instead.
    let mode: LayoutDrag["mode"] = turning ? "rotate" : resizing ? "resize" : (fields.x && fields.y ? "move" : "reorder");
    let blocked: LayoutDrag["blocked"];
    if (mode === "resize" && grip?.classList.contains("is-computed")) {
      mode = "blocked";
      blocked = { reason: "size", code: computed.width ?? computed.height };
    } else if (mode === "rotate" && computed.rotate && !fields.rotate) {
      mode = "blocked";
      blocked = { reason: "rotation", code: computed.rotate };
    } else if (mode === "reorder" && (computed.x || computed.y)) {
      // An object its code places has no coordinates to rewrite, and moving its lines would not
      // move it, so the drag says where it is placed instead.
      mode = "blocked";
      blocked = { reason: "position", code: computed.x ?? computed.y };
    } else if (mode === "reorder" && (!statement || siblings.length < 2)) {
      return;
    }
    if (locked) {
      mode = "blocked";
      blocked = { reason: "locked" };
    }

    event.preventDefault();
    const box = element.getBoundingClientRect();
    drag = {
      element,
      fields,
      mode,
      blocked,
      side: grip?.dataset.handle,
      // An object turns about its middle, which turning leaves where it is.
      centre: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
      statement,
      siblings,
      index: siblings.indexOf(element),
      pointerId: event.pointerId,
      captured: false,
      originX: event.clientX,
      originY: event.clientY,
      scale: canvasScale(element),
      moved: false,
      values: {},
      originBox: element.getBoundingClientRect(),
      peerBoxes: [...(element.closest(".frameseq-slide")?.querySelectorAll<HTMLElement>("[data-frameseq-edit]") ?? [])]
        .filter((candidate) => candidate !== element
          && !candidate.contains(element)
          && !element.contains(candidate))
        .map((candidate) => candidate.getBoundingClientRect()),
    };
  });

  addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const travelled = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
    if (!drag.moved && travelled < (drag.mode === "reorder" ? reorderThreshold : dragThreshold)) return;
    if (drag.mode === "blocked") {
      if (!drag.moved) {
        drag.moved = true;
        dispatchEvent(new CustomEvent("frameseq-layout-blocked", { detail: { element: drag.element, ...drag.blocked } }));
      }
      return;
    }
    if (!drag.moved) {
      drag.moved = true;
      try {
        root.setPointerCapture(event.pointerId);
        drag.captured = root.hasPointerCapture(event.pointerId);
      } catch {
        drag.captured = false;
      }
      drag.element.classList.add(
        drag.mode === "reorder" ? "is-frameseq-reordering" : "is-frameseq-dragging",
      );
    }

    if (drag.mode === "reorder") {
      const siblings = drag.siblings ?? [];
      drag.target = insertionIndex(
        siblings.map((sibling) => sibling.getBoundingClientRect()),
        event.clientX,
        event.clientY,
      );
      showInsertion(siblings, drag.target);
      return;
    }

    const dx = (event.clientX - drag.originX) / drag.scale;
    const dy = (event.clientY - drag.originY) / drag.scale;

    if (drag.mode === "move") {
      const snapped = snapMove(
        drag,
        drag.fields.x.value + dx,
        drag.fields.y.value + dy,
        event.ctrlKey || event.metaKey,
      );
      drag.values = { x: Math.round(snapped.x), y: Math.round(snapped.y) };
      drag.element.style.left = `${drag.values.x}px`;
      drag.element.style.top = `${drag.values.y}px`;
      dispatchEvent(new CustomEvent("frameseq-layout-preview", {
        detail: { element: drag.element, values: drag.values },
      }));
      return;
    }

    if (drag.mode === "rotate") {
      const centre = drag.centre ?? { x: drag.originX, y: drag.originY };
      const angle = (x: number, y: number): number => Math.atan2(y - centre.y, x - centre.x) * 180 / Math.PI;
      let degrees = (drag.fields.rotate?.value ?? 0) + angle(event.clientX, event.clientY) - angle(drag.originX, drag.originY);
      degrees = ((degrees % 360) + 540) % 360 - 180;
      // Shift turns by steps of 15°, as a drawing program does.
      degrees = event.shiftKey ? Math.round(degrees / 15) * 15 : Math.round(degrees);
      drag.values = { rotate: degrees === -180 ? 180 : degrees };
      drag.element.style.transform = `rotate(${drag.values.rotate}deg)`;
      dispatchEvent(new CustomEvent("frameseq-layout-preview", {
        detail: { element: drag.element, values: drag.values },
      }));
      return;
    }

    // A side moves only its own edge; the left and top edges move the object's x and y with it.
    const side = drag.side ?? "se";
    const { width, height, x, y } = drag.fields;
    let newWidth = width?.value;
    let newHeight = height?.value;
    if (width && side.includes("e")) newWidth = width.value + dx;
    if (width && x && side.includes("w")) newWidth = width.value - dx;
    if (height && side.includes("s")) newHeight = height.value + dy;
    if (height && y && side.includes("n")) newHeight = height.value - dy;
    // Shift on a corner keeps the object's proportions.
    if (event.shiftKey && side.length === 2 && width && height && newWidth !== undefined) {
      newHeight = newWidth * (height.value / width.value);
    }
    drag.values = {};
    const horizontal = side.includes("e") || side.includes("w");
    const vertical = side.includes("n") || side.includes("s");
    if (width && newWidth !== undefined && horizontal) {
      drag.values.width = Math.max(8, Math.round(newWidth));
      drag.element.style.width = `${drag.values.width}px`;
      if (x && side.includes("w")) {
        drag.values.x = Math.round(x.value + width.value - drag.values.width);
        drag.element.style.left = `${drag.values.x}px`;
      }
    }
    if (height && newHeight !== undefined && vertical) {
      drag.values.height = Math.max(8, Math.round(newHeight));
      drag.element.style.height = `${drag.values.height}px`;
      if (y && side.includes("n")) {
        drag.values.y = Math.round(y.value + height.value - drag.values.height);
        drag.element.style.top = `${drag.values.y}px`;
      }
    }
    dispatchEvent(new CustomEvent("frameseq-layout-preview", {
      detail: { element: drag.element, values: drag.values },
    }));
  }, { signal });

  function endDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = undefined;
    if (finished.captured && root.hasPointerCapture(event.pointerId)) {
      root.releasePointerCapture(event.pointerId);
    }
    finished.element.classList.remove("is-frameseq-dragging", "is-frameseq-reordering");
    insertion.remove();
    clearSmartGuides();
    if (!finished.moved || finished.mode === "blocked") return;

    // A turn its code does not write yet is added to it by FrameSeq Studio, as .rotate().
    if (finished.mode === "rotate" && !finished.fields.rotate) {
      const target = parseSourceTarget(finished.element.dataset.frameseqSource ?? "");
      if (target && finished.values.rotate !== undefined) sendSourceRequest({ rotate: { target, degrees: finished.values.rotate } });
      return;
    }
    // The slide document is written for us, which hot-swaps a newly laid-out canvas.
    if (finished.mode !== "reorder") {
      sendSourceEdits(finished.fields, finished.values);
      return;
    }

    const { siblings = [], statement, index = 0, target } = finished;
    // Dropping either side of where it already sits leaves the order as it was.
    if (!statement || target === undefined || target === index || target === index + 1) return;
    const neighbour = target < siblings.length ? siblings[target] : siblings[siblings.length - 1];
    const landing = parseSourceStatement(neighbour);
    if (landing) sendSourceMove(statement, target < siblings.length ? landing.start : landing.end);
  }

  addEventListener("pointerup", endDrag, { signal });
  addEventListener("pointercancel", endDrag, { signal });

  /** Abandon a drag whose pointer was lost, so a later click can never commit a stale one. */
  function abandonDrag(): void {
    if (!drag) return;
    const abandoned = drag;
    drag = undefined;
    abandoned.element.classList.remove("is-frameseq-dragging", "is-frameseq-reordering");
    insertion.remove();
    clearSmartGuides();
    if (abandoned.moved && abandoned.mode !== "blocked") location.reload();
  }

  addEventListener("blur", abandonDrag, { signal });
  addEventListener("pointerup", (event) => {
    // A release the deck never saw means the pointer left it mid-drag.
    if (drag && event.pointerId === drag.pointerId && !root.contains(event.target as Node)) {
      abandonDrag();
    }
  }, { signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) abandonDrag();
  }, { signal });

  /**
   * Undo the last drag. A browser has no editor to undo into, so the development server keeps
   * the history; an embedded preview leaves undo to the editor around it, which owns it.
   */
  addEventListener("keydown", (event) => {
    if (!editing || window.parent !== window) return;
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
    if (event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    import.meta.hot?.send(sourceUndoEvent, {});
  }, { signal });

  const receiveEditResult = (result: unknown): void => {
    const outcome = result as { ok?: unknown; undo?: unknown } | undefined;
    // A refused drag leaves the preview showing a position the source does not state, so it
    // has to be redrawn. Nothing left to undo is not a mismatch, and needs no reload.
    if (outcome?.ok === false && outcome.undo !== true) location.reload();
  };
  import.meta.hot?.on(sourceEditResultEvent, receiveEditResult);
  signal?.addEventListener("abort", () => {
    import.meta.hot?.off(sourceEditResultEvent, receiveEditResult);
    removeHandles();
    insertion.remove();
    clearSmartGuides();
  }, { once: true });

  return {
    setEditing: (active: boolean): void => {
      editing = active;
      document.documentElement.classList.toggle("frameseq-edit-mode", active);
      dispatchEvent(new CustomEvent("frameseq-editing-change", { detail: active }));
      if (!active) {
        removeHandles();
        insertion.remove();
      }
    },
    setLocked: (next: boolean): void => {
      locked = next;
      document.documentElement.classList.toggle("frameseq-layout-locked", next);
      if (next) removeHandles();
      else placeHandle(selectedOne());
    },
  };
}

/** What the Studio can ask the preview to draw onto a slide. */
/**
 * What the Studio can have drawn: a shape, a line, a connector, or a box for a text, a formula,
 * a picture, or some other content, which is placed by its corner and width alone.
 */
type PlacementKind = ShapeKind | "text" | "line" | "arrow" | "connector" | "polygon" | (string & {});

/** The size a box of content takes when it is clicked in rather than dragged out. */
function usualBox(kind: string): { width: number; height: number } {
  switch (kind) {
    case "text": return { width: 360, height: 60 };
    case "image": return { width: 480, height: 320 };
    case "table": return { width: 560, height: 200 };
    case "chart": return { width: 560, height: 320 };
    case "qr": return { width: 200, height: 200 };
    case "icon": return { width: 96, height: 96 };
    case "code": return { width: 560, height: 120 };
    case "placeholder-title": return { width: 960, height: 90 };
    case "placeholder-subtitle": return { width: 960, height: 60 };
    case "placeholder-author": return { width: 480, height: 44 };
    case "placeholder-body": return { width: 960, height: 400 };
    default: return { width: 480, height: 120 };
  }
}

/** An object a connector may be drawn from or to, as the Studio needs to name it. */
function connectable(target: Element | null, canvas: HTMLElement): HTMLElement | undefined {
  const element = target?.closest<HTMLElement>("[data-frameseq-node]");
  if (!element || !canvas.contains(element) || element === canvas) return undefined;
  const type = element.dataset.frameseqNode ?? "";
  if (["slide", "line", "row", "column", "stack", "spacer"].includes(type)) return undefined;
  return element;
}

/**
 * Draw a new object onto the slide shown, as a drawing program does: the Studio says what, and
 * the pointer says where. A shape or a text box is dragged out corner to corner, or clicked in at
 * its usual size; a line runs from press to release; a connector runs from one object to
 * another; a polygon is clicked in corner by corner. The preview only measures, in the
 * coordinates the object will be written in, and leaves writing it into the slide document to
 * the Studio.
 */
/** The tool the Studio picked, kept while a saved document redraws the preview under it. */
let placingKind: PlacementKind | undefined;

function createPlacer(
  root: HTMLElement,
  activeCanvas: () => HTMLElement | undefined,
  placed: () => void,
  signal: AbortSignal,
): void {
  let kind = placingKind;
  const choose = (next: PlacementKind | undefined): void => {
    kind = next;
    placingKind = next;
  };
  let press: { x: number; y: number; pointerId: number; from?: HTMLElement } | undefined;
  let swallowClick = false;
  /** A polygon's corners so far, in the page's coordinates, while it is clicked in. */
  let corners: Array<{ x: number; y: number }> = [];
  /** Whether the press now down put down a polygon's corner, or closed it. */
  let cornerPress = false;
  const overlay = document.createElementNS(svgNamespace, "svg");
  overlay.classList.add("frameseq-place-overlay");
  overlay.setAttribute("aria-hidden", "true");
  const ghost = document.createElementNS(svgNamespace, "path");
  overlay.append(ghost);

  const stop = (cancelled: boolean): void => {
    if (cancelled && kind) window.parent.postMessage({ type: "frameseq.place-cancelled" }, "*");
    choose(undefined);
    press = undefined;
    corners = [];
    overlay.remove();
    document.documentElement.classList.remove("frameseq-placing");
    delete document.documentElement.dataset.frameseqPlacing;
  };

  addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: unknown; kind?: unknown } | null;
    if (data?.type === "frameseq.place" && typeof data.kind === "string") {
      choose(data.kind as PlacementKind);
      document.documentElement.classList.add("frameseq-placing");
      document.documentElement.dataset.frameseqPlacing = kind === "connector" ? "connector" : "draw";
      window.focus();
    } else if (data?.type === "frameseq.place-cancel") {
      stop(false);
    }
  }, { signal });

  /**
   * The box a new object's coordinates count from: what positions it once it is written at the
   * end of the slide, in the slide's first region, which is the nearest positioned container.
   */
  const frameOf = (canvas: HTMLElement): HTMLElement => {
    const body = canvas.querySelector<HTMLElement>(".frameseq-slide-body");
    const region = body?.querySelector<HTMLElement>(":scope > .frameseq-region-left, :scope > .frameseq-grid-cell-0")
      ?? body
      ?? canvas;
    let frame: HTMLElement | null = region;
    while (frame && frame !== canvas && getComputedStyle(frame).position === "static") frame = frame.parentElement;
    return frame ?? canvas;
  };

  /** Lines, and a polygon's edges, snap to every 45° while Shift is held, as in a drawing program. */
  const snapLine = (x: number, y: number, shift: boolean, from: { x: number; y: number } | undefined = press): { x: number; y: number } => {
    if (!from || !shift) return { x, y };
    const dx = x - from.x;
    const dy = y - from.y;
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
  };

  /** How the canvas is scaled on the page, and a point on the page in the coordinates written. */
  const measure = (canvas: HTMLElement): { scale: number; local: (x: number, y: number) => { x: number; y: number } } => {
    const frame = frameOf(canvas);
    const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth || 1;
    const origin = frame.getBoundingClientRect();
    return {
      scale,
      local: (x, y) => ({
        x: Math.round((x - origin.left) / scale - frame.clientLeft),
        y: Math.round((y - origin.top) / scale - frame.clientTop),
      }),
    };
  };

  /** The polygon clicked in so far, its last edge running to the pointer. */
  const drawCorners = (pointer?: { x: number; y: number }): void => {
    const points = pointer ? [...corners, pointer] : corners;
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    ghost.setAttribute("d", points.length >= 3 ? `${path} Z` : path);
  };

  /** Write the polygon clicked in, once it has three corners spanning some width and height. */
  const finishPolygon = (): void => {
    const canvas = activeCanvas();
    if (!canvas || corners.length < 3) return;
    const { local } = measure(canvas);
    const points = corners.map((corner) => local(corner.x, corner.y));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    if (Math.max(...xs) === x || Math.max(...ys) === y) return;
    window.parent.postMessage({
      type: "frameseq.placed",
      kind: "polygon",
      x,
      y,
      points: points.map((point) => [point.x - x, point.y - y]),
    }, "*");
    stop(false);
    placed();
  };

  /** The box dragged out, square while Shift is held. */
  const dragBox = (x: number, y: number, shift: boolean): { left: number; top: number; width: number; height: number } => {
    if (!press) return { left: x, top: y, width: 0, height: 0 };
    let width = Math.abs(x - press.x);
    let height = Math.abs(y - press.y);
    if (shift) width = height = Math.max(width, height);
    return {
      left: x < press.x ? press.x - width : press.x,
      top: y < press.y ? press.y - height : press.y,
      width,
      height,
    };
  };

  const draw = (x: number, y: number, shift: boolean): void => {
    if (!press || !kind) return;
    if (kind === "line" || kind === "arrow" || kind === "connector") {
      const end = kind === "connector" ? { x, y } : snapLine(x, y, shift);
      ghost.setAttribute("d", `M ${press.x} ${press.y} L ${end.x} ${end.y}`);
      return;
    }
    const box = dragBox(x, y, shift || kind === "circle");
    if (!isShapeKind(kind) || box.width < 2 || box.height < 2) {
      ghost.setAttribute("d", `M ${box.left} ${box.top} h ${box.width} v ${box.height} h ${-box.width} Z`);
      return;
    }
    const outline = shapeGeometry(kind, box.width, box.height).outline.map((segment) => {
      if (segment.op === "Z") return segment;
      if (segment.op === "C") {
        return {
          ...segment,
          x1: segment.x1 + box.left, y1: segment.y1 + box.top,
          x2: segment.x2 + box.left, y2: segment.y2 + box.top,
          x: segment.x + box.left, y: segment.y + box.top,
        };
      }
      return { ...segment, x: segment.x + box.left, y: segment.y + box.top };
    });
    ghost.setAttribute("d", svgPath(outline));
  };

  root.addEventListener("pointerdown", (event) => {
    if (!kind || event.button !== 0) return;
    const canvas = activeCanvas();
    const target = event.target instanceof Element ? event.target : null;
    if (!canvas || !target || !canvas.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (kind === "polygon") {
      cornerPress = true;
      const first = corners[0];
      const last = corners.at(-1);
      // Clicking the first corner again closes the outline.
      if (first && corners.length >= 3 && Math.hypot(event.clientX - first.x, event.clientY - first.y) <= 8) {
        finishPolygon();
        return;
      }
      const corner = snapLine(event.clientX, event.clientY, event.shiftKey, last);
      // The second click of a double-click lands where the first did, and adds nothing.
      if (!last || Math.hypot(corner.x - last.x, corner.y - last.y) > 3) corners.push(corner);
      if (!overlay.isConnected) document.body.append(overlay);
      drawCorners();
      return;
    }
    const from = kind === "connector" ? connectable(target, canvas) : undefined;
    if (kind === "connector" && !from) return;
    press = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, from };
    ghost.setAttribute("d", "");
    document.body.append(overlay);
  }, { capture: true, signal });

  addEventListener("pointermove", (event) => {
    if (press && event.pointerId === press.pointerId) draw(event.clientX, event.clientY, event.shiftKey);
    else if (kind === "polygon" && corners.length > 0) {
      drawCorners(snapLine(event.clientX, event.clientY, event.shiftKey, corners.at(-1)));
    }
  }, { signal });

  addEventListener("pointerup", (event) => {
    if (cornerPress) {
      cornerPress = false;
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 0);
      return;
    }
    if (!press || !kind || event.pointerId !== press.pointerId) return;
    const canvas = activeCanvas();
    const start = press;
    const what = kind;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    if (!canvas) {
      stop(true);
      return;
    }
    const dragged = Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 5;

    if (what === "connector") {
      const to = connectable(document.elementFromPoint(event.clientX, event.clientY), canvas);
      if (!start.from || !to || to === start.from) {
        // Released over nothing it could connect: wait for another try.
        press = undefined;
        overlay.remove();
        return;
      }
      const describe = (element: HTMLElement) => ({
        name: element.dataset.frameseqName,
        source: element.dataset.frameseqSource,
        shared: element.dataset.frameseqShared === "true",
        type: element.dataset.frameseqNode,
      });
      window.parent.postMessage({ type: "frameseq.placed", kind: what, from: describe(start.from), to: describe(to) }, "*");
      stop(false);
      placed();
      return;
    }

    const { scale, local } = measure(canvas);

    if (what === "line" || what === "arrow") {
      const end = dragged ? snapLine(event.clientX, event.clientY, event.shiftKey) : { x: start.x + 200 * scale, y: start.y };
      const a = local(start.x, start.y);
      const b = local(end.x, end.y);
      window.parent.postMessage({ type: "frameseq.placed", kind: what, x1: a.x, y1: a.y, x2: b.x, y2: b.y }, "*");
    } else {
      const usual = isShapeKind(what) ? shapeSize(what) : usualBox(what);
      const box = dragged ? dragBox(event.clientX, event.clientY, event.shiftKey || what === "circle") : undefined;
      const corner = box ? local(box.left, box.top) : local(start.x, start.y);
      const width = box ? Math.max(Math.round(box.width / scale), 16) : usual.width;
      const height = box ? Math.max(Math.round(box.height / scale), 16) : usual.height;
      // A click puts the object's middle where it was clicked.
      const x = box ? corner.x : Math.round(corner.x - width / 2);
      const y = box ? corner.y : Math.round(corner.y - height / 2);
      window.parent.postMessage({ type: "frameseq.placed", kind: what, x, y, width, height }, "*");
    }
    stop(false);
    placed();
  }, { signal });

  // A right-click puts the tool down, as Escape does.
  root.addEventListener("contextmenu", (event) => {
    if (!kind) return;
    event.preventDefault();
    event.stopPropagation();
    stop(true);
  }, { capture: true, signal });

  // The click that ends a placement is not a click on whatever lay beneath it.
  root.addEventListener("click", (event) => {
    if (!swallowClick) return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, signal });

  // A polygon is finished with a double-click, and Enter; Backspace takes back its last corner.
  root.addEventListener("dblclick", (event) => {
    if (kind !== "polygon") return;
    event.preventDefault();
    event.stopPropagation();
    finishPolygon();
  }, { capture: true, signal });

  addEventListener("keydown", (event) => {
    if (kind === "polygon" && (event.key === "Enter" || event.key === "Backspace")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Enter") finishPolygon();
      else {
        corners.pop();
        drawCorners();
      }
      return;
    }
    if (!kind || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stop(true);
  }, { capture: true, signal });

  // A redraw replaces the slides, not the tool: the next mount picks it up where this one left it.
  signal.addEventListener("abort", () => {
    press = undefined;
    overlay.remove();
  }, { once: true });
}

let activeMountController: AbortController | undefined;
/** Whether this presenter window has been fitted to its screen, which happens once, not on each reload of the slides. */
let presenterFitted = false;

export function mountSlides(slidesDocument: SlidesRootDefinition, target: HTMLElement): void {
  activeMountController?.abort();
  const mountController = new AbortController();
  const { signal } = mountController;
  activeMountController = mountController;
  resolvePrintUnits(slidesDocument.node);
  resolveAnchors(slidesDocument.node);
  resolveShapePaint(slidesDocument.node);
  for (const page of Object.values(mastersOf(slidesDocument))) collectSharedSpans(page);
  shapeObserver?.disconnect();
  shapeObserver = typeof ResizeObserver === "undefined"
    ? undefined
    : new ResizeObserver((entries) => {
      for (const entry of entries) drawShape(entry.target as HTMLElement);
    });
  collectSharedSpans(slidesDocument.node);
  document.title = slidesDocument.title;
  target.replaceChildren();

  const searchParams = new URLSearchParams(location.search);
  const printMode = searchParams.has("print");
  const pptxMode = printMode && searchParams.has("pptx");
  const remoteMode = !printMode && searchParams.get("remote") === "1";
  const presenterMode = !printMode && !remoteMode && searchParams.has("presenter");
  // Every slide at once, small, for the rail in FrameSeq Studio. Only a development server
  // offers it, so a built presentation carries none of it.
  const thumbnailMode = localEditingAvailable && !printMode && !remoteMode && !presenterMode
    && searchParams.has("thumbnails");
  document.documentElement.classList.toggle("frameseq-thumbnail-mode", thumbnailMode);
  // The slides alone, edge to edge, as FrameSeq Studio shows them full screen: no controls, no
  // editing, and a click moves on.
  const showMode = !printMode && !remoteMode && !presenterMode && !thumbnailMode && searchParams.has("show");
  // Presenter view beside that show, on another screen: it ends the show as the show itself does.
  const besideShow = presenterMode && searchParams.has("show");
  const interactivePreview = localEditingAvailable && !presenterMode && !remoteMode && !showMode;
  // The master pages in place of the slides, for FrameSeq Studio's master view, where they are
  // edited like slides. Only a development server offers it.
  const masterMode = localEditingAvailable && !printMode && !remoteMode && !presenterMode && !showMode
    && searchParams.has("masters");
  // FrameSeq Studio's preview edits as a drawing program does: objects are selected, dragged,
  // and typed into with no mode to enter, and its E button locks the layout instead.
  const directEditing = interactivePreview && !printMode && !thumbnailMode && inStudioPreview();
  document.documentElement.classList.toggle("frameseq-direct-edit", directEditing);
  document.documentElement.classList.toggle("frameseq-master-mode", masterMode);
  document.documentElement.classList.toggle("frameseq-print", printMode);
  document.documentElement.classList.toggle("frameseq-presenter-mode", presenterMode);
  document.documentElement.classList.toggle("frameseq-remote-mode", remoteMode);
  document.documentElement.classList.toggle("frameseq-show-mode", showMode);
  document.documentElement.style.setProperty("--slide-width", `${slidesDocument.canvasWidth}px`);
  document.documentElement.style.setProperty("--slide-height", `${slidesDocument.canvasHeight}px`);
  document.documentElement.style.setProperty("--slide-ratio", `${slidesDocument.canvasWidth} / ${slidesDocument.canvasHeight}`);
  // The size each page prints at: the paper for a presentation made for it, and otherwise the
  // canvas at CSS's 96 pixels to the inch.
  const paper = slidesDocument.paper;
  const printWidth = paper ? paper.width * 96 / 25.4 : slidesDocument.canvasWidth;
  const printHeight = paper ? paper.height * 96 / 25.4 : slidesDocument.canvasHeight;
  document.documentElement.style.setProperty("--slide-print-width", `${printWidth}px`);
  document.documentElement.style.setProperty("--slide-print-height", `${printHeight}px`);
  document.documentElement.style.setProperty("--slide-print-zoom", String(printWidth / slidesDocument.canvasWidth));
  // How far type is read from, relative to a 1280-wide slide: the layout check scales its
  // smallest readable size by it. Paper is measured across its short side.
  const readingUnits = paper ? Math.min(slidesDocument.canvasWidth, slidesDocument.canvasHeight) * 1280 / paperCanvasUnits : slidesDocument.canvasWidth;
  document.documentElement.dataset.frameseqReadingScale = String(readingUnits / 1280);
  if (paper) {
    document.documentElement.dataset.frameseqPaper = paper.name;
    document.documentElement.dataset.frameseqPaperPoints = String(paper.width * 72 / 25.4 / slidesDocument.canvasWidth);
  } else {
    delete document.documentElement.dataset.frameseqPaper;
    delete document.documentElement.dataset.frameseqPaperPoints;
  }
  // A figure is read on the page of a paper, so the layout check judges its type in points.
  if (slidesDocument.node.props.figure === true) document.documentElement.dataset.frameseqFigure = "true";
  else delete document.documentElement.dataset.frameseqFigure;
  document.documentElement.dataset.frameseqTheme = slidesDocument.theme.name;
  document.documentElement.dataset.frameseqThemeFamily = slidesDocument.theme.family;
  document.documentElement.dataset.frameseqCoverLayout = slidesDocument.theme.coverLayout;
  for (const [name, value] of Object.entries(themeCssVariables(slidesDocument.theme))) {
    document.documentElement.style.setProperty(name, value);
  }
  applyPresentationFont(slidesDocument.font);

  if (printMode) {
    const pageStyle = document.createElement("style");
    pageStyle.textContent = `@page { size: ${printWidth / 96}in ${printHeight / 96}in; margin: 0; }`;
    document.head.append(pageStyle);
  }

  const root = document.createElement("main");
  root.className = "frameseq-slides";
  root.tabIndex = -1;
  root.setAttribute("aria-label", words().canvas);
  applyStyles(root, slidesDocument.node.styles);

  const pages = masterMode ? Object.values(mastersOf(slidesDocument)) : slidesDocument.slides;
  const slides = pages.map((slide, index) => {
    const frame = document.createElement("section");
    frame.className = "frameseq-slide-frame";
    frame.dataset.index = String(index);

    const canvas = masterMode
      ? renderMasterCanvas(slide, index, slidesDocument)
      : renderSlideCanvas(slide, index, slidesDocument);
    if (pptxMode && typeof slide.props.notes === "string") {
      canvas.dataset.frameseqNotes = slide.props.notes;
    }
    frame.append(canvas);
    root.append(frame);
    return {
      frame,
      canvas,
      maxStep: maxStep(slide),
      node: slide,
      label: masterMode ? masterLabel(String(slide.props.masterPage)) : slideLabel(slide, index),
    };
  });

  if (printMode) {
    target.append(root);
    for (const { frame, canvas } of slides) {
      frame.classList.add("is-active");
      canvas.style.transform = "none";
      canvas.querySelectorAll<HTMLElement>(".frameseq-step").forEach((element) => {
        element.classList.add("is-visible");
      });
    }
    settleWhenReady(() => slides.map(({ canvas }) => canvas), signal);
    document.documentElement.dataset.ready = "true";
    return;
  }

  if (import.meta.hot && thumbnailMode) {
    mountThumbnails(target, root, slides, (canvas, frame) => scaleCanvas(canvas, frame, slidesDocument), signal);
    settleWhenReady(() => slides.map(({ canvas }) => canvas), signal);
    document.documentElement.dataset.ready = "true";
    return;
  }

  // A presentation with no master pages yet has nothing for the master view to show.
  if (masterMode && slides.length === 0) {
    const empty = document.createElement("p");
    empty.className = "frameseq-master-empty";
    empty.textContent = words().noMasters;
    target.append(empty);
    window.parent.postMessage({ type: "frameseq.slide", index: 0, count: 0, label: "", notes: "" }, "*");
    document.documentElement.dataset.ready = "true";
    return;
  }

  // Asked to show an object, the preview stays where it is when that object is already on
  // screen, so following the editor never resets the reveal steps of the current slide.
  if (import.meta.hot && !showMode) {
    enableSourceReveal(root, (index) => {
      if (index !== currentSlide) goTo(index);
    }, signal, () => updateLayoutEditing(true));
    if (directEditing) enableTyping(root, signal);
  }

  const laserPointers = slides.map(({ canvas }) => {
    const pointer = document.createElement("span");
    pointer.className = "frameseq-laser-pointer";
    pointer.setAttribute("aria-hidden", "true");
    canvas.append(pointer);
    return pointer;
  });

  const presenter = presenterMode
    ? createPresenterView(target, root, slidesDocument)
    : undefined;
  const remote = remoteMode
    ? createRemoteView(target, root, slidesDocument)
    : undefined;
  const controls = presenter?.controls ?? remote?.controls ?? document.createElement("nav");
  if (!presenter && !remote) {
    target.append(root);
    const w = words();
    controls.className = "frameseq-controls";
    controls.setAttribute("aria-label", w.slideNavigation);
    controls.innerHTML = `
      <button type="button" data-action="previous" aria-label="${w.previousSlide}">←</button>
      <span class="frameseq-counter"></span>
      <button type="button" data-action="next" aria-label="${w.nextSlide}">→</button>
      ${interactivePreview ? `
        <span class="frameseq-zoom-controls" aria-label="${w.previewZoom}">
          <button type="button" data-action="zoom-out" aria-label="${w.zoomOut}" title="${w.zoomOut}">−</button>
          <span class="frameseq-zoom-value" aria-live="polite">100%</span>
          <button type="button" data-action="zoom-in" aria-label="${w.zoomIn}" title="${w.zoomIn}">+</button>
          <button type="button" data-action="zoom-fit" aria-label="${w.fitTitle}" title="${w.fitTitle}">${w.fit}</button>
          <button type="button" data-action="zoom-reset" aria-label="${w.resetZoom}" title="${w.resetZoom}">1:1</button>
        </span>
      ` : ""}
      ${localRemoteAvailable ? `<button type="button" data-action="remote-pair" aria-label="${w.pairRemote}" title="${w.pairRemote}">R</button>` : ""}
      ${localEditingAvailable && directEditing ? `<button type="button" class="frameseq-lock-toggle" data-action="layout-lock" aria-pressed="false" aria-label="${w.layoutLock}" title="${w.layoutLockTitle}">${lockPicture(false)}</button>` : ""}
      ${localEditingAvailable && !directEditing ? `<button type="button" data-action="edit-toggle" aria-pressed="false" aria-label="${w.layoutEditing}" title="${w.layoutEditingTitle}">E</button>` : ""}
      <button type="button" data-action="presenter" aria-label="${w.openPresenter}" title="${w.openPresenter}">P</button>
    `;
    if (!showMode) target.append(controls);
  }

  // After a slide show's last slide the screen goes black, as PowerPoint's does, and one more
  // step ends the show. FrameSeq Studio names the language to say so in.
  const showEnd = showMode ? document.createElement("div") : undefined;
  if (showEnd) {
    showEnd.className = "frameseq-show-end";
    showEnd.textContent = words().showEnd;
    showEnd.hidden = true;
    target.append(showEnd);
  }

  const layoutEditor = localEditingAvailable && !presenter && !remote && !showMode
    ? createLayoutEditor(root, slidesDocument.canvasWidth, signal)
    : undefined;
  // Editing mode, and the Studio's lock, survive both a hot canvas swap and a fallback page reload.
  let layoutEditing = directEditing || readLayoutEditing();
  let layoutLocked = directEditing && readLayoutLocked();
  let audienceZoom: number | undefined;
  let currentAudienceScale = 1;

  function updateLayoutEditing(active: boolean): void {
    if (!layoutEditor) return;
    // FrameSeq Studio's preview never leaves editing; its layout is locked instead.
    layoutEditing = active || directEditing;
    if (!directEditing) storeLayoutEditing(layoutEditing);
    layoutEditor.setEditing(layoutEditing);
    const button = controls.querySelector<HTMLButtonElement>('[data-action="edit-toggle"]');
    button?.setAttribute("aria-pressed", String(layoutEditing));
    if (button) {
      button.title = layoutEditing
        ? "Editing on · click to select, Ctrl/Command-click to multi-select, Escape to leave"
        : "Enter editing mode";
      button.setAttribute("aria-label", layoutEditing ? "Layout editing on" : "Layout editing off");
    }
  }

  /** Lock FrameSeq Studio's layout, so objects stay where they are while they are selected and typed into. */
  function updateLayoutLock(locked: boolean): void {
    if (!layoutEditor || !directEditing) return;
    layoutLocked = locked;
    storeLayoutLocked(locked);
    layoutEditor.setLocked(locked);
    const button = controls.querySelector<HTMLButtonElement>('[data-action="layout-lock"]');
    if (!button) return;
    const w = words();
    button.setAttribute("aria-pressed", String(locked));
    button.title = locked ? w.layoutUnlockTitle : w.layoutLockTitle;
    button.innerHTML = lockPicture(locked);
  }

  updateLayoutEditing(layoutEditing);
  updateLayoutLock(layoutLocked);
  // FrameSeq Studio's menus lock the layout, and elsewhere turn layout editing on and off.
  addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: unknown; active?: unknown; locked?: unknown } | null;
    if (data?.type === "frameseq.layout-editing" && typeof data.active === "boolean") updateLayoutEditing(data.active);
    if (data?.type === "frameseq.layout-lock" && typeof data.locked === "boolean") updateLayoutLock(data.locked);
  }, { signal });
  // An object drawn from the Studio is there to be arranged, so editing turns on once it lands.
  if (layoutEditor && window.parent !== window) {
    createPlacer(root, () => slides[currentSlide]?.canvas, () => updateLayoutEditing(true), signal);
  }

  let currentSlide = 0;
  let currentStep = 0;
  let remoteSession = searchParams.get("session")?.trim() ?? "";
  const syncClientId = createRemoteSession();
  let nextCanvas: HTMLElement | undefined;
  let pointerState = {
    slide: 0,
    x: 0.5,
    y: 0.5,
    visible: false,
  };

  function updateNextScale(): void {
    if (presenter && nextCanvas) {
      scaleCanvas(nextCanvas, presenter.nextFrame, slidesDocument);
    }
  }

  function updateScale(): void {
    const { frame, canvas } = slides[currentSlide];
    if (!presenter && !remote) {
      currentAudienceScale = fitAudienceFrame(frame, root, slidesDocument, audienceZoom, showMode);
      const value = controls.querySelector<HTMLElement>(".frameseq-zoom-value");
      if (value) value.textContent = `${Math.round(currentAudienceScale * 100)}%`;
    }
    scaleCanvas(canvas, frame, slidesDocument);
  }

  function setAudienceZoom(zoom?: number): void {
    audienceZoom = zoom === undefined ? undefined : Math.min(Math.max(zoom, 0.1), 3);
    updateScale();
  }

  function updatePresenter(): void {
    if (!presenter) return;

    const current = slides[currentSlide];
    const notes = current.node.props.notes;
    const noteText = typeof notes === "string" ? notes.trim() : "";
    presenter.currentLabel.textContent = `${currentSlide + 1}. ${current.label}`;
    presenter.notes.textContent = noteText || "No speaker notes for this slide.";
    presenter.notes.classList.toggle("is-empty", !noteText);
    presenter.pageSelect.value = String(currentSlide);

    presenter.nextFrame.replaceChildren();
    nextCanvas = undefined;
    const nextIndex = currentSlide + 1;
    if (nextIndex >= slides.length) {
      presenter.nextLabel.textContent = words().endOfPresentation;
      presenter.nextFrame.classList.add("is-empty");
      presenter.nextFrame.textContent = words().end;
      return;
    }

    presenter.nextFrame.classList.remove("is-empty");
    presenter.nextLabel.textContent = `${nextIndex + 1}. ${slides[nextIndex].label}`;
    nextCanvas = renderSlideCanvas(slides[nextIndex].node, nextIndex, slidesDocument);
    nextCanvas.querySelectorAll<HTMLElement>(".frameseq-step").forEach((element) => {
      element.classList.toggle("is-visible", Number(element.dataset.step ?? 0) <= 0);
    });
    presenter.nextFrame.append(nextCanvas);
    settleCanvas(nextCanvas);
    requestAnimationFrame(updateNextScale);
  }

  function updateRemote(): void {
    if (!remote) return;
    remote.currentLabel.textContent = `${currentSlide + 1}. ${slides[currentSlide].label}`;
  }

  const syncChannel = typeof BroadcastChannel === "function"
    ? new BroadcastChannel(`frameseq-navigation:${location.pathname}`)
    : undefined;

  function postSyncMessage(message: SyncMessage): void {
    syncChannel?.postMessage(message);
    if (!remoteSession || !localRemoteAvailable) return;
    import.meta.hot?.send(remoteSyncEvent, {
      session: remoteSession,
      sender: syncClientId,
      message,
    } satisfies RemoteEnvelope);
  }

  function renderLaserPointer(): void {
    laserPointers.forEach((pointer, index) => {
      const visible = pointerState.visible
        && pointerState.slide === index
        && currentSlide === index;
      pointer.classList.toggle("is-visible", visible);
      if (!visible) return;
      pointer.style.left = `${pointerState.x * 100}%`;
      pointer.style.top = `${pointerState.y * 100}%`;
    });
  }

  function broadcastPointer(): void {
    postSyncMessage({
      type: "pointer",
      ...pointerState,
    });
  }

  function setPointer(
    state: { slide: number; x: number; y: number; visible: boolean },
    shouldBroadcast = true,
  ): void {
    pointerState = {
      slide: Math.min(Math.max(Math.trunc(state.slide), 0), slides.length - 1),
      x: Math.min(Math.max(state.x, 0), 1),
      y: Math.min(Math.max(state.y, 0), 1),
      visible: state.visible,
    };
    renderLaserPointer();
    if (shouldBroadcast) broadcastPointer();
  }

  function hidePointer(shouldBroadcast = true): void {
    if (!pointerState.visible) return;
    pointerState = { ...pointerState, visible: false };
    renderLaserPointer();
    if (shouldBroadcast) broadcastPointer();
  }

  function broadcastNavigation(): void {
    postSyncMessage({
      type: "navigation",
      slide: currentSlide,
      step: currentStep,
    });
  }

  function update(shouldBroadcast = true): void {
    if (showEnd) showEnd.hidden = true;
    dispatchEvent(new CustomEvent("frameseq-slide-change", { detail: currentSlide }));
    hidePointer(Boolean(presenter) && shouldBroadcast);
    slides.forEach(({ frame, canvas }, index) => {
      const active = index === currentSlide;
      frame.classList.toggle("is-active", active);
      if (!active) return;
      if (canvas.dataset.frameseqSettled !== "true") settleCanvas(canvas);
      canvas.querySelectorAll<HTMLElement>(".frameseq-step").forEach((element) => {
        const step = Number(element.dataset.step ?? 0);
        element.classList.toggle("is-visible", step <= currentStep);
      });
    });

    const counter = presenter?.counter
      ?? remote?.counter
      ?? controls.querySelector<HTMLElement>(".frameseq-counter");
    if (counter) {
      const stepSuffix = slides[currentSlide].maxStep > 0
        ? ` · ${currentStep}/${slides[currentSlide].maxStep}`
        : "";
      counter.textContent = `${currentSlide + 1}/${slides.length}${stepSuffix}`;
    }
    history.replaceState(null, "", `#${currentSlide + 1}`);
    if (import.meta.hot && window.parent !== window && !presenter && !remote) {
      window.parent.postMessage({
        type: "frameseq.slide",
        index: currentSlide,
        step: currentStep,
        count: slides.length,
        label: slides[currentSlide].label,
        notes: typeof slides[currentSlide].node.props.notes === "string" ? slides[currentSlide].node.props.notes : "",
        // A cover or a poster's header drawn from the presentation's details, which an editor offers to set.
        details: slides[currentSlide].canvas.dataset.frameseqDetails ?? "",
      }, "*");
    }
    updatePresenter();
    updateRemote();
    if (shouldBroadcast) broadcastNavigation();
    requestAnimationFrame(updateScale);
  }

  function next(): void {
    if (currentStep < slides[currentSlide].maxStep) {
      currentStep += 1;
    } else if (currentSlide < slides.length - 1) {
      currentSlide += 1;
      currentStep = 0;
    } else if (showEnd) {
      if (showEnd.hidden) showEnd.hidden = false;
      else endShow();
      return;
    }
    update();
  }

  function previous(): void {
    if (showEnd && !showEnd.hidden) {
      showEnd.hidden = true;
      return;
    }
    if (currentStep > 0) {
      currentStep -= 1;
    } else if (currentSlide > 0) {
      currentSlide -= 1;
      currentStep = slides[currentSlide].maxStep;
    }
    update();
  }

  function goTo(index: number): void {
    currentSlide = Math.min(Math.max(index, 0), slides.length - 1);
    currentStep = 0;
    update();
  }

  function modeUrl(mode: "audience" | "presenter" | "remote"): URL {
    const url = new URL(location.href);
    url.searchParams.delete("print");
    if (mode === "presenter") {
      url.searchParams.set("presenter", "1");
      url.searchParams.delete("remote");
    } else if (mode === "remote") {
      url.searchParams.set("remote", "1");
      url.searchParams.delete("presenter");
    } else {
      url.searchParams.delete("presenter");
      url.searchParams.delete("remote");
    }
    url.hash = String(currentSlide + 1);
    // The window it opens speaks the language this page speaks, whatever page is around this one.
    if (speaksChinese()) url.searchParams.set("lang", "zh");
    return url;
  }

  function openMode(mode: "audience" | "presenter"): void {
    const url = modeUrl(mode);
    window.open(url.href, `frameseq-${mode}`);
  }

  function switchMode(mode: "presenter" | "remote"): void {
    location.assign(modeUrl(mode));
  }

  async function openRemotePairing(): Promise<void> {
    if (!localRemoteAvailable) return;
    if (!remoteSession) remoteSession = createRemoteSession();

    const currentUrl = new URL(location.href);
    currentUrl.searchParams.set("session", remoteSession);
    history.replaceState(null, "", currentUrl);

    const w = words();
    const dialog = document.createElement("dialog");
    dialog.className = "frameseq-remote-dialog";
    dialog.innerHTML = `
      <div class="frameseq-remote-dialog-header">
        <div>
          <div class="frameseq-remote-dialog-kicker">${w.localNetwork}</div>
          <h2>${w.pairTitle}</h2>
        </div>
        <button type="button" data-action="close" aria-label="${w.close}">×</button>
      </div>
      <p>${w.pairHint}</p>
      <div class="frameseq-remote-qr" aria-live="polite">${w.preparing}</div>
      <label class="frameseq-remote-address-picker">
        <span>${w.networkAddress}</span>
        <select></select>
      </label>
      <code class="frameseq-remote-url"></code>
      <div class="frameseq-remote-dialog-actions">
        <button type="button" data-action="copy">${w.copyLink}</button>
        <button type="button" data-action="close">${w.done}</button>
      </div>
      <p class="frameseq-remote-dialog-note">${w.pairNote}</p>
    `;
    target.append(dialog);

    const qr = dialog.querySelector<HTMLElement>(".frameseq-remote-qr");
    const picker = dialog.querySelector<HTMLSelectElement>("select");
    const urlLabel = dialog.querySelector<HTMLElement>(".frameseq-remote-url");
    const copyButton = dialog.querySelector<HTMLButtonElement>("[data-action='copy']");
    if (!qr || !picker || !urlLabel || !copyButton) {
      dialog.remove();
      throw new Error("Phone remote dialog is incomplete");
    }

    const renderCode = async (origin: string) => {
      const url = controllerUrl(origin, remoteSession);
      qr.innerHTML = await QRCode.toString(url, {
        type: "svg",
        width: 280,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#020617", light: "#ffffff" },
      });
      urlLabel.textContent = url;
    };

    try {
      const response = await fetch("/__frameseq/remote-info", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { origins?: unknown };
      const origins = Array.isArray(data.origins)
        ? data.origins.filter((origin): origin is string => typeof origin === "string")
        : [];
      if (!isLoopbackHostname(location.hostname)) origins.unshift(location.origin);
      const uniqueOrigins = [...new Set(origins)];
      if (uniqueOrigins.length === 0) {
        throw new Error("No local-network address was found");
      }
      uniqueOrigins.forEach((origin) => {
        const option = document.createElement("option");
        option.value = origin;
        option.textContent = origin;
        picker.append(option);
      });
      await renderCode(uniqueOrigins[0]);
      picker.addEventListener("change", () => void renderCode(picker.value));
    } catch (error) {
      qr.textContent = w.noPhoneLink(error instanceof Error ? error.message : undefined);
      picker.closest("label")?.remove();
      urlLabel.remove();
      copyButton.remove();
    }

    dialog.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.action;
      if (action === "close") dialog.close();
      if (action === "copy" && urlLabel.textContent) {
        if (!navigator.clipboard) {
          copyButton.textContent = w.copyUnavailable;
          return;
        }
        void navigator.clipboard.writeText(urlLabel.textContent).then(() => {
          copyButton.textContent = w.copied;
        }).catch(() => {
          copyButton.textContent = w.copyFailed;
        });
      }
    });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
  }

  controls.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (button?.dataset.action === "next") next();
    if (button?.dataset.action === "previous") previous();
    if (button?.dataset.action === "presenter") openMode("presenter");
    if (button?.dataset.action === "audience") openMode("audience");
    if (button?.dataset.action === "end-show") postSyncMessage({ type: "end-show" });
    if (button?.dataset.action === "presenter-fullscreen") {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen().catch(() => undefined);
    }
    if (button?.dataset.action === "remote-pair") void openRemotePairing();
    if (button?.dataset.action === "remote-here") switchMode("remote");
    if (button?.dataset.action === "edit-toggle") updateLayoutEditing(!layoutEditing);
    if (button?.dataset.action === "layout-lock") updateLayoutLock(!layoutLocked);
    if (button?.dataset.action === "zoom-out") setAudienceZoom(currentAudienceScale / 1.1);
    if (button?.dataset.action === "zoom-in") setAudienceZoom(currentAudienceScale * 1.1);
    if (button?.dataset.action === "zoom-fit") setAudienceZoom();
    if (button?.dataset.action === "zoom-reset") setAudienceZoom(1);
  });

  remote?.shell.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.action;
    if (action === "presenter-here") switchMode("presenter");
  });

  const fullscreenToggle = presenter?.controls.querySelector<HTMLButtonElement>("[data-action='presenter-fullscreen']");
  if (fullscreenToggle) {
    document.addEventListener("fullscreenchange", () => {
      const full = Boolean(document.fullscreenElement);
      fullscreenToggle.textContent = full ? words().exitFullScreen : words().fullScreen;
      fullscreenToggle.setAttribute("aria-pressed", String(full));
    }, { signal });
  }

  // Presenter view that FrameSeq Studio's show opened beside it, on another screen, fills that
  // screen's usable area as a maximised window does: the show could size the window only by its
  // contents, which leaves the window's frame over the edges.
  if (besideShow && window.opener && !presenterFitted) {
    presenterFitted = true;
    const area = screen as Screen & { availLeft?: number; availTop?: number };
    try {
      moveTo(area.availLeft ?? 0, area.availTop ?? 0);
      resizeTo(screen.availWidth, screen.availHeight);
    } catch {
      // A window the page may not move stays as it opened.
    }
  }

  presenter?.pageSelect.addEventListener("change", () => {
    goTo(Number(presenter.pageSelect.value));
  });

  if (presenter) {
    let timerElapsed = 0;
    let timerStarted = performance.now();
    let timerRunning = true;
    let notesScaleIndex = readNotesScaleIndex();

    const applyNotesScale = () => {
      const scale = notesScaleSteps[notesScaleIndex];
      presenter.shell.style.setProperty("--frameseq-notes-scale", String(scale));
      presenter.notesScaleValue.textContent = `${Math.round(scale * 100)}%`;
      presenter.notesSmaller.disabled = notesScaleIndex === 0;
      presenter.notesLarger.disabled = notesScaleIndex === notesScaleSteps.length - 1;
    };

    const stepNotesScale = (direction: number) => {
      const next = Math.min(
        Math.max(notesScaleIndex + direction, 0),
        notesScaleSteps.length - 1,
      );
      if (next === notesScaleIndex) return;
      notesScaleIndex = next;
      applyNotesScale();
      storeNotesScale(notesScaleSteps[next]);
    };

    applyNotesScale();

    const updateTimer = () => {
      const elapsed = timerElapsed + (timerRunning ? performance.now() - timerStarted : 0);
      presenter.timer.textContent = formatDuration(elapsed);
      presenter.timerToggle.textContent = timerRunning ? words().pause : words().resume;
    };

    presenter.shell.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (button?.dataset.action === "mobile-panel") {
        const panel = button.dataset.panel;
        if (panel === "notes" || panel === "next") {
          presenter.shell.dataset.mobilePanel = panel;
          presenter.shell
            .querySelectorAll<HTMLButtonElement>("[data-action='mobile-panel']")
            .forEach((candidate) => {
              candidate.setAttribute("aria-selected", String(candidate.dataset.panel === panel));
            });
        }
      }
      if (button?.dataset.action === "timer-toggle") {
        if (timerRunning) {
          timerElapsed += performance.now() - timerStarted;
        } else {
          timerStarted = performance.now();
        }
        timerRunning = !timerRunning;
        updateTimer();
      }
      if (button?.dataset.action === "timer-reset") {
        timerElapsed = 0;
        timerStarted = performance.now();
        timerRunning = true;
        updateTimer();
      }
      if (button?.dataset.action === "notes-smaller") stepNotesScale(-1);
      if (button?.dataset.action === "notes-larger") stepNotesScale(1);
    });
    updateTimer();
    window.setInterval(updateTimer, 250);
  }

  const laserHost = presenter?.currentHost ?? remote?.currentHost;
  const laserToggle = presenter?.laserToggle ?? remote?.laserToggle;
  if (laserHost && laserToggle) {
    let laserEnabled = false;
    let pointerFrame = 0;
    let pendingPointer: typeof pointerState | undefined;

    const flushPointer = () => {
      pointerFrame = 0;
      if (!pendingPointer) return;
      const nextPointer = pendingPointer;
      pendingPointer = undefined;
      setPointer(nextPointer);
    };

    const queuePointer = (state: typeof pointerState) => {
      pendingPointer = state;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(flushPointer);
    };

    const setLaserEnabled = (enabled: boolean) => {
      laserEnabled = enabled;
      laserToggle.textContent = words().laser(enabled);
      laserToggle.setAttribute("aria-pressed", String(enabled));
      laserHost.classList.toggle("is-laser-active", enabled);
      if (!enabled) queuePointer({ ...pointerState, visible: false });
    };

    laserToggle.addEventListener("click", () => setLaserEnabled(!laserEnabled));
    laserHost.addEventListener("pointermove", (event) => {
      if (!laserEnabled) return;
      const canvas = slides[currentSlide].canvas;
      const bounds = canvas.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      const visible = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      queuePointer({ slide: currentSlide, x, y, visible });
    });
    laserHost.addEventListener("pointerleave", () => {
      if (laserEnabled) queuePointer({ ...pointerState, visible: false });
    });
    laserHost.addEventListener("pointerup", (event) => {
      if (laserEnabled && event.pointerType === "touch") {
        queuePointer({ ...pointerState, visible: false });
      }
    });
    laserHost.addEventListener("pointercancel", () => {
      if (laserEnabled) queuePointer({ ...pointerState, visible: false });
    });
  }

  function setRemoteConnection(label: string, state: "waiting" | "connected" | "disconnected"): void {
    if (!remote) return;
    remote.status.textContent = label;
    remote.status.classList.toggle("is-waiting", state === "waiting");
    remote.status.classList.toggle("is-connected", state === "connected");
    remote.status.classList.toggle("is-disconnected", state === "disconnected");
  }

  function handleSyncMessage(message: unknown, source: "broadcast" | "remote"): void {
    if (!message || typeof message !== "object") return;
    const data = message as {
      type?: unknown;
      slide?: unknown;
      step?: unknown;
      x?: unknown;
      y?: unknown;
      visible?: unknown;
    };
    if (data.type === "end-show") {
      if (showMode) endShow();
      return;
    }
    if (data.type === "request-state") {
      if (!remote) {
        broadcastNavigation();
        broadcastPointer();
      }
      return;
    }
    if (data.type === "pointer"
      && typeof data.slide === "number"
      && typeof data.x === "number"
      && typeof data.y === "number"
      && typeof data.visible === "boolean") {
      setPointer({
        slide: data.slide,
        x: data.x,
        y: data.y,
        visible: data.visible,
      }, false);
      if (source === "remote") syncChannel?.postMessage(data);
      return;
    }
    if (data.type !== "navigation"
      || typeof data.slide !== "number"
      || typeof data.step !== "number") return;

    currentSlide = Math.min(Math.max(Math.trunc(data.slide), 0), slides.length - 1);
    currentStep = Math.min(
      Math.max(Math.trunc(data.step), 0),
      slides[currentSlide].maxStep,
    );
    update(false);
    if (source === "remote") syncChannel?.postMessage(data);
    if (remote) setRemoteConnection(words().connected, "connected");
  }

  syncChannel?.addEventListener("message", (event: MessageEvent<unknown>) => {
    handleSyncMessage(event.data, "broadcast");
  }, { signal });

  const receiveRemoteSync = (payload: unknown): void => {
    if (!payload || typeof payload !== "object") return;
    const envelope = payload as { session?: unknown; sender?: unknown; message?: unknown };
    if (!remoteSession
      || envelope.session !== remoteSession
      || envelope.sender === syncClientId) return;
    handleSyncMessage(envelope.message, "remote");
  };
  const receiveConnect = (): void => {
    // A slide show paired with a phone says where it is each time it reaches the server, for a
    // phone that asked while it was away.
    if (showMode && remoteSession) broadcastNavigation();
    if (!remote || !remoteSession) return;
    setRemoteConnection(words().waiting, "waiting");
    postSyncMessage({ type: "request-state" });
  };
  const receiveDisconnect = (): void => {
    if (remote) setRemoteConnection(words().disconnected, "disconnected");
  };
  import.meta.hot?.on(remoteSyncEvent, receiveRemoteSync);
  import.meta.hot?.on("vite:ws:connect", receiveConnect);
  import.meta.hot?.on("vite:ws:disconnect", receiveDisconnect);
  signal.addEventListener("abort", () => {
    syncChannel?.close();
    import.meta.hot?.off(remoteSyncEvent, receiveRemoteSync);
    import.meta.hot?.off("vite:ws:connect", receiveConnect);
    import.meta.hot?.off("vite:ws:disconnect", receiveDisconnect);
  }, { once: true });

  if (remote) {
    if (!localRemoteAvailable) {
      setRemoteConnection(words().remoteUnavailable, "disconnected");
    } else if (!remoteSession) {
      setRemoteConnection(words().invalidPairing, "disconnected");
    } else {
      setRemoteConnection(words().waiting, "waiting");
    }
  }

  addEventListener("keydown", (event) => {
    const modified = event.ctrlKey || event.altKey || event.metaKey;
    // A slide show answers the keys a presentation remote sends, as PowerPoint does, and Escape
    // ends it. F5, which some remotes send to start a show, starts nothing new.
    if (showMode && !modified) {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const action = key === "Escape" ? endShow
        : key === "F5" ? () => undefined
        : ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n"].includes(key) ? next
        : ["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p"].includes(key) ? previous
        : key === "Home" ? () => goTo(0)
        : key === "End" ? () => goTo(slides.length - 1)
        : undefined;
      if (action) {
        event.preventDefault();
        action();
      }
      return;
    }
    // Presenter view beside the show ends it with Escape too, and F5 starts nothing new there
    // either, rather than reloading the page.
    if (besideShow && !modified && (event.key === "Escape" || event.key === "F5")
      && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      if (event.key === "Escape") postSyncMessage({ type: "end-show" });
      return;
    }
    // In FrameSeq Studio, F5 in the preview presents, as it does anywhere else in the window,
    // rather than reloading the preview.
    if (import.meta.hot && window.parent !== window && searchParams.get("frameseq-preview") === "studio"
      && event.key === "F5" && !modified) {
      event.preventDefault();
      window.parent.postMessage({ type: "frameseq.command", command: event.shiftKey ? "present-beginning" : "present" }, "*");
      return;
    }
    // An embedded preview has no document of its own to save or undo, so it hands those
    // shortcuts to the editor around it instead of letting the browser act on the page.
    if (import.meta.hot && window.parent !== window && !presenter && !remote
      && (event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      const command = key === "s"
        ? "save"
        : (key === "z" ? (event.shiftKey ? "redo" : "undo") : (key === "y" && !event.shiftKey ? "redo" : undefined));
      if (command) {
        event.preventDefault();
        window.parent.postMessage({ type: "frameseq.command", command }, "*");
        return;
      }
    }
    if (interactivePreview
      && event.code === "Digit0"
      && (event.ctrlKey || event.metaKey)
      && !event.altKey
      && !event.shiftKey) {
      event.preventDefault();
      setAudienceZoom(1);
      return;
    }
    if (event.key === "Escape" && layoutEditing && !directEditing) {
      event.preventDefault();
      updateLayoutEditing(false);
      return;
    }
    if (["ArrowRight", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      next();
    }
    if (["ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      previous();
    }
    if (!presenterMode && !remoteMode && event.code === "KeyP" && !modified && !event.repeat) {
      event.preventDefault();
      openMode("presenter");
    }
    if ((presenterMode || remoteMode)
      && event.code === "KeyL"
      && event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && !event.shiftKey
      && !event.repeat) {
      event.preventDefault();
      (presenter?.laserToggle ?? remote?.laserToggle)?.click();
    }
    if (presenter
      && !modified
      && ["-", "+", "="].includes(event.key)
      // The page selector answers a bare keypress with its own typeahead, and it is the
      // one place in the presenter view that keyboard focus can rest inside.
      && !(event.target as HTMLElement | null)?.closest("select, input, textarea")) {
      event.preventDefault();
      (event.key === "-" ? presenter.notesSmaller : presenter.notesLarger).click();
    }
  }, { signal });

  if (interactivePreview) {
    root.addEventListener("wheel", (event) => {
      if (event.deltaY === 0 || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      setAudienceZoom(currentAudienceScale * Math.exp(-event.deltaY * 0.0015));
    }, { passive: false, signal });
  }

  /** End a slide show: FrameSeq Studio closes the one it shows, and a page of its own leaves full screen. */
  function endShow(): void {
    if (window.parent !== window) window.parent.postMessage({ type: "frameseq.show-end" }, "*");
    else if (document.fullscreenElement) void document.exitFullscreen();
  }

  if (showMode) {
    // A click moves on, except on a link or a control of the slide's own.
    root.addEventListener("click", (event) => {
      if (event.button !== 0) return;
      if ((event.target as Element | null)?.closest("a[href], button, input, select, textarea, audio, video")) return;
      next();
    }, { signal });
    showEnd?.addEventListener("click", (event) => {
      if (event.button === 0) endShow();
    }, { signal });
    // The pointer hides while it rests, so it never sits over the slides on screen.
    let restTimer = 0;
    const wake = () => {
      root.classList.remove("is-pointer-resting");
      window.clearTimeout(restTimer);
      restTimer = window.setTimeout(() => root.classList.add("is-pointer-resting"), 2000);
    };
    addEventListener("pointermove", wake, { signal });
    signal.addEventListener("abort", () => window.clearTimeout(restTimer), { once: true });
    wake();
  }

  const initialSlide = Math.min(
    Math.max(Number(location.hash.slice(1) || 1) - 1, 0),
    Math.max(slides.length - 1, 0),
  );
  currentSlide = initialSlide;
  const resizeObserver = new ResizeObserver(() => {
    updateScale();
    updateNextScale();
  });
  resizeObserver.observe(presenter?.currentHost ?? remote?.currentHost ?? root);
  if (presenter) resizeObserver.observe(presenter.nextFrame);
  signal.addEventListener("abort", () => resizeObserver.disconnect(), { once: true });
  update(false);
  // Fonts that arrive after the first slide was shown change how much text fits, so the slides
  // already shown are settled again; the others settle when they appear.
  void document.fonts?.ready.then(() => {
    if (signal.aborted) return;
    for (const { canvas } of slides) {
      if (canvas.dataset.frameseqSettled === "true" && canvas.isConnected) settleCanvas(canvas);
    }
    if (nextCanvas?.isConnected) settleCanvas(nextCanvas);
  });
  // A slide show starts where it was asked to, and the other pages open on the presentation, such
  // as presenter view, follow it there; any other page asks them where they are instead.
  if (showMode) broadcastNavigation();
  else postSyncMessage({ type: "request-state" });
  document.documentElement.dataset.ready = "true";
}
