import { EditorSelection, type ChangeSpec, type Text, type TransactionSpec } from "@codemirror/state";
import { shapeGeometry, shapeSize, svgPath, type ShapeKind } from "../shapes";
import { t } from "./i18n";
import type { SlideGroup } from "./outline";
import { stringLiteral } from "./properties";
import { closeMenus, element } from "./ui";

/**
 * Content written into the slide's flow after the selected object, as a word processor inserts
 * at the cursor: text, lists, formulas, pictures, and data. On a canvas, where nothing flows,
 * it is drawn out like a shape instead.
 */
export const contentKinds = [
  "paragraph", "bullets", "steps", "quote", "code",
  "math", "typst", "latex",
  "image", "table", "chart", "qr", "icon",
] as const;

export type ContentKind = (typeof contentKinds)[number];

/** What can be put onto a slide from the Studio. */
export type InsertKind = ShapeKind | "text" | "line" | "arrow" | "connector" | ContentKind;

export type InsertGroup = keyof typeof t.insert.groups;

export function isContentKind(kind: string): kind is ContentKind {
  return (contentKinds as readonly string[]).includes(kind);
}

/** The content side of the gallery: what a slide says. */
export const contentGroups: Array<{ id: InsertGroup; kinds: ContentKind[] }> = [
  { id: "writing", kinds: ["paragraph", "bullets", "steps", "quote", "code"] },
  { id: "formulas", kinds: ["math", "typst", "latex"] },
  { id: "media", kinds: ["image", "table", "chart", "qr", "icon"] },
];

/** The drawing side of the gallery, in the order a drawing program lists it. */
export const insertGroups: Array<{ id: InsertGroup; kinds: InsertKind[] }> = [
  { id: "lines", kinds: ["text", "line", "arrow", "connector"] },
  {
    id: "basic",
    kinds: [
      "rect", "rounded", "pill", "ellipse", "circle", "diamond", "triangle",
      "pentagon", "hexagon", "octagon", "parallelogram", "trapezoid", "star", "plus",
    ],
  },
  { id: "diagram", kinds: ["cylinder", "document", "note", "cube", "cloud", "callout"] },
  { id: "arrows", kinds: ["chevron", "step", "arrow-right", "arrow-left", "arrow-up", "arrow-down", "arrow-both"] },
];

export function insertName(kind: InsertKind): string {
  return t.insert.names[kind];
}

const svgOpen = '<svg viewBox="0 0 32 24" aria-hidden="true" focusable="false">';

/** Pictures of the content objects, in the gallery's own line style. */
const contentPictures: Record<ContentKind, string> = {
  paragraph: '<path class="is-stroke" d="M6 7h20M6 12h20M6 17h13"/>',
  bullets: '<circle class="is-ink" cx="7" cy="7" r="1.6"/><circle class="is-ink" cx="7" cy="12" r="1.6"/>'
    + '<circle class="is-ink" cx="7" cy="17" r="1.6"/><path class="is-stroke" d="M11 7h15M11 12h15M11 17h15"/>',
  steps: '<text class="is-glyph is-small" x="7" y="9">1</text><text class="is-glyph is-small" x="7" y="14">2</text>'
    + '<text class="is-glyph is-small" x="7" y="19">3</text><path class="is-stroke" d="M11 7h15M11 12h15M11 17h15"/>',
  quote: '<path class="is-stroke" d="M8 16c2-1 3-2.6 3-5V7H6.5v4H11M18 16c2-1 3-2.6 3-5V7h-4.5v4H21"/>',
  code: '<path class="is-stroke" d="M12 7l-5 5 5 5M20 7l5 5-5 5"/>',
  math: '<text class="is-glyph" x="16" y="16.5">x²</text>',
  typst: '<text class="is-glyph is-big" x="16" y="18">∑</text>',
  latex: '<text class="is-glyph is-serif" x="16" y="16.5">TeX</text>',
  image: '<rect x="5" y="4" width="22" height="16" rx="2"/><circle class="is-ink" cx="11" cy="9" r="2"/>'
    + '<path class="is-stroke" d="M6 18l6-5 4 3 4-4 6 5"/>',
  table: '<rect x="5" y="4" width="22" height="16" rx="1.5"/><path class="is-stroke" d="M5 9.5h22M5 14.5h22M12.5 4v16M19.5 4v16"/>',
  chart: '<path class="is-stroke" d="M6 4v16h21"/><rect x="9" y="12" width="3.5" height="8"/>'
    + '<rect x="15" y="8" width="3.5" height="12"/><rect x="21" y="5" width="3.5" height="15"/>',
  qr: '<rect x="6" y="3" width="7" height="7"/><rect x="19" y="3" width="7" height="7"/><rect x="6" y="14" width="7" height="7"/>'
    + '<path class="is-ink" d="M19 14h3v3h-3zM23 18h3v3h-3z"/>',
  icon: '<path d="m16 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z"/>',
};

