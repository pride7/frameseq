import { shapeKinds, toneHues, type ShapeKind } from "../shapes";
import type {
  InspectComputed,
  InspectMethod,
  InspectObject,
  InspectProperty,
  InspectRegion,
  InspectSlide,
  InspectText,
} from "./api";
import { t } from "./i18n";
import {
  appendCall,
  commandCheck,
  fieldLiteral,
  fieldSpecs,
  hasMethod,
  lastProperty,
  literalValue,
  methodOf,
  planFor,
  quoteFor,
  reframe,
  removeCalls,
  replaceLiteral,
  shiftSlide,
  stringLiteral,
  taggedText,
  takesRole,
  textRoles,
  unframe,
  type FieldSpec,
  type SectionId,
  type SourcePlan,
} from "./properties";
import { chooseIcon } from "./icons";
import { element, showMenu, toast } from "./ui";

/** The presentation's details a cover or a poster's header draws, in the order a cover shows them. */
export const detailNames = ["title", "subtitle", "author", "institute", "date"] as const;

export type DetailName = (typeof detailNames)[number];

/** The presentation's details as the slide in the preview draws them, to be set in Current slide. */
export interface SlideDetails {
  /** A cover drawn from them, or a poster's header. */
  kind: "cover" | "header";
  /** Each detail's words, or the code that works them out. */
  fields: Array<{ name: DetailName; value: string; computed?: string }>;
  /** False when presentation()'s options are code, so none can be set here. */
  editable: boolean;
}

export interface InspectorEvents {
  /** Set one of the presentation's details; false when it cannot be written. */
  setDetail: (name: DetailName, value: string) => boolean;
  /** Show where presentation() writes a detail. */
  revealDetail: (name: DetailName) => void;
  /** Write a cover drawn from the presentation's details as text objects on its slide. */
  convertCover: () => void;
  /** Show where an object was written, and outline it in the preview. */
  selectObject: (object: InspectObject) => void;
  selectRegion: (region: InspectRegion) => void;
  /**
   * Apply edits made against the text the panel was drawn from, as one undoable step; false
   * when a check no longer reads as expected, so nothing changes on a guess.
   */
  edit: (plan: SourcePlan) => boolean;
  /** Put the editor's cursor on a position and give the editor focus. */
  reveal: (position: number) => void;
  /** Delete objects that are statements of their own, the one chosen and those that go with it. */
  deleteObjects: (objects: InspectObject[]) => void;
  /** Write a copy of an object that is a statement of its own after it, and select the copy. */
  duplicateObject: (object: InspectObject) => void;
  /** Choose a picture for an image, copied beside the presentation; undefined when cancelled. */
  choosePicture: () => Promise<string | undefined>;
  /** A right-click on an object's row, which has selected it, at a point on the page. */
  objectMenu: (object: InspectObject, x: number, y: number, keyboard: boolean) => void;
}

