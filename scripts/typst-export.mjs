import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { createServer } from "vite";
import {
  chartPalette,
  chartSvg,
  connectorHeading,
  connectorMidpoint,
  polygonCorners,
  resolveAnchors,
  resolveShapePaint,
  richColor,
  richRuns,
  shapeGeometry,
  shapeSize,
} from "../lib/index.js";
import { locateProblems, reportedProblems } from "./document-errors.mjs";
import { checkSlides, slidesFileSuffix } from "./slide-selection.mjs";

/** A screen presentation's page width in points; one made for paper uses the paper's. */
const screenWidthPoints = 960;
const semanticClasses = new Set([
  "frameseq-auto-title-page",
  "frameseq-panel-title",
  "frameseq-semantic-cells",
  "frameseq-body-copy",
  "frameseq-caption",
  "frameseq-card",
  "frameseq-card-copy",
  "frameseq-card-title",
  "frameseq-content-slide",
  "frameseq-cover-author",
  "frameseq-cover-date",
  "frameseq-cover-eyebrow",
  "frameseq-cover-institute",
  "frameseq-cover-rule",
  "frameseq-cover-slide",
  "frameseq-cover-subtitle",
  "frameseq-cover-title",
  "frameseq-full-bleed-image",
  "frameseq-grid-cell",
  "frameseq-grid-section",
  "frameseq-group",
  "frameseq-layout-canvas",
  "frameseq-layout-center",
  "frameseq-layout-full-bleed",
  "frameseq-layout-grid",
  "frameseq-layout-split",
  "frameseq-list",
  "frameseq-list-copy",
  "frameseq-list-item",
  "frameseq-list-marker",
  "frameseq-metric",
  "frameseq-metric-label",
  "frameseq-metric-value",
  "frameseq-quote",
  "frameseq-region",
  "frameseq-region-card",
  "frameseq-region-left",
  "frameseq-region-right",
  "frameseq-footnote",
  "frameseq-reference",
  "frameseq-references",
  "frameseq-slide-footnotes",
  "frameseq-semantic-chart",
  "frameseq-semantic-code",
  "frameseq-semantic-icon",
  "frameseq-semantic-image",
  "frameseq-semantic-qr",
  "frameseq-semantic-table",
  "frameseq-semantic-latex",
  "frameseq-semantic-line",
  "frameseq-semantic-math",
  "frameseq-semantic-shape",
  "frameseq-semantic-typst",
  "frameseq-slide-body",
  "frameseq-slide-lead",
  "frameseq-slide-title",
  "frameseq-steps",
]);

const supportedStyles = new Set([
  "alignItems",
  "alignSelf",
  "background",
  "border",
  "borderColor",
  "borderRadius",
  "borderStyle",
  "borderWidth",
  "color",
  "display",
  "flexDirection",
  "flexGrow",
  "flexWrap",
  "fontSize",
  "fontWeight",
  "gap",
  "gridTemplateColumns",
  "height",
  "justifyContent",
  "left",
  "lineHeight",
  "margin",
  "minHeight",
  "minWidth",
  "opacity",
  "overflow",
  "padding",
  "position",
  "textAlign",
  "top",
  "transform",
  "width",
]);

function typstName(entry, slides) {
  const file = basename(entry, extname(entry));
  return `${file.replace(/\.slides$/, "")}${slidesFileSuffix(slides)}.typ`;
}

function typstString(value) {
  return JSON.stringify(String(value))
    .replaceAll("\u2028", "\\u{2028}")
    .replaceAll("\u2029", "\\u{2029}");
}

function classes(node) {
  return typeof node.props?.className === "string"
    ? node.props.className.split(/\s+/).filter(Boolean)
    : [];
}

function hasClass(node, name) {
  return classes(node).includes(name);
}

