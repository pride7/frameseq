import { mkdir } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import process from "node:process";
import PptxGenJS from "pptxgenjs";
import puppeteer from "puppeteer";
import { build as viteBuild, preview } from "vite";
import { polygonCorners, shapeGeometry, shapePreset } from "../lib/index.js";
import { deckReady, watchDeck } from "./document-errors.mjs";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import { keepSlides, slidesFileSuffix } from "./slide-selection.mjs";

// Canvas pixels per inch of the slide: 96 for a screen presentation, and on paper however many
// the canvas fits across the sheet. Set for each export from the deck it renders.
let cssPixelsPerInch = 96;
let pointsPerCssPixel = 72 / cssPixelsPerInch;

function pptxName(entry, slides) {
  const file = basename(entry, extname(entry));
  return `${file.replace(/\.slides$/, "")}${slidesFileSuffix(slides)}.pptx`;
}

function number(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function cssColor(value, opacity = 1) {
  if (!value || value === "transparent") return undefined;
  const hex = value.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length <= 4
      ? [...hex].map((character) => character.repeat(2)).join("")
      : hex;
    const alpha = expanded.length === 8
      ? Number.parseInt(expanded.slice(6, 8), 16) / 255
      : 1;
    return {
      color: expanded.slice(0, 6).toUpperCase(),
      transparency: clamp(Math.round((1 - alpha * opacity) * 100), 0, 100),
    };
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  if (!rgb) return undefined;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  return {
    color: [rgb[1], rgb[2], rgb[3]]
      .map((channel) => clamp(Math.round(Number(channel)), 0, 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase(),
    transparency: clamp(Math.round((1 - alpha * opacity) * 100), 0, 100),
  };
}

const cjkPattern = /[⺀-鿿豈-﫿＀-￯]/;

function familyList(fontFamily) {
  return String(fontFamily ?? "")
    .split(",")
    .map((family) => family.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

/**
 * PowerPoint stores one typeface per run, so a Latin-only family would leave
 * CJK text to whatever the viewer substitutes. Runs that contain CJK text use
 * the first CJK family from the stack instead; those faces also carry Latin
 * glyphs, so mixed runs stay consistent.
 */
function fontFace(fontFamily, text = "") {
  const families = familyList(fontFamily);
  if (cjkPattern.test(text)) {
    const cjk = families.find((family) => /PingFang|Hiragino|YaHei|Noto (Sans|Serif)( Mono)? CJK|Noto (Sans|Serif)( Mono)? SC|Source Han|Songti|SimSun|Sarasa/i.test(family));
    if (cjk) return cjk;
  }
  const generic = new Set(["sans-serif", "serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "cursive", "fantasy"]);
  return families.find((family) => !generic.has(family.toLowerCase())) || "Arial";
}

function rotation(transform) {
  if (!transform || transform === "none") return 0;
  const matrix = transform.match(/^matrix\(([^)]+)\)$/)?.[1]
    .split(",")
    .map(Number);
  if (!matrix || matrix.length < 2 || matrix.some((value) => !Number.isFinite(value))) return 0;
  return Math.round(Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI * 100) / 100;
}

function position(box) {
  return {
    x: box.x / cssPixelsPerInch,
    y: box.y / cssPixelsPerInch,
    w: Math.max(box.width / cssPixelsPerInch, 0.001),
    h: Math.max(box.height / cssPixelsPerInch, 0.001),
  };
}

function fill(style) {
  const color = cssColor(style.backgroundColor, style.opacity);
  return color && color.transparency < 100
    ? { color: color.color, transparency: color.transparency }
    : { type: "none" };
}

function emptyLine() {
  return { color: "000000", transparency: 100, width: 0 };
}

function dashType(style) {
  return style === "dashed" ? "dash" : style === "dotted" ? "sysDot" : "solid";
}

function borderSides(style) {
  return ["top", "right", "bottom", "left"].map((side) => {
    const suffix = `${side[0].toUpperCase()}${side.slice(1)}`;
    const width = number(style[`border${suffix}Width`]);
    const borderStyle = style[`border${suffix}Style`];
    const color = cssColor(style[`border${suffix}Color`], style.opacity);
    return {
      side,
      width,
      style: borderStyle,
      color,
      visible: width > 0
        && borderStyle !== "none"
        && borderStyle !== "hidden"
        && Boolean(color)
        && color.transparency < 100,
    };
  });
}

function sameBorder(first, second) {
  return first.visible && second.visible
    && Math.abs(first.width - second.width) < 0.001
    && first.style === second.style
    && first.color.color === second.color.color
    && first.color.transparency === second.color.transparency;
}

function uniformBorder(style) {
  const sides = borderSides(style);
  if (!sides.every((side) => sameBorder(sides[0], side))) return undefined;
  return sides[0];
}

function border(style) {
  const side = uniformBorder(style);
  if (!side) return emptyLine();
  return {
    color: side.color.color,
    transparency: side.color.transparency,
    width: Math.max(side.width * pointsPerCssPixel, 0.1),
    dashType: dashType(side.style),
  };
}

function addPartialBorders(pptx, slide, item) {
  if (uniformBorder(item.style)) return;
  for (const side of borderSides(item.style).filter((candidate) => candidate.visible)) {
    const half = side.width / 2;
    const horizontal = side.side === "top" || side.side === "bottom";
    const x = side.side === "right"
      ? item.box.x + item.box.width - half
      : item.box.x + (side.side === "left" ? half : 0);
    const y = side.side === "bottom"
      ? item.box.y + item.box.height - half
      : item.box.y + (side.side === "top" ? half : 0);
    slide.addShape(pptx.ShapeType.line, {
      x: x / cssPixelsPerInch,
      y: y / cssPixelsPerInch,
      w: horizontal ? Math.max(item.box.width / cssPixelsPerInch, 0.001) : 0,
      h: horizontal ? 0 : Math.max(item.box.height / cssPixelsPerInch, 0.001),
      line: {
        color: side.color.color,
        transparency: side.color.transparency,
        width: Math.max(side.width * pointsPerCssPixel, 0.1),
        dashType: dashType(side.style),
      },
      objectName: `FrameSeq border-${side.side} ${item.id}`,
    });
  }
}

function shapeType(pptx, item) {
  if (item.nodeType === "circle") return pptx.ShapeType.ellipse;
  const radius = number(item.style.borderRadius);
  if (radius >= Math.min(item.box.width, item.box.height) * 0.4) {
    return pptx.ShapeType.ellipse;
  }
  return radius > Math.min(item.box.width, item.box.height) * 0.08
    ? pptx.ShapeType.roundRect
    : pptx.ShapeType.rect;
}

function verticalAlignment(style) {
  const display = style.display ?? "";
  let alignment = "";

  if (display.includes("flex")) {
    alignment = style.flexDirection?.startsWith("column")
      ? style.justifyContent
      : style.alignItems;
  } else if (display.includes("grid")) {
    alignment = style.alignItems;
  }

  if (alignment === "center") return "mid";
  if (alignment === "end" || alignment === "flex-end") return "bottom";
  return "top";
}

function textOptions(item, box = item.contentBox) {
  const color = cssColor(item.style.color, item.style.opacity) ?? {
    color: "000000",
    transparency: 0,
  };
  const fontSize = Math.max(number(item.style.fontSize, 16) * pointsPerCssPixel, 1);
  const lineHeight = number(item.style.lineHeight);
  const letterSpacing = number(item.style.letterSpacing);
  const weight = Number.parseInt(item.style.fontWeight, 10);
  const options = {
    ...position(box),
    margin: 0,
    isTextBox: true,
    fontFace: fontFace(item.style.fontFamily, item.text ?? ""),
    fontSize,
    color: color.color,
    transparency: color.transparency,
    bold: Number.isFinite(weight) ? weight >= 600 : /bold/i.test(item.style.fontWeight),
    italic: item.style.fontStyle === "italic" || item.style.fontStyle === "oblique",
    align: item.style.textAlign === "center"
      ? "center"
      : item.style.textAlign === "right" || item.style.textAlign === "end"
        ? "right"
        : "left",
    valign: verticalAlignment(item.style),
    breakLine: false,
    fit: "shrink",
    paraSpaceAfter: 0,
    rotate: rotation(item.style.transform),
    objectName: `FrameSeq ${item.nodeType ?? item.kind} ${item.id}`,
  };
  if (lineHeight > 0) options.lineSpacing = lineHeight * pointsPerCssPixel;
  if (letterSpacing !== 0) options.charSpacing = letterSpacing * pointsPerCssPixel;
  if (item.style.textDecorationLine.includes("underline")) {
    options.underline = { style: "sng", color: color.color };
  }
  return options;
}

function addDecoration(pptx, slide, item) {
  const itemFill = fill(item.style);
  const itemLine = border(item.style);
  if (itemFill.type !== "none" || itemLine.transparency < 100) {
    slide.addShape(shapeType(pptx, item), {
      ...position(item.box),
      fill: itemFill,
      line: itemLine,
      objectName: `FrameSeq decoration ${item.id}`,
    });
  }
  addPartialBorders(pptx, slide, item);
}

/**
 * Text whose words are marked bold, in italics, or in a colour of their own, as runs PowerPoint
 * keeps editable, each with its own type; a line break ends a paragraph, as in the text itself.
 */
function richText(runs) {
  return runs.flatMap((run) => {
    const color = cssColor(run.color);
    const parts = run.text.split("\n");
    return parts.flatMap((part, index) => {
      const options = { bold: run.bold, italic: run.italic, ...(color ? { color: color.color } : {}) };
      if (index < parts.length - 1) options.breakLine = true;
      return part || options.breakLine ? [{ text: part, options }] : [];
    });
  });
}

function addText(pptx, slide, item) {
  addDecoration(pptx, slide, item);
  if (!item.text) return;
  slide.addText(item.runs ? richText(item.runs) : item.text, textOptions(item));
}

function addMarker(pptx, slide, item) {
  addDecoration(pptx, slide, item);

  if (item.marker?.type === "bullet") {
    const dot = cssColor(item.marker.color, item.style.opacity) ?? {
      color: "000000",
      transparency: 0,
    };
    const width = Math.max(item.marker.width, 1);
    const height = Math.max(item.marker.height, 1);
    slide.addShape(pptx.ShapeType.ellipse, {
      x: (item.box.x + (item.box.width - width) / 2) / cssPixelsPerInch,
      y: (item.box.y + (item.box.height - height) / 2) / cssPixelsPerInch,
      w: width / cssPixelsPerInch,
      h: height / cssPixelsPerInch,
      fill: { color: dot.color, transparency: dot.transparency },
      line: { color: dot.color, transparency: 100, width: 0 },
      objectName: `FrameSeq bullet ${item.id}`,
    });
    return;
  }

  if (!item.text) return;
  slide.addText(item.text, {
    ...textOptions(item, item.box),
    align: "center",
    valign: "mid",
    margin: 0,
    objectName: `FrameSeq marker ${item.id}`,
  });
}

function addShape(pptx, slide, item) {
  const padding = [
    item.style.paddingTop,
    item.style.paddingRight,
    item.style.paddingBottom,
    item.style.paddingLeft,
  ].map((value) => number(value) * pointsPerCssPixel);
  slide.addText(item.runs ? richText(item.runs) : item.text ?? "", {
    ...textOptions(item, item.box),
    shape: shapeType(pptx, item),
    fill: fill(item.style),
    line: border(item.style),
    margin: padding,
    valign: "mid",
    objectName: `FrameSeq ${item.nodeType} ${item.id}`,
  });
  addPartialBorders(pptx, slide, item);
}

/**
 * A shape() becomes PowerPoint's own preset of the same outline, so it can still be restyled,
 * resized, or swapped for another shape there. The preset places its label in its own room.
 * A polygon() has no preset, and becomes a freeform through its own corners instead.
 */
function addVectorShape(pptx, slide, item) {
  const { shape, box } = item;
  const fillColor = cssColor(shape.fill, item.style.opacity);
  const strokeColor = cssColor(shape.stroke, item.style.opacity);
  const options = {
    ...textOptions(item, box),
    isTextBox: false,
    shape: shape.kind === "polygon" ? pptx.ShapeType.custGeom : shapePreset(shape.kind),
    fill: fillColor && fillColor.transparency < 100
      ? { color: fillColor.color, transparency: fillColor.transparency }
      : undefined,
    line: strokeColor && strokeColor.transparency < 100 && shape.strokeWidth > 0
      ? {
        color: strokeColor.color,
        transparency: strokeColor.transparency,
        width: Math.max(shape.strokeWidth * pointsPerCssPixel, 0.1),
        dashType: shape.dashed ? "dash" : "solid",
      }
      : emptyLine(),
    // Left, right, bottom, top, inside the preset's own room for text.
    margin: [6, 6, 3, 3].map((value) => value * pointsPerCssPixel),
    align: "center",
    valign: "mid",
    objectName: `FrameSeq shape ${shape.kind} ${item.id}`,
  };
  if (shape.kind === "polygon") {
    const outline = shapeGeometry("polygon", box.width, box.height, { points: shape.points, strokeWidth: shape.strokeWidth }).outline;
    options.points = [
      ...(polygonCorners(outline) ?? []).map(([x, y]) => ({ x: x / cssPixelsPerInch, y: y / cssPixelsPerInch })),
      { close: true },
    ];
  }
  const shortSide = Math.min(box.width, box.height);
  const radius = shape.kind === "pill"
    ? shortSide / 2
    : shape.kind === "rounded" ? shape.radius ?? shortSide * 0.16667 : shape.radius;
  if ((shape.kind === "pill" || shape.kind === "rounded" || shape.kind === "rect") && radius > 0) {
    options.shape = pptx.ShapeType.roundRect;
    options.rectRadius = radius / cssPixelsPerInch;
  }
  if (shape.shadow) {
    options.shadow = { type: "outer", blur: 8, offset: 3, angle: 90, color: "0F172A", opacity: 0.2 };
  }
  slide.addText(item.runs ? richText(item.runs) : item.text ?? "", options);
}

function lineStroke(item) {
  const stroke = cssColor(item.line.stroke, item.style.opacity) ?? {
    color: "000000",
    transparency: 0,
  };
  return {
    color: stroke.color,
    transparency: stroke.transparency,
    width: Math.max(item.line.strokeWidth * pointsPerCssPixel, 0.1),
    dashType: item.line.dashed ? "dash" : "solid",
    beginArrowType: item.line.startArrow ? "triangle" : "none",
    endArrowType: item.line.endArrow ? "triangle" : "none",
  };
}

/** A connector's label, as a small text box that hides the line behind it, as on the slide. */
function addLineLabel(pptx, slide, item) {
  const label = item.line.label;
  if (!label?.text) return;
  const labelItem = { ...item, text: label.text, style: label.style, box: label.box, nodeType: "line label" };
  const background = cssColor(label.style.backgroundColor);
  slide.addText(label.text, {
    ...textOptions(labelItem, label.box),
    isTextBox: false,
    shape: pptx.ShapeType.roundRect,
    rectRadius: label.box.height / 2 / cssPixelsPerInch,
    fill: background && background.transparency < 100
      ? { color: background.color, transparency: background.transparency }
      : undefined,
    line: emptyLine(),
    margin: 0,
    align: "center",
    valign: "mid",
    fit: "none",
    objectName: `FrameSeq line label ${item.id}`,
  });
}

function addLine(pptx, slide, item) {
  const { x1, y1, x2, y2, points, route } = item.line;
  // An elbow, a curve, or a connector through stops has no preset that bends where FrameSeq
  // routed it, so it is drawn as a path of its own, still a line PowerPoint can recolour and restyle.
  if (Array.isArray(points) && points.length >= 2 && (route === "elbow" || route === "curve" || points.length > 2)) {
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    const local = (point) => ({ x: (point.x - left) / cssPixelsPerInch, y: (point.y - top) / cssPixelsPerInch });
    const path = route === "curve" && points.length === 4
      ? [local(points[0]), {
        ...local(points[3]),
        curve: {
          type: "cubic",
          x1: local(points[1]).x,
          y1: local(points[1]).y,
          x2: local(points[2]).x,
          y2: local(points[2]).y,
        },
      }]
      : points.map(local);
    slide.addShape(pptx.ShapeType.custGeom, {
      x: left / cssPixelsPerInch,
      y: top / cssPixelsPerInch,
      w: Math.max((right - left) / cssPixelsPerInch, 0.001),
      h: Math.max((bottom - top) / cssPixelsPerInch, 0.001),
      points: path,
      line: lineStroke(item),
      objectName: `FrameSeq line ${item.id}`,
    });
    addLineLabel(pptx, slide, item);
    return;
  }
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  slide.addShape(pptx.ShapeType.line, {
    x: x / cssPixelsPerInch,
    y: y / cssPixelsPerInch,
    w: Math.max(Math.abs(x2 - x1) / cssPixelsPerInch, 0.001),
    h: Math.max(Math.abs(y2 - y1) / cssPixelsPerInch, 0.001),
    flipH: x2 < x1,
    flipV: y2 < y1,
    line: lineStroke(item),
    objectName: `FrameSeq line ${item.id}`,
  });
  addLineLabel(pptx, slide, item);
}

function tableBorder(width, style, color) {
  if (!(width > 0) || !color || style === "none" || style === "hidden" || color.transparency >= 100) return { type: "none" };
  return { type: dashType(style) === "solid" ? "solid" : "dash", pt: Math.max(width * pointsPerCssPixel, 0.25), color: color.color };
}

/**
 * A table becomes a PowerPoint table, so its text stays editable cell by cell and the rows keep
 * their measured widths, heights, and rules.
 */
function addTable(slide, item) {
  const { rows, columnWidths, rowHeights } = item.table;
  const last = rows.length - 1;
  const tableTop = tableBorder(number(item.style.borderTopWidth), item.style.borderTopStyle, cssColor(item.style.borderTopColor));
  const tableBottom = tableBorder(number(item.style.borderBottomWidth), item.style.borderBottomStyle, cssColor(item.style.borderBottomColor));
  const cells = rows.map((row, rowIndex) => row.map((cell) => {
    const style = cell.style;
    const color = cssColor(style.color) ?? { color: "000000", transparency: 0 };
    const background = cssColor(style.backgroundColor);
    const weight = Number.parseInt(style.fontWeight, 10);
    const top = rowIndex === 0 ? tableTop : tableBorder(number(style.borderTopWidth), style.borderTopStyle, cssColor(style.borderTopColor));
    const bottom = rowIndex === last ? tableBottom : tableBorder(number(style.borderBottomWidth), style.borderBottomStyle, cssColor(style.borderBottomColor));
    return {
      text: cell.runs ? richText(cell.runs) : cell.text,
      options: {
        fontFace: fontFace(style.fontFamily, cell.text),
        fontSize: Math.max(number(style.fontSize, 16) * pointsPerCssPixel, 1),
        color: color.color,
        bold: Number.isFinite(weight) ? weight >= 600 : false,
        align: style.textAlign === "right" || style.textAlign === "end" ? "right" : style.textAlign === "center" ? "center" : "left",
        valign: "middle",
        margin: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
          .map((value) => number(value) / cssPixelsPerInch),
        border: [top, { type: "none" }, bottom, { type: "none" }],
        ...(background && background.transparency < 100 ? { fill: { color: background.color, transparency: background.transparency } } : {}),
      },
    };
  }));
  slide.addTable(cells, {
    ...position(item.box),
    colW: columnWidths.map((width) => width / cssPixelsPerInch),
    rowH: rowHeights.map((height) => height / cssPixelsPerInch),
    autoPage: false,
    objectName: `FrameSeq table ${item.id}`,
  });
}

/** A chart becomes a PowerPoint chart drawn from the same data, which can be edited there. */
function addChart(pptx, slide, item) {
  const { spec, fontFamily, fontSize, foreground, muted, grid, palette } = item.chart;
  const hex = (value) => cssColor(value)?.color;
  const types = { bar: pptx.ChartType.bar, hbar: pptx.ChartType.bar, line: pptx.ChartType.line, pie: pptx.ChartType.pie, donut: pptx.ChartType.doughnut };
  const pie = spec.kind === "pie" || spec.kind === "donut";
  const colors = (spec.colors?.length ? spec.colors : palette).map(hex).filter(Boolean);
  const size = Math.max(fontSize * pointsPerCssPixel * 0.85, 6);
  const named = spec.series.filter((series) => series.name).length;
  const showValues = spec.showValues ?? (pie || (spec.kind !== "line" && spec.series.length === 1 && spec.labels.length <= 12));
  const unit = spec.unit ? spec.unit.replace(/"/g, "") : "";
  slide.addChart(types[spec.kind], spec.series.map((series, index) => ({
    name: series.name || (pie ? "Share" : `Series ${index + 1}`),
    labels: spec.labels,
    values: series.values,
  })), {
    ...position(item.box),
    chartColors: colors,
    barDir: spec.kind === "hbar" ? "bar" : "col",
    barGrouping: "clustered",
    holeSize: spec.kind === "donut" ? 58 : undefined,
    showLegend: spec.legend ?? (pie || named > 1),
    legendPos: "t",
    legendFontSize: size,
    legendFontFace: fontFace(fontFamily),
    legendColor: hex(foreground),
    showValue: showValues && !pie,
    showPercent: showValues && pie && !unit,
    dataLabelFormatCode: unit ? `#,##0.##"${unit}"` : undefined,
    dataLabelFontSize: size,
    dataLabelColor: pie ? "FFFFFF" : hex(foreground),
    dataLabelPosition: pie ? "ctr" : "outEnd",
    catAxisLabelFontSize: size,
    catAxisLabelColor: hex(foreground),
    catAxisLabelFontFace: fontFace(fontFamily),
    valAxisLabelFontSize: size,
    valAxisLabelColor: hex(muted),
    valAxisLabelFontFace: fontFace(fontFamily),
    valAxisLabelFormatCode: unit ? `#,##0.##"${unit}"` : undefined,
    valAxisMaxVal: spec.max,
    valGridLine: { color: hex(grid) ?? "E5E7EB", style: "solid", size: 0.75 },
    catGridLine: { style: "none" },
    lineSize: 2.5,
    lineDataSymbolSize: 7,
    objectName: `FrameSeq chart ${item.id}`,
  });
}

async function screenshotData(page, selector) {
  const element = await page.$(selector);
  if (!element) throw new Error(`PPTX export could not find ${selector}`);
  const data = await element.screenshot({ type: "png", encoding: "base64" });
  return `data:image/png;base64,${data}`;
}

/**
 * A picture on a slide's master, taken with the slide's own content hidden, which a screenshot
 * would otherwise bake into it: the slide's objects are exported above it on their own.
 */
async function masterScreenshotData(page, slideIndex, id) {
  const toggle = (on) => page.evaluate((index, hidden) => {
    const slide = document.querySelector(`[data-frameseq-export-slide="${index}"]`);
    for (const child of slide?.children ?? []) {
      if (!child.classList.contains("frameseq-master-layer")) child.style.visibility = hidden ? "hidden" : "";
    }
  }, slideIndex, on);
  await toggle(true);
  try {
    return await screenshotData(page, `[data-frameseq-export-id="${id}"]`);
  } finally {
    await toggle(false);
  }
}

async function captureSlides(page) {
  return page.evaluate(() => {
    const slideElements = Array.from(document.querySelectorAll(".frameseq-slide-frame > .frameseq-slide"));
    let exportSequence = 0;
    const selector = [
      '[data-frameseq-node="row"]',
      '[data-frameseq-node="column"]',
      '[data-frameseq-node="stack"]',
      '[data-frameseq-node="text"]',
      '[data-frameseq-node="image"]',
      '[data-frameseq-node="code"]',
      '[data-frameseq-node="equation"]',
      '[data-frameseq-node="typst"]',
      '[data-frameseq-node="latex"]',
      '[data-frameseq-node="rect"]',
      '[data-frameseq-node="circle"]',
      '[data-frameseq-node="shape"]',
      '[data-frameseq-node="line"]',
      '[data-frameseq-node="table"]',
      '[data-frameseq-node="chart"]',
      '[data-frameseq-node="qr"]',
      '[data-frameseq-node="icon"]',
      ".frameseq-theme-header",
      ".frameseq-theme-header .frameseq-text",
      ".frameseq-theme-title-bar",
      ".frameseq-theme-footer",
      ".frameseq-theme-footer-author",
      ".frameseq-theme-footer-institute",
      ".frameseq-theme-footer-title",
      ".frameseq-theme-footer-details",
      ".frameseq-auto-title-page > .frameseq-text",
      ".frameseq-cover-rule",
    ].join(",");

    const px = (value) => Number.parseFloat(value) || 0;
    const styleSnapshot = (style) => ({
      alignItems: style.alignItems,
      backgroundColor: style.backgroundColor,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
      borderBottomColor: style.borderBottomColor,
      borderLeftColor: style.borderLeftColor,
      borderTopStyle: style.borderTopStyle,
      borderRightStyle: style.borderRightStyle,
      borderBottomStyle: style.borderBottomStyle,
      borderLeftStyle: style.borderLeftStyle,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      borderRadius: style.borderTopLeftRadius,
      color: style.color,
      display: style.display,
      flexDirection: style.flexDirection,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontStyle: style.fontStyle,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      opacity: Number.parseFloat(style.opacity) || 1,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      justifyContent: style.justifyContent,
      textAlign: style.textAlign,
      textDecorationLine: style.textDecorationLine,
      transform: style.transform,
      visibility: style.visibility,
    });
    const relativeBox = (element, slideRect, style, content = false) => {
      const rect = element.getBoundingClientRect();
      const borderLeft = content ? px(style.borderLeftWidth) : 0;
      const borderRight = content ? px(style.borderRightWidth) : 0;
      const borderTop = content ? px(style.borderTopWidth) : 0;
      const borderBottom = content ? px(style.borderBottomWidth) : 0;
      const paddingLeft = content ? px(style.paddingLeft) : 0;
      const paddingRight = content ? px(style.paddingRight) : 0;
      const paddingTop = content ? px(style.paddingTop) : 0;
      const paddingBottom = content ? px(style.paddingBottom) : 0;
      return {
        x: rect.left - slideRect.left + borderLeft + paddingLeft,
        y: rect.top - slideRect.top + borderTop + paddingTop,
        width: Math.max(rect.width - borderLeft - borderRight - paddingLeft - paddingRight, 0),
        height: Math.max(rect.height - borderTop - borderBottom - paddingTop - paddingBottom, 0),
      };
    };
    // The words of text that marks some of them bold, in italics, or in a colour, run by run.
    const runsOf = (host) => {
      if (!host?.querySelector(".frameseq-run")) return undefined;
      const runs = [];
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const style = getComputedStyle(node.parentElement);
        const weight = Number.parseInt(style.fontWeight, 10);
        runs.push({ text: node.textContent, bold: weight >= 600, italic: style.fontStyle === "italic", color: style.color });
      }
      if (runs.length > 0) runs[runs.length - 1].text = runs[runs.length - 1].text.trimEnd();
      return runs;
    };
    const hasDecoration = (style) => {
      const background = style.backgroundColor;
      const visibleBackground = background !== "transparent"
        && !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(background);
      return visibleBackground || px(style.borderTopWidth) > 0
        || px(style.borderRightWidth) > 0
        || px(style.borderBottomWidth) > 0
        || px(style.borderLeftWidth) > 0;
    };

    const slides = slideElements.map((slide, position) => {
      // Its place in the whole presentation, when only some of its slides are exported.
      const slideIndex = Number(slide.parentElement?.dataset.index ?? position);
      const slideRect = slide.getBoundingClientRect();
      slide.dataset.frameseqExportSlide = String(slideIndex);
      const items = [];

      for (const element of slide.querySelectorAll(selector)) {
        if (!(element instanceof HTMLElement)) continue;
        const computed = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (computed.display === "none" || computed.visibility === "hidden"
          || rect.width < 0.5 || rect.height < 0.5) continue;

        const nodeType = element.dataset.frameseqNode;
        const listMarker = element.classList.contains("frameseq-list-marker");
        let kind;
        if (listMarker) kind = "marker";
        else if (nodeType === "line") kind = "line";
        // A label with math in it has no native equivalent, so it travels as a picture.
        else if (nodeType === "rect" || nodeType === "circle") kind = element.querySelector(".frameseq-inline-math") ? "raster" : "shape";
        // A shape() label with math in it has no native equivalent, so it travels as a picture.
        else if (nodeType === "shape") kind = element.querySelector(".frameseq-inline-math") ? "raster" : "vshape";
        // A table becomes an editable table unless math in a cell needs the picture of it.
        else if (nodeType === "table") kind = element.querySelector(".frameseq-inline-math") ? "raster" : "table";
        else if (nodeType === "chart") kind = "chart";
        else if (["image", "equation", "typst", "latex", "qr", "icon"].includes(nodeType)) kind = "raster";
        else if (nodeType === "text" || nodeType === "code"
          || element.matches(".frameseq-theme-title-bar, .frameseq-theme-footer-author, .frameseq-theme-footer-institute, .frameseq-theme-footer-title, .frameseq-theme-footer-details, .frameseq-auto-title-page > .frameseq-text, .frameseq-theme-header .frameseq-text")) {
          kind = element.querySelector(".frameseq-inline-math") ? "raster" : "text";
        }
        else if (hasDecoration(computed)) kind = "decoration";
        else continue;

        exportSequence += 1;
        const id = String(exportSequence);
        element.dataset.frameseqExportId = id;
        const item = {
          id,
          kind,
          nodeType: nodeType ?? "chrome",
          master: Boolean(element.closest(".frameseq-master-layer")),
          text: kind === "text" || kind === "shape" || kind === "marker"
            ? (element.innerText || element.textContent || "").trimEnd()
            : undefined,
          box: relativeBox(element, slideRect, computed),
          contentBox: relativeBox(element, slideRect, computed, true),
          style: styleSnapshot(computed),
          runs: kind === "text" || kind === "shape" ? runsOf(element) : undefined,
        };

        if (kind === "marker" && item.text === "•") {
          const pseudo = getComputedStyle(element, "::before");
          const pseudoVisible = pseudo.content !== "none"
            && px(pseudo.width) > 0
            && px(pseudo.height) > 0;
          const fallbackDiameter = Math.max(px(computed.fontSize) * 0.32, 3);
          item.marker = {
            type: "bullet",
            color: pseudoVisible ? pseudo.backgroundColor : computed.color,
            width: pseudoVisible ? px(pseudo.width) : fallbackDiameter,
            height: pseudoVisible ? px(pseudo.height) : fallbackDiameter,
          };
        } else if (kind === "marker") {
          item.marker = { type: "label" };
        }

        if (kind === "table") {
          const rows = Array.from(element.rows);
          item.table = {
            rows: rows.map((row) => Array.from(row.cells).map((cell) => ({
              text: (cell.innerText || cell.textContent || "").trim(),
              runs: runsOf(cell),
              style: styleSnapshot(getComputedStyle(cell)),
            }))),
            columnWidths: rows[0] ? Array.from(rows[0].cells).map((cell) => cell.getBoundingClientRect().width) : [],
            rowHeights: rows.map((row) => row.getBoundingClientRect().height),
          };
        }

        if (kind === "chart") {
          const variable = (name, fallback) => computed.getPropertyValue(name).trim() || fallback;
          item.chart = {
            spec: JSON.parse(element.dataset.frameseqChart),
            fontFamily: computed.fontFamily,
            fontSize: px(computed.fontSize),
            foreground: variable("--frameseq-foreground", "#111827"),
            muted: variable("--frameseq-muted", "#4b5563"),
            grid: variable("--frameseq-border", "#e5e7eb"),
            palette: [variable("--frameseq-accent", "#2563eb"), "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#64748b"],
          };
        }

        if (kind === "vshape") {
          const drawing = JSON.parse(element.dataset.frameseqDrawing ?? "{}");
          const body = element.querySelector(".frameseq-shape-body");
          const label = element.querySelector(".frameseq-shape-label");
          const bodyStyle = body ? getComputedStyle(body) : undefined;
          item.text = (label?.innerText || label?.textContent || "").trimEnd();
          item.runs = runsOf(label);
          // The label carries the type; the shape itself carries opacity and rotation.
          item.style = {
            ...styleSnapshot(label ? getComputedStyle(label) : computed),
            opacity: Number.parseFloat(computed.opacity) || 1,
            transform: computed.transform,
          };
          item.shape = {
            kind: drawing.kind,
            points: drawing.points,
            fill: bodyStyle?.fill,
            stroke: bodyStyle?.stroke,
            strokeWidth: px(bodyStyle?.strokeWidth),
            dashed: drawing.dashed === true,
            radius: drawing.radius,
            shadow: Boolean(element.querySelector(".frameseq-shape-outline.has-shadow")),
          };
        }

        if (kind === "line") {
          const vector = element.querySelector(":scope > svg > line, :scope > svg > path");
          const matrix = vector?.getScreenCTM();
          if (!vector || !matrix) continue;
          const point = (x, y) => {
            const transformed = new DOMPoint(x, y).matrixTransform(matrix);
            return { x: transformed.x - slideRect.left, y: transformed.y - slideRect.top };
          };
          const routed = vector.tagName.toLowerCase() === "path";
          const corners = routed ? JSON.parse(vector.dataset.frameseqPoints ?? "[]").map(([x, y]) => point(x, y)) : [];
          const start = routed ? corners[0] : point(Number(vector.getAttribute("x1")), Number(vector.getAttribute("y1")));
          const end = routed ? corners[corners.length - 1] : point(Number(vector.getAttribute("x2")), Number(vector.getAttribute("y2")));
          if (!start || !end) continue;
          const vectorStyle = getComputedStyle(vector);
          const label = element.querySelector(":scope > .frameseq-line-label");
          item.line = {
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            route: routed ? vector.dataset.frameseqRoute : "straight",
            points: routed ? corners : undefined,
            stroke: vectorStyle.stroke,
            strokeWidth: px(vectorStyle.strokeWidth),
            dashed: Boolean(vector.getAttribute("stroke-dasharray")),
            startArrow: Boolean(vector.getAttribute("marker-start")),
            endArrow: Boolean(vector.getAttribute("marker-end")),
            label: label
              ? {
                text: (label.innerText || label.textContent || "").trim(),
                box: relativeBox(label, slideRect, getComputedStyle(label)),
                style: styleSnapshot(getComputedStyle(label)),
              }
              : undefined,
          };
        }
        items.push(item);
      }

      // A master that paints the whole page paints the slide's background.
      const master = slide.querySelector(":scope > .frameseq-master-layer");
      const masterBackground = master ? getComputedStyle(master).backgroundColor : "";
      const paintsBackground = masterBackground
        && masterBackground !== "transparent"
        && !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(masterBackground);
      return {
        index: slideIndex,
        label: slide.dataset.frameseqSlideLabel ?? `Slide ${slideIndex + 1}`,
        notes: slide.dataset.frameseqNotes ?? "",
        backgroundColor: paintsBackground ? masterBackground : getComputedStyle(slide).backgroundColor,
        items,
      };
    });

    const rootStyles = getComputedStyle(document.documentElement);
    const width = Number.parseFloat(rootStyles.getPropertyValue("--slide-width"));
    return {
      title: document.title,
      width,
      height: Number.parseFloat(rootStyles.getPropertyValue("--slide-height")),
      printWidth: Number.parseFloat(rootStyles.getPropertyValue("--slide-print-width")) || width,
      slides,
    };
  });
}

export async function exportPptx({
  entry,
  requestedOutput,
  flatten = false,
  slides: chosen,
  packageRoot,
  configFile,
}) {
  const buildDirectory = resolve(process.cwd(), "tmp", "frameseq-pptx-build");
  process.env.FRAMESEQ_ENTRY = entry;
  process.env.FRAMESEQ_BUILD_DIR = buildDirectory;
  process.env.FRAMESEQ_SOURCE_MARKS = "1";

  await viteBuild({ configFile, root: packageRoot });
  const server = await preview({
    configFile,
    root: packageRoot,
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: false,
    },
  });
  const address = server.httpServer.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Could not determine PPTX preview server address");
  }

  const browser = await puppeteer.launch(puppeteerLaunchOptions());
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
    await watchDeck(page);
    await page.goto(`http://127.0.0.1:${address.port}/?print=1&pptx=1`, {
      waitUntil: "networkidle0",
    });
    await deckReady(page, entry);
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMediaType("screen");
    if (chosen) await keepSlides(page, chosen);

    let slides = await captureSlides(page);
    await page.setViewport({
      width: Math.ceil(slides.width),
      height: Math.ceil(slides.height),
      deviceScaleFactor: 2,
    });
    await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
    slides = await captureSlides(page);

    const pptx = new PptxGenJS();
    const layoutName = "FRAMESEQ";
    cssPixelsPerInch = slides.width / (slides.printWidth / 96);
    pointsPerCssPixel = 72 / cssPixelsPerInch;
    const width = slides.width / cssPixelsPerInch;
    const height = slides.height / cssPixelsPerInch;
    pptx.defineLayout({ name: layoutName, width, height });
    pptx.layout = layoutName;
    pptx.title = slides.title;
    pptx.subject = `Exported from FrameSeq (${flatten ? "flattened" : "editable"})`;
    pptx.author = "FrameSeq";
    pptx.company = "FrameSeq";
    pptx.lang = "en-US";

    for (const slideData of slides.slides) {
      const slide = pptx.addSlide();
      const background = cssColor(slideData.backgroundColor);
      if (background && background.transparency < 100) {
        slide.background = { color: background.color, transparency: background.transparency };
      }
      if (slideData.notes) slide.addNotes(slideData.notes);

      if (flatten) {
        const data = await screenshotData(
          page,
          `[data-frameseq-export-slide="${slideData.index}"]`,
        );
        slide.addImage({ data, x: 0, y: 0, w: width, h: height, objectName: `FrameSeq slide ${slideData.index + 1}` });
        continue;
      }

      for (const item of slideData.items) {
        if (item.kind === "decoration") addDecoration(pptx, slide, item);
        if (item.kind === "text") addText(pptx, slide, item);
        if (item.kind === "marker") addMarker(pptx, slide, item);
        if (item.kind === "shape") addShape(pptx, slide, item);
        if (item.kind === "vshape") addVectorShape(pptx, slide, item);
        if (item.kind === "line" && item.line) addLine(pptx, slide, item);
        if (item.kind === "table") addTable(slide, item);
        if (item.kind === "chart") addChart(pptx, slide, item);
        if (item.kind === "raster") {
          const data = item.master
            ? await masterScreenshotData(page, slideData.index, item.id)
            : await screenshotData(page, `[data-frameseq-export-id="${item.id}"]`);
          slide.addImage({ data, ...position(item.box), objectName: `FrameSeq ${item.nodeType} ${item.id}` });
        }
      }
    }

    const defaultOutput = resolve(process.cwd(), "output", "pptx", pptxName(entry, chosen));
    const outputPath = resolve(requestedOutput ?? defaultOutput);
    await mkdir(dirname(outputPath), { recursive: true });
    await pptx.writeFile({ fileName: outputPath, compression: true });
    console.log(`PPTX exported to ${outputPath}${flatten ? " (flattened)" : ""}`);
  } finally {
    await browser.close();
    await server.close();
  }
}
