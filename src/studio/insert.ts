import { EditorSelection, type ChangeSpec, type Text, type TransactionSpec } from "@codemirror/state";
import { shapeGeometry, shapeSize, svgPath, type ShapeKind } from "../shapes";
import { t } from "./i18n";
import type { SlideGroup } from "./outline";
import { closeMenus, element } from "./ui";

/** What can be drawn onto a slide from the Studio. */
export type InsertKind = ShapeKind | "text" | "line" | "arrow" | "connector";

export type InsertGroup = keyof typeof t.insert.groups;

/** The gallery's sections, in the order a drawing program lists them. */
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

/** A small picture of what a gallery button draws, made from the shape's own outline. */
function thumbnail(kind: InsertKind): string {
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

/** The grid of everything that can be drawn, below the button that opened it. */
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
  for (const group of insertGroups) {
    gallery.append(element("p", "studio-insert-heading", t.insert.groups[group.id]));
    const grid = element("div", "studio-insert-grid");
    for (const kind of group.kinds) {
      const button = element("button", "studio-insert-item");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.dataset.kind = kind;
      button.title = insertName(kind);
      button.setAttribute("aria-label", insertName(kind));
      button.innerHTML = thumbnail(kind);
      button.addEventListener("click", () => {
        close();
        pick(kind);
      });
      buttons.push(button);
      grid.append(button);
    }
    gallery.append(grid);
  }
  document.body.append(gallery);
  const box = anchor.getBoundingClientRect();
  const size = gallery.getBoundingClientRect();
  gallery.style.left = `${Math.max(6, Math.min(box.right - size.width, innerWidth - size.width - 6))}px`;
  gallery.style.top = `${Math.min(box.bottom + 4, innerHeight - size.height - 6)}px`;

  const columns = 7;
  const onPointer = (event: PointerEvent): void => {
    if (!gallery.contains(event.target as Node) && !anchor.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent): void => {
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      anchor.focus();
    } else if (event.key in steps) {
      event.preventDefault();
      const next = Math.min(Math.max(index + steps[event.key], 0), buttons.length - 1);
      buttons[index < 0 ? 0 : next]?.focus();
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