function typstFont(value) {
  const source = String(value ?? "");
  const generic = source.toLowerCase();
  const ignored = new Set([
    "-apple-system",
    "blinkmacsystemfont",
    "cursive",
    "fantasy",
    "monospace",
    "sans-serif",
    "serif",
    "system-ui",
    "ui-monospace",
    "ui-sans-serif",
    "ui-serif",
  ]);
  const fonts = source
    .split(",")
    .map((font) => font.trim().replace(/^['"]|['"]$/g, ""))
    .filter((font) => font && !ignored.has(font.toLowerCase()));
  if (/mono/.test(generic)) fonts.push("Consolas", "DejaVu Sans Mono");
  else if (/sans|system-ui|-apple-system|segoe/i.test(generic)) fonts.push("Segoe UI", "Arial");
  else if (/serif|georgia|cambria|times/i.test(generic)) fonts.push("Georgia", "New Computer Modern");
  const unique = [...new Set(fonts)];
  if (unique.length === 0) return undefined;
  if (unique.length === 1) return typstString(unique[0]);
  return `(${unique.map(typstString).join(", ")},)`;
}

function compactNumber(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function parseHex(value) {
  const match = String(value).trim().match(/^#([0-9a-f]{3,8})$/i);
  if (!match) return undefined;
  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((character) => character.repeat(2)).join("");
  }
  if (hex.length !== 6 && hex.length !== 8) return undefined;
  return `#${hex.toLowerCase()}`;
}

function cssRgbToHex(value) {
  const match = String(value).trim().match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i,
  );
  if (!match) return undefined;
  const channels = match.slice(1, 4).map((channel) =>
    Math.min(255, Math.max(0, Math.round(Number(channel)))));
  let alpha = 255;
  if (match[4]) {
    alpha = match[4].endsWith("%")
      ? Math.round(Number.parseFloat(match[4]) * 2.55)
      : Math.round(Number(match[4]) * 255);
    alpha = Math.min(255, Math.max(0, alpha));
  }
  return `#${[...channels, ...(alpha < 255 ? [alpha] : [])]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function cssColor(value, context, fallback) {
  const resolved = context.resolveVariable(String(value ?? "").trim());
  if (!resolved || resolved === "transparent" || resolved === "none") return "none";
  const named = {
    black: "#000000",
    blue: "#0000ff",
    gray: "#808080",
    green: "#008000",
    orange: "#ffa500",
    red: "#ff0000",
    white: "#ffffff",
    yellow: "#ffff00",
  }[resolved.toLowerCase()];
  const direct = parseHex(resolved) ?? cssRgbToHex(resolved) ?? named;
  if (direct) return `rgb(${typstString(direct)})`;

  const colors = [...resolved.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)];
  if (colors.length > 0) {
    const last = colors.at(-1)?.[0];
    const parsed = parseHex(last) ?? cssRgbToHex(last);
    if (parsed) {
      context.warn(`CSS background ${typstString(resolved)} was reduced to its final solid color.`);
      return `rgb(${typstString(parsed)})`;
    }
  }

  if (fallback) return cssColor(fallback, context);
  context.warn(`Unsupported CSS color ${typstString(resolved)}; Typst inherited the surrounding color.`);
  return undefined;
}

function length(value, context, axis = "x") {
  if (value === undefined || value === null || value === "") return undefined;
  const resolved = context.resolveVariable(String(value).trim());
  if (resolved === "auto" || resolved === "none") return resolved;
  if (/^-?[\d.]+fr$/.test(resolved)) return resolved;
  if (/^-?[\d.]+%$/.test(resolved)) return resolved;
  const match = resolved.match(/^(-?[\d.]+)(px|pt|rem|em|vw|vh|in|cm|mm)?$/i);
  if (!match) {
    context.warn(`Unsupported CSS length ${typstString(resolved)}; the value was omitted.`);
    return undefined;
  }
  const number = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "px";
  if (unit === "pt" || unit === "in" || unit === "cm" || unit === "mm") {
    return `${compactNumber(number)}${unit}`;
  }
  if (unit === "vw") return `${compactNumber(number)}%`;
  if (unit === "vh") return `${compactNumber(number)}%`;
  const pixels = unit === "rem" || unit === "em" ? number * 16 : number;
  const scale = axis === "y" ? context.scaleY : context.scaleX;
  return `${compactNumber(pixels * scale)}pt`;
}

function inset(value, context) {
  if (!value) return undefined;
  const values = context.resolveVariable(String(value)).split(/\s+/).filter(Boolean);
  if (values.length === 0 || values.length > 4) return undefined;
  const [a, b = a, c = a, d = b] = values;
  const top = length(a, context, "y");
  const right = length(b, context, "x");
  const bottom = length(c, context, "y");
  const left = length(d, context, "x");
  if (![top, right, bottom, left].every(Boolean)) return undefined;
  if (top === right && right === bottom && bottom === left) return top;
  return `(top: ${top}, right: ${right}, bottom: ${bottom}, left: ${left})`;
}

function weight(value) {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  const names = {
    bold: 700,
    bolder: 700,
    light: 300,
    medium: 500,
    normal: 400,
    semibold: 600,
  };
  const numeric = Number(names[normalized] ?? normalized);
  return Number.isFinite(numeric) ? String(Math.min(1000, Math.max(100, Math.round(numeric)))) : undefined;
}

function textAlignment(value) {
  if (value === "center") return "center";
  if (value === "right" || value === "flex-end") return "right";
  return "left";
}

function childArgument(content) {
  return `[${content}]`;
}

function joinArguments(argumentsList) {
  return argumentsList.filter(Boolean).join(", ");
}

function parseGridColumns(value, childCount, context) {
  const source = String(value ?? "").trim();
  const repeat = source.match(/^repeat\(\s*(\d+)\s*,/i);
  if (repeat) return repeat[1];
  const tracks = source.match(/(?:minmax\([^)]*\)|-?[\d.]+(?:fr|%|px|pt|rem|em))/gi) ?? [];
  if (tracks.length > 0) {
    return `(${tracks.map((track) => {
      if (/minmax/i.test(track)) return "1fr";
      if (/px|rem|em|pt/i.test(track)) return length(track, context) ?? "1fr";
      return track;
    }).join(", ")},)`;
  }
  return String(Math.max(1, childCount));
}

function mathContent(content) {
  const source = String(content ?? "");
  const parts = [];
  let cursor = 0;
  const matcher = /\$([^$\n]+)\$/g;
  for (const match of source.matchAll(matcher)) {
    if (match.index > cursor) parts.push(`#text(${typstString(source.slice(cursor, match.index))})`);
    parts.push(`#mi(${typstString(match[1])})`);
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) parts.push(`#text(${typstString(source.slice(cursor))})`);
  return parts.length > 0 ? parts.join(" ") : `#text(${typstString(source)})`;
}

/**
 * A text's words as Typst content: words marked bold, in italics, or in a colour of their own set
 * that way, and inline math as math.
 */
function inlineContent(content, context) {
  return richRuns(String(content ?? "")).map((run) => {
    const words = mathContent(run.text);
    const settings = [];
    if (run.bold) settings.push('weight: "bold"');
    if (run.italic) settings.push('style: "italic"');
    const fill = run.color ? cssColor(richColor(run.color), context) : undefined;
    if (fill && fill !== "none") settings.push(`fill: ${fill}`);
    return settings.length > 0 ? `#text(${settings.join(", ")})[${words}]` : words;
  }).join("");
}

function semanticTextStyle(node, context) {
  const names = new Set(classes(node));
  const theme = context.theme;
  const bodySize = context.font?.size;
  const headingSize = context.font?.heading?.size;
  const codeSize = context.font?.code?.size;
  const style = {
    color: theme.colors.foreground,
    family: theme.fonts.body,
    size: bodySize ?? 21,
    weight: context.font?.weight,
  };

  if (names.has("frameseq-cover-title")) {
    style.color = theme.chrome.coverTitleBox
      ? theme.chrome.footerAccentForeground
      : theme.family === "beamer" ? theme.colors.accent : theme.colors.foreground;
    style.family = context.font?.heading?.family ?? theme.fonts.heading;
    style.size = headingSize ?? (theme.name === "minimal-academic" ? 52 : theme.family === "beamer" ? 54 : 72);
    style.weight = context.font?.heading?.weight ?? (theme.family === "beamer" ? 600 : 820);
  } else if (names.has("frameseq-slide-title")) {
    style.color = theme.family === "beamer" ? theme.colors.accent : theme.colors.foreground;
    style.family = context.font?.heading?.family ?? theme.fonts.heading;
    style.size = headingSize ?? (theme.family === "beamer" ? 34 : 48);
    style.weight = context.font?.heading?.weight ?? (theme.family === "beamer" ? 600 : 800);
  } else if (names.has("frameseq-cover-subtitle")) {
    style.color = theme.family === "beamer" ? theme.colors.foreground : theme.colors.muted;
    style.size = 25;
  } else if (names.has("frameseq-cover-author")) {
    style.color = theme.colors.subtle;
    style.size = theme.family === "beamer" ? 18 : 16;
    style.weight = theme.family === "beamer" ? 400 : 600;
  } else if (names.has("frameseq-cover-institute") || names.has("frameseq-cover-date")) {
    style.color = theme.colors.muted;
    style.size = 16;
  } else if (names.has("frameseq-cover-eyebrow")) {
    style.color = theme.colors.accent;
    style.size = 15;
    style.weight = 750;
  } else if (names.has("frameseq-slide-lead")) {
    style.size = 30;
    style.weight = 650;
  } else if (names.has("frameseq-body-copy")) {
    style.color = theme.colors.muted;
    style.size = bodySize ?? 21;
  } else if (names.has("frameseq-list-copy")) {
    style.size = bodySize ?? 20;
  } else if (names.has("frameseq-card-title")) {
    style.size = 24;
    style.weight = 750;
  } else if (names.has("frameseq-card-copy")) {
    style.color = theme.colors.muted;
    style.size = bodySize ?? 21;
  } else if (names.has("frameseq-caption") || names.has("frameseq-footnote")) {
    style.color = theme.colors.subtle;
    style.size = 15;
  } else if (names.has("frameseq-reference")) {
    style.color = theme.colors.muted;
    style.size = bodySize ?? 19;
  } else if (names.has("frameseq-quote")) {
    style.size = 38;
    style.weight = 650;
  } else if (names.has("frameseq-metric-value")) {
    style.size = 48;
    style.weight = 820;
  } else if (names.has("frameseq-metric-label")) {
    style.color = theme.colors.muted;
    style.size = 16;
    style.weight = 600;
  } else if (names.has("frameseq-semantic-code")) {
    style.color = theme.colors.codeForeground;
    style.family = context.font?.code?.family ?? theme.fonts.mono;
    style.size = codeSize ?? 16;
    style.weight = context.font?.code?.weight;
  }
  return style;
}

function borderStroke(styles, context, fallbackColor, dashed = styles.borderStyle === "dashed") {
  const border = styles.border ? context.resolveVariable(styles.border) : "";
  const widthValue = styles.borderWidth ?? border.match(/(?:^|\s)([\d.]+(?:px|pt|rem|em))(?:\s|$)/)?.[1];
  const colorValue = styles.borderColor
    ?? border.match(/var\([^)]+\)|#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i)?.[0]
    ?? fallbackColor;
  if (styles.borderStyle === "none" || border === "0" || border === "none") return "none";
  if (!widthValue && !styles.borderColor && !styles.border && !dashed) return undefined;
  const width = length(widthValue ?? (dashed ? "2px" : "1px"), context);
  const color = cssColor(colorValue, context, fallbackColor);
  if (!width || !color || color === "none") return "none";
  return dashed ? `(paint: ${color}, thickness: ${width}, dash: "dashed")` : `${width} + ${color}`;
}

function commonBlockArguments(node, context, defaults = {}) {
  const styles = node.styles ?? {};
  const args = [];
  const width = length(styles.width ?? defaults.width, context, "x");
  const height = length(styles.height ?? defaults.height, context, "y");
  const fill = cssColor(styles.background ?? defaults.background, context);
  const stroke = borderStroke(styles, context, defaults.borderColor, defaults.dashed ?? styles.borderStyle === "dashed");
  const radius = length(styles.borderRadius ?? defaults.radius, context);
  const padding = inset(styles.padding ?? defaults.padding, context);
  if (width) args.push(`width: ${width}`);
  if (height) args.push(`height: ${height}`);
  if (fill && fill !== "none") args.push(`fill: ${fill}`);
  if (stroke) args.push(`stroke: ${stroke}`);
  if (radius) args.push(`radius: ${radius}`);
  if (padding) args.push(`inset: ${padding}`);
  return args;
}

function wrapCommon(node, content, context, defaults = {}) {
  const styles = node.styles ?? {};
  let result = content;
  const blockArguments = commonBlockArguments(node, context, defaults);
  if (blockArguments.length > 0) {
    result = `#block(${joinArguments(blockArguments)})[${result}]`;
  }
  // selfAlign() places the box within its parent, so it wins over the styles that
  // describe how the contents sit inside the box.
  const self = styles.alignSelf === "auto" || styles.alignSelf === "stretch"
    ? undefined
    : styles.alignSelf;
  const align = self ?? styles.textAlign ?? styles.alignItems ?? defaults.align;
  if (align && align !== "stretch") result = `#align(${textAlignment(align)})[${result}]`;
  const margin = inset(styles.margin, context);
  if (margin) result = `#pad(${margin})[${result}]`;
  const rotate = styles.transform?.match(/rotate\(\s*(-?[\d.]+)deg\s*\)/i)?.[1];
  if (rotate) result = `#rotate(${compactNumber(Number(rotate))}deg)[${result}]`;
  if (styles.position === "absolute") {
    const dx = length(styles.left ?? 0, context, "x") ?? "0pt";
    const dy = length(styles.top ?? 0, context, "y") ?? "0pt";
    result = `#place(top + left, dx: ${dx}, dy: ${dy})[${result}]`;
  }
  return result;
}

function inspectCustomStyles(node, context) {
  if (typeof node.props?.fit === "number") {
    context.warn("fit() shrinks text to its room in the browser, PDF, and PowerPoint; Typst keeps the text at its full size.");
  }
  for (const name of classes(node)) {
    if (!semanticClasses.has(name) && !/^frameseq-(?:grid-cell-\d+|step)$/.test(name)) {
      context.warn(`CSS class ${typstString(name)} has no automatic Typst equivalent.`);
    }
  }
  for (const property of Object.keys(node.styles ?? {})) {
    if (!supportedStyles.has(property)) {
      context.warn(`CSS property ${typstString(property)} has no automatic Typst equivalent.`);
    }
  }
  if (node.styles?.opacity && node.styles.opacity !== "1") {
    context.warn("Object opacity is not yet translated to Typst; colors remain opaque.");
  }
}

function makeContext(presentation, entry, outputPath) {
  const theme = presentation.theme;
  const canvasWidth = Number(presentation.canvasWidth) || 1280;
  const canvasHeight = Number(presentation.canvasHeight) || 720;
  const paper = presentation.paper;
  const slideWidthPoints = paper ? paper.width * 72 / 25.4 : screenWidthPoints;
  const slideHeightPoints = slideWidthPoints * canvasHeight / canvasWidth;
  const warnings = new Set();
  const assets = [];
  const variables = {
    "--frameseq-accent": theme.colors.accent,
    "--frameseq-accent-foreground": theme.colors.accentForeground,
    "--frameseq-border": theme.colors.border,
    "--frameseq-card-padding": theme.spacing.cardPadding,
    "--frameseq-code-background": theme.colors.codeBackground,
    "--frameseq-code-foreground": theme.colors.codeForeground,
    "--frameseq-content-gap": theme.spacing.contentGap,
    "--frameseq-cover-background": theme.coverBackground,
    "--frameseq-cover-x": theme.spacing.coverX,
    "--frameseq-cover-y": theme.spacing.coverY,
    "--frameseq-foreground": theme.colors.foreground,
    "--frameseq-grid-gap": theme.spacing.gridGap,
    "--frameseq-muted": theme.colors.muted,
    "--frameseq-radius-large": theme.radii.large,
    "--frameseq-radius-medium": theme.radii.medium,
    "--frameseq-radius-pill": theme.radii.pill,
    "--frameseq-region-gap": theme.spacing.regionGap,
    "--frameseq-slide-x": theme.spacing.slideX,
    "--frameseq-slide-y": theme.spacing.slideY,
    "--frameseq-split-gap": theme.spacing.splitGap,
    "--frameseq-subtle": theme.colors.subtle,
    "--frameseq-surface": theme.colors.surface,
    "--frameseq-surface-strong": theme.colors.surfaceStrong,
  };
  return {
    assets,
    canvasHeight,
    canvasWidth,
    entry,
    entryDirectory: dirname(entry),
    font: presentation.font,
    outputDirectory: dirname(outputPath),
    scaleX: slideWidthPoints / canvasWidth,
    scaleY: slideHeightPoints / canvasHeight,
    slideHeightPoints,
    slideWidthPoints,
    theme,
    variables,
    warnings,
    resolveVariable(value) {
      return String(value).replace(/var\((--[^),]+)(?:,\s*([^)]+))?\)/g, (_match, name, fallback) =>
        variables[name] ?? fallback ?? "");
    },
    warn(message) {
      warnings.add(message);
    },
  };
}