/** A small picture of what a gallery button puts on the slide; a shape is drawn from its own outline. */
function thumbnail(kind: InsertKind): string {
  if (isContentKind(kind)) return `${svgOpen}${contentPictures[kind]}</svg>`;
  switch (kind) {
    case "text":
      return `${svgOpen}<path class="is-stroke" d="M9 6h14M16 6v13"/></svg>`;
    case "line":
      return `${svgOpen}<path class="is-stroke" d="M5 19L27 5"/></svg>`;
    case "arrow":
      return `${svgOpen}<path class="is-stroke" d="M5 19L23.5 7.2"/><path class="is-ink" d="M27 5l-7.4 1.2 3.6 5.2z"/></svg>`;
    case "connector":
      return `${svgOpen}<rect x="2" y="3" width="9" height="7" rx="1.5"/><rect x="21" y="14" width="9" height="7" rx="1.5"/>`
        + '<path class="is-stroke" d="M11 6.5h5v11h2.5"/><path class="is-ink" d="M21 17.5l-3.4-2v4z"/></svg>';
    default: {
      const usual = shapeSize(kind);
      const scale = Math.min(26 / usual.width, 18 / usual.height);
      const width = usual.width * scale;
      const height = usual.height * scale;
      const geometry = shapeGeometry(kind, width, height, { strokeWidth: 1.4 });
      const left = (32 - width) / 2;
      const top = (24 - height) / 2;
      const path = (segments: typeof geometry.outline, className = ""): string => (
        `<path${className ? ` class="${className}"` : ""} d="${svgPath(segments)}"/>`
      );
      return `${svgOpen}<g transform="translate(${left.toFixed(2)} ${top.toFixed(2)})">${path(geometry.outline)}`
        + `${geometry.shade ? path(geometry.shade, "is-shade") : ""}${geometry.detail ? path(geometry.detail, "is-stroke") : ""}</g></svg>`;
    }
  }
}

let openGallery: { close: () => void } | undefined;

/**
 * Everything that can be put on a slide, below the button that opened it: content on one side,
 * named so it can be told apart, and shapes and lines on the other, drawn as they will look.
 */
