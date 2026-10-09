import type { InspectObject, InspectProperty, InspectRegion, InspectSlide } from "./api";
import { element } from "./ui";

export interface InspectorEvents {
  /** Show where an object was written, and outline it in the preview. */
  selectObject: (object: InspectObject) => void;
  selectRegion: (region: InspectRegion) => void;
  /** Rewrite one literal; false when the text no longer holds what the inspector read. */
  editProperty: (property: InspectProperty, literal: string) => boolean;
}

/** Glyphs for the kinds of object a slide holds, so a long list can be scanned by shape. */
const glyphs: Record<string, string> = {
  text: "T",
  image: "▣",
  code: "{}",
  math: "∑",
  equation: "∑",
  typst: "∫",
  latex: "∫",
  rect: "▭",
  circle: "○",
  line: "╱",
  bullets: "•",
  steps: "1.",
  metric: "#",
  group: "▦",
  card: "▦",
  gridSection: "▦",
  row: "▤",
  column: "▥",
  stack: "▦",
};

const colorProperties = new Set(["color", "background", "fill", "stroke"]);
const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Format an inspector value as a safe TypeScript literal, as the VS Code extension does. */
export function formatPropertyValue(property: InspectProperty, input: string): string | undefined {
  if (property.kind === "number") {
    const value = input.trim();
    return value && Number.isFinite(Number(value)) ? value : undefined;
  }
  if (property.kind === "boolean") {
    const value = input.trim();
    return value === "true" || value === "false" ? value : undefined;
  }
  const quote = property.expected[0];
  if (quote === "'") return `'${input.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (quote === "`") {
    return `\`${input.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
  }
  return JSON.stringify(input);
}

function shortHex(value: string): string {
  return value.length === 4
    ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
    : value;
}

/**
 * The objects on the slide the preview shows, grouped by the region they were written in, with
 * the literal values their commands state. Choosing an object shows its source and outlines it
 * in the preview; editing a value rewrites only that literal, as one undoable edit.
 */
export class SlideInspector {
  private slide: InspectSlide | undefined;
  private note = "";
  private highlighted: string | undefined;
  /** Rows the reader opened or closed, kept across the redraw after every edit. */
  private readonly opened = new Set<string>();
  private readonly closed = new Set<string>();
  private deferred = false;

  constructor(private readonly body: HTMLElement, private readonly events: InspectorEvents) {
    this.render();
  }

  /** Show a slide's objects; with no slide, say why there is nothing to show. */
  show(slide: InspectSlide | undefined, note = ""): void {
    this.slide = slide;
    this.note = note;
    this.render();
  }

  /** Mark the object at the editor's cursor, opening the rows above it. */
  highlight(object: InspectObject | undefined): void {
    const key = object ? this.objectKey(object) : undefined;
    if (key === this.highlighted) return;
    this.highlighted = key;
    if (object && this.slide) {
      this.closed.delete(`region:${object.region || "main"}`);
      let parent = this.parentOf(object);
      while (parent) {
        this.opened.add(this.objectKey(parent) as string);
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

  private render(): void {
    // A value being typed is not thrown away by a redraw; the redraw waits for it.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.body.contains(active) && active.dataset.dirty === "true") {
      this.deferred = true;
      return;
    }
    this.deferred = false;
    const focusKey = active instanceof HTMLInputElement && this.body.contains(active) ? active.dataset.key : undefined;
    const selection = focusKey && active instanceof HTMLInputElement
      ? [active.selectionStart, active.selectionEnd] as const
      : undefined;

    const slide = this.slide;
    if (!slide) {
      this.body.replaceChildren(element("p", "studio-inspector-empty", this.note || "Show a slide to inspect its objects."));
      return;
    }

    const rows: HTMLElement[] = [];
    const summary = element("p", "studio-inspector-summary");
    summary.textContent = [
      slide.layout === "default" ? "flow layout" : `${slide.layout} layout`,
      `${slide.objects.length} object${slide.objects.length === 1 ? "" : "s"}`,
      slide.notes ? "speaker notes" : undefined,
    ].filter(Boolean).join(" · ");
    rows.push(summary);
    if (this.note) rows.push(element("p", "studio-inspector-note", this.note));

    const paths = [...new Set([
      ...slide.objects.map((object) => object.region || "main"),
      ...(slide.regions ?? []).map((region) => region.path),
    ])];
    for (const path of paths) {
      const region = (slide.regions ?? []).find((candidate) => candidate.path === path);
      const members = slide.objects.filter((object) => (object.region || "main") === path && !object.parentId);
      const key = `region:${path}`;
      const open = this.isOpen(key, true);
      rows.push(this.row({
        key,
        depth: 0,
        glyph: "◫",
        kind: "region",
        title: path,
        detail: region ? "named region" : undefined,
        meta: String(members.length),
        expandable: members.length > 0 || Boolean(region?.properties?.length),
        open,
        onToggle: () => this.toggle(key, true),
        onSelect: region ? () => this.events.selectRegion(region) : undefined,
      }));
      if (!open) continue;
      for (const property of region?.properties ?? []) rows.push(this.propertyRow(property, `${key}:${property.name}`, 1));
      for (const object of members) this.objectRows(object, 1, rows);
    }
    if (slide.objects.length === 0) rows.push(element("p", "studio-inspector-empty", "This slide has no objects yet."));

    this.body.replaceChildren(...rows);

    if (focusKey) {
      const input = this.body.querySelector<HTMLInputElement>(`input[data-key="${CSS.escape(focusKey)}"]`);
      if (input) {
        input.focus({ preventScroll: true });
        if (selection && input.type === "text") input.setSelectionRange(selection[0], selection[1]);
      }
    }
  }

  private objectRows(object: InspectObject, depth: number, rows: HTMLElement[]): void {
    const slide = this.slide as InspectSlide;
    const key = this.objectKey(object) as string;
    const children = slide.objects.filter((candidate) => candidate.parentId === object.id);
    const open = this.isOpen(key, false);
    const label = object.label?.replace(/\s+/g, " ").trim();
    rows.push(this.row({
      key,
      depth,
      glyph: glyphs[object.type] ?? "◇",
      kind: object.type,
      title: label ? `${object.type} · ${label}` : object.type,
      detail: object.name ? `#${object.name}` : undefined,
      meta: `L${object.source.line}`,
      expandable: object.properties.length > 0 || children.length > 0,
      open,
      onToggle: () => this.toggle(key, false),
      onSelect: () => this.events.selectObject(object),
      highlighted: key === this.highlighted,
    }));
    if (!open) return;
    for (const property of object.properties) rows.push(this.propertyRow(property, `${key}:${property.name}`, depth + 1));
    for (const child of children) this.objectRows(child, depth + 1, rows);
  }

  private row(options: {
    key: string;
    depth: number;
    glyph: string;
    kind: string;
    title: string;
    detail?: string;
    meta?: string;
    expandable: boolean;
    open: boolean;
    onToggle: () => void;
    onSelect?: () => void;
    highlighted?: boolean;
  }): HTMLElement {
    const row = element("div", `studio-tree-row${options.highlighted ? " is-highlighted" : ""}`);
    row.setAttribute("role", "treeitem");
    row.dataset.key = options.key;
    row.dataset.kind = options.kind;
    row.style.setProperty("--depth", String(options.depth));
    if (options.expandable) row.setAttribute("aria-expanded", String(options.open));
    row.tabIndex = -1;

    const toggle = element("button", "studio-tree-toggle", options.expandable ? "" : " ");
    toggle.type = "button";
    toggle.tabIndex = -1;
    toggle.setAttribute("aria-label", options.open ? "Collapse" : "Expand");
    if (!options.expandable) toggle.disabled = true;
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onToggle();
    });

    const glyph = element("span", "studio-tree-glyph", options.glyph);
    glyph.setAttribute("aria-hidden", "true");
    const title = element("span", "studio-tree-title", options.title);
    row.append(toggle, glyph, title);
    if (options.detail) row.append(element("span", "studio-tree-detail", options.detail));
    if (options.meta) row.append(element("span", "studio-tree-meta", options.meta));
    row.title = options.title;

    row.addEventListener("click", () => {
      if (options.onSelect) options.onSelect();
      else options.onToggle();
    });
    row.addEventListener("dblclick", () => {
      if (options.expandable) options.onToggle();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") options.onSelect?.();
      if ((event.key === "ArrowRight" && !options.open) || (event.key === "ArrowLeft" && options.open)) {
        if (options.expandable) options.onToggle();
      }
    });
    return row;
  }

  /** A literal from the source, edited where it stands: type and press Enter, or step numbers. */
  private propertyRow(property: InspectProperty, key: string, depth: number): HTMLElement {
    const row = element("div", "studio-tree-row studio-property-row");
    row.style.setProperty("--depth", String(depth));
    row.dataset.key = key;
    const name = element("label", "studio-property-name", property.name);
    const original = String(property.value);

    const commit = (raw: string): boolean => {
      const literal = formatPropertyValue(property, raw);
      if (literal === undefined) return false;
      if (literal === property.expected) return true;
      if (!this.events.editProperty(property, literal)) return false;
      // The literal now reads differently; later edits are checked against the new text.
      property.source = { ...property.source, end: property.source.start + literal.length };
      property.expected = literal;
      property.value = property.kind === "number" ? Number(raw) : (property.kind === "boolean" ? raw.trim() === "true" : raw);
      return true;
    };

    if (property.kind === "boolean") {
      const input = element("input", "studio-property-check");
      input.type = "checkbox";
      input.checked = property.value === true;
      input.dataset.key = key;
      input.setAttribute("aria-label", property.name);
      input.addEventListener("change", () => {
        if (!commit(String(input.checked))) input.checked = !input.checked;
      });
      row.append(name, input);
      return row;
    }

    const input = element("input", "studio-property-input");
    input.type = "text";
    input.value = original;
    input.spellcheck = false;
    input.dataset.key = key;
    input.classList.add(`is-${property.kind}`);
    input.setAttribute("aria-label", property.name);
    if (property.kind === "number") input.inputMode = "decimal";
    const settle = (): void => {
      input.dataset.dirty = "false";
      input.classList.remove("is-invalid");
      if (this.deferred) this.render();
    };
    const accept = (): void => {
      if (input.value === String(property.value)) {
        settle();
        return;
      }
      if (commit(input.value)) settle();
      else input.classList.add("is-invalid");
    };
    input.addEventListener("input", () => {
      input.dataset.dirty = String(input.value !== String(property.value));
      input.classList.remove("is-invalid");
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        accept();
      } else if (event.key === "Escape") {
        event.preventDefault();
        input.value = String(property.value);
        settle();
        input.blur();
      } else if (property.kind === "number" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        // Step the number and write it at once, so the preview follows each press.
        event.preventDefault();
        const step = event.shiftKey ? 10 : (event.altKey ? 0.1 : 1);
        const current = Number(input.value);
        if (!Number.isFinite(current)) return;
        const next = Math.round((current + (event.key === "ArrowUp" ? step : -step)) * 100) / 100;
        input.value = String(next);
        if (commit(input.value)) settle();
        else input.classList.add("is-invalid");
      }
    });
    input.addEventListener("blur", accept);
    row.append(name, input);

    const value = String(property.value);
    if (property.kind === "string" && colorProperties.has(property.name) && hexColor.test(value)) {
      const swatch = element("input", "studio-property-swatch");
      swatch.type = "color";
      swatch.value = shortHex(value);
      swatch.setAttribute("aria-label", `${property.name} colour`);
      swatch.addEventListener("input", () => {
        input.value = swatch.value;
        commit(swatch.value);
      });
      row.append(swatch);
    }
    return row;
  }
}