async function writeAsset(context, content, extension, label) {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 10);
  const filename = `${label}-${hash}${extension}`;
  const assetDirectory = resolve(context.outputDirectory, "assets");
  const output = resolve(assetDirectory, filename);
  await mkdir(assetDirectory, { recursive: true });
  await writeFile(output, content);
  const path = `assets/${filename}`;
  context.assets.push(path);
  return path;
}

async function copyImageAsset(source, context) {
  const value = String(source ?? "");
  if (value.startsWith("data:")) {
    const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) return undefined;
    const mime = match[1] ?? "application/octet-stream";
    const extensions = {
      "image/gif": ".gif",
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/svg+xml": ".svg",
      "image/webp": ".webp",
    };
    const extension = extensions[mime] ?? ".bin";
    const bytes = match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3]));
    return writeAsset(context, bytes, extension, "image");
  }

  if (/^https?:\/\//i.test(value)) {
    context.warn(`Remote image ${typstString(value)} was not downloaded; a link placeholder was emitted.`);
    return undefined;
  }

  let sourcePath;
  if (value.startsWith("file:")) sourcePath = fileURLToPath(value);
  else if (value.startsWith("/@fs/")) sourcePath = decodeURIComponent(value.slice(5));
  else sourcePath = isAbsolute(value) ? value : resolve(context.entryDirectory, value);
  if (!existsSync(sourcePath)) {
    context.warn(`Image asset ${typstString(value)} could not be found.`);
    return undefined;
  }
  const bytes = await readFile(sourcePath);
  const extension = extname(sourcePath) || ".bin";
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const filename = `${basename(sourcePath, extension).replace(/[^a-z0-9_-]+/gi, "-")}-${hash}${extension}`;
  const assetDirectory = resolve(context.outputDirectory, "assets");
  const output = resolve(assetDirectory, filename);
  await mkdir(assetDirectory, { recursive: true });
  await copyFile(sourcePath, output);
  const path = `assets/${filename}`;
  context.assets.push(path);
  return path;
}

async function serializeText(node, context) {
  const semantic = semanticTextStyle(node, context);
  const styles = node.styles ?? {};
  const args = [];
  const font = typstFont(semantic.family);
  const size = length(styles.fontSize ?? semantic.size, context, "y");
  const fill = cssColor(styles.color ?? semantic.color, context);
  const fontWeight = weight(styles.fontWeight ?? semantic.weight);
  if (font) args.push(`font: ${font}`);
  if (size) args.push(`size: ${size}`);
  if (fill && fill !== "none") args.push(`fill: ${fill}`);
  if (fontWeight) args.push(`weight: ${fontWeight}`);
  const body = inlineContent(node.props?.content, context);
  const content = `#text(${joinArguments(args)})[${body}]`;
  // A theme like Beamer's Madrid sets the cover's title in a rounded box of its accent colours.
  if (hasClass(node, "frameseq-cover-title") && context.theme.chrome.coverTitleBox) {
    const em = Number.parseFloat(styles.fontSize ?? semantic.size) || 54;
    return wrapCommon(node, content, context, {
      background: context.theme.chrome.footerAccentBackground,
      padding: `${Math.round(em * 0.42)}px ${Math.round(em * 0.9)}px`,
      radius: "14px",
    });
  }
  return wrapCommon(node, content, context);
}

async function serializeCode(node, context) {
  const semantic = semanticTextStyle(node, context);
  const code = `#raw(${typstString(node.props?.content ?? "")}, block: true, lang: ${typstString(node.props?.language ?? "text")})`;
  return wrapCommon(node, code, context, {
    background: context.theme.colors.codeBackground,
    borderColor: context.theme.colors.border,
    padding: "25px 30px",
    radius: context.theme.radii.large,
    width: "100%",
    color: semantic.color,
  });
}

async function serializeImage(node, context) {
  const path = await copyImageAsset(node.props?.src, context);
  if (!path) {
    const label = node.props?.alt || node.props?.src || "Image unavailable";
    return wrapCommon(
      node,
      `#text(fill: ${cssColor(context.theme.colors.muted, context)})[${inlineContent(label, context)}]`,
      context,
      { borderColor: context.theme.colors.border, padding: "18px", width: "100%" },
    );
  }
  const args = [`${typstString(path)}`];
  const width = length(node.styles?.width ?? "100%", context);
  const height = length(node.styles?.height, context, "y");
  if (width) args.push(`width: ${width}`);
  if (height) args.push(`height: ${height}`);
  args.push(`fit: ${hasClass(node, "frameseq-full-bleed-image") ? '"cover"' : '"contain"'}`);
  return wrapCommon({ ...node, styles: { ...node.styles, width: undefined, height: undefined } }, `#image(${args.join(", ")})`, context);
}

/** A table as a native Typst table, ruled as in the browser: heavy above and below, light under the heading. */
function serializeTable(node, context) {
  const rows = node.props?.rows ?? [];
  const header = Number(node.props?.header ?? 0);
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const align = Array.from({ length: columns }, (_, index) => node.props?.align?.[index] ?? "left");
  const foreground = cssColor(context.theme.colors.foreground, context);
  const border = cssColor(context.theme.colors.border, context, context.theme.colors.foreground);
  const heavy = `table.hline(stroke: ${length("2px", context)} + ${foreground})`;
  const light = `table.hline(stroke: ${length("1px", context)} + ${foreground})`;
  const rule = `table.hline(stroke: ${length("1px", context)} + ${border})`;
  const fill = node.props?.striped ? cssColor(context.theme.colors.surfaceStrong, context) : undefined;
  const cells = (row, bold) => Array.from({ length: columns }, (_, index) => (
    bold ? `[#strong[${inlineContent(row[index] ?? "", context)}]]` : `[${inlineContent(row[index] ?? "", context)}]`
  ));
  const body = rows.slice(header);
  const parts = [
    `columns: ${columns}`,
    `align: (${align.join(", ")},)`,
    "stroke: none",
    `inset: (x: ${length("16px", context)}, y: ${length("9px", context, "y")})`,
    ...(fill ? [`fill: (_, y) => if y >= ${header} and calc.even(y - ${header}) == false { ${fill} }`] : []),
    heavy,
    ...(header > 0 ? [`table.header(${rows.slice(0, header).flatMap((row) => cells(row, true)).join(", ")})`, light] : []),
    ...body.flatMap((row, index) => [...(index > 0 ? [rule] : []), ...cells(row, false)]),
    heavy,
  ];
  const size = length(context.font?.size ?? 21, context, "y");
  return wrapCommon(node, `#text(size: ${size})[#table(\n  ${parts.join(",\n  ")}\n)]`, context);
}

/** Every node's parent on the slide being exported, for measuring the room an object has. */
function recordParents(node, parents = new Map()) {
  for (const child of node.children ?? []) {
    parents.set(child, node);
    recordParents(child, parents);
  }
  return parents;
}

/**
 * The width an object takes in the export: its own when it states one in pixels, and otherwise
 * the slide's content width shared out by the grids and splits around it. Typst lays out after
 * this runs, so drawings that need a size, such as charts, take it from here.
 */