export function showInsertGallery(anchor: HTMLElement, pick: (kind: InsertKind) => void): void {
  if (openGallery) {
    openGallery.close();
    return;
  }
  closeMenus();
  const gallery = element("div", "studio-insert-gallery");
  gallery.setAttribute("role", "menu");
  gallery.setAttribute("aria-label", t.insert.button);
  const buttons: HTMLButtonElement[] = [];
  const item = (kind: InsertKind, labelled: boolean): HTMLButtonElement => {
    const button = element("button", `studio-insert-item${labelled ? " is-labelled" : ""}`);
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.dataset.kind = kind;
    const description = isContentKind(kind) ? t.insert.descriptions[kind] : undefined;
    button.title = description ? `${insertName(kind)} · ${description}` : insertName(kind);
    button.setAttribute("aria-label", insertName(kind));
    button.innerHTML = thumbnail(kind);
    if (labelled) button.append(element("span", "studio-insert-label", insertName(kind)));
    button.addEventListener("click", () => {
      close();
      pick(kind);
    });
    buttons.push(button);
    return button;
  };
  const column = (title: string, groups: Array<{ id: InsertGroup; kinds: InsertKind[] }>, labelled: boolean): HTMLElement => {
    const side = element("div", `studio-insert-column${labelled ? " is-content" : ""}`);
    side.append(element("p", "studio-insert-title", title));
    for (const group of groups) {
      side.append(element("p", "studio-insert-heading", t.insert.groups[group.id]));
      const grid = element("div", `studio-insert-grid${labelled ? " is-labelled" : ""}`);
      grid.append(...group.kinds.map((kind) => item(kind, labelled)));
      side.append(grid);
    }
    return side;
  };
  gallery.append(column(t.insert.content, contentGroups, true), column(t.insert.drawing, insertGroups, false));
  document.body.append(gallery);
  const box = anchor.getBoundingClientRect();
  const size = gallery.getBoundingClientRect();
  gallery.style.left = `${Math.max(6, Math.min(box.right - size.width, innerWidth - size.width - 6))}px`;
  gallery.style.top = `${Math.max(6, Math.min(box.bottom + 4, innerHeight - size.height - 6))}px`;

  const onPointer = (event: PointerEvent): void => {
    if (!gallery.contains(event.target as Node) && !anchor.contains(event.target as Node)) close();
  };
  // The arrow keys move to the nearest button that way, across both sides and their grids.
  const nearest = (from: HTMLButtonElement, dx: number, dy: number): HTMLButtonElement | undefined => {
    const origin = from.getBoundingClientRect();
    const centre = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const start = centre(origin);
    let best: { button: HTMLButtonElement; score: number } | undefined;
    for (const button of buttons) {
      if (button === from) continue;
      const point = centre(button.getBoundingClientRect());
      const along = (point.x - start.x) * dx + (point.y - start.y) * dy;
      if (along <= 1) continue;
      const across = Math.abs((point.x - start.x) * dy) + Math.abs((point.y - start.y) * dx);
      const score = along + across * 3;
      if (!best || score < best.score) best = { button, score };
    }
    return best?.button;
  };
  const onKey = (event: KeyboardEvent): void => {
    const current = document.activeElement as HTMLButtonElement;
    const steps: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      anchor.focus();
    } else if (event.key in steps) {
      event.preventDefault();
      if (!buttons.includes(current)) {
        buttons[0]?.focus();
        return;
      }
      nearest(current, ...steps[event.key])?.focus();
    }
  };
  function close(): void {
    gallery.remove();
    removeEventListener("pointerdown", onPointer, true);
    removeEventListener("keydown", onKey, true);
    removeEventListener("blur", close);
    openGallery = undefined;
  }
  addEventListener("pointerdown", onPointer, true);
  addEventListener("keydown", onKey, true);
  addEventListener("blur", close);
  openGallery = { close };
  buttons[0]?.focus();
}

/** A content object's code, a line at a time, and the words to type over in it. */
export interface ContentCode {
  lines: string[];
  /** Where the placeholder is: a line of `lines`, and its start and end on that line. */
  select?: { line: number; from: number; to: number };
}

/**
 * The code that writes a content object, with sample text in the Studio's language and strings
 * in the document's own quotes. A picture comes from `image`: a path beside the presentation,
 * written with new URL() so the build finds it, or a web address. An icon is `icon` by name.
 */
export function contentCode(kind: ContentKind, options: { quote?: string; image?: string; icon?: string } = {}): ContentCode {
  const quote = options.quote === "'" ? "'" : '"';
  const literal = (value: string): string => stringLiteral(value, quote) as string;
  const samples = t.insert.samples;
  // Select the words of the first literal that holds `words` on the line.
  const around = (lines: string[], words: string, line = 0): ContentCode => {
    const from = lines[line].indexOf(words);
    return { lines, select: from < 0 ? undefined : { line, from, to: from + words.length } };
  };
  switch (kind) {
    case "paragraph":
      return around([`text(${literal(samples.text)});`], samples.text);
    case "bullets":
    case "steps": {
      const items = kind === "bullets" ? samples.items : samples.steps;
      return around([`${kind}(${items.map(literal).join(", ")});`], items[0]);
    }
    case "quote":
      return around([`text(${literal(samples.quote)}).quote();`], samples.quote);
    case "code":
      return around(['code(`const answer = 42;`, "ts");'], "const answer = 42;");
    case "math":
      return around(["math`E = mc^2`;"], "E = mc^2");
    case "typst":
      return around(["typst`", "  $ sum_(k=1)^n k = (n(n + 1)) / 2 $", "`;"], "$ sum_(k=1)^n k = (n(n + 1)) / 2 $", 1);
    case "latex":
      // LaTeX itself sets tables; a formula in LaTeX notation is math(), which KaTeX sets at once.
      return around([
        "latex`",
        "  \\begin{tabular}{lr}",
        "    \\toprule",
        "    Model & Accuracy \\\\",
        "    \\midrule",
        "    Baseline & 91.2\\% \\\\",
        "    Ours & 94.6\\% \\\\",
        "    \\bottomrule",
        "  \\end{tabular}",
        "`;",
      ], "Model & Accuracy", 3);
    case "image": {
      const source = options.image ?? "./images/picture.png";
      const address = /^[a-z][a-z0-9+.-]*:/i.test(source) ? literal(source) : `new URL(${literal(source)}, import.meta.url).href`;
      return around([`image(${address}, ${literal(samples.alt)});`], samples.alt);
    }
    case "table": {
      const row = (cells: string[]): string => `  [${cells.map(literal).join(", ")}],`;
      return around(["table([", row(samples.header), ...samples.rows.map(row), "]);"], samples.header[0], 1);
    }
    case "chart": {
      const entries = Object.entries(samples.chart).map(([label, value]) => `${literal(label)}: ${value}`);
      return around([`chart("bar", { ${entries.join(", ")} });`], "bar");
    }
    case "qr":
      return around([`qr(${literal("https://example.com")});`], "https://example.com");
    case "icon": {
      const name = options.icon ?? "star";
      return around([`icon(${literal(name)});`], name);
    }
  }
}