const svg = (body: string): string => (
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`
);

/** Pictures for the kinds of object a slide holds, so a long list can be scanned by shape. */
const icons: Record<string, string> = {
  text: svg('<path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6"/>'),
  image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 16-4.5-4.5-8.5 8"/>'),
  code: svg('<path d="m8.5 7.5-5 4.5 5 4.5M15.5 7.5l5 4.5-5 4.5"/>'),
  formula: svg('<path d="M17.5 6V4.5h-11l6 7.5-6 7.5h11V18"/>'),
  rect: svg('<rect x="3.5" y="6" width="17" height="12" rx="1.5"/>'),
  circle: svg('<circle cx="12" cy="12" r="8"/>'),
  shape: svg('<path d="M12 3.5 20.5 12 12 20.5 3.5 12Z"/>'),
  polygon: svg('<path d="M4.5 7.5 15 4l5 8-5.5 8L4 16.5Z"/>'),
  junction: svg('<path d="M3.5 12h17M12 12V4.5"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>'),
  cells: svg('<rect x="3.5" y="8.5" width="5" height="7" rx="1"/><rect x="9.5" y="8.5" width="5" height="7" rx="1" fill="currentColor"/><rect x="15.5" y="8.5" width="5" height="7" rx="1"/>'),
  line: svg('<path d="M4.5 19.5 19.5 4.5M19.5 4.5h-6M19.5 4.5v6"/>'),
  bullets: svg('<path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10M4.5 6.5h1M4.5 12h1M4.5 17.5h1"/>'),
  steps: svg('<path d="M10 6.5h9.5M10 12h9.5M10 17.5h9.5M4.5 5l1.5-.8v4.3M4 15.5c.4-.7 2.6-.9 2.5.6 0 1-2.5 1.8-2.5 3h2.6"/>'),
  metric: svg('<path d="M4 17.5 9.5 12l3.5 3.5 7-7M15 8.5h5v5"/>'),
  container: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17"/>'),
  row: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.2 4.5v15M14.8 4.5v15"/>'),
  column: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17"/>'),
  table: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M10 4.5v15"/>'),
  chart: svg('<path d="M4.5 4.5v15h15M8.5 15.5v-3M12.5 15.5v-7M16.5 15.5v-5"/>'),
  qr: svg('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5H14zM17 20h3v-3"/>'),
  icon: svg('<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.8 5.4-.7Z"/>'),
  quote: svg('<path d="M6 17c2-1 3-3 3-6V7H5v4h4M15 17c2-1 3-3 3-6V7h-4v4h4"/>'),
  region: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke-dasharray="3 2.2"/>'),
};

const iconFor: Record<string, string> = {
  math: "formula", equation: "formula", typst: "formula", typstFile: "formula", latex: "formula", latexFile: "formula",
  group: "container", card: "container", gridSection: "container", stack: "container", custom: "container",
  lead: "text", caption: "text",
};

/** The family an object belongs to, which tints its picture. */
function category(type: string): string {
  if (["text", "lead", "caption", "quote", "bullets", "steps", "metric"].includes(type)) return "text";
  if (["rect", "circle", "shape", "polygon", "junction", "cells", "line"].includes(type)) return "shape";
  if (["math", "equation", "typst", "typstFile", "latex", "latexFile", "code"].includes(type)) return "formula";
  if (["image", "chart", "qr", "icon", "table"].includes(type)) return "media";
  return "container";
}

const actionIcons = {
  code: svg('<path d="m8.5 7.5-5 4.5 5 4.5M15.5 7.5l5 4.5-5 4.5"/>'),
  delete: svg('<path d="M4 6.5h16M18 6.5v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-12M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5"/>'),
  duplicate: svg('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/>'),
  left: svg('<path d="M4 6.5h16M4 12h10M4 17.5h13"/>'),
  center: svg('<path d="M4 6.5h16M7 12h10M5.5 17.5h13"/>'),
  right: svg('<path d="M4 6.5h16M10 12h10M7 17.5h13"/>'),
};

/** Settings shown side by side, with short names, because they are read together. */
const pairs: Array<[string, string]> = [
  ["width", "height"], ["x", "y"], ["x1", "y1"], ["x2", "y2"], ["minWidth", "minHeight"], ["maxWidth", "maxHeight"],
];

const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A CSS colour as the #rrggbb a colour picker takes, when the browser understands it. */
function pickerColor(value: string): string | undefined {
  if (hexColor.test(value)) {
    return value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value.toLowerCase();
  }
  const context = document.createElement("canvas").getContext("2d");
  if (!context || !CSS.supports("color", value)) return undefined;
  context.fillStyle = "#000000";
  context.fillStyle = value;
  return /^#[0-9a-f]{6}$/i.test(context.fillStyle) ? context.fillStyle : undefined;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** What an object's strings are called, by its command and the argument. */
function textLabel(type: string, argument: number): string | undefined {
  const names = t.inspector.texts;
  const first = (name: string): string | undefined => (argument === 0 ? name : undefined);
  switch (type) {
    case "text": case "lead": case "caption": case "quote": return first(names.text);
    case "code": return first(names.code);
    case "math": case "equation": return first(names.formula);
    case "latex": return first(names.source("LaTeX"));
    case "typst": return first(names.source("Typst"));
    case "latexFile": return first(names.file("LaTeX"));
    case "typstFile": return first(names.file("Typst"));
    case "image": return argument === 0 ? names.image : (argument === 1 ? names.imageAlt : undefined);
    case "icon": return first(names.icon);
    case "qr": return first(names.qr);
    case "rect": case "circle": case "junction": return first(names.label);
    case "shape": return argument === 0 ? names.shapeKind : (argument === 1 ? names.label : undefined);
    case "polygon": return argument === 1 ? names.label : undefined;
    case "card": return argument === 0 ? names.title : (argument === 1 ? names.body : undefined);
    case "metric": return argument === 0 ? names.value : (argument === 1 ? names.label : undefined);
    default: return undefined;
  }
}

const multiline = new Set(["text", "lead", "caption", "quote", "code", "math", "equation", "latex", "typst"]);
const monospace = new Set(["code", "math", "equation", "latex", "typst", "latexFile", "typstFile", "image", "icon", "qr"]);

/**
 * The objects on the slide the preview shows, grouped by the region they were written in.
 * Selecting one, here, in the preview, or in the code, opens its settings below its row: what it
 * says, then its text, appearance, size, and position. Every change is an edit to the source and
 * one step of the editor's history: a value already written is rewritten where it stands, a new
 * one is added as a method call after the object's last one, and going back to the default
 * takes the call away.
 */
export class SlideInspector {
  private slide: InspectSlide | undefined;
  private note = "";
  private highlighted: string | undefined;
  /** Rows the reader opened or closed, kept across the redraw after every edit. */
  private readonly opened = new Set<string>();
  private readonly closed = new Set<string>();
  /** Settings asked for from "More settings" before they have a value. */
  private readonly revealed = new Set<string>();
  /** The control to focus after the next redraw, such as a list item just added. */
  private focusNext: string | undefined;
  /** A drag on a setting's name is changing it; the redraw waits for the drag to end. */
  private scrubbing = false;
  private deferred = false;
  /** The selected object's settings were folded by clicking its row again. */
  private folded = false;
  /** An object just inserted, whose words take the focus once the panel shows it. */
  private contentFocus: { position: number; until: number } | undefined;
  /** Text boxes the reader dragged to another height, kept across the redraw. */
  private readonly heights = new Map<string, string>();
  /** The presentation's details the slide draws, and the one selected in the preview. */
  private details: SlideDetails | undefined;
  private detailHighlighted: DetailName | undefined;

  constructor(private readonly body: HTMLElement, private readonly events: InspectorEvents) {
    this.body.addEventListener("keydown", (event) => this.navigate(event));
    this.render();
  }

  /**
   * Once the object written at this position is shown and selected, open its settings and put
   * the focus in its words, selected, so typing replaces the sample an insertion wrote.
   */
  focusContentAt(position: number): void {
    this.contentFocus = { position, until: Date.now() + 10_000 };
  }

  /** The box holding what an object says, which an insertion leaves to be typed over. */
  private contentKey(object: InspectObject, key: string): string | undefined {
    if (object.type === "bullets" || object.type === "steps") return object.texts?.length ? `${key}:item:0` : undefined;
    const texts = object.texts ?? [];
    const words = object.type === "image" || object.type === "shape"
      ? texts.find((text) => text.argument === 1)
      : texts.find((text) => textLabel(object.type, text.argument));
    return words ? `${key}:text:${words.argument}` : undefined;
  }

  /**
   * Open an object's settings and give them the focus: its words, selected to be typed over,
   * when `words` asks for them and it has any, or else its row.
   */
  openSettings(object: InspectObject, words: boolean): void {
    this.highlight(object);
    const key = this.objectKey(object);
    if (!key) return;
    this.folded = false;
    if (words && object.source.start !== undefined) this.contentFocus = { position: object.source.start, until: Date.now() + 10_000 };
    else this.focusNext = key;
    this.render();
    this.body.querySelector<HTMLElement>(".studio-object-card")?.scrollIntoView({ block: "nearest" });
  }

  /** Whether an object says something in words, which its settings show first. */
  hasWords(object: InspectObject): boolean {
    const key = this.objectKey(object);
    return Boolean(key && this.contentKey(object, key));
  }

  /**
   * Write words typed on the slide into the literal that holds them, as Content writes them: in
   * the quotes they were written with, a template keeping its frame, and a number in a table's
   * cell staying a number while it reads as one. False when the code has moved on.
   */
  writeWords(object: InspectObject, text: InspectText, value: string): boolean {
    let ok: boolean;
    if (object.type === "table") {
      const number = text.kind === "number" && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim());
      const literal = number
        ? value.trim()
        : stringLiteral(value, text.kind === "string" ? text.expected[0] : quoteFor(object), text.raw);
      if (literal === undefined) return false;
      ok = literal === text.expected || this.apply(replaceLiteral(text, literal));
    } else {
      const template = text.raw === true || text.expected.startsWith("`");
      ok = this.setText(object, text, template ? reframe(unframe(String(text.value)), value) : value);
    }
    if (ok) this.render();
    return ok;
  }

  /** Give a shape written without a label, such as rect(), the words typed on it. */
  writeLabel(object: InspectObject, value: string): boolean {
    const place = object.labelAt;
    const check = commandCheck(object);
    const literal = stringLiteral(value, quoteFor(object));
    if (!place || !check || literal === undefined) return false;
    const ok = this.apply({ edits: [{ from: place.at, to: place.at, insert: `${place.prefix}${literal}` }], checks: [check] });
    if (ok) this.render();
    return ok;
  }

  /** Show a slide's objects; with no slide, say why there is nothing to show. */
  show(slide: InspectSlide | undefined, note = "", details?: SlideDetails): void {
    this.slide = slide;
    this.note = note;
    if (details?.kind !== this.details?.kind) this.detailHighlighted = undefined;
    this.details = details;
    this.render();
  }

  /** Mark one of the presentation's details as selected, as a click on it in the preview does. */
  highlightDetail(name: DetailName | undefined): void {
    this.detailHighlighted = name;
    if (name) this.highlight(undefined);
    this.render();
    this.body.querySelector<HTMLElement>(".studio-card-row.is-highlighted")?.scrollIntoView({ block: "nearest" });
  }

  /** Select the object at the editor's cursor, opening the rows above it. */
  highlight(object: InspectObject | undefined): void {
    const key = object ? this.objectKey(object) : undefined;
    if (object) this.detailHighlighted = undefined;
    if (key === this.highlighted) return;
    this.highlighted = key;
    this.folded = false;
    this.revealed.clear();
    if (object && this.slide) {
      this.closed.delete(`region:${object.region || "main"}`);
      let parent = this.parentOf(object);
      while (parent) {
        this.closed.delete(this.objectKey(parent) as string);
        parent = this.parentOf(parent);
      }
    }
    this.render();
    this.body.querySelector<HTMLElement>(".studio-tree-row.is-highlighted")?.scrollIntoView({ block: "nearest" });
  }

  private parentOf(object: InspectObject): InspectObject | undefined {
    return object.parentId ? this.slide?.objects.find((candidate) => candidate.id === object.parentId) : undefined;
  }

  /** Keys stay the same when a value is edited, so open rows and focus survive the redraw. */
  private objectKey(object: InspectObject): string | undefined {
    if (!this.slide) return undefined;
    const index = this.slide.objects.indexOf(object);
    return index < 0 ? undefined : `object:${this.slide.index}:${index}`;
  }

  private selectedObject(): InspectObject | undefined {
    return this.slide?.objects.find((object) => this.objectKey(object) === this.highlighted);
  }

  private isOpen(key: string, byDefault: boolean): boolean {
    return byDefault ? !this.closed.has(key) : this.opened.has(key);
  }

  private toggle(key: string, byDefault: boolean): void {
    if (this.isOpen(key, byDefault)) {
      this.opened.delete(key);
      this.closed.add(key);
    } else {
      this.closed.delete(key);
      this.opened.add(key);
    }
    this.render();
  }

  /**
   * Apply an edit, then carry the panel's picture of the slide through it. `before` updates the
   * picture in the positions the edit was made against, before they move.
   */
  private apply(plan: SourcePlan | undefined, before?: () => void): boolean {
    if (!plan || !this.slide || plan.edits.length === 0) return false;
    if (!this.events.edit(plan)) return false;
    before?.();
    shiftSlide(this.slide, plan.edits);
    return true;
  }

  private render(): void {
    // A value being typed, or dragged, is not thrown away by a redraw; the redraw waits for it.
    const active = document.activeElement;
    const typing = (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
      && this.body.contains(active) && active.dataset.dirty === "true";
    if (typing || this.scrubbing) {
      this.deferred = true;
      return;
    }
    this.deferred = false;
    for (const area of this.body.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]")) {
      if (area.style.height) this.heights.set(area.dataset.key as string, area.style.height);
    }
    let selectAll = false;
    if (this.contentFocus) {
      const inserted = this.selectedObject();
      if (Date.now() > this.contentFocus.until) {
        this.contentFocus = undefined;
      } else if (inserted && inserted.source.start === this.contentFocus.position) {
        this.contentFocus = undefined;
        this.folded = false;
        const key = this.objectKey(inserted) as string;
        this.focusNext = this.contentKey(inserted, key) ?? key;
        selectAll = true;
      }
    }
    const focusKey = this.focusNext
      ?? (active instanceof HTMLElement && this.body.contains(active) ? active.dataset.key : undefined);
    this.focusNext = undefined;
    const selection = (active instanceof HTMLInputElement && active.type === "text") || active instanceof HTMLTextAreaElement
      ? [active.selectionStart, active.selectionEnd] as const
      : undefined;

    const slide = this.slide;
    if (!slide) {
      this.body.replaceChildren(element("p", "studio-inspector-empty", this.note || t.inspector.empty));
      return;
    }

    const rows: HTMLElement[] = [];
    const summary = element("p", "studio-inspector-summary");
    summary.textContent = [
      slide.layout === "default"
        ? t.inspector.flowLayout
        : t.inspector.layout(t.inspector.layouts[slide.layout] ?? slide.layout),
      t.inspector.objects(slide.objects.length),
      slide.notes ? t.inspector.notes : undefined,
    ].filter(Boolean).join(" · ");
    rows.push(summary);
    if (this.note) rows.push(element("p", "studio-inspector-note", this.note));
    if (this.details) rows.push(this.detailsCard(this.details));

    const paths = [...new Set([
      ...slide.objects.map((object) => object.region || "main"),
      ...(slide.regions ?? []).map((region) => region.path),
    ])];
    for (const path of paths) {
      const region = (slide.regions ?? []).find((candidate) => candidate.path === path);
      const members = slide.objects.filter((object) => (object.region || "main") === path && !object.parentId);
      const key = `region:${path}`;
      const open = this.isOpen(key, true);
      const cell = /^cell(\d+)$/.exec(path);
      rows.push(this.row({
        key,
        depth: 0,
        icon: icons.region,
        kind: "region",
        title: t.inspector.regions[path] ?? (cell ? t.inspector.cell(Number(cell[1])) : path),
        tooltip: region ? `${path} · ${t.inspector.namedRegion}` : path,
        meta: String(members.length),
        expandable: members.length > 0 || Boolean(region?.properties?.length),
        open,
        onToggle: () => this.toggle(key, true),
        onSelect: region ? () => this.events.selectRegion(region) : undefined,
      }));
      if (!open) continue;
      if (region?.properties?.length) rows.push(this.regionCard(region));
      for (const object of members) this.objectRows(object, 1, rows);
    }
    if (slide.objects.length === 0) {
      if (!this.details) rows.push(element("p", "studio-inspector-empty", t.inspector.noObjects));
    } else if (!this.selectedObject()) {
      rows.push(element("p", "studio-inspector-hint", t.inspector.selectHint));
    }

    this.body.replaceChildren(...rows);

    if (focusKey) {
      const target = this.body.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`);
      if (target) {
        target.focus({ preventScroll: true });
        const typed = target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type === "text");
        if (selectAll) {
          if (typed) target.select();
          target.scrollIntoView({ block: "nearest" });
        } else if (selection && typed) {
          target.setSelectionRange(selection[0], selection[1]);
        }
      }
    }
  }

  /** Up and Down move between rows; Ctrl+D copies the selected object and Delete removes it, as on a slide. */
  private navigate(event: KeyboardEvent): void {
    const row = (event.target as HTMLElement).closest?.(".studio-tree-row[role='treeitem']");
    if (!row) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const all = [...this.body.querySelectorAll<HTMLElement>(".studio-tree-row[role='treeitem']")];
      all[all.indexOf(row as HTMLElement) + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && row.classList.contains("is-highlighted")) {
      const object = this.selectedObject();
      if (object?.statement) {
        event.preventDefault();
        this.events.duplicateObject(object);
      }
    } else if ((event.key === "Delete" || event.key === "Backspace") && row.classList.contains("is-highlighted")) {
      const object = this.selectedObject();
      if (object) {
        event.preventDefault();
        this.remove(object);
      }
    }
  }

  /**
   * Delete an object as the preview does: a connector that ends at it goes too, since it would
   * point at nothing, and an object placed by its name keeps it, with a word on why.
   */
  remove(object: InspectObject): void {
    if (!object.statement) {
      toast(t.inspector.cannotDelete, { tone: "warning" });
      return;
    }
    const dependents = object.name
      ? (this.slide?.objects ?? []).filter((other) => other !== object && other.refers?.includes(object.name as string))
      : [];
    const connectors = dependents.filter((other) => other.type === "line" && other.statement);
    const placed = dependents.filter((other) => !connectors.includes(other));
    if (placed.length) {
      toast(t.inspector.placedByName(placed.length), { tone: "warning" });
      return;
    }
    this.events.deleteObjects([object, ...connectors]);
  }

  private objectRows(object: InspectObject, depth: number, rows: HTMLElement[]): void {
    const slide = this.slide as InspectSlide;
    const key = this.objectKey(object) as string;
    const children = slide.objects.filter((candidate) => candidate.parentId === object.id);
    const open = this.isOpen(key, true);
    const kind = t.inspector.kinds[object.type] ?? object.type;
    const label = object.label ? oneLine(object.label) : "";
    const selected = key === this.highlighted;
    let title = label || kind;
    // Plain text needs no tag beside its own words; other objects say what they are.
    let tag = label && object.type !== "text" ? kind : undefined;
    if (object.type === "shape") {
      // shape("diamond", "Valid?") is labelled by its words, and its kind is the tag.
      const words = object.texts?.find((text) => text.argument === 1)?.value;
      tag = t.insert.names[object.label as ShapeKind] ?? kind;
      title = words ? oneLine(String(words)) : tag;
    } else if (takesRole(object)) {
      const role = [...(object.methods ?? [])].reverse()
        .find((method) => (textRoles as readonly string[]).includes(method.name))?.name;
      if (role && role !== "body") tag = t.inspector.roles[role];
    }
    rows.push(this.row({
      key,
      depth,
      icon: icons[object.type] ?? icons[iconFor[object.type] ?? ""] ?? icons.shape,
      kind: object.type,
      category: category(object.type),
      title,
      tooltip: `${kind}${label ? ` · ${label}` : ""}\n${t.inspector.line(object.source.line)}`,
      detail: object.name ? `#${object.name}` : undefined,
      tag,
      expandable: children.length > 0,
      open,
      onToggle: () => this.toggle(key, true),
      // Clicking the selected object again folds its settings away, and once more opens them.
      onSelect: () => {
        if (!selected) {
          this.events.selectObject(object);
          return;
        }
        this.folded = !this.folded;
        this.focusNext = key;
        this.render();
      },
      highlighted: selected,
      onMenu: (x, y, keyboard) => {
        if (!selected) this.events.selectObject(object);
        this.events.objectMenu(object, x, y, keyboard);
      },
    }));
    if (selected && !this.folded) rows.push(this.card(object, depth));
    if (!open) return;
    for (const child of children) this.objectRows(child, depth + 1, rows);
  }

  private row(options: {
    key: string;
    depth: number;
    icon: string;
    kind: string;
    category?: string;
    title: string;
    tooltip: string;
    detail?: string;
    tag?: string;
    meta?: string;
    expandable: boolean;
    open: boolean;
    onToggle: () => void;
    onSelect?: () => void;
    highlighted?: boolean;
    /** A right-click on the row, or the menu key, at a point on the page. */
    onMenu?: (x: number, y: number, keyboard: boolean) => void;
  }): HTMLElement {
    const row = element("div", `studio-tree-row${options.highlighted ? " is-highlighted" : ""}`);
    row.setAttribute("role", "treeitem");
    row.dataset.key = options.key;
    row.dataset.kind = options.kind;
    if (options.category) row.dataset.category = options.category;
    row.style.setProperty("--depth", String(options.depth));
    if (options.expandable) row.setAttribute("aria-expanded", String(options.open));
    row.setAttribute("aria-selected", String(Boolean(options.highlighted)));
    row.tabIndex = options.highlighted ? 0 : -1;

    const toggle = element("button", "studio-tree-toggle");
    toggle.type = "button";
    toggle.tabIndex = -1;
    toggle.setAttribute("aria-label", options.open ? t.inspector.collapse : t.inspector.expand);
    if (!options.expandable) toggle.disabled = true;
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onToggle();
    });

    const glyph = element("span", "studio-tree-glyph");
    glyph.innerHTML = options.icon;
    const title = element("span", "studio-tree-title", options.title);
    row.append(toggle, glyph, title);
    if (options.detail) row.append(element("span", "studio-tree-detail", options.detail));
    if (options.tag) row.append(element("span", "studio-tree-tag", options.tag));
    if (options.meta) row.append(element("span", "studio-tree-meta", options.meta));
    row.title = options.tooltip;

    row.addEventListener("click", () => {
      if (options.onSelect) options.onSelect();
      else options.onToggle();
    });
    row.addEventListener("dblclick", () => {
      if (options.expandable) options.onToggle();
    });
    row.addEventListener("contextmenu", (event) => {
      if (!options.onMenu || event.shiftKey) return;
      event.preventDefault();
      const keyboard = event.button !== 2 && !event.ctrlKey;
      const box = row.getBoundingClientRect();
      options.onMenu(keyboard ? box.left + 24 : event.clientX, keyboard ? box.bottom : event.clientY, keyboard);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") options.onSelect?.();
      if ((event.key === "ArrowRight" && !options.open) || (event.key === "ArrowLeft" && options.open)) {
        if (options.expandable) options.onToggle();
      }
    });
    return row;
  }

  // ── The presentation's details ────────────────────────────────────────────────────────────

  /**
   * The details a cover or a poster's header draws from presentation(): its title, subtitle,
   * author, institute, and date, each set here as the cover's own words would be. Clearing one
   * takes it away; one the code works out is shown as code and leads to it.
   */
  private detailsCard(details: SlideDetails): HTMLElement {
    const card = element("div", "studio-object-card is-details");
    const section = element("section", "studio-card-section");
    section.append(element("h4", "studio-card-heading", details.kind === "cover" ? t.details.cover : t.details.header));
    for (const field of details.fields) {
      const key = `detail:${field.name}`;
      let control: HTMLElement;
      if (field.computed !== undefined) {
        const button = element("button", "studio-prop is-computed");
        button.type = "button";
        button.dataset.key = key;
        button.append(element("span", "studio-prop-code", field.computed));
        button.title = t.inspector.computed(field.computed);
        button.addEventListener("click", () => this.events.revealDetail(field.name));
        control = button;
      } else {
        const input = this.textBox(field.value, false);
        input.dataset.key = key;
        input.placeholder = field.name === "title" ? "FrameSeq" : t.details.unset;
        input.disabled = !details.editable;
        input.setAttribute("aria-label", t.details.fields[field.name]);
        this.editable(input, () => field.value, (value) => {
          const written = this.events.setDetail(field.name, value);
          if (written) field.value = value;
          return written;
        });
        control = input;
      }
      const row = this.labelled(t.details.fields[field.name], control);
      if (field.name === this.detailHighlighted) row.classList.add("is-highlighted");
      section.append(row);
    }
    card.append(section);
    if (!details.editable) card.append(element("p", "studio-inspector-empty", t.details.code));
    const footer = element("div", "studio-card-footer");
    if (details.kind === "cover") {
      const convert = element("button", "studio-card-more");
      convert.type = "button";
      convert.innerHTML = actionIcons.plus;
      convert.append(element("span", undefined, t.details.convert));
      convert.title = t.details.convertTitle;
      convert.dataset.action = "convert-cover";
      convert.addEventListener("click", () => this.events.convertCover());
      footer.append(convert);
    }
    footer.append(element("span", "studio-card-spacer"));
    footer.append(this.iconButton(actionIcons.code, t.inspector.goToCode, () => this.events.revealDetail(this.detailHighlighted ?? "title")));
    card.append(footer);
    return card;
  }

  // ── The selected object's settings ────────────────────────────────────────────────────────

  private card(object: InspectObject, depth: number): HTMLElement {
    const key = this.objectKey(object) as string;
    const card = element("div", "studio-object-card");
    card.style.setProperty("--depth", String(depth));
    card.dataset.category = category(object.type);

    const texts = this.textControls(object, key);
    if (texts) card.append(texts);

    const plan = planFor(object.type);
    const shown = new Set<string>();
    const sections = [...plan.sections];
    if (object.type === "line") {
      const ends = ["x1", "y1", "x2", "y2"].filter((name) => lastProperty(object, name));
      if (ends.length) sections.push({ id: "position", fields: ends });
    } else if (this.slide?.layout === "canvas" || (object.methods ?? []).some((method) => method.name === "position")
      || object.properties.some((property) => property.name === "x" || property.name === "y")) {
      sections.push({ id: "position", fields: ["x", "y"] });
    }
    const isWritten = (name: string): boolean => Boolean(lastProperty(object, name))
      || Boolean(object.computed?.some((value) => value.name === name));
    for (const section of sections) {
      const fields = section.fields.filter((name) => this.offers(object, name));
      // A written height sits beside the width the section shows, and so on for each pair.
      for (const [first, second] of pairs) {
        if (fields.includes(first) && !fields.includes(second) && isWritten(second)) fields.splice(fields.indexOf(first) + 1, 0, second);
        else if (fields.includes(second) && !fields.includes(first) && isWritten(first)) fields.splice(fields.indexOf(second), 0, first);
      }
      fields.forEach((name) => shown.add(name));
      const rows = this.fieldRows(object, key, fields, section.id);
      if (section.id === "text" && takesRole(object)) rows.unshift(this.roleRow(object, key));
      if (rows.length) card.append(this.section(section.id, rows));
    }

    // Whatever else is written for the object, and what the reader asked to add.
    const written = [
      ...object.properties.map((property) => property.name),
      ...(object.computed ?? []).map((value) => value.name),
    ];
    const others = [...new Set([...written, ...plan.more.filter((name) => this.revealed.has(`${key}:${name}`))])]
      .filter((name) => !shown.has(name));
    if (others.length) card.append(this.section("other", this.fieldRows(object, key, others, "other")));

    const footer = element("div", "studio-card-footer");
    const addable = plan.more.filter((name) => (
      !written.includes(name) && !shown.has(name) && !this.revealed.has(`${key}:${name}`) && this.canAdd(object, name)
    ));
    if (addable.length) {
      const more = element("button", "studio-card-more");
      more.type = "button";
      more.innerHTML = actionIcons.plus;
      more.append(element("span", undefined, t.inspector.addSetting));
      more.addEventListener("click", () => {
        const box = more.getBoundingClientRect();
        showMenu(box.left, box.bottom + 4, addable.map((name) => ({
          label: t.inspector.fields[name] ?? name,
          run: () => {
            this.revealed.add(`${key}:${name}`);
            this.focusNext = `${key}:field:${name}`;
            this.render();
          },
        })), t.inspector.addSetting);
      });
      footer.append(more);
    }
    footer.append(element("span", "studio-card-spacer"));
    footer.append(this.iconButton(actionIcons.code, t.inspector.goToCode, () => {
      if (object.source.start !== undefined) this.events.reveal(object.source.start);
    }));
    const duplicate = this.iconButton(actionIcons.duplicate, object.statement ? t.inspector.duplicateTitle : t.inspector.cannotDuplicate, () => {
      this.events.duplicateObject(object);
    });
    duplicate.classList.add("is-duplicate");
    duplicate.disabled = !object.statement;
    footer.append(duplicate);
    const remove = this.iconButton(actionIcons.delete, object.statement ? t.inspector.deleteTitle : t.inspector.cannotDelete, () => {
      this.remove(object);
    });
    remove.classList.add("is-danger");
    remove.disabled = !object.statement;
    footer.append(remove);
    card.append(footer);
    return card;
  }

  private section(id: SectionId, rows: HTMLElement[]): HTMLElement {
    const section = element("section", "studio-card-section");
    section.append(element("h4", "studio-card-heading", t.inspector.sections[id]), ...rows);
    return section;
  }

  private iconButton(icon: string, label: string, run: () => void): HTMLButtonElement {
    const button = element("button", "studio-card-icon");
    button.type = "button";
    button.innerHTML = icon;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", run);
    return button;
  }

  /** Whether a setting belongs on this object: it is written, or its builder has the method. */
  private offers(object: InspectObject, name: string): boolean {
    if (lastProperty(object, name) || object.computed?.some((value) => value.name === name)) return true;
    return this.canAdd(object, name);
  }

  private canAdd(object: InspectObject, name: string): boolean {
    const spec = fieldSpecs[name];
    if (!spec?.method || !object.append || !hasMethod(object.type, spec.method)) return false;
    if (name === "x" || name === "y") return !(object.methods ?? []).some((method) => method.name === "position");
    return true;
  }

  /** The strings the command was given: a text object's words, an image's file, a list's items. */
  private textControls(object: InspectObject, key: string): HTMLElement | undefined {
    const texts = object.texts ?? [];
    const box = element("div", "studio-card-texts");
    if (object.type === "bullets" || object.type === "steps") {
      if (!texts.length) return undefined;
      box.append(element("span", "studio-card-label", t.inspector.texts.items), this.itemList(object, key, texts));
      return box;
    }
    for (const text of texts) {
      const label = textLabel(object.type, text.argument);
      if (!label) continue;
      if (object.type === "shape" && text.argument === 0) {
        box.append(this.labelled(label, this.select(
          `${key}:text:${text.argument}`,
          shapeKinds.map((kind) => ({ value: kind, label: t.insert.names[kind] })),
          String(text.value),
          undefined,
          (value) => this.setText(object, text, value),
        )));
        continue;
      }
      box.append(this.textField(object, key, text, label));
    }
    return box.childElementCount ? box : undefined;
  }

  /**
   * A box for a string. One holding a line break is always a text area: a one-line box would
   * drop the break, and write the string back without it.
   */
  private textBox(value: string, wide: boolean): HTMLInputElement | HTMLTextAreaElement {
    if (wide || /[\r\n]/.test(value)) {
      const area = element("textarea", "studio-text-input");
      area.rows = 1;
      area.value = value;
      return area;
    }
    const input = element("input", "studio-text-input");
    input.type = "text";
    input.value = value;
    return input;
  }

  private textField(object: InspectObject, key: string, text: InspectText, label: string): HTMLElement {
    // A template written over lines, as latex`...` and typst`...` usually are, is shown without
    // the line break after its backtick and the indent its lines share, which go back on writing.
    const template = text.raw === true || text.expected.startsWith("`");
    const shown = (): string => (template ? unframe(String(text.value)).body : String(text.value));
    const input = this.textBox(shown(), multiline.has(object.type) && text.argument === 0);
    if (monospace.has(object.type)) input.classList.add("is-code");
    input.spellcheck = !monospace.has(object.type);
    input.dataset.key = `${key}:text:${text.argument}`;
    const height = this.heights.get(input.dataset.key);
    if (height && input instanceof HTMLTextAreaElement) input.style.height = height;
    input.setAttribute("aria-label", label);
    // Text that runs over lines, or a template, takes Enter as a line break; Ctrl+Enter writes it.
    // A formula is one expression, written as a template too, and Enter still writes it. So do
    // words on one line, which are written as text`...` when they hold a formula.
    const oneLine = ["math", "equation", "text", "lead", "caption", "quote"].includes(object.type);
    const breaks = (): boolean => (template && !oneLine) || input.value.includes("\n");
    this.editable(input, shown, (value) => (
      this.setText(object, text, template ? reframe(unframe(String(text.value)), value) : value)
    ), {
      enter: (event) => !(input instanceof HTMLTextAreaElement) || event.ctrlKey || event.metaKey || (!event.shiftKey && !breaks()),
    });
    const field = element("label", "studio-card-text");
    field.append(element("span", "studio-card-label", label));
    if ((object.type === "icon" || object.type === "image") && text.argument === 0) {
      // An icon's name is easier to choose by its picture than to remember, and a picture is
      // changed for another as a drawing program does.
      const choose = element("button", "studio-card-choose", t.icons.choose);
      choose.type = "button";
      choose.addEventListener("click", (event) => {
        event.preventDefault();
        const chosen = object.type === "icon" ? chooseIcon(choose, String(text.value)) : this.events.choosePicture();
        void chosen.then((name) => {
          if (name && this.setText(object, text, name)) this.render();
        });
      });
      const both = element("div", "studio-card-controls");
      both.append(input, choose);
      field.append(both);
    } else {
      field.append(input);
    }
    return field;
  }

  private itemList(object: InspectObject, key: string, texts: InspectText[]): HTMLElement {
    const list = element("div", "studio-item-list");
    texts.forEach((text, index) => {
      const item = element("div", "studio-item");
      const mark = element("span", "studio-item-mark", object.type === "steps" ? `${index + 1}.` : "•");
      const input = this.textBox(String(text.value), false);
      input.dataset.key = `${key}:item:${index}`;
      input.setAttribute("aria-label", `${t.inspector.texts.items} ${index + 1}`);
      this.editable(input, () => String(text.value), (value) => this.setText(object, text, value), {
        enter: (event) => !(input instanceof HTMLTextAreaElement) || event.ctrlKey || event.metaKey,
      });
      item.append(mark, input);
      if (texts.length > 1) {
        const remove = this.iconButton(actionIcons.close, t.inspector.removeItem, () => this.removeItem(texts, index));
        remove.classList.add("studio-item-remove");
        item.append(remove);
      }
      list.append(item);
    });
    const add = element("button", "studio-card-more");
    add.type = "button";
    add.innerHTML = actionIcons.plus;
    add.append(element("span", undefined, t.inspector.addItem));
    add.addEventListener("click", () => this.addItem(object, key, texts));
    list.append(add);
    return list;
  }

  private roleRow(object: InspectObject, key: string): HTMLElement {
    const roles = (object.methods ?? [])
      .filter((method) => method.arguments === 0 && (textRoles as readonly string[]).includes(method.name));
    const current = roles[roles.length - 1]?.name ?? "body";
    return this.labelled(t.inspector.role, this.select(
      `${key}:role`,
      textRoles.map((role) => ({ value: role, label: t.inspector.roles[role] })),
      current,
      undefined,
      (role) => this.setRole(object, roles, role),
    ));
  }

  /** The rows of a section: pairs side by side, colours with a swatch, choices as buttons. */
  private fieldRows(object: InspectObject, key: string, names: string[], section: SectionId): HTMLElement[] {
    const rows: HTMLElement[] = [];
    const used = new Set<string>();
    for (const name of names) {
      if (used.has(name)) continue;
      const pair = pairs.find((candidate) => candidate[0] === name && names.includes(candidate[1]));
      if (pair) {
        used.add(pair[0]).add(pair[1]);
        const row = element("div", "studio-card-row is-pair");
        row.append(...pair.map((part) => this.control(object, key, part, true)));
        rows.push(row);
        continue;
      }
      used.add(name);
      let control = this.control(object, key, name, false);
      if (name === "fontSize" && section === "text" && takesRole(object)) {
        const both = element("div", "studio-card-controls");
        both.append(control, this.boldToggle(object, key));
        control = both;
      }
      const label = object.type === "line" && name === "stroke" ? t.inspector.fields.color : (t.inspector.fields[name] ?? name);
      const row = this.labelled(label, control);
      // The name of a number can be dragged, as in a drawing program.
      const spec = fieldSpecs[name] ?? this.genericSpec(object, name);
      const input = control.querySelector<HTMLInputElement>("input.studio-prop-input");
      if ((spec.kind === "number" || spec.kind === "length") && input && !input.disabled) {
        this.scrubber(row.querySelector(".studio-card-label") as HTMLElement, input, object, spec);
      }
      rows.push(row);
    }
    return rows;
  }

  private labelled(label: string, control: HTMLElement): HTMLElement {
    const row = element("div", "studio-card-row");
    row.append(element("span", "studio-card-label", label), control);
    return row;
  }

  /** One setting's control, after what kind of value it takes and whether code computes it. */
  private control(object: InspectObject, key: string, name: string, short: boolean): HTMLElement {
    const spec = fieldSpecs[name] ?? this.genericSpec(object, name);
    const fieldKey = `${key}:field:${name}`;
    const computed = object.computed?.filter((value) => value.name === name).pop();
    const property = lastProperty(object, name);
    const prefix = short ? (t.inspector.short[name] ?? t.inspector.fields[name] ?? name) : undefined;
    if (computed && !(property && property.source.start > computed.source.start)) {
      return this.computedControl(computed, fieldKey, prefix);
    }
    const canWrite = Boolean(property) || this.canAdd(object, name);

    if (name === "tone") return this.toneControl(object, fieldKey, property);
    if (name === "textAlign") return this.alignControl(object, spec, fieldKey, property);
    if (spec.kind === "choice") {
      return this.select(
        fieldKey,
        (spec.choices ?? []).map((choice) => ({ value: choice, label: t.inspector.choices[choice] ?? choice })),
        property ? String(property.value) : "",
        t.inspector.unset,
        (value) => (value ? this.setField(object, spec, value) : this.resetField(object, spec)),
        !canWrite,
      );
    }
    if (spec.kind === "color") return this.colorControl(object, spec, fieldKey, property, canWrite);
    return this.numberControl(object, spec, fieldKey, property, canWrite, prefix);
  }

  /** A setting the report knows but the panel does not: edited as the literal it is. */
  private genericSpec(object: InspectObject, name: string): FieldSpec {
    return { name, kind: lastProperty(object, name)?.kind === "number" ? "number" : "text" };
  }

  private computedControl(computed: InspectComputed, fieldKey: string, prefix?: string): HTMLElement {
    const button = element("button", "studio-prop is-computed");
    button.type = "button";
    button.dataset.key = fieldKey;
    if (prefix) button.append(element("span", "studio-prop-prefix", prefix));
    button.append(element("span", "studio-prop-code", computed.text));
    button.title = t.inspector.computed(computed.text);
    button.addEventListener("click", () => this.events.reveal(computed.source.start));
    return button;
  }

  private numberControl(
    object: InspectObject,
    spec: FieldSpec,
    fieldKey: string,
    property: InspectProperty | undefined,
    canWrite: boolean,
    prefix?: string,
  ): HTMLElement {
    const box = element("div", "studio-prop");
    const input = element("input", "studio-prop-input");
    input.type = "text";
    input.dataset.key = fieldKey;
    input.value = property ? String(property.value) : "";
    input.placeholder = spec.kind === "length" ? t.inspector.auto : t.inspector.unset;
    input.inputMode = spec.kind === "text" ? "text" : "decimal";
    input.spellcheck = false;
    input.disabled = !canWrite;
    input.setAttribute("aria-label", t.inspector.fields[spec.name] ?? spec.name);
    if (prefix) {
      const handle = element("span", "studio-prop-prefix", prefix);
      if (spec.kind !== "text" && canWrite) this.scrubber(handle, input, object, spec);
      box.append(handle);
    }
    box.append(input);
    if (spec.unit) {
      const unit = element("span", "studio-prop-unit", spec.unit);
      const showUnit = (): void => {
        unit.hidden = !/^-?(?:\d+\.?\d*|\.\d+)$/.test(input.value.trim());
      };
      showUnit();
      input.addEventListener("input", showUnit);
      box.append(unit);
    }
    const written = (): string => {
      const current = lastProperty(object, spec.name);
      return current ? String(current.value) : "";
    };
    this.editable(input, written, (value) => (
      value.trim() ? this.setField(object, spec, value) : this.resetField(object, spec)
    ), {
      step: spec.kind === "text" ? undefined : (direction, large, fine) => {
        const current = Number(input.value.trim() || 0);
        if (!Number.isFinite(current)) return false;
        const step = spec.step ?? 1;
        let next = Math.round((current + direction * (large ? step * 10 : (fine ? step / 10 : step))) * 1000) / 1000;
        if (spec.min !== undefined) next = Math.max(spec.min, next);
        if (spec.max !== undefined) next = Math.min(spec.max, next);
        input.value = String(next);
        input.dispatchEvent(new Event("input"));
        return true;
      },
    });
    return box;
  }

  /** Drag a setting's name left or right to change it, as in a drawing program. */
  private scrubber(handle: HTMLElement, input: HTMLInputElement, object: InspectObject, spec: FieldSpec): void {
    handle.classList.add("is-scrub");
    handle.title = t.inspector.scrub;
    handle.addEventListener("pointerdown", (event) => {
      if (input.disabled || event.button !== 0) return;
      const start = Number(input.value.trim() || 0);
      if (!Number.isFinite(start)) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const origin = event.clientX;
      let last = input.value;
      this.scrubbing = true;
      const move = (moved: PointerEvent): void => {
        const step = (spec.step ?? 1) * (moved.shiftKey ? 10 : 1);
        let next = Math.round((start + Math.round((moved.clientX - origin) / 3) * step) * 1000) / 1000;
        if (spec.min !== undefined) next = Math.max(spec.min, next);
        if (spec.max !== undefined) next = Math.min(spec.max, next);
        const text = String(next);
        if (text === last) return;
        last = text;
        input.value = text;
        input.dispatchEvent(new Event("input"));
        if (this.setField(object, spec, text)) input.dataset.dirty = "false";
        else input.classList.add("is-invalid");
      };
      const end = (): void => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        this.scrubbing = false;
        this.render();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  }

  private colorControl(
    object: InspectObject,
    spec: FieldSpec,
    fieldKey: string,
    property: InspectProperty | undefined,
    canWrite: boolean,
  ): HTMLElement {
    const box = element("div", "studio-prop is-color");
    const value = property ? String(property.value) : "";
    const swatch = element("input", "studio-prop-swatch");
    swatch.type = "color";
    swatch.dataset.key = `${fieldKey}:swatch`;
    swatch.disabled = !canWrite;
    swatch.value = (value ? pickerColor(value) : undefined) ?? "#000000";
    if (!value) swatch.classList.add("is-empty");
    swatch.setAttribute("aria-label", t.inspector.colour(t.inspector.fields[spec.name] ?? spec.name));
    const input = element("input", "studio-prop-input");
    input.type = "text";
    input.value = value;
    input.placeholder = t.inspector.unset;
    input.spellcheck = false;
    input.disabled = !canWrite;
    input.dataset.key = fieldKey;
    input.setAttribute("aria-label", t.inspector.fields[spec.name] ?? spec.name);
    swatch.addEventListener("input", () => {
      // The picker stays open while the colour is dragged; the redraw waits until it closes.
      swatch.dataset.dirty = "true";
      input.value = swatch.value;
      swatch.classList.remove("is-empty");
      if (!this.setField(object, spec, swatch.value)) input.classList.add("is-invalid");
    });
    swatch.addEventListener("change", () => {
      swatch.dataset.dirty = "false";
      this.render();
    });
    this.editable(input, () => String(lastProperty(object, spec.name)?.value ?? ""), (next) => (
      next.trim() ? this.setField(object, spec, next) : this.resetField(object, spec)
    ));
    box.append(swatch, input);
    if (property) {
      const reset = this.iconButton(actionIcons.close, t.inspector.reset, () => {
        this.resetField(object, spec);
        this.render();
      });
      reset.classList.add("studio-prop-reset");
      box.append(reset);
    }
    return box;
  }

  private alignControl(object: InspectObject, spec: FieldSpec, fieldKey: string, property: InspectProperty | undefined): HTMLElement {
    const group = element("div", "studio-segmented");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", t.inspector.fields.textAlign);
    const current = property ? String(property.value) : "";
    for (const choice of spec.choices ?? []) {
      const button = element("button", "studio-segment");
      button.type = "button";
      button.dataset.key = `${fieldKey}:${choice}`;
      button.innerHTML = actionIcons[choice as "left" | "center" | "right"] ?? "";
      button.title = t.inspector.choices[choice] ?? choice;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(current === choice));
      button.disabled = !property && !this.canAdd(object, spec.name);
      // Choosing the alignment already set goes back to the default.
      button.addEventListener("click", () => {
        if (current === choice) this.resetField(object, spec);
        else this.setField(object, spec, choice);
        this.render();
      });
      group.append(button);
    }
    return group;
  }

  private toneControl(object: InspectObject, fieldKey: string, property: InspectProperty | undefined): HTMLElement {
    const spec = fieldSpecs.tone;
    const group = element("div", "studio-tones");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", t.inspector.fields.tone);
    const current = property ? String(property.value) : "";
    for (const tone of spec.choices ?? []) {
      const button = element("button", "studio-tone");
      button.type = "button";
      button.dataset.key = `${fieldKey}:${tone}`;
      button.style.setProperty("--tone", tone === "accent" ? "var(--studio-accent)" : toneHues[tone as keyof typeof toneHues]);
      button.title = t.inspector.tones[tone] ?? tone;
      button.setAttribute("aria-label", button.title);
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(current === tone));
      button.disabled = !property && !this.canAdd(object, "tone");
      button.addEventListener("click", () => {
        if (current === tone) this.resetField(object, spec);
        else this.setField(object, spec, tone);
        this.render();
      });
      group.append(button);
    }
    return group;
  }

  private boldToggle(object: InspectObject, key: string): HTMLElement {
    const calls = (object.methods ?? []).filter((method) => ["bold", "fontWeight", "weight"].includes(method.name));
    const weight = lastProperty(object, "fontWeight")?.value;
    const active = (object.methods ?? []).some((method) => method.name === "bold")
      || (typeof weight === "number" && weight >= 600) || weight === "bold";
    const button = element("button", "studio-segment studio-bold", "B");
    button.type = "button";
    button.dataset.key = `${key}:bold`;
    button.title = t.inspector.bold;
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", () => {
      if (active) this.apply(removeCalls(object, calls));
      else this.addCall(object, "bold", "bold()", []);
      this.render();
    });
    return button;
  }

  private select(
    fieldKey: string,
    options: Array<{ value: string; label: string }>,
    current: string,
    unset: string | undefined,
    change: (value: string) => boolean,
    disabled = false,
  ): HTMLSelectElement {
    const select = element("select", "studio-select");
    select.dataset.key = fieldKey;
    select.disabled = disabled;
    if (unset !== undefined) select.append(new Option(unset, ""));
    for (const option of options) select.append(new Option(option.label, option.value));
    if (current && !options.some((option) => option.value === current)) select.append(new Option(current, current));
    select.value = current;
    select.addEventListener("change", () => {
      if (!change(select.value)) select.value = current;
      this.render();
    });
    return select;
  }

  /**
   * Make a text box write its value on Enter or when it loses focus, put the written value back
   * on Escape, and step numbers with the arrow keys.
   */
  private editable(
    input: HTMLInputElement | HTMLTextAreaElement,
    written: () => string,
    commit: (value: string) => boolean,
    options: {
      enter?: (event: KeyboardEvent) => boolean;
      step?: (direction: 1 | -1, large: boolean, fine: boolean) => boolean;
    } = {},
  ): void {
    const settle = (): void => {
      input.dataset.dirty = "false";
      input.classList.remove("is-invalid");
      input.removeAttribute("title");
    };
    const accept = (): void => {
      if (input.value === written()) {
        settle();
        if (this.deferred) this.render();
        return;
      }
      if (commit(input.value)) {
        settle();
        this.render();
      } else {
        input.classList.add("is-invalid");
        input.title = t.inspector.invalid;
      }
    };
    input.addEventListener("input", () => {
      input.dataset.dirty = String(input.value !== written());
      input.classList.remove("is-invalid");
    });
    input.addEventListener("keydown", (event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.key === "Enter" && (options.enter ? options.enter(keyboard) : true)) {
        keyboard.preventDefault();
        accept();
      } else if (keyboard.key === "Escape") {
        keyboard.preventDefault();
        input.value = written();
        settle();
        input.blur();
      } else if (options.step && (keyboard.key === "ArrowUp" || keyboard.key === "ArrowDown")) {
        keyboard.preventDefault();
        // Each press is written at once, so the preview follows it.
        if (options.step(keyboard.key === "ArrowUp" ? 1 : -1, keyboard.shiftKey, keyboard.altKey)) {
          if (commit(input.value)) settle();
          else input.classList.add("is-invalid");
        }
      }
    });
    input.addEventListener("blur", accept);
  }

  // ── Writing settings into the source ──────────────────────────────────────────────────────

  private setField(object: InspectObject, spec: FieldSpec, raw: string): boolean {
    const property = lastProperty(object, spec.name);
    const literal = fieldLiteral(spec, raw, property?.kind === "string" ? property.expected[0] : quoteFor(object));
    if (literal === undefined) return false;
    if (property) {
      if (literal === property.expected) return true;
      return this.apply(replaceLiteral(property, literal), () => {
        property.expected = literal;
        property.value = literalValue(literal);
        property.kind = typeof property.value === "number" ? "number" : "string";
      });
    }
    if (spec.name === "x" || spec.name === "y") {
      const x = spec.name === "x" ? literal : "0";
      const y = spec.name === "y" ? literal : "0";
      return this.addCall(object, "position", `position({ x: ${x}, y: ${y} })`, [
        { name: "x", literal: x, offset: "position({ x: ".length },
        { name: "y", literal: y, offset: `position({ x: ${x}, y: `.length },
      ]);
    }
    if (spec.name === "toneStyle") {
      const tone = lastProperty(object, "tone");
      if (tone) {
        const at = tone.source.end;
        if (!this.apply({
          edits: [{ from: at, to: at, insert: `, ${literal}` }],
          checks: [{ from: tone.source.start, to: at, text: tone.expected }],
        })) return false;
        object.properties.push(this.literalProperty("toneStyle", literal, at + 2));
        return true;
      }
      const accent = stringLiteral("accent", quoteFor(object)) as string;
      return this.addCall(object, "tone", `tone(${accent}, ${literal})`, [
        { name: "tone", literal: accent, offset: "tone(".length },
        { name: "toneStyle", literal, offset: `tone(${accent}, `.length },
      ]);
    }
    const method = spec.method as string;
    return this.addCall(object, method, `${method}(${literal})`, [{ name: spec.name, literal, offset: method.length + 1 }]);
  }

  private resetField(object: InspectObject, spec: FieldSpec): boolean {
    const property = lastProperty(object, spec.name);
    if (!property) return !object.computed?.some((value) => value.name === spec.name);
    if (spec.name === "toneStyle") {
      const tone = lastProperty(object, "tone");
      if (!tone) return false;
      return this.apply({
        edits: [{ from: tone.source.end, to: property.source.end, insert: "" }],
        checks: [
          { from: tone.source.start, to: tone.source.end, text: tone.expected },
          { from: property.source.start, to: property.source.end, text: property.expected },
        ],
      });
    }
    const method = methodOf(object, property.source.start);
    if (!method || method.name === "position" || (method.arguments !== 1 && method.name !== "tone")) return false;
    // Every call that sets it goes, or an earlier one would take over.
    const calls = (object.methods ?? []).filter((candidate) => object.properties.some((other) => (
      other.name === spec.name && methodOf(object, other.source.start) === candidate
    )));
    return this.apply(removeCalls(object, calls));
  }

  /**
   * Add a method call after the object's last one, then note the call and its literals in the
   * panel's picture, so the next change to the same setting rewrites what was just written.
   */
  private addCall(
    object: InspectObject,
    name: string,
    call: string,
    literals: Array<{ name: string; literal: string; offset: number }>,
  ): boolean {
    const plan = appendCall(object, call);
    if (!plan || !object.append) return false;
    const at = object.append.at;
    const insert = plan.edits[0].insert;
    if (!this.apply(plan)) return false;
    // Text before the insertion did not move, so the new call is where it was written.
    const dot = at + insert.length - call.length - 1;
    object.methods = [...(object.methods ?? []), {
      name,
      start: dot,
      end: at + insert.length,
      nameStart: dot + 1,
      nameEnd: dot + 1 + name.length,
      arguments: literals.length ? 1 : 0,
      removeFrom: at,
    }];
    for (const literal of literals) {
      object.properties.push(this.literalProperty(literal.name, literal.literal, dot + 1 + literal.offset));
    }
    return true;
  }

  private literalProperty(name: string, literal: string, start: number): InspectProperty {
    const value = literalValue(literal);
    return {
      name,
      kind: typeof value === "number" ? "number" : "string",
      value,
      source: { line: 0, character: 0, start, end: start + literal.length },
      expected: literal,
    };
  }

  private setText(object: InspectObject, text: InspectText, value: string): boolean {
    const tagged = taggedText(object, text, value);
    if (tagged) {
      // text("...") becomes text`...`, so the template now stands where the parentheses did.
      return this.apply(tagged, () => {
        text.source = { ...text.source, start: tagged.edits[0].from, end: tagged.edits[0].to };
        text.expected = tagged.edits[0].insert;
        text.raw = true;
        text.value = value;
        object.label = value;
      });
    }
    const literal = stringLiteral(value, text.expected[0], text.raw);
    if (literal === undefined) return false;
    if (literal === text.expected) return true;
    return this.apply(replaceLiteral(text, literal), () => {
      text.expected = literal;
      text.value = value;
      if (text.argument === 0) object.label = value;
    });
  }

  private setRole(object: InspectObject, roles: InspectMethod[], role: string): boolean {
    const current = roles[roles.length - 1];
    if (role === (current?.name ?? "body")) return true;
    if (role === "body") return this.apply(removeCalls(object, roles));
    if (current) {
      return this.apply({
        edits: [{ from: current.nameStart, to: current.nameEnd, insert: role }],
        checks: [{ from: current.nameStart, to: current.nameEnd, text: current.name }],
      }, () => {
        current.name = role;
      });
    }
    return this.addCall(object, role, `${role}()`, []);
  }

  private addItem(object: InspectObject, key: string, texts: InspectText[]): void {
    const last = texts[texts.length - 1];
    // Items written one to a line get a line of their own, at the same indent.
    const ownLines = texts.length > 1
      ? new Set(texts.map((text) => text.source.line)).size === texts.length
      : last.source.line !== object.source.line;
    const literal = stringLiteral(t.inspector.newItem, last.expected[0] === "'" ? "'" : '"') as string;
    const separator = ownLines ? `,\n${" ".repeat(Math.max(0, last.source.character - 1))}` : ", ";
    const at = last.source.end;
    if (!this.apply({
      edits: [{ from: at, to: at, insert: `${separator}${literal}` }],
      checks: [{ from: last.source.start, to: at, text: last.expected }],
    })) return;
    const item: InspectText = {
      ...this.literalProperty("content", literal, at + separator.length),
      source: { line: last.source.line + (ownLines ? 1 : 0), character: last.source.character, start: at + separator.length, end: at + separator.length + literal.length },
      argument: last.argument + 1,
    };
    object.texts = [...(object.texts ?? []), item];
    this.focusNext = `${key}:item:${texts.length}`;
    this.render();
    this.body.querySelector<HTMLInputElement>(`[data-key="${CSS.escape(`${key}:item:${texts.length}`)}"]`)?.select();
  }

  private removeItem(texts: InspectText[], index: number): void {
    const item = texts[index];
    const neighbour = index > 0 ? texts[index - 1] : texts[index + 1];
    if (!neighbour) return;
    const [from, to] = index > 0 ? [neighbour.source.end, item.source.end] : [item.source.start, neighbour.source.start];
    this.apply({
      edits: [{ from, to, insert: "" }],
      checks: [
        { from: item.source.start, to: item.source.end, text: item.expected },
        { from: neighbour.source.start, to: neighbour.source.end, text: neighbour.expected },
      ],
    });
    this.render();
  }

  /** The literal settings of a named region, edited where they are written. */
  private regionCard(region: InspectRegion): HTMLElement {
    const card = element("div", "studio-object-card is-region");
    card.style.setProperty("--depth", "0");
    for (const property of region.properties ?? []) {
      const spec = fieldSpecs[property.name] ?? { name: property.name, kind: property.kind === "number" ? "number" : "text" };
      const input = element("input", "studio-prop-input");
      input.type = "text";
      input.value = String(property.value);
      input.dataset.key = `region:${region.path}:${property.name}`;
      input.spellcheck = false;
      input.setAttribute("aria-label", property.name);
      this.editable(input, () => String(property.value), (value) => {
        const literal = fieldLiteral(spec, value, property.kind === "string" ? property.expected[0] : '"');
        if (literal === undefined) return false;
        if (literal === property.expected) return true;
        return this.apply(replaceLiteral(property, literal), () => {
          property.expected = literal;
          property.value = literalValue(literal);
        });
      });
      const box = element("div", "studio-prop");
      box.append(input);
      if (spec.unit && property.kind === "number") box.append(element("span", "studio-prop-unit", spec.unit));
      card.append(this.labelled(t.inspector.fields[property.name] ?? property.name, box));
    }
    return card;
  }
}