function objectWidth(node, context, fallback) {
  const own = String(node.styles?.width ?? "");
  const width = Number.parseFloat(own);
  if (Number.isFinite(width) && /^-?[\d.]+(?:px)?$/.test(own)) return width;
  if (fallback !== undefined) return fallback;
  let available = context.canvasWidth - 2 * (Number.parseFloat(context.resolveVariable(context.theme.spacing.slideX)) || 84);
  const chain = [];
  for (let current = node; context.parents?.get(current); current = context.parents.get(current)) {
    chain.unshift({ parent: context.parents.get(current), child: current });
  }
  for (const { parent, child } of chain) {
    const template = String(parent.styles?.gridTemplateColumns ?? "");
    if (parent.styles?.display !== "grid" || !template) continue;
    const repeated = /^repeat\((\d+)/.exec(template);
    const tracks = repeated
      ? Array.from({ length: Number(repeated[1]) }, () => 1)
      : template.split(/\s+/).map((track) => Number.parseFloat(track) || 1);
    const index = parent.children.indexOf(child) % tracks.length;
    const gap = Number.parseFloat(context.resolveVariable(context.theme.spacing.gridGap)) || 20;
    available = (available - gap * (tracks.length - 1)) * tracks[index] / tracks.reduce((sum, track) => sum + track, 0);
  }
  return Math.max(available, 40);
}

/** A chart drawn by the same code as in the browser, as an SVG image at its size. */
async function serializeChart(node, context) {
  const width = objectWidth(node, context);
  const ownHeight = Number.parseFloat(node.styles?.height ?? "");
  const height = Number.isFinite(ownHeight) ? ownHeight : width * 9 / 16;
  const theme = context.theme;
  const svg = chartSvg({ ...node.props }, {
    width,
    height,
    fontSize: Number.parseFloat(node.styles?.fontSize ?? "") || 18,
    foreground: theme.colors.foreground,
    muted: theme.colors.muted,
    grid: theme.colors.border,
    palette: [theme.colors.accent, ...chartPalette],
  }).replace('font-family="inherit"', `font-family="${String(theme.fonts.body).replace(/"/g, "'")}"`);
  const path = await writeAsset(context, svg, ".svg", "chart");
  const strip = { ...node, styles: { ...node.styles, width: undefined, height: undefined } };
  return wrapCommon(strip, `#image(${typstString(path)}, width: ${length(width, context)})`, context);
}

/** A QR code as a crisp SVG image, dark on light as phones expect. */
async function serializeQr(node, context) {
  const svg = await QRCode.toString(String(node.props?.text ?? ""), { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  const path = await writeAsset(context, svg, ".svg", "qr");
  const size = objectWidth(node, context, 200);
  const strip = { ...node, styles: { ...node.styles, width: undefined, height: undefined } };
  return wrapCommon(strip, `#image(${typstString(path)}, width: ${length(size, context)})`, context);
}

/** An icon in its colour at its size; Typst draws SVG without CSS, so the colour is written in. */
async function serializeIcon(node, context) {
  const svg = typeof node.props?.svg === "string" ? node.props.svg : "";
  if (!svg) {
    context.warn(`Icon ${typstString(node.props?.name ?? "")} had no drawing and was omitted.`);
    return "";
  }
  const color = context.resolveVariable(node.styles?.color ?? context.theme.colors.accent);
  const path = await writeAsset(context, svg.replaceAll("currentColor", color), ".svg", "icon");
  const size = Number.parseFloat(node.styles?.fontSize ?? "") || 48;
  const strip = { ...node, styles: { ...node.styles, fontSize: undefined, color: undefined } };
  return wrapCommon(strip, `#image(${typstString(path)}, width: ${length(size, context)})`, context);
}

async function serializeTypst(node, context) {
  let source = String(node.props?.source ?? "");
  const possibleFile = resolve(context.entryDirectory, source);
  if (/\.typ$/i.test(source) && existsSync(possibleFile)) source = await readFile(possibleFile, "utf8");
  return wrapCommon(node, `#block[\n${source}\n]`, context);
}

function stripLatexComments(source) {
  return String(source).split(/\r?\n/).map((line) => {
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] !== "%") continue;
      let slashCount = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) slashCount += 1;
      if (slashCount % 2 === 0) return line.slice(0, index);
    }
    return line;
  }).join("\n");
}

function readLatexGroup(source, start) {
  let cursor = start;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] !== "{") return undefined;
  const contentStart = cursor + 1;
  let depth = 1;
  for (cursor = contentStart; cursor < source.length; cursor += 1) {
    if (source[cursor] === "\\") {
      cursor += 1;
      continue;
    }
    if (source[cursor] === "{") depth += 1;
    if (source[cursor] === "}") depth -= 1;
    if (depth === 0) {
      return { content: source.slice(contentStart, cursor), end: cursor + 1 };
    }
  }
  return undefined;
}

function stripTabularSurroundings(source) {
  return source
    .replace(/\\(?:centering|small|footnotesize|scriptsize|tiny|normalsize)\b/g, "")
    .trim();
}

function extractLatexTabular(source) {
  const cleaned = stripLatexComments(source);
  const begin = /\\begin\{(tabular\*?|tabularx)\}/i.exec(cleaned);
  if (!begin) return undefined;
  const environment = begin[1];
  const endMarker = `\\end{${environment}}`;
  const bodyEnd = cleaned.toLowerCase().indexOf(endMarker.toLowerCase(), begin.index + begin[0].length);
  if (bodyEnd < 0) return undefined;
  if (stripTabularSurroundings(cleaned.slice(0, begin.index))) return undefined;
  if (stripTabularSurroundings(cleaned.slice(bodyEnd + endMarker.length))) return undefined;

  let cursor = begin.index + begin[0].length;
  while (/\s/.test(cleaned[cursor] ?? "")) cursor += 1;
  if (cleaned[cursor] === "[") {
    const optionalEnd = cleaned.indexOf("]", cursor + 1);
    if (optionalEnd < 0) return undefined;
    cursor = optionalEnd + 1;
  }
  if (/^tabular(?:x|\*)$/i.test(environment)) {
    const width = readLatexGroup(cleaned, cursor);
    if (!width) return undefined;
    cursor = width.end;
    while (/\s/.test(cleaned[cursor] ?? "")) cursor += 1;
    if (cleaned[cursor] === "[") {
      const optionalEnd = cleaned.indexOf("]", cursor + 1);
      if (optionalEnd < 0) return undefined;
      cursor = optionalEnd + 1;
    }
  }
  const specification = readLatexGroup(cleaned, cursor);
  if (!specification || specification.end > bodyEnd) return undefined;
  return {
    body: cleaned.slice(specification.end, bodyEnd),
    specification: specification.content,
  };
}

function latexLength(value) {
  const source = String(value).trim();
  if (/^\\(?:line|text|column)width$/i.test(source)) return "1fr";
  const match = source.match(/^(-?[\d.]+)\s*(pt|pc|in|cm|mm|em|ex)$/i);
  if (!match) return "auto";
  const unit = match[2].toLowerCase();
  if (unit === "pc") return `${compactNumber(Number(match[1]) * 12)}pt`;
  if (unit === "ex") return `${compactNumber(Number(match[1]) * 0.5)}em`;
  return `${compactNumber(Number(match[1]))}${unit}`;
}

function parseLatexColumnSpecification(specification) {
  const columns = [];
  const parse = (source) => {
    let cursor = 0;
    while (cursor < source.length) {
      const character = source[cursor];
      if (/\s|\|/.test(character)) {
        cursor += 1;
        continue;
      }
      if (character === "*" && source[cursor + 1] === "{") {
        const count = readLatexGroup(source, cursor + 1);
        const repeated = count ? readLatexGroup(source, count.end) : undefined;
        if (!count || !repeated || !/^\d+$/.test(count.content.trim())) return false;
        for (let index = 0; index < Number(count.content); index += 1) {
          if (!parse(repeated.content)) return false;
        }
        cursor = repeated.end;
        continue;
      }
      if (/[><@!]/.test(character) && source[cursor + 1] === "{") {
        const decoration = readLatexGroup(source, cursor + 1);
        if (!decoration) return false;
        cursor = decoration.end;
        continue;
      }
      if (/[lcrS]/.test(character)) {
        columns.push({
          align: character === "r" || character === "S" ? "right" : character === "c" ? "center" : "left",
          width: "auto",
        });
        cursor += 1;
        continue;
      }
      if (character === "X") {
        columns.push({ align: "left", width: "1fr" });
        cursor += 1;
        continue;
      }
      if (/[pmb]/.test(character) && source[cursor + 1] === "{") {
        const width = readLatexGroup(source, cursor + 1);
        if (!width) return false;
        columns.push({ align: "left", width: latexLength(width.content) });
        cursor = width.end;
        continue;
      }
      return false;
    }
    return true;
  };
  return parse(specification) && columns.length > 0 ? columns : undefined;
}

function splitLatexTable(source, separator) {
  const parts = [];
  let start = 0;
  let braceDepth = 0;
  let math = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\" && source[index + 1] !== "\\") {
      index += 1;
      continue;
    }
    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (character === "$" && braceDepth === 0) math = !math;
    if (braceDepth > 0 || math) continue;
    const isCell = separator === "cell" && character === "&";
    const isRow = separator === "row" && character === "\\" && source[index + 1] === "\\";
    if (!isCell && !isRow) continue;
    parts.push(source.slice(start, index));
    index += isRow ? 1 : 0;
    if (isRow && source[index + 1] === "[") {
      const optionalEnd = source.indexOf("]", index + 2);
      if (optionalEnd >= 0) index = optionalEnd;
    }
    start = index + 1;
  }
  parts.push(source.slice(start));
  return parts;
}

function parseMulticolumn(source) {
  const match = /^\s*\\multicolumn\s*/i.exec(source);
  if (!match) return undefined;
  const count = readLatexGroup(source, match[0].length);
  const specification = count ? readLatexGroup(source, count.end) : undefined;
  const content = specification ? readLatexGroup(source, specification.end) : undefined;
  if (!count || !specification || !content || source.slice(content.end).trim()) return undefined;
  const colspan = Number(count.content.trim());
  if (!Number.isInteger(colspan) || colspan < 1) return undefined;
  return { colspan, content: content.content };
}

