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
  resolveShapePaint,
  shapeGeometry,
  shapeSize,
  svgPath,
  type LineRoute,
  type ShapeKind,
  type ShapePaint,
} from "./shapes";
import { themeCssVariables } from "./theme";
import { mountThumbnails } from "./thumbnails";

const remoteSyncEvent = "frameseq:remote-sync";
const sourceEditEvent = "frameseq:apply-edit";
const sourceUndoEvent = "frameseq:undo-edit";
const sourceEditResultEvent = "frameseq:apply-edit-result";
const layoutEditingKey = "frameseq-layout-editing";
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

function applyStyles(element: HTMLElement, styles: Record<string, string>): void {
  Object.assign(element.style, styles);
}

function appendTextWithInlineMath(element: HTMLElement, content: string): void {
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
  const route = node.props.route as LineRoute | undefined;
  const points = node.props.points as Array<[number, number]> | undefined;
  // A routed connector is a path through its corners; a straight one stays a plain line.
  const routed = (route === "elbow" || route === "curve") && Array.isArray(points) && points.length >= 2;
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
  kind: ShapeKind;
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
  const kind = node.props.kind as ShapeKind;
  const paint = node.props.paint as ShapePaint | undefined;
  const defaults = shapeSize(kind);
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

function titlePageItem(className: string, content: string): HTMLElement {
  const element = document.createElement("div");
  element.className = `frameseq-text ${className}`;
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
  titlePage.append(titlePageItem("frameseq-cover-title", slides.title));
  if (slides.subtitle) {
    titlePage.append(titlePageItem("frameseq-cover-subtitle", slides.subtitle));
  }

  const rule = document.createElement("div");
  rule.className = "frameseq-cover-rule";
  titlePage.append(rule);

  if (slides.author) {
    titlePage.append(titlePageItem("frameseq-cover-author", slides.author));
  }
  if (slides.institute) {
    titlePage.append(titlePageItem("frameseq-cover-institute", slides.institute));
  }
  if (slides.date) {
    titlePage.append(titlePageItem("frameseq-cover-date", slides.date));
  }
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
  header.append(titlePageItem("frameseq-theme-header-title", slides.title));
  if (slides.subtitle) header.append(titlePageItem("frameseq-theme-header-subtitle", slides.subtitle));
  const credits = [slides.author, slides.institute, slides.date].filter((value): value is string => Boolean(value));
  if (credits.length > 0) {
    const line = document.createElement("div");
    line.className = "frameseq-theme-header-credits";
    for (const credit of credits) line.append(titlePageItem("frameseq-theme-header-credit", credit));
    header.append(line);
  }
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
): number {
  const horizontalMargin = 18;
  const topMargin = 18;
  const controlsSpace = 58;
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
  const shell = document.createElement("main");
  shell.className = "frameseq-presenter";
  shell.dataset.mobilePanel = "notes";
  shell.innerHTML = `
    <header class="frameseq-presenter-header">
      <div>
        <div class="frameseq-presenter-kicker">Presenter view</div>
        <div class="frameseq-presenter-title"></div>
      </div>
      <div class="frameseq-presenter-timer-group">
        <button type="button" data-action="laser-toggle" aria-pressed="false" title="Toggle laser pointer (Ctrl+L)">Laser: Off</button>
        <span class="frameseq-presenter-timer" aria-live="off">00:00</span>
        <button type="button" data-action="timer-toggle">Pause</button>
        <button type="button" data-action="timer-reset">Reset</button>
      </div>
    </header>
    <section class="frameseq-presenter-current" aria-label="Current slide"></section>
    <aside class="frameseq-presenter-side">
      <div class="frameseq-presenter-mobile-tabs" role="tablist" aria-label="Presenter detail">
        <button type="button" role="tab" data-action="mobile-panel" data-panel="notes" aria-selected="true">Notes</button>
        <button type="button" role="tab" data-action="mobile-panel" data-panel="next" aria-selected="false">Next slide</button>
      </div>
      <section class="frameseq-presenter-next">
        <div class="frameseq-presenter-section-heading">
          <span>Next</span>
          <span class="frameseq-presenter-next-label"></span>
        </div>
        <div class="frameseq-presenter-next-frame"></div>
      </section>
      <section class="frameseq-presenter-notes-panel">
        <div class="frameseq-presenter-section-heading">
          <span>Speaker notes</span>
          <span class="frameseq-presenter-notes-size">
            <button type="button" data-action="notes-smaller" title="Smaller notes text (-)" aria-label="Smaller speaker notes text">A−</button>
            <span class="frameseq-presenter-notes-size-value" aria-live="off">100%</span>
            <button type="button" data-action="notes-larger" title="Larger notes text (+)" aria-label="Larger speaker notes text">A+</button>
          </span>
        </div>
        <div class="frameseq-presenter-notes"></div>
      </section>
    </aside>
    <nav class="frameseq-presenter-controls" aria-label="Presenter controls">
      <button type="button" data-action="previous">← Previous</button>
      <span class="frameseq-counter"></span>
      <button type="button" data-action="next">Next →</button>
      <label>
        <span>Go to</span>
        <select class="frameseq-presenter-page-select" aria-label="Go to slide"></select>
      </label>
      ${localRemoteAvailable
        ? `<button type="button" data-action="${pairedRemote ? "remote-here" : "remote-pair"}">${pairedRemote ? "Simple remote" : "Phone remote"}</button>`
        : ""}
      <button type="button" data-action="audience">Open audience view</button>
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
  const shell = document.createElement("main");
  shell.className = "frameseq-remote";
  shell.innerHTML = `
    <header class="frameseq-remote-header">
      <div>
        <div class="frameseq-remote-kicker">Phone remote</div>
        <div class="frameseq-remote-title"></div>
      </div>
      <div class="frameseq-remote-header-actions">
        <div class="frameseq-remote-status is-waiting">Connecting…</div>
        <button type="button" data-action="presenter-here">Presenter view</button>
      </div>
    </header>
    <section class="frameseq-remote-current" aria-label="Current slide"></section>
    <div class="frameseq-remote-slide-label"></div>
    <nav class="frameseq-remote-controls" aria-label="Remote controls">
      <button type="button" data-action="previous">← Previous</button>
      <span class="frameseq-counter"></span>
      <button type="button" data-action="next">Next →</button>
      <button type="button" class="frameseq-remote-laser" data-action="laser-toggle" aria-pressed="false">Laser: Off</button>
    </nav>
    <p class="frameseq-remote-hint">Enable the laser, then drag across the slide preview.</p>
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

type ArrangeAction =
  | "align-left"
  | "align-center"
  | "align-right"
  | "align-top"
  | "align-middle"
  | "align-bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

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

/** Alt-click any object in the live preview to open the line that wrote it. */
function enableSourceReveal(
  root: HTMLElement,
  navigate?: (index: number) => void,
  signal?: AbortSignal,
): void {
  let focused: HTMLElement | undefined;
  const selected = new Set<HTMLElement>();
  let selectionSlideIndex: number | undefined;
  document.querySelectorAll(".frameseq-selection-toolbar, .frameseq-selection-coordinates")
    .forEach((element) => element.remove());
  const selectionToolbar = document.createElement("div");
  selectionToolbar.className = "frameseq-selection-toolbar";
  selectionToolbar.innerHTML = `
    <span class="frameseq-selection-path"></span>
    <span class="frameseq-selection-tools" aria-label="Arrange selected components">
      <button type="button" data-action="align-left" title="Align left" aria-label="Align left">↤</button>
      <button type="button" data-action="align-center" title="Align horizontal centres" aria-label="Align horizontal centres">↔</button>
      <button type="button" data-action="align-right" title="Align right" aria-label="Align right">↦</button>
      <button type="button" data-action="align-top" title="Align top" aria-label="Align top">↥</button>
      <button type="button" data-action="align-middle" title="Align vertical centres" aria-label="Align vertical centres">↕</button>
      <button type="button" data-action="align-bottom" title="Align bottom" aria-label="Align bottom">↧</button>
      <button type="button" data-action="distribute-horizontal" title="Distribute horizontally" aria-label="Distribute horizontally">H⋯</button>
      <button type="button" data-action="distribute-vertical" title="Distribute vertically" aria-label="Distribute vertically">V⋮</button>
    </span>
    <button type="button" data-action="bind-region">Bind region</button>
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
    selectionCoordinates.textContent = positioned
      ? `Selected · x ${Math.round(x)} · y ${Math.round(y)} · ${Math.round(width)} × ${Math.round(height)}`
      : "Selected · flow item · drag to reorder";
    selectionCoordinates.classList.toggle("is-readonly", !positioned);
    selectionCoordinates.style.left = `${Math.max(8, Math.min(innerWidth - 220, box.left))}px`;
    selectionCoordinates.style.top = `${Math.max(8, box.top - 32)}px`;
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
      if (path) path.textContent = `${targets.length} selected · ${selectionLabel(primary)}`;
      updateArrangeButtons(elements);
      selectionToolbar.classList.add("is-visible");
    }
    const bind = selectionToolbar.querySelector<HTMLButtonElement>('[data-action="bind-region"]');
    if (bind) bind.hidden = targets.length < 2;
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
    focused = match;
    focused.classList.add("is-frameseq-source-focus");
    focused.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  addEventListener("message", (event) => focusSource(event.data), { signal });

  root.addEventListener("click", (event) => {
    if (event.button !== 0) return;
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
    if (elements.some((element) => ["row", "column", "stack", "slide"].includes(element.dataset.frameseqNode ?? ""))) {
      explain("Selected · a region is deleted in the source");
      return;
    }
    if (elements.some((element) => !parseSourceStatement(element))) {
      explain("Selected · written inside another command; delete it in the source");
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
      explain(`Selected · ${dependents.length === 1 ? "another object is" : `${dependents.length} objects are`} placed by its name`);
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
  addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (focused || selected.size > 0)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearFocused();
      clearSelection();
      return;
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
    const axis = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y";
    const elements = [...selected];
    const fields = elements.map((element) => parseSourceFields(element) ?? {});
    if (fields.some((candidate) => !candidate[axis])) {
      selectionCoordinates.textContent = axis === "x"
        ? "Selected · no literal x coordinate"
        : "Selected · no literal y coordinate";
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
    focusCanvas();
  }, 0);
}

type SourceFields = Record<string, SourceField>;

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

interface LayoutDrag {
  element: HTMLElement;
  fields: SourceFields;
  mode: "move" | "resize" | "reorder";
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
 * Drag an object on a canvas slide to change the coordinates its command states, and drag the
 * corner handle to change its size. Returns the switch that turns the mode on and off.
 */
function createLayoutEditor(
  root: HTMLElement,
  canvasWidth: number,
  signal?: AbortSignal,
): (active: boolean) => void {
  const handle = document.createElement("div");
  handle.className = "frameseq-edit-handle";
  handle.setAttribute("aria-hidden", "true");
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

  root.addEventListener("pointerover", (event) => {
    if (!editing || drag) return;
    const element = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-frameseq-edit]")
      : null;
    if (element === handle.parentElement) return;
    const fields = element ? parseSourceFields(element) : undefined;
    if (element && fields?.width) element.append(handle);
    else handle.remove();
  });

  root.addEventListener("pointerdown", (event) => {
    // Alt is the shortcut for opening the source, so it never starts a drag.
    if (!editing || event.button !== 0 || event.altKey || !(event.target instanceof Element)) return;
    const resizing = Boolean(event.target.closest(".frameseq-edit-handle"));
    const region = event.shiftKey
      ? event.target.closest<HTMLElement>(
        ":is(.frameseq-row,.frameseq-column,.frameseq-stack)[data-frameseq-name][data-frameseq-edit]",
      )
      : null;
    const element = region ?? (resizing
      ? handle.parentElement
      : event.target.closest<HTMLElement>("[data-frameseq-edit], [data-frameseq-statement]"));
    if (!element) return;

    const fields = parseSourceFields(element) ?? {};
    const statement = parseSourceStatement(element);
    const siblings = statement ? reorderSiblings(element) : [];
    // An object placed by coordinates is dragged to new ones; one in the document flow has
    // none to change, so dragging it trades its place with a neighbour instead.
    const mode = resizing ? "resize" : (fields.x && fields.y ? "move" : "reorder");
    if (mode === "resize" && !fields.width) return;
    if (mode === "reorder" && (!statement || siblings.length < 2)) return;

    event.preventDefault();
    drag = {
      element,
      fields,
      mode,
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
    if (!drag.moved && travelled < dragThreshold) return;
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

    drag.values = { width: Math.max(8, Math.round(drag.fields.width.value + dx)) };
    drag.element.style.width = `${drag.values.width}px`;
    if (drag.fields.height) {
      drag.values.height = Math.max(8, Math.round(drag.fields.height.value + dy));
      drag.element.style.height = `${drag.values.height}px`;
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
    if (!finished.moved) return;

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
    if (abandoned.moved) location.reload();
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
    handle.remove();
    insertion.remove();
    clearSmartGuides();
  }, { once: true });

  return (active: boolean): void => {
    editing = active;
    document.documentElement.classList.toggle("frameseq-edit-mode", active);
    dispatchEvent(new CustomEvent("frameseq-editing-change", { detail: active }));
    if (!active) {
      handle.remove();
      insertion.remove();
    }
  };
}

/** What the Studio can ask the preview to draw onto a slide. */
type PlacementKind = ShapeKind | "text" | "line" | "arrow" | "connector";

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
 * another. The preview only measures, in the coordinates the object will be written in, and
 * leaves writing it into the slide document to the Studio.
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
  const overlay = document.createElementNS(svgNamespace, "svg");
  overlay.classList.add("frameseq-place-overlay");
  overlay.setAttribute("aria-hidden", "true");
  const ghost = document.createElementNS(svgNamespace, "path");
  overlay.append(ghost);

  const stop = (cancelled: boolean): void => {
    if (cancelled && kind) window.parent.postMessage({ type: "frameseq.place-cancelled" }, "*");
    choose(undefined);
    press = undefined;
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

  /** Lines snap to every 45° while Shift is held, as in a drawing program. */
  const snapLine = (x: number, y: number, shift: boolean): { x: number; y: number } => {
    if (!press || !shift) return { x, y };
    const dx = x - press.x;
    const dy = y - press.y;
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return { x: press.x + Math.cos(angle) * length, y: press.y + Math.sin(angle) * length };
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
    if (kind === "text" || box.width < 2 || box.height < 2) {
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
    const from = kind === "connector" ? connectable(target, canvas) : undefined;
    if (kind === "connector" && !from) return;
    press = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, from };
    ghost.setAttribute("d", "");
    document.body.append(overlay);
  }, { capture: true, signal });

  addEventListener("pointermove", (event) => {
    if (press && event.pointerId === press.pointerId) draw(event.clientX, event.clientY, event.shiftKey);
  }, { signal });

  addEventListener("pointerup", (event) => {
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

    const frame = frameOf(canvas);
    const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth || 1;
    const origin = frame.getBoundingClientRect();
    const local = (x: number, y: number): { x: number; y: number } => ({
      x: Math.round((x - origin.left) / scale - frame.clientLeft),
      y: Math.round((y - origin.top) / scale - frame.clientTop),
    });

    if (what === "line" || what === "arrow") {
      const end = dragged ? snapLine(event.clientX, event.clientY, event.shiftKey) : { x: start.x + 200 * scale, y: start.y };
      const a = local(start.x, start.y);
      const b = local(end.x, end.y);
      window.parent.postMessage({ type: "frameseq.placed", kind: what, x1: a.x, y1: a.y, x2: b.x, y2: b.y }, "*");
    } else {
      const usual = what === "text" ? { width: 360, height: 60 } : shapeSize(what);
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

  // The click that ends a placement is not a click on whatever lay beneath it.
  root.addEventListener("click", (event) => {
    if (!swallowClick) return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, signal });

  addEventListener("keydown", (event) => {
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

export function mountSlides(slidesDocument: SlidesRootDefinition, target: HTMLElement): void {
  activeMountController?.abort();
  const mountController = new AbortController();
  const { signal } = mountController;
  activeMountController = mountController;
  resolvePrintUnits(slidesDocument.node);
  resolveAnchors(slidesDocument.node);
  resolveShapePaint(slidesDocument.node);
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
  const interactivePreview = localEditingAvailable && !presenterMode && !remoteMode;
  document.documentElement.classList.toggle("frameseq-print", printMode);
  document.documentElement.classList.toggle("frameseq-presenter-mode", presenterMode);
  document.documentElement.classList.toggle("frameseq-remote-mode", remoteMode);
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
  root.setAttribute("aria-label", "FrameSeq slide canvas");
  applyStyles(root, slidesDocument.node.styles);

  const slides = slidesDocument.slides.map((slide, index) => {
    const frame = document.createElement("section");
    frame.className = "frameseq-slide-frame";
    frame.dataset.index = String(index);

    const canvas = renderSlideCanvas(slide, index, slidesDocument);
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
      label: slideLabel(slide, index),
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

  // Asked to show an object, the preview stays where it is when that object is already on
  // screen, so following the editor never resets the reveal steps of the current slide.
  if (import.meta.hot) {
    enableSourceReveal(root, (index) => {
      if (index !== currentSlide) goTo(index);
    }, signal);
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
    controls.className = "frameseq-controls";
    controls.setAttribute("aria-label", "Slide navigation");
    controls.innerHTML = `
      <button type="button" data-action="previous" aria-label="Previous slide">←</button>
      <span class="frameseq-counter"></span>
      <button type="button" data-action="next" aria-label="Next slide">→</button>
      ${interactivePreview ? `
        <span class="frameseq-zoom-controls" aria-label="Preview zoom">
          <button type="button" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
          <span class="frameseq-zoom-value" aria-live="polite">100%</span>
          <button type="button" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
          <button type="button" data-action="zoom-fit" aria-label="Fit slide to window" title="Fit slide to window">Fit</button>
          <button type="button" data-action="zoom-reset" aria-label="Reset slide to 100%" title="Reset slide to 100%">1:1</button>
        </span>
      ` : ""}
      ${localRemoteAvailable ? '<button type="button" data-action="remote-pair" aria-label="Pair phone remote" title="Pair phone remote">R</button>' : ""}
      ${localEditingAvailable ? '<button type="button" data-action="edit-toggle" aria-pressed="false" aria-label="Toggle layout editing" title="Drag objects to rewrite their coordinates (Escape to leave)">E</button>' : ""}
      <button type="button" data-action="presenter" aria-label="Open presenter view" title="Open presenter view">P</button>
    `;
    target.append(controls);
  }

  const setLayoutEditing = localEditingAvailable && !presenter && !remote
    ? createLayoutEditor(root, slidesDocument.canvasWidth, signal)
    : undefined;
  // Editing mode survives both a hot canvas swap and a fallback page reload.
  let layoutEditing = readLayoutEditing();
  let audienceZoom: number | undefined;
  let currentAudienceScale = 1;

  function updateLayoutEditing(active: boolean): void {
    if (!setLayoutEditing) return;
    layoutEditing = active;
    storeLayoutEditing(active);
    setLayoutEditing(active);
    const button = controls.querySelector<HTMLButtonElement>('[data-action="edit-toggle"]');
    button?.setAttribute("aria-pressed", String(active));
    if (button) {
      button.title = active
        ? "Editing on · click to select, Ctrl/Command-click to multi-select, Escape to leave"
        : "Enter editing mode";
      button.setAttribute("aria-label", active ? "Layout editing on" : "Layout editing off");
    }
  }

  updateLayoutEditing(layoutEditing);
  // An object drawn from the Studio is there to be arranged, so editing turns on once it lands.
  if (setLayoutEditing && window.parent !== window) {
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
      currentAudienceScale = fitAudienceFrame(frame, root, slidesDocument, audienceZoom);
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
      presenter.nextLabel.textContent = "End of presentation";
      presenter.nextFrame.classList.add("is-empty");
      presenter.nextFrame.textContent = "End";
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
    }
    update();
  }

  function previous(): void {
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

    const dialog = document.createElement("dialog");
    dialog.className = "frameseq-remote-dialog";
    dialog.innerHTML = `
      <div class="frameseq-remote-dialog-header">
        <div>
          <div class="frameseq-remote-dialog-kicker">Local network</div>
          <h2>Pair a phone remote</h2>
        </div>
        <button type="button" data-action="close" aria-label="Close">×</button>
      </div>
      <p>Connect the phone and this computer to the same Wi-Fi, then scan the code.</p>
      <div class="frameseq-remote-qr" aria-live="polite">Preparing local address…</div>
      <label class="frameseq-remote-address-picker">
        <span>Network address</span>
        <select></select>
      </label>
      <code class="frameseq-remote-url"></code>
      <div class="frameseq-remote-dialog-actions">
        <button type="button" data-action="copy">Copy link</button>
        <button type="button" data-action="close">Done</button>
      </div>
      <p class="frameseq-remote-dialog-note">Keep the presentation server and this browser page open while presenting.</p>
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
      qr.textContent = error instanceof Error
        ? `Could not create a phone link: ${error.message}`
        : "Could not create a phone link.";
      picker.closest("label")?.remove();
      urlLabel.remove();
      copyButton.remove();
    }

    dialog.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.action;
      if (action === "close") dialog.close();
      if (action === "copy" && urlLabel.textContent) {
        if (!navigator.clipboard) {
          copyButton.textContent = "Copy unavailable";
          return;
        }
        void navigator.clipboard.writeText(urlLabel.textContent).then(() => {
          copyButton.textContent = "Copied";
        }).catch(() => {
          copyButton.textContent = "Copy failed";
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
    if (button?.dataset.action === "remote-pair") void openRemotePairing();
    if (button?.dataset.action === "remote-here") switchMode("remote");
    if (button?.dataset.action === "edit-toggle") updateLayoutEditing(!layoutEditing);
    if (button?.dataset.action === "zoom-out") setAudienceZoom(currentAudienceScale / 1.1);
    if (button?.dataset.action === "zoom-in") setAudienceZoom(currentAudienceScale * 1.1);
    if (button?.dataset.action === "zoom-fit") setAudienceZoom();
    if (button?.dataset.action === "zoom-reset") setAudienceZoom(1);
  });

  remote?.shell.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.action;
    if (action === "presenter-here") switchMode("presenter");
  });

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
      presenter.timerToggle.textContent = timerRunning ? "Pause" : "Resume";
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
      laserToggle.textContent = enabled ? "Laser: On" : "Laser: Off";
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
    if (remote) setRemoteConnection("Connected", "connected");
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
    if (!remote || !remoteSession) return;
    setRemoteConnection("Waiting for presentation…", "waiting");
    postSyncMessage({ type: "request-state" });
  };
  const receiveDisconnect = (): void => {
    if (remote) setRemoteConnection("Disconnected", "disconnected");
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
      setRemoteConnection("Local remote unavailable", "disconnected");
    } else if (!remoteSession) {
      setRemoteConnection("Invalid pairing link", "disconnected");
    } else {
      setRemoteConnection("Waiting for presentation…", "waiting");
    }
  }

  addEventListener("keydown", (event) => {
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
    const modified = event.ctrlKey || event.altKey || event.metaKey;
    if (interactivePreview
      && event.code === "Digit0"
      && (event.ctrlKey || event.metaKey)
      && !event.altKey
      && !event.shiftKey) {
      event.preventDefault();
      setAudienceZoom(1);
      return;
    }
    if (event.key === "Escape" && layoutEditing) {
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
  postSyncMessage({ type: "request-state" });
  document.documentElement.dataset.ready = "true";
}
