import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const slideWidthPoints = 960;
const semanticClasses = new Set([
  "frameseq-auto-title-page",
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
  "frameseq-semantic-code",
  "frameseq-semantic-image",
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
  "padding",
  "position",
  "textAlign",
  "top",
  "transform",
  "width",
]);

function typstName(entry) {
  const file = basename(entry, extname(entry));
  return `${file.replace(/\.slides$/, "")}.typ`;
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

function inlineContent(content) {
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
    style.color = theme.family === "beamer" ? theme.colors.accent : theme.colors.foreground;
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
  } else if (names.has("frameseq-caption")) {
    style.color = theme.colors.subtle;
    style.size = 15;
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

function borderStroke(styles, context, fallbackColor) {
  const border = styles.border ? context.resolveVariable(styles.border) : "";
  const widthValue = styles.borderWidth ?? border.match(/(?:^|\s)([\d.]+(?:px|pt|rem|em))(?:\s|$)/)?.[1];
  const colorValue = styles.borderColor
    ?? border.match(/var\([^)]+\)|#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i)?.[0]
    ?? fallbackColor;
  if (styles.borderStyle === "none" || border === "0" || border === "none") return "none";
  if (!widthValue && !styles.borderColor && !styles.border) return undefined;
  const width = length(widthValue ?? "1px", context);
  const color = cssColor(colorValue, context, fallbackColor);
  return width && color && color !== "none" ? `${width} + ${color}` : "none";
}

function commonBlockArguments(node, context, defaults = {}) {
  const styles = node.styles ?? {};
  const args = [];
  const width = length(styles.width ?? defaults.width, context, "x");
  const height = length(styles.height ?? defaults.height, context, "y");
  const fill = cssColor(styles.background ?? defaults.background, context);
  const stroke = borderStroke(styles, context, defaults.borderColor);
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
  const align = styles.textAlign ?? styles.alignItems ?? defaults.align;
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
  const body = inlineContent(node.props?.content);
  const content = `#text(${joinArguments(args)})[${body}]`;
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
      `#text(fill: ${cssColor(context.theme.colors.muted, context)})[${inlineContent(label)}]`,
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
  return `#text(fill: ${cssColor(context.theme.colors.error, context)})[${inlineContent("Unsupported LaTeX fragment")}]`;
}

async function serializeShape(node, context) {
  const styles = node.styles ?? {};
  const args = commonBlockArguments(node, context, {
    borderColor: context.theme.colors.accent,
    height: node.type === "circle" ? "120px" : "120px",
    radius: node.type === "rect" ? context.theme.radii.medium : undefined,
    width: node.type === "circle" ? "120px" : "240px",
  });
  const label = inlineContent(node.props?.label ?? "");
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

async function serializeLine(node, context) {
  const start = `(${length(`${Number(node.props?.x1 ?? 0)}px`, context)}, ${length(`${Number(node.props?.y1 ?? 0)}px`, context, "y")})`;
  const end = `(${length(`${Number(node.props?.x2 ?? 0)}px`, context)}, ${length(`${Number(node.props?.y2 ?? 0)}px`, context, "y")})`;
  const strokeWidth = length(node.props?.strokeWidth ?? "3px", context) ?? "2.25pt";
  const strokeColor = cssColor(node.props?.stroke ?? context.theme.colors.accent, context, context.theme.colors.accent);
  if (node.props?.arrow && node.props.arrow !== "none") {
    context.warn("Connector arrowheads are not yet editable in Typst; the connector line itself remains editable.");
  }
  return `#place(top + left)[#line(start: ${start}, end: ${end}, stroke: ${strokeWidth} + ${strokeColor})]`;
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

async function serializeContainer(node, context) {
  if (hasClass(node, "frameseq-list")) return serializeList(node, context);
  const children = await Promise.all((node.children ?? []).map((child) => serializeNode(child, context)));
  if (node.type === "stack" || hasClass(node, "frameseq-layout-canvas")) {
    return wrapCommon(node, `#block(width: 100%, height: 100%)[${children.join("\n")}]`, context);
  }

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
  }

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
  if (node.type === "typst") return serializeTypst(node, context);
  if (node.type === "latex") return serializeLatex(node, context);
  if (node.type === "rect" || node.type === "circle") return serializeShape(node, context);
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
  if (["image", "code", "equation", "typst", "latex", "rect", "circle", "line"].includes(node.type)) {
    return true;
  }
  return (node.children ?? []).some(hasVisibleNodeContent);
}

function slideChrome(slide, index, presentation, context, cover, horizontal) {
  const chrome = context.theme.chrome;
  if (cover && !chrome.showOnCover) return [];
  const elements = [];
  const title = typeof slide.props?.title === "string" ? slide.props.title : undefined;
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

async function serializeSlide(slide, index, presentation, context) {
  const cover = hasClass(slide, "frameseq-cover-slide");
  const background = cssColor(
    cover ? context.theme.coverBackground : context.theme.colors.background,
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
  if (context.theme.chrome.titleBar && !cover) {
    childNodes = childNodes.filter((child) => !hasClass(child, "frameseq-slide-title"));
  }
  const children = await Promise.all(childNodes.map((child) => serializeNode(child, context)));
  if (automaticTitlePage) {
    children.splice(
      Math.min(2, children.length),
      0,
      `#line(length: 72%, stroke: ${length("1px", context)} + ${cssColor(context.theme.colors.accent, context)})`,
    );
  }
  let body = `#stack(dir: ttb, spacing: ${gap}, ${children.map(childArgument).join(", ")})`;
  if (cover && context.theme.coverLayout === "center") body = `#align(center + horizon)[${body}]`;
  const slideLabel = slide.props?.name ?? slide.props?.title ?? `Slide ${index + 1}`;
  const notes = typeof slide.props?.notes === "string" && slide.props.notes.trim()
    ? `\n// Speaker notes: ${slide.props.notes.replaceAll("\n", " ")}`
    : "";
  const chrome = slideChrome(slide, index, presentation, context, cover, horizontal).join("\n  ");
  return `// Slide ${index + 1}: ${String(slideLabel).replaceAll("\n", " ")}${notes}\n#page(\n  width: ${compactNumber(context.slideWidthPoints)}pt,\n  height: ${compactNumber(context.slideHeightPoints)}pt,\n  margin: 0pt,\n  fill: ${background},\n)[\n  #set text(fill: ${cssColor(context.theme.colors.foreground, context)})\n  #block(\n    width: 100%,\n    height: 100%,\n    inset: (x: ${horizontal}, y: ${vertical}),\n  )[\n    ${body}\n  ]\n  ${chrome}\n]`;
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
    const module = await server.ssrLoadModule(entry);
    const presentation = module.default;
    if (!presentation?.node || presentation.node.type !== "slides") {
      throw new Error("The slide source did not export a FrameSeq presentation");
    }
    return presentation;
  } finally {
    await server.close();
  }
}

export async function exportTypst({ entry, requestedOutput, packageRoot, configFile }) {
  const defaultOutput = resolve(process.cwd(), "output", "typst", typstName(entry));
  const outputPath = resolve(requestedOutput ?? defaultOutput);
  await mkdir(dirname(outputPath), { recursive: true });
  const presentation = await loadPresentation(entry, packageRoot, configFile);
  const context = makeContext(presentation, entry, outputPath);
  const pages = [];
  for (const [index, slide] of presentation.slides.entries()) {
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