function serializeLatexTable(source, context) {
  const tabular = extractLatexTabular(source);
  if (!tabular || /\\multirow\b|\\(?:begin|end)\{(?:tabular\*?|tabularx|array)\}/i.test(tabular.body)) {
    return undefined;
  }
  const hasRules = /\\(?:toprule|midrule|bottomrule|hline|cline|cmidrule)\b/i.test(tabular.body);
  const body = tabular.body
    .replace(/\\(?:toprule|midrule|bottomrule|hline)(?:\[[^\]]*\])?/gi, "")
    .replace(/\\(?:c|c?mid)rule(?:\([^)]*\))?\s*\{[^}]*\}/gi, "")
    .replace(/\\addlinespace(?:\[[^\]]*\])?/gi, "");
  const rows = splitLatexTable(body, "row")
    .map((row) => splitLatexTable(row, "cell").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  if (rows.length === 0) return undefined;

  const columns = parseLatexColumnSpecification(tabular.specification);
  const inferredCount = Math.max(...rows.map((row) => row.reduce((total, cell) =>
    total + (parseMulticolumn(cell)?.colspan ?? 1), 0)));
  const columnCount = Math.max(columns?.length ?? 0, inferredCount);
  if (columnCount < 1 || rows.some((row) => row.reduce((total, cell) =>
    total + (parseMulticolumn(cell)?.colspan ?? 1), 0) > columnCount)) return undefined;

  const normalizedColumns = columns?.length === columnCount
    ? columns
    : Array.from({ length: columnCount }, () => ({ align: "left", width: "auto" }));
  const cells = rows.flatMap((row) => row.map((cell) => {
    const multicolumn = parseMulticolumn(cell);
    const content = multicolumn?.content ?? cell;
    const rendered = `#mitext(${typstString(content)})`;
    return multicolumn && multicolumn.colspan > 1
      ? `table.cell(colspan: ${multicolumn.colspan})[${rendered}]`
      : `[${rendered}]`;
  }));
  const border = cssColor(context.theme.colors.border, context, context.theme.colors.foreground);
  const argumentsList = [
    `columns: (${normalizedColumns.map((column) => column.width).join(", ")},)`,
    `align: (${normalizedColumns.map((column) => column.align).join(", ")},)`,
    `inset: ${length("10px", context)}`,
    hasRules ? `stroke: (x: none, y: ${length("1px", context)} + ${border})` : undefined,
    ...cells,
  ];
  return `#table(\n  ${argumentsList.filter(Boolean).join(",\n  ")}\n)`;
}

function looksLikeMath(source) {
  const value = String(source).trim();
  if (/\\begin\{(?:equation\*?|align\*?|gather\*?|multline\*?|cases|matrix|pmatrix|bmatrix|vmatrix)\}/i.test(value)) return true;
  if (/\\(?:section|subsection|paragraph|textbf|emph|begin\{(?:itemize|enumerate|description))\b/i.test(value)) return false;
  return /(?:^|[^\\])[$_^=]|\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|lim|alpha|beta|gamma|theta|lambda|mu|pi|sigma|phi|omega|sin|cos|tan|log|exp)\b/i.test(value);
}

function supportsMiTeXText(source) {
  return !/\\(?:documentclass|usepackage|includegraphics|input|include)\b|\\begin\{(?:figure|algorithm|description|picture|tikzpicture)\}/i.test(source);
}

async function serializeLatex(node, context) {
  let source = String(node.props?.source ?? "");
  const possibleFile = resolve(context.entryDirectory, source);
  if (/\.tex$/i.test(source) && existsSync(possibleFile)) source = await readFile(possibleFile, "utf8");
  const table = serializeLatexTable(source, context);
  if (table) return wrapCommon(node, table, context);
  if (looksLikeMath(source)) return wrapCommon(node, `#mitex(${typstString(source)})`, context);
  if (supportsMiTeXText(source) && !/\\begin\{(?:tabular\*?|tabularx)\}/i.test(source)) {
    return wrapCommon(node, `#mitext(${typstString(source)})`, context);
  }
  const svg = typeof node.props?.svg === "string" ? node.props.svg : "";
  if (svg) {
    const path = await writeAsset(context, svg, ".svg", "latex");
    context.warn("A LaTeX fragment outside MiTeX text support and the native tabular converter was preserved as SVG.");
    return wrapCommon(node, `#image(${typstString(path)}, width: 100%, fit: "contain")`, context);
  }
  context.warn("A LaTeX fragment could not be converted and had no compiled SVG fallback.");
  return `#text(fill: ${cssColor(context.theme.colors.error, context)})[${inlineContent("Unsupported LaTeX fragment", context)}]`;
}

async function serializeShape(node, context) {
  const styles = node.styles ?? {};
  const paint = node.props?.paint;
  const args = commonBlockArguments(node, context, {
    background: paint?.fill,
    borderColor: paint?.stroke ?? context.theme.colors.accent,
    dashed: node.props?.dashed === true || styles.borderStyle === "dashed",
    height: node.type === "circle" ? "120px" : "120px",
    radius: node.type === "rect" ? context.theme.radii.medium : undefined,
    width: node.type === "circle" ? "120px" : "240px",
  });
  // The label takes the box's type, as the browser sets it: 24 px and semibold unless restyled.
  const text = String(node.props?.label ?? "");
  const textArguments = [`weight: ${weight(styles.fontWeight) ?? "\"semibold\""}`];
  const textColor = cssColor(styles.color ?? paint?.text ?? context.theme.colors.foreground, context);
  if (textColor && textColor !== "none") textArguments.push(`fill: ${textColor}`);
  const size = length(styles.fontSize ?? "24px", context);
  if (size) textArguments.push(`size: ${size}`);
  const label = text ? `#text(${textArguments.join(", ")})[${inlineContent(text, context)}]` : "";
  const element = node.type === "circle" ? "circle" : "rect";
  let result = `#${element}(${joinArguments(args)})[#align(center + horizon)[${label}]]`;
  const rotate = styles.transform?.match(/rotate\(\s*(-?[\d.]+)deg\s*\)/i)?.[1];
  if (rotate) result = `#rotate(${rotate}deg)[${result}]`;
  if (styles.position === "absolute") {
    const dx = length(styles.left ?? 0, context) ?? "0pt";
    const dy = length(styles.top ?? 0, context, "y") ?? "0pt";
    result = `#place(top + left, dx: ${dx}, dy: ${dy})[${result}]`;
  }
  return result;
}

function pixelValue(value) {
  const match = typeof value === "string" ? /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim()) : null;
  if (match) return Number(match[1]);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A point in canvas pixels as a Typst coordinate pair. */
function typstPoint(x, y, context) {
  return `(${length(`${x}px`, context, "x")}, ${length(`${y}px`, context, "y")})`;
}

/**
 * Outline segments as editable Typst: a polygon when every edge is straight, and a curve
 * otherwise. An open outline, such as a cube's inner edges, is stroked without a fill.
 */
function typstOutline(segments, fill, stroke, context) {
  const corners = polygonCorners(segments);
  if (corners) {
    const points = corners.map(([x, y]) => typstPoint(x, y, context)).join(", ");
    return `#place(top + left)[#polygon(fill: ${fill}, stroke: ${stroke}, ${points})]`;
  }
  const parts = segments.map((segment) => {
    if (segment.op === "Z") return "curve.close(mode: \"straight\")";
    if (segment.op === "M") return `curve.move(${typstPoint(segment.x, segment.y, context)})`;
    if (segment.op === "L") return `curve.line(${typstPoint(segment.x, segment.y, context)})`;
    return `curve.cubic(${typstPoint(segment.x1, segment.y1, context)}, ${typstPoint(segment.x2, segment.y2, context)}, ${typstPoint(segment.x, segment.y, context)})`;
  });
  return `#place(top + left)[#curve(fill: ${fill}, stroke: ${stroke}, ${parts.join(", ")})]`;
}

/** A shape() as its outline drawn in Typst, with the label set in the outline's room. */
async function serializeVectorShape(node, context) {
  const styles = node.styles ?? {};
  const kind = node.props?.kind;
  const points = kind === "polygon" ? node.props?.points : undefined;
  const paint = node.props?.paint ?? {};
  const defaults = shapeSize(kind, points);
  const width = pixelValue(styles.width) ?? defaults.width;
  const height = pixelValue(styles.height) ?? (kind === "circle" ? width : defaults.height);
  const strokeWidth = pixelValue(node.props?.strokeWidth) ?? 2;
  const geometry = shapeGeometry(kind, width, height, { strokeWidth, radius: pixelValue(styles.borderRadius), points });
  const fill = cssColor(node.props?.fill ?? paint.fill ?? context.theme.colors.surface, context) ?? "none";
  const strokeColor = cssColor(node.props?.stroke ?? paint.stroke ?? context.theme.colors.border, context);
  const thickness = length(`${strokeWidth}px`, context) ?? "1.5pt";
  const stroke = strokeColor && strokeColor !== "none" && strokeWidth > 0
    ? `(paint: ${strokeColor}, thickness: ${thickness}, join: "round"${node.props?.dashed ? ", dash: \"dashed\"" : ""})`
    : "none";
  const shade = cssColor(paint.shade ?? node.props?.fill ?? context.theme.colors.surfaceStrong, context) ?? fill;
  const drawing = [
    typstOutline(geometry.outline, fill, stroke, context),
    geometry.shade ? typstOutline(geometry.shade, shade, stroke, context) : "",
    geometry.detail ? typstOutline(geometry.detail, "none", stroke, context) : "",
  ].join("");
  if (node.props?.shadow) context.warn("Shape shadows are not drawn in Typst.");

  const room = geometry.text;
  const textArguments = [`weight: ${weight(styles.fontWeight) ?? "\"semibold\""}`];
  const textColor = cssColor(styles.color ?? paint.text ?? context.theme.colors.foreground, context);
  if (textColor && textColor !== "none") textArguments.push(`fill: ${textColor}`);
  const size = length(styles.fontSize ?? "22px", context);
  if (size) textArguments.push(`size: ${size}`);
  const text = String(node.props?.label ?? "");
  const label = text
    ? `#place(top + left, dx: ${length(`${room.x}px`, context, "x")}, dy: ${length(`${room.y}px`, context, "y")})`
      + `[#box(width: ${length(`${room.width}px`, context, "x")}, height: ${length(`${room.height}px`, context, "y")})`
      + `[#align(center + horizon)[#text(${textArguments.join(", ")})[${inlineContent(text, context)}]]]]`
    : "";
  let result = `#box(width: ${length(`${width}px`, context, "x")}, height: ${length(`${height}px`, context, "y")})[${drawing}${label}]`;
  const rotate = styles.transform?.match(/rotate\(\s*(-?[\d.]+)deg\s*\)/i)?.[1];
  if (rotate) result = `#rotate(${rotate}deg)[${result}]`;
  if (styles.position === "absolute") {
    const dx = length(styles.left ?? 0, context) ?? "0pt";
    const dy = length(styles.top ?? 0, context, "y") ?? "0pt";
    result = `#place(top + left, dx: ${dx}, dy: ${dy})[${result}]`;
  }
  return result;
}