/** The size a content object is drawn at when it is clicked onto a canvas rather than dragged out. */
export function contentSize(kind: ContentKind): { width: number; height: number } {
  switch (kind) {
    case "image": return { width: 480, height: 320 };
    case "table": return { width: 560, height: 200 };
    case "chart": return { width: 560, height: 320 };
    case "qr": return { width: 200, height: 200 };
    case "icon": return { width: 96, height: 96 };
    case "code": return { width: 560, height: 120 };
    case "typst": case "latex": case "math": return { width: 480, height: 120 };
    default: return { width: 480, height: 120 };
  }
}

/**
 * Write a content object after a statement of the slide, the one holding the selected object,
 * at that statement's indent. Its later lines take the same indent.
 */
export function insertAfter(doc: Text, after: number, indent: string, content: ContentCode): TransactionSpec & { at: number } {
  const line = doc.lineAt(after);
  const insert = `\n${content.lines.map((text) => `${indent}${text}`).join("\n")}`;
  const start = line.to + 1;
  let selection = EditorSelection.single(start + indent.length);
  if (content.select) {
    const before = content.lines.slice(0, content.select.line).reduce((sum, text) => sum + indent.length + text.length + 1, 0);
    const from = start + before + indent.length + content.select.from;
    selection = EditorSelection.single(from, from + content.select.to - content.select.from);
  }
  return {
    at: start + indent.length,
    changes: { from: line.to, insert },
    selection,
    scrollIntoView: true,
    userEvent: "input.insert",
  };
}

/** A shape, a text box, or a line drawn in the preview, in the coordinates it is written in. */
export interface Placement {
  kind: InsertKind;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

const integer = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0);

/** The command that writes a placed object, and where its placeholder text sits in it. */
export function placementCode(placement: Placement): { code: string; select?: [number, number] } {
  const { kind } = placement;
  if (kind === "line" || kind === "arrow") {
    const points = `{ x1: ${integer(placement.x1)}, y1: ${integer(placement.y1)}, x2: ${integer(placement.x2)}, y2: ${integer(placement.y2)} }`;
    return { code: `line(${points})${kind === "arrow" ? ".arrow()" : ""};` };
  }
  const label = JSON.stringify(t.insert.placeholder);
  const position = `.position({ x: ${integer(placement.x)}, y: ${integer(placement.y)} })`;
  const head = kind === "text" ? `text(${label})` : `shape(${JSON.stringify(kind)}, ${label})`;
  const size = kind === "text"
    ? `.width(${integer(placement.width)})`
    : `.width(${integer(placement.width)}).height(${integer(placement.height)})`;
  const at = head.indexOf(label) + 1;
  return { code: `${head}${position}${size};`, select: [at, at + label.length - 2] };
}

/** A content object drawn onto a canvas: where it was drawn, and as wide; its height follows. */
export function placedContent(content: ContentCode, placement: Placement): ContentCode {
  const lines = [...content.lines];
  const last = lines.length - 1;
  lines[last] = lines[last].replace(
    /;$/,
    `.position({ x: ${integer(placement.x)}, y: ${integer(placement.y)} }).width(${integer(placement.width)});`,
  );
  return { ...content, lines };
}

