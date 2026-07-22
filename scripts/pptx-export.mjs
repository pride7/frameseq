import { mkdir } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import process from "node:process";
import PptxGenJS from "pptxgenjs";
import puppeteer from "puppeteer";
import { build as viteBuild, preview } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const cssPixelsPerInch = 96;
const pointsPerCssPixel = 72 / cssPixelsPerInch;

function pptxName(entry) {
  const file = basename(entry, extname(entry));
  return `${file.replace(/\.slides$/, "")}.pptx`;
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

function fontFace(fontFamily) {
  return fontFamily
    .split(",", 1)[0]
    .trim()
    .replace(/^['"]|['"]$/g, "") || "Arial";
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

function border(style) {
  const widths = [
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ].map((value) => number(value));
  const width = Math.max(...widths);
  const color = cssColor(style.borderColor, style.opacity);
  if (width <= 0 || !color || color.transparency >= 100 || style.borderStyle === "none") {
    return { color: "000000", transparency: 100, width: 0 };
  }
  return {
    color: color.color,
    transparency: color.transparency,
    width: Math.max(width * pointsPerCssPixel, 0.1),
    dashType: style.borderStyle === "dashed"
      ? "dash"
      : style.borderStyle === "dotted"
        ? "sysDot"
        : "solid",
  };
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
    fontFace: fontFace(item.style.fontFamily),
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
    valign: item.style.display.includes("flex") && item.style.alignItems === "center"
      ? "mid"
      : "top",
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
  if (itemFill.type === "none" && itemLine.transparency === 100) return;
  slide.addShape(shapeType(pptx, item), {
    ...position(item.box),
    fill: itemFill,
    line: itemLine,
    objectName: `FrameSeq decoration ${item.id}`,
  });
}

function addText(pptx, slide, item) {
  addDecoration(pptx, slide, item);
  if (!item.text) return;
  slide.addText(item.text, textOptions(item));
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
  slide.addText(item.text ?? "", {
    ...textOptions(item, item.box),
    shape: shapeType(pptx, item),
    fill: fill(item.style),
    line: border(item.style),
    margin: padding,
    valign: "mid",
    objectName: `FrameSeq ${item.nodeType} ${item.id}`,
  });
}

function addLine(pptx, slide, item) {
  const { x1, y1, x2, y2 } = item.line;
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const stroke = cssColor(item.line.stroke, item.style.opacity) ?? {
    color: "000000",
    transparency: 0,
  };
  slide.addShape(pptx.ShapeType.line, {
    x: x / cssPixelsPerInch,
    y: y / cssPixelsPerInch,
    w: Math.max(Math.abs(x2 - x1) / cssPixelsPerInch, 0.001),
    h: Math.max(Math.abs(y2 - y1) / cssPixelsPerInch, 0.001),
    flipH: x2 < x1,
    flipV: y2 < y1,
    line: {
      color: stroke.color,
      transparency: stroke.transparency,
      width: Math.max(item.line.strokeWidth * pointsPerCssPixel, 0.1),
      beginArrowType: item.line.startArrow ? "triangle" : "none",
      endArrowType: item.line.endArrow ? "triangle" : "none",
    },
    objectName: `FrameSeq line ${item.id}`,
  });
}

async function screenshotData(page, selector) {
  const element = await page.$(selector);
  if (!element) throw new Error(`PPTX export could not find ${selector}`);
  const data = await element.screenshot({ type: "png", encoding: "base64" });
  return `data:image/png;base64,${data}`;
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
      '[data-frameseq-node="line"]',
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
      borderColor: style.borderTopColor,
      borderStyle: style.borderTopStyle,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      borderRadius: style.borderTopLeftRadius,
      color: style.color,
      display: style.display,
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
    const hasDecoration = (style) => {
      const background = style.backgroundColor;
      const visibleBackground = background !== "transparent"
        && !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(background);
      return visibleBackground || px(style.borderTopWidth) > 0
        || px(style.borderRightWidth) > 0
        || px(style.borderBottomWidth) > 0
        || px(style.borderLeftWidth) > 0;
    };

    const slides = slideElements.map((slide, slideIndex) => {
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
        else if (nodeType === "rect" || nodeType === "circle") kind = "shape";
        else if (["image", "equation", "typst", "latex"].includes(nodeType)) kind = "raster";
        else if (nodeType === "text" || nodeType === "code"
          || element.matches(".frameseq-theme-title-bar, .frameseq-theme-footer-author, .frameseq-theme-footer-institute, .frameseq-theme-footer-title, .frameseq-theme-footer-details, .frameseq-auto-title-page > .frameseq-text")) {
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
          text: kind === "text" || kind === "shape" || kind === "marker"
            ? (element.innerText || element.textContent || "").trimEnd()
            : undefined,
          box: relativeBox(element, slideRect, computed),
          contentBox: relativeBox(element, slideRect, computed, true),
          style: styleSnapshot(computed),
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

        if (kind === "line") {
          const vector = element.querySelector("line");
          const matrix = vector?.getScreenCTM();
          if (!vector || !matrix) continue;
          const point = (x, y) => {
            const transformed = new DOMPoint(x, y).matrixTransform(matrix);
            return { x: transformed.x - slideRect.left, y: transformed.y - slideRect.top };
          };
          const start = point(Number(vector.getAttribute("x1")), Number(vector.getAttribute("y1")));
          const end = point(Number(vector.getAttribute("x2")), Number(vector.getAttribute("y2")));
          const vectorStyle = getComputedStyle(vector);
          item.line = {
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            stroke: vectorStyle.stroke,
            strokeWidth: px(vectorStyle.strokeWidth),
            startArrow: Boolean(vector.getAttribute("marker-start")),
            endArrow: Boolean(vector.getAttribute("marker-end")),
          };
        }
        items.push(item);
      }

      return {
        index: slideIndex,
        label: slide.dataset.frameseqSlideLabel ?? `Slide ${slideIndex + 1}`,
        notes: slide.dataset.frameseqNotes ?? "",
        backgroundColor: getComputedStyle(slide).backgroundColor,
        items,
      };
    });

    const rootStyles = getComputedStyle(document.documentElement);
    return {
      title: document.title,
      width: Number.parseFloat(rootStyles.getPropertyValue("--slide-width")),
      height: Number.parseFloat(rootStyles.getPropertyValue("--slide-height")),
      slides,
    };
  });
}

export async function exportPptx({
  entry,
  requestedOutput,
  flatten = false,
  packageRoot,
  configFile,
}) {
  const buildDirectory = resolve(process.cwd(), "tmp", "frameseq-pptx-build");
  process.env.FRAMESEQ_ENTRY = entry;
  process.env.FRAMESEQ_BUILD_DIR = buildDirectory;

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
    await page.goto(`http://127.0.0.1:${address.port}/?print=1&pptx=1`, {
      waitUntil: "networkidle0",
    });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMediaType("screen");

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
        if (item.kind === "line" && item.line) addLine(pptx, slide, item);
        if (item.kind === "raster") {
          const data = await screenshotData(page, `[data-frameseq-export-id="${item.id}"]`);
          slide.addImage({ data, ...position(item.box), objectName: `FrameSeq ${item.nodeType} ${item.id}` });
        }
      }
    }

    const defaultOutput = resolve(process.cwd(), "output", "pptx", pptxName(entry));
    const outputPath = resolve(requestedOutput ?? defaultOutput);
    await mkdir(dirname(outputPath), { recursive: true });
    await pptx.writeFile({ fileName: outputPath, compression: true });
    console.log(`PPTX exported to ${outputPath}${flatten ? " (flattened)" : ""}`);
  } finally {
    await browser.close();
    await server.close();
  }
}