async function serializeLine(node, context) {
  const props = node.props ?? {};
  const start = [Number(props.x1 ?? 0), Number(props.y1 ?? 0)];
  const end = [Number(props.x2 ?? 0), Number(props.y2 ?? 0)];
  const route = props.route === "elbow" || props.route === "curve" ? props.route : "straight";
  const points = Array.isArray(props.points) && props.points.length >= 2 && (route !== "straight" || props.points.length > 2)
    ? props.points
    : [start, end];
  const widthPixels = pixelValue(props.strokeWidth ?? "3px") ?? 3;
  const strokeWidth = length(`${widthPixels}px`, context) ?? "2.25pt";
  const strokeColor = cssColor(props.stroke ?? context.theme.colors.accent, context, context.theme.colors.accent);
  const stroke = `(paint: ${strokeColor}, thickness: ${strokeWidth}, cap: "round", join: "round"${props.dashed ? ", dash: \"dashed\"" : ""})`;
  const parts = [];
  if (route === "curve" && points.length === 4) {
    const [s, c1, c2, e] = points;
    parts.push(`#place(top + left)[#curve(stroke: ${stroke}, curve.move(${typstPoint(...s, context)}), curve.cubic(${typstPoint(...c1, context)}, ${typstPoint(...c2, context)}, ${typstPoint(...e, context)}))]`);
  } else if (points.length > 2) {
    const steps = points.map(([x, y], index) => `curve.${index === 0 ? "move" : "line"}(${typstPoint(x, y, context)})`);
    parts.push(`#place(top + left)[#curve(stroke: ${stroke}, ${steps.join(", ")})]`);
  } else {
    parts.push(`#place(top + left)[#line(start: ${typstPoint(...start, context)}, end: ${typstPoint(...end, context)}, stroke: ${stroke})]`);
  }

  // Arrowheads match the preview's: eight line widths long, reaching one width past the end.
  const arrow = props.arrow;
  for (const at of ["start", "end"]) {
    if (!(arrow === "both" || arrow === at)) continue;
    const heading = connectorHeading(points, at);
    const [x, y] = at === "end" ? points[points.length - 1] : points[0];
    const tip = [x + heading.x * widthPixels, y + heading.y * widthPixels];
    const base = [tip[0] - heading.x * widthPixels * 8, tip[1] - heading.y * widthPixels * 8];
    const side = [-heading.y * widthPixels * 4, heading.x * widthPixels * 4];
    const corners = [tip, [base[0] + side[0], base[1] + side[1]], [base[0] - side[0], base[1] - side[1]]];
    parts.push(`#place(top + left)[#polygon(fill: ${strokeColor}, ${corners.map(([px, py]) => typstPoint(px, py, context)).join(", ")})]`);
  }

  if (typeof props.label === "string" && props.label) {
    const middle = connectorMidpoint(route, points);
    const background = cssColor(context.theme.colors.background, context) ?? "white";
    const color = cssColor(context.theme.colors.muted, context);
    // A room around the midpoint, wide enough for any label, with the label centred in it.
    const room = { width: 600, height: 80 };
    parts.push(`#place(top + left, dx: ${length(`${middle.x - room.width / 2}px`, context, "x")}, dy: ${length(`${middle.y - room.height / 2}px`, context, "y")})`
      + `[#box(width: ${length(`${room.width}px`, context, "x")}, height: ${length(`${room.height}px`, context, "y")})`
      + `[#align(center + horizon)[#box(fill: ${background}, inset: (x: ${length("10px", context)}, y: ${length("2px", context, "y")}), radius: ${length("10px", context)})`
      + `[#text(size: ${length("18px", context)}, weight: "semibold"${color && color !== "none" ? `, fill: ${color}` : ""})[${inlineContent(props.label, context)}]]]]]`);
  }
  return parts.join("");
}

async function serializeList(node, context) {
  const ordered = hasClass(node, "frameseq-steps");
  const rows = [];
  for (const [index, row] of node.children.entries()) {
    const contentNode = row.children?.[1] ?? row.children?.[0];
    const copy = contentNode ? await serializeNode(contentNode, context) : "";
    const marker = ordered
      ? `#circle(radius: 10pt, fill: ${cssColor(context.theme.colors.accent, context)})[#align(center + horizon)[#text(size: 9pt, weight: 800, fill: ${cssColor(context.theme.colors.accentForeground, context)}, ${typstString(index + 1)})]]`
      : `#circle(radius: 4pt, fill: ${cssColor(context.theme.colors.accent, context)})`;
    const rowContent = `#grid(columns: (24pt, 1fr), column-gutter: ${length("16px", context)}, align: (center + horizon, left + horizon), [${marker}], [${copy}])`;
    if (context.theme.family === "beamer") rows.push(childArgument(rowContent));
    else {
      rows.push(childArgument(`#block(width: 100%, inset: ${inset("17px 20px", context)}, fill: ${cssColor(context.theme.colors.surface, context)}, stroke: ${length("1px", context)} + ${cssColor(context.theme.colors.border, context)}, radius: ${length(context.theme.radii.medium, context)})[${rowContent}]`));
    }
  }
  return wrapCommon(node, `#stack(dir: ttb, spacing: ${length("14px", context)}, ${rows.join(", ")})`, context);
}

/** The top and left padding of a container in pixels, from the CSS shorthand. */
function paddingStart(value) {
  const sides = String(value ?? "").trim().split(/\s+/).filter(Boolean).map((part) => pixelValue(part) ?? 0);
  if (sides.length === 0) return { top: 0, left: 0 };
  return { top: sides[0], left: sides.length === 1 ? sides[0] : sides.length < 4 ? sides[1] : sides[3] };
}

/** Whether a child is placed by coordinates rather than laid out in its container's flow. */
function isPlaced(child) {
  return child.type === "line" || child.styles?.position === "absolute";
}

async function serializeContainer(node, context) {
  if (hasClass(node, "frameseq-list")) return serializeList(node, context);
  const serialized = await Promise.all((node.children ?? []).map((child) => serializeNode(child, context)));
  // CSS places an absolute child from its container's padding edge, and Typst from inside the
  // inset, so a placed child moves back by the padding to land where the browser puts it.
  const padding = paddingStart(node.styles?.padding);
  const shift = (text) => (padding.top || padding.left
    ? `#place(top + left, dx: ${length(`${-padding.left}px`, context, "x")}, dy: ${length(`${-padding.top}px`, context, "y")})[${text}]`
    : text);
  if (node.type === "stack" || hasClass(node, "frameseq-layout-canvas")) {
    const children = serialized.map((text, index) => (isPlaced(node.children[index]) ? shift(text) : text));
    return wrapCommon(node, `#block(width: 100%, height: 100%)[${children.join("\n")}]`, context);
  }
  // A placed child takes no room in a row or a column, so it stays out of the stack.
  const placed = serialized.filter((_, index) => isPlaced(node.children[index])).map(shift);
  const children = serialized.filter((_, index) => !isPlaced(node.children[index]));

  const styles = node.styles ?? {};
  const isGrid = hasClass(node, "frameseq-layout-grid")
    || hasClass(node, "frameseq-layout-split")
    || hasClass(node, "frameseq-grid-section")
    || styles.display === "grid";
  const gapValue = styles.gap
    ?? (hasClass(node, "frameseq-layout-split")
      ? context.theme.spacing.splitGap
      : hasClass(node, "frameseq-layout-grid") || hasClass(node, "frameseq-grid-section")
        ? context.theme.spacing.gridGap
        : context.theme.spacing.regionGap);
  const gap = length(gapValue, context) ?? "0pt";
  let content;
  if (isGrid) {
    const columns = parseGridColumns(styles.gridTemplateColumns, children.length, context);
    content = `#grid(columns: ${columns}, column-gutter: ${gap}, row-gutter: ${gap}, ${children.map(childArgument).join(", ")})`;
  } else {
    const direction = node.type === "row" || styles.flexDirection === "row" ? "ltr" : "ttb";
    content = `#stack(dir: ${direction}, spacing: ${gap}, ${children.map(childArgument).join(", ")})`;
    // In a box of a given height, the flex alignment across a row, or along a column, places
    // the contents up and down within it.
    const vertical = direction === "ltr" ? styles.alignItems : styles.justifyContent;
    if (styles.height && (vertical === "center" || vertical === "flex-end" || vertical === "end")) {
      content = `#align(${vertical === "center" ? "horizon" : "bottom"})[${content}]`;
    }
  }
  content = `${placed.join("")}${content}`;

  const card = hasClass(node, "frameseq-card")
    || hasClass(node, "frameseq-region-card")
    || classes(node).some((name) => /^frameseq-grid-cell(?:-|$)/.test(name));
  const result = wrapCommon(node, content, context, card ? {
    background: context.theme.colors.surface,
    borderColor: context.theme.colors.border,
    padding: context.theme.spacing.cardPadding,
    radius: context.theme.radii.medium,
  } : {});
  if (hasClass(node, "frameseq-layout-center")) return `#align(center + horizon)[${result}]`;
  return result;
}