/** Where a slide's code ends: after its last character that is not white space. */
export function slideEnd(doc: Text, group: SlideGroup): number {
  let end = group.to;
  while (end > group.from && /\s/.test(doc.sliceString(end - 1, end))) end -= 1;
  return end;
}

/**
 * Write an object at the end of a slide, after its last line with anything on it. The lines
 * before may have moved the cursor into another region, so `returnToMain` steps back first: the
 * preview measured the object's coordinates in the slide's first region.
 */
export function appendToSlide(
  doc: Text,
  group: SlideGroup,
  code: string,
  returnToMain: boolean,
  select?: [number, number],
): TransactionSpec {
  let end = group.to;
  while (end > group.from && /\s/.test(doc.sliceString(end - 1, end))) end -= 1;
  const line = doc.lineAt(end);
  const indent = /^[ \t]*/.exec(doc.lineAt(group.anchor).text)?.[0] ?? "";
  const insert = `${returnToMain ? `\n${indent}main();` : ""}\n${indent}${code}`;
  const codeStart = line.to + insert.length - code.length;
  return {
    changes: { from: line.to, insert },
    selection: select
      ? EditorSelection.single(codeStart + select[0], codeStart + select[1])
      : EditorSelection.cursor(codeStart + code.length),
    scrollIntoView: true,
    userEvent: "input.insert",
  };
}

/** One end of a connector drawn in the preview: the object it starts or ends at. */
export interface ConnectorEnd {
  name?: string;
  /** The object's source, as the preview reports it: line, column, start, and end. */
  source?: string;
  /** Made by a loop or a helper, so one command writes several objects. */
  shared?: boolean;
  type?: string;
}

const nameStems: Record<string, string> = { shape: "shape", rect: "box", circle: "circle", text: "label", image: "image", icon: "icon" };

/**
 * Connect two objects with a connector that follows them: name whichever of them has no name
 * yet, by adding .as() to the end of its command, and write the connector after the later of
 * the two statements, so it lands in the same region they do. Returns why it cannot, instead.
 */
export function connectorChanges(
  doc: Text,
  ends: [ConnectorEnd, ConnectorEnd],
  range: (target: { start: number; end: number }) => { from: number; to: number } | undefined,
  statements: Array<{ from: number; to: number }>,
  taken: Set<string>,
): { spec: TransactionSpec; names: [string, string] } | string {
  const changes: ChangeSpec[] = [];
  const names: string[] = [];
  let last = 0;
  for (const end of ends) {
    const [, , start, finish] = (end.source ?? "").split(":").map(Number);
    const at = Number.isInteger(start) && Number.isInteger(finish) ? range({ start, end: finish }) : undefined;
    if (end.name) {
      names.push(end.name);
    } else {
      if (end.shared || !at) return t.insert.cannotName;
      const stem = nameStems[end.type ?? ""] ?? "node";
      let index = 1;
      while (taken.has(`${stem}${index}`)) index += 1;
      const name = `${stem}${index}`;
      taken.add(name);
      names.push(name);
      changes.push({ from: at.to, insert: `.as(${JSON.stringify(name)})` });
    }
    if (at) last = Math.max(last, at.to);
  }
  if (last === 0) return t.insert.cannotName;
  // After the whole statement holding the later object, which may run over several lines.
  const statement = statements.find((candidate) => candidate.from <= last && last <= candidate.to);
  const after = doc.lineAt(statement ? statement.to : last);
  const indent = /^[ \t]*/.exec(after.text)?.[0] ?? "";
  const code = `line().from(${JSON.stringify(names[0])}).to(${JSON.stringify(names[1])}).arrow();`;
  changes.push({ from: after.to, insert: `\n${indent}${code}` });
  const shift = changes
    .filter((change) => (change as { from: number }).from <= after.to)
    .reduce((sum, change) => sum + String((change as { insert: string }).insert).length, 0);
  changes.sort((a, b) => (a as { from: number }).from - (b as { from: number }).from);
  return {
    spec: {
      changes,
      selection: EditorSelection.cursor(after.to + shift),
      scrollIntoView: true,
      userEvent: "input.insert",
    },
    names: [names[0], names[1]],
  };
}