async function serializeNode(node, context) {
  inspectCustomStyles(node, context);
  if (node.type === "text") return serializeText(node, context);
  if (node.type === "code") return serializeCode(node, context);
  if (node.type === "equation") return wrapCommon(node, `#mitex(${typstString(node.props?.content ?? "")})`, context, {
    background: context.theme.colors.surfaceStrong,
    borderColor: context.theme.colors.border,
    padding: "28px 48px",
    radius: context.theme.radii.large,
  });
  if (node.type === "image") return serializeImage(node, context);
  if (node.type === "table") return serializeTable(node, context);
  if (node.type === "chart") return serializeChart(node, context);
  if (node.type === "qr") return serializeQr(node, context);
  if (node.type === "icon") return serializeIcon(node, context);
  if (node.type === "typst") return serializeTypst(node, context);
  if (node.type === "latex") return serializeLatex(node, context);
  if (node.type === "rect" || node.type === "circle") return serializeShape(node, context);
  if (node.type === "shape") return serializeVectorShape(node, context);
  if (node.type === "line") return serializeLine(node, context);
  if (node.type === "spacer") return `${compactNumber(Number(node.styles?.flexGrow ?? 1))}fr`;
  if (node.type === "row" || node.type === "column" || node.type === "stack") {
    return serializeContainer(node, context);
  }
  context.warn(`Unsupported FrameSeq object type ${typstString(node.type)} was omitted.`);
  return "";
}

function syntheticTextNode(content, className) {
  return {
    type: "text",
    props: { className, content },
    styles: {},
    children: [],
  };
}

function hasVisibleNodeContent(node) {
  if (node.type === "text") return Boolean(String(node.props?.content ?? "").trim());
  if (["image", "code", "equation", "typst", "latex", "rect", "circle", "shape", "line", "table", "chart", "qr", "icon"].includes(node.type)) {
    return true;
  }
  return (node.children ?? []).some(hasVisibleNodeContent);
}

function slideChrome(slide, index, presentation, context, cover, horizontal, masterTakesTitle = false) {
  const chrome = context.theme.chrome;
  if (cover && !chrome.showOnCover) return [];
  const elements = [];
  // A master that places the title has taken the title bar's job.
  const title = typeof slide.props?.title === "string" && !masterTakesTitle ? slide.props.title : undefined;
  if (chrome.titleBar && title) {
    const height = length(chrome.titleBarHeight, context, "y") ?? "40.5pt";
    const foreground = cssColor(chrome.titleBarForeground, context, context.theme.colors.accent);
    const background = cssColor(chrome.titleBarBackground, context, context.theme.colors.background);
    const headingSize = length(context.font?.heading?.size ?? (chrome.titleBarStyle === "underline" ? 34 : 28), context, "y");
    const headingFont = typstFont(context.font?.heading?.family ?? context.theme.fonts.heading);
    const textArgs = [
      headingFont ? `font: ${headingFont}` : undefined,
      headingSize ? `size: ${headingSize}` : undefined,
      `fill: ${foreground}`,
      `weight: ${weight(context.font?.heading?.weight ?? 650)}`,
    ].filter(Boolean).join(", ");
    if (chrome.titleBarStyle === "underline") {
      elements.push(`#place(top + left, dx: ${horizontal}, dy: ${length("20px", context, "y")})[#block(width: 100% - ${horizontal} * 2, height: ${height})[#align(left + bottom)[#text(${textArgs}, ${typstString(title)})] #place(bottom + left)[#line(length: 100%, stroke: ${length("1px", context)} + ${foreground})]]]`);
    } else {
      elements.push(`#place(top + left)[#block(width: 100%, height: ${height}, inset: (x: ${horizontal}), fill: ${background})[#align(left + horizon)[#text(${textArgs}, ${typstString(title)})]]]`);
    }
  }

  if (chrome.footer) {
    const height = length(chrome.footerHeight, context, "y") ?? "22.5pt";
    const foreground = cssColor(chrome.footerForeground, context, context.theme.colors.muted);
    const background = cssColor(chrome.footerBackground, context, context.theme.colors.background);
    const border = cssColor(chrome.footerBorderColor, context);
    const number = chrome.slideNumber ? `${index + 1} / ${presentation.slides.length}` : "";
    const left = chrome.footerLayout === "title"
      ? presentation.title
      : presentation.author ?? presentation.title;
    const middle = chrome.footerLayout === "title" ? "" : presentation.institute ?? "";
    const details = chrome.footerLayout === "title"
      ? number
      : [presentation.date, number].filter(Boolean).join(" · ");
    const columns = chrome.footerLayout === "title" ? "(78%, 22%)" : "(1fr, 1fr, auto)";
    const cells = [left, ...(chrome.footerLayout === "title" ? [] : [middle]), details]
      .map((item, cellIndex) => `[#block(height: ${height}, inset: (x: ${length("18px", context)}))[#align(${cellIndex === 0 ? "left" : cellIndex === 1 && chrome.footerLayout !== "title" ? "center" : "right"} + horizon)[#text(size: ${length("13px", context, "y")}, fill: ${foreground}, ${typstString(item)})]]]`)
      .join(", ");
    const borderLine = border && border !== "none"
      ? `#place(top + left)[#line(length: 100%, stroke: ${length("1px", context)} + ${border})]`
      : "";
    elements.push(`#place(bottom + left)[#block(width: 100%, height: ${height}, fill: ${background})[${borderLine}#grid(columns: ${columns}, ${cells})]]`);
  }
  return elements;
}

/** A poster's title band, reaching the page edges past the page's own inset as it does in HTML. */
function metadataHeader(presentation, context, horizontal, vertical) {
  const chrome = context.theme.chrome;
  const foreground = cssColor(chrome.headerForeground, context, "#ffffff");
  const background = cssColor(chrome.headerBackground, context, context.theme.colors.accent);
  const headingSize = length(context.font?.heading?.size ?? 76, context, "y");
  const credits = [presentation.author, presentation.institute, presentation.date].filter(Boolean);
  const lines = [
    `#text(size: ${headingSize}, weight: 800, ${typstString(presentation.title)})`,
    ...(presentation.subtitle ? [`#text(size: ${length(36, context, "y")}, ${typstString(presentation.subtitle)})`] : []),
    ...(credits.length > 0 ? [`#text(size: ${length(26, context, "y")}, ${typstString(credits.join("    "))})`] : []),
  ];
  return `#block(width: 100%, fill: ${background}, outset: (x: ${horizontal}, top: ${vertical}), inset: (top: ${length(8, context, "y")}, bottom: ${length(48, context, "y")}))[#set text(fill: ${foreground})\n#stack(dir: ttb, spacing: ${length(14, context, "y")}, ${lines.map((line) => `[${line}]`).join(", ")})]`;
}

const masterFields = /\{(title|subtitle|author|institute|date|page|total|slide)\}/g;

/** A master object with {page}, {title}, and the other fields in its text filled in for one slide. */
function withFields(node, values) {
  const fill = (value) => (
    typeof value === "string" ? value.replace(masterFields, (_whole, key) => values[key] ?? "") : value
  );
  return {
    ...node,
    props: { ...node.props, content: fill(node.props?.content), label: fill(node.props?.label) },
    children: (node.children ?? []).map((child) => withFields(child, values)),
  };
}

/** The master a slide is drawn on, as the renderer chooses it. */
function slideMaster(slide, presentation) {
  const asked = slide.props?.master;
  if (asked === false) return undefined;
  const name = typeof asked === "string" ? asked : hasClass(slide, "frameseq-cover-slide") ? "cover" : "content";
  const page = (presentation.node.props.masters ?? {})[name];
  return page ? { name, page } : undefined;
}

/** A placeholder's rectangle in canvas pixels, or undefined when it was given no position. */
function placeholderBox(node, context) {
  const units = (value, whole) => {
    const match = value === undefined ? null : /^(-?\d*\.?\d+)(px|%)?$/.exec(String(value).trim());
    if (!match) return undefined;
    return match[2] === "%" ? Number(match[1]) * whole / 100 : Number(match[1]);
  };
  const left = units(node.styles?.left, context.canvasWidth);
  const top = units(node.styles?.top, context.canvasHeight);
  if (left === undefined || top === undefined) return undefined;
  return {
    left,
    top,
    width: units(node.styles?.width, context.canvasWidth) ?? context.canvasWidth - left,
    height: units(node.styles?.height, context.canvasHeight) ?? context.canvasHeight - top,
  };
}

const placeholderTextStyles = ["color", "fontFamily", "fontSize", "fontStyle", "fontWeight", "letterSpacing", "lineHeight", "textAlign", "textTransform"];

/** The first node in a tree with this class, and the tree without it. */
function takeNode(nodes, className) {
  let found;
  const visit = (list) => list.flatMap((node) => {
    if (found) return [node];
    if (hasClass(node, className)) {
      found = node;
      return [];
    }
    const original = node.children ?? [];
    const children = visit(original);
    const changed = children.length !== original.length || children.some((child, index) => child !== original[index]);
    return [changed ? { ...node, children } : node];
  });
  const rest = visit(nodes);
  return { found, rest };
}

function verticalAlignment(value) {
  if (value === "flex-start" || value === "start") return "top";
  if (value === "flex-end" || value === "end") return "bottom";
  return "horizon";
}

async function serializeSlide(slide, index, presentation, context) {
  const cover = hasClass(slide, "frameseq-cover-slide");
  const master = slideMaster(slide, presentation);
  const masterBackground = master?.page.styles?.background;
  const background = cssColor(
    masterBackground ?? (cover ? context.theme.coverBackground : context.theme.colors.background),
    context,
    context.theme.colors.background,
  );
  const horizontal = length(
    cover ? context.theme.spacing.coverX : context.theme.spacing.slideX,
    context,
  );
  const vertical = length(
    cover ? context.theme.spacing.coverY : context.theme.spacing.slideY,
    context,
    "y",
  );
  const gap = length(context.theme.spacing.contentGap, context) ?? "18pt";
  let childNodes = slide.children ?? [];
  const automaticTitlePage = cover
    && context.theme.chrome.autoTitlePage
    && !childNodes.some(hasVisibleNodeContent);
  if (automaticTitlePage) {
    childNodes = [
      syntheticTextNode(presentation.title, "frameseq-cover-title"),
      ...(presentation.subtitle
        ? [syntheticTextNode(presentation.subtitle, "frameseq-cover-subtitle")]
        : []),
      ...(presentation.author
        ? [syntheticTextNode(presentation.author, "frameseq-cover-author")]
        : []),
      ...(presentation.institute
        ? [syntheticTextNode(presentation.institute, "frameseq-cover-institute")]
        : []),
      ...(presentation.date
        ? [syntheticTextNode(presentation.date, "frameseq-cover-date")]
        : []),
    ];
  }
  // The master draws behind the slide, takes the text its placeholders hold out of the slide's
  // column, and sets the room the rest of the slide's content has.
  const masterLayer = [];
  const placedText = [];
  let contentInset = `(x: ${horizontal}, y: ${vertical})`;
  let contentAlign;
  let masterTakesTitle = false;
  if (master) {
    const values = {
      title: presentation.title,
      subtitle: presentation.subtitle ?? "",
      author: presentation.author ?? "",
      institute: presentation.institute ?? "",
      date: presentation.date ?? "",
      page: String(index + 1),
      total: String(presentation.slides.length),
      slide: typeof slide.props?.title === "string" ? slide.props.title : "",
    };
    context.parents = recordParents(master.page);
    for (const child of master.page.children ?? []) {
      if (typeof child.props?.placeholder === "string") continue;
      masterLayer.push(await serializeNode(withFields(child, values), context));
    }
    for (const placeholder of master.page.children ?? []) {
      const role = placeholder.props?.placeholder;
      if (typeof role !== "string") continue;
      const box = placeholderBox(placeholder, context);
      if (role === "body") {
        if (box) {
          const side = (value, axis) => length(`${value}px`, context, axis);
          contentInset = `(left: ${side(box.left)}, top: ${side(box.top, "y")}, right: ${side(context.canvasWidth - box.left - box.width)}, bottom: ${side(context.canvasHeight - box.top - box.height, "y")})`;
        }
        const justify = placeholder.styles?.justifyContent;
        if (justify === "center" || justify === "flex-end") contentAlign = verticalAlignment(justify);
        continue;
      }
      const roleClass = role === "title"
        ? (cover ? "frameseq-cover-title" : "frameseq-slide-title")
        : `frameseq-cover-${role}`;
      // A slide's title is its own first line; a cover's text sits in its body.
      const { found, rest } = role === "title" && !cover
        ? { found: childNodes.find((child) => hasClass(child, roleClass)), rest: childNodes.filter((child) => !hasClass(child, roleClass)) }
        : takeNode(childNodes, roleClass);
      if (!found) continue;
      const styles = { ...found.styles };
      for (const property of placeholderTextStyles) {
        if (placeholder.styles?.[property] && !styles[property] && supportedStyles.has(property)) {
          styles[property] = placeholder.styles[property];
        }
      }
      const text = { ...found, styles };
      if (!box) {
        found.styles = styles;
        continue;
      }
      if (role === "title") masterTakesTitle = true;
      childNodes = rest;
      context.parents = recordParents(slide);
      const content = await serializeNode(text, context);
      const dx = length(`${box.left}px`, context);
      const dy = length(`${box.top}px`, context, "y");
      placedText.push(`#place(top + left, dx: ${dx}, dy: ${dy})[#block(width: ${length(`${box.width}px`, context)}, height: ${length(`${box.height}px`, context, "y")})[#align(${verticalAlignment(placeholder.styles?.justifyContent)})[${content}]]]`);
    }
  }
  if (context.theme.chrome.titleBar && !cover && !masterTakesTitle) {
    childNodes = childNodes.filter((child) => !hasClass(child, "frameseq-slide-title"));
  }
  context.parents = recordParents(slide);
  const children = await Promise.all(childNodes.map((child) => serializeNode(child, context)));
  if (context.theme.chrome.header && !cover) children.unshift(metadataHeader(presentation, context, horizontal, vertical));
  if (automaticTitlePage) {
    children.splice(
      Math.min(2, children.length),
      0,
      `#line(length: 72%, stroke: ${length("1px", context)} + ${cssColor(context.theme.colors.accent, context)})`,
    );
  }
  // Fractions in the stack share the room left over, as the browser's auto margins do: a cover's
  // words stand in the middle of the page, above an author at its foot, and a theme like Beamer's
  // sets a content slide's body in the middle of the room below its title.
  let items = children.map(childArgument);
  if (cover && context.theme.coverLayout === "default" && !contentAlign) {
    const isAuthor = (child) => hasClass(child, "frameseq-cover-author");
    // The cover's words usually sit in one column of their own, which is opened up for the room.
    const column = childNodes.length === 1 && (childNodes[0].children ?? []).some(isAuthor)
      ? childNodes[0].children
      : undefined;
    if (column) {
      context.parents = recordParents(slide);
      items = (await Promise.all(column.map((child) => serializeNode(child, context)))).map(childArgument);
    }
    const author = automaticTitlePage ? -1 : (column ?? childNodes).findIndex(isAuthor);
    items = author > 0
      ? ["1fr", ...items.slice(0, author), "1fr", ...items.slice(author)]
      : ["1fr", ...items, "1fr"];
  } else if (!cover && !contentAlign && context.theme.contentAlign === "center") {
    const titled = childNodes[0] && hasClass(childNodes[0], "frameseq-slide-title") ? 1 : 0;
    if (items.length > titled) items = [...items.slice(0, titled), "1fr", ...items.slice(titled), "1fr"];
  }
  let body = `#stack(dir: ttb, spacing: ${gap}, ${items.join(", ")})`;
  if (cover && context.theme.coverLayout === "center") body = `#align(center + horizon)[${body}]`;
  else if (contentAlign) body = `#align(${contentAlign})[${body}]`;
  const slideLabel = slide.props?.name ?? slide.props?.title ?? `Slide ${index + 1}`;
  const notes = typeof slide.props?.notes === "string" && slide.props.notes.trim()
    ? `\n// Speaker notes: ${slide.props.notes.replaceAll("\n", " ")}`
    : "";
  const chrome = slideChrome(slide, index, presentation, context, cover, horizontal, masterTakesTitle).join("\n  ");
  const behind = masterLayer.length > 0 ? `${masterLayer.join("\n  ")}\n  ` : "";
  const placed = placedText.length > 0 ? `\n  ${placedText.join("\n  ")}` : "";
  return `// Slide ${index + 1}: ${String(slideLabel).replaceAll("\n", " ")}${notes}\n#page(\n  width: ${compactNumber(context.slideWidthPoints)}pt,\n  height: ${compactNumber(context.slideHeightPoints)}pt,\n  margin: 0pt,\n  fill: ${background},\n)[\n  #set text(fill: ${cssColor(context.theme.colors.foreground, context)})\n  ${behind}#block(\n    width: 100%,\n    height: 100%,\n    inset: ${contentInset},\n  )[\n    ${body}\n  ]${placed}\n  ${chrome}\n]`;
}

async function loadPresentation(entry, packageRoot, configFile) {
  process.env.FRAMESEQ_ENTRY = entry;
  process.env.FRAMESEQ_OPEN_BROWSER = "0";
  const server = await createServer({
    appType: "custom",
    configFile,
    root: packageRoot,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: "error",
  });
  try {
    let module;
    try {
      module = await server.ssrLoadModule(entry);
    } catch (error) {
      // The runtime ran in this process, so the statement it stopped in is still on record.
      throw await locateProblems(entry, reportedProblems(error));
    }
    const presentation = module.default;
    if (!presentation?.node || presentation.node.type !== "slides") {
      throw new Error("The slide source did not export a FrameSeq presentation");
    }
    // Named placements and connectors become coordinates, and tones become colours, exactly
    // as the preview resolves them before it draws.
    try {
      resolveAnchors(presentation.node);
    } catch (error) {
      throw await locateProblems(entry, reportedProblems(error));
    }
    resolveShapePaint(presentation.node);
    return presentation;
  } finally {
    await server.close();
  }
}

export async function exportTypst({ entry, requestedOutput, slides, packageRoot, configFile }) {
  const defaultOutput = resolve(process.cwd(), "output", "typst", typstName(entry, slides));
  const outputPath = resolve(requestedOutput ?? defaultOutput);
  const presentation = await loadPresentation(entry, packageRoot, configFile);
  if (slides) checkSlides(slides, presentation.slides.length);
  await mkdir(dirname(outputPath), { recursive: true });
  const context = makeContext(presentation, entry, outputPath);
  const pages = [];
  for (const [index, slide] of presentation.slides.entries()) {
    // A slide left out keeps the others' numbers, and their footers count the whole presentation.
    if (slides && !slides.includes(index + 1)) continue;
    pages.push(await serializeSlide(slide, index, presentation, context));
  }

  const warnings = [...context.warnings].sort();
  const warningComments = warnings.length > 0
    ? `// Conversion notes:\n${warnings.map((warning) => `// - ${warning}`).join("\n")}\n\n`
    : "";
  const source = `// Generated by FrameSeq from ${relative(process.cwd(), entry).replaceAll("\\", "/")}\n// This is editable Typst source. Re-run the export after changing the FrameSeq document.\n${warningComments}#import "@preview/mitex:0.2.7": mi, mitex, mitext\n\n#set par(leading: 0.55em)\n\n${pages.join("\n\n")}\n`;
  await writeFile(outputPath, source, "utf8");
  console.log(`Typst exported to ${outputPath}`);
  if (warnings.length > 0) {
    console.log(`Typst export completed with ${warnings.length} conversion note${warnings.length === 1 ? "" : "s"}; see the generated file header.`);
  }
  return { assets: context.assets, outputPath, source, warnings };
}
