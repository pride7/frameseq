import { toneNames } from "../shapes";
import type { InspectMethod, InspectObject, InspectProperty, InspectSlide, InspectText } from "./api";

/**
 * What the Current slide panel offers to set on each kind of object, and how a setting becomes
 * source: a literal rewritten in place, a method call added after the object's last one, or a
 * call taken away. The panel speaks in settings such as "size" and "colour"; this module turns
 * them into the methods the language has.
 */

export type FieldKind = "length" | "number" | "color" | "choice" | "text";

export interface FieldSpec {
  /** The name the inspect report gives the value. */
  name: string;
  /** The method that sets it; none when the panel can only rewrite a value already written. */
  method?: string;
  kind: FieldKind;
  choices?: readonly string[];
  step?: number;
  min?: number;
  max?: number;
  /** Shown after a plain number. */
  unit?: string;
}

const spec = (name: string, kind: FieldKind, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  name,
  method: name,
  kind,
  ...extra,
});

export const fieldSpecs: Record<string, FieldSpec> = {
  fontSize: spec("fontSize", "length", { unit: "px", min: 1 }),
  color: spec("color", "color"),
  textAlign: spec("textAlign", "choice", { choices: ["left", "center", "right"] }),
  lineHeight: spec("lineHeight", "number", { step: 0.1, min: 0 }),
  fontWeight: spec("fontWeight", "number", { step: 100, min: 100, max: 900 }),
  background: spec("background", "color"),
  fill: spec("fill", "color"),
  stroke: spec("stroke", "color"),
  strokeWidth: spec("strokeWidth", "length", { unit: "px", min: 0 }),
  border: spec("border", "text"),
  radius: spec("radius", "length", { unit: "px", min: 0 }),
  opacity: spec("opacity", "number", { step: 0.1, min: 0, max: 1 }),
  width: spec("width", "length", { unit: "px", min: 0 }),
  height: spec("height", "length", { unit: "px", min: 0 }),
  minWidth: spec("minWidth", "length", { unit: "px", min: 0 }),
  minHeight: spec("minHeight", "length", { unit: "px", min: 0 }),
  maxWidth: spec("maxWidth", "length", { unit: "px", min: 0 }),
  maxHeight: spec("maxHeight", "length", { unit: "px", min: 0 }),
  x: spec("x", "number", { method: "position", unit: "px" }),
  y: spec("y", "number", { method: "position", unit: "px" }),
  rotation: spec("rotation", "number", { method: "rotate", unit: "°", step: 5 }),
  gap: spec("gap", "length", { unit: "px", min: 0 }),
  padding: spec("padding", "length", { unit: "px", min: 0 }),
  margin: spec("margin", "length", { unit: "px" }),
  align: spec("align", "choice", { choices: ["start", "center", "end", "stretch"] }),
  justify: spec("justify", "choice", {
    choices: ["start", "center", "end", "space-between", "space-around", "space-evenly"],
  }),
  arrow: spec("arrow", "choice", { choices: ["none", "start", "end", "both"] }),
  tone: spec("tone", "choice", { choices: toneNames }),
  toneStyle: spec("toneStyle", "choice", { method: "tone", choices: ["soft", "solid", "outline"] }),
  x1: spec("x1", "number", { method: undefined, unit: "px" }),
  y1: spec("y1", "number", { method: undefined, unit: "px" }),
  x2: spec("x2", "number", { method: undefined, unit: "px" }),
  y2: spec("y2", "number", { method: undefined, unit: "px" }),
};

export type SectionId = "text" | "appearance" | "size" | "position" | "layout" | "line" | "other";

export interface Plan {
  sections: Array<{ id: SectionId; fields: string[] }>;
  /** Settings the panel lists only once they are written, or when asked for. */
  more: string[];
}

/** The text roles a text object can take; the last one called wins. */
export const textRoles = ["body", "title", "hero", "subtitle", "author", "eyebrow", "lead", "caption", "quote"] as const;

const containers = new Set(["group", "card", "gridSection", "row", "column", "stack"]);
const shapes = new Set(["rect", "circle", "shape"]);
const formulas = new Set(["math", "equation", "typst", "typstFile", "latex", "latexFile"]);

/** The settings shown for a kind of object, in the order a drawing program would show them. */
export function planFor(type: string): Plan {
  if (type === "text" || type === "lead" || type === "caption" || type === "quote") {
    return {
      sections: [
        { id: "text", fields: ["fontSize", "color", "textAlign"] },
        { id: "appearance", fields: ["background"] },
        { id: "size", fields: ["width"] },
      ],
      more: ["height", "lineHeight", "fontWeight", "opacity", "rotation", "padding", "radius", "border", "maxWidth"],
    };
  }
  if (type === "bullets" || type === "steps") {
    return {
      sections: [{ id: "text", fields: ["fontSize", "color"] }, { id: "size", fields: ["width"] }],
      more: ["lineHeight", "gap", "background", "padding", "opacity"],
    };
  }
  if (shapes.has(type)) {
    return {
      sections: [
        { id: "appearance", fields: ["tone", ...(type === "shape" ? ["toneStyle"] : []), "fill", "stroke", "strokeWidth"] },
        { id: "size", fields: ["width", "height"] },
      ],
      more: ["radius", "fontSize", "color", "opacity", "rotation"],
    };
  }
  if (type === "line") {
    return { sections: [{ id: "line", fields: ["stroke", "strokeWidth", "arrow"] }], more: ["opacity"] };
  }
  if (type === "image") {
    return {
      sections: [{ id: "size", fields: ["width", "height"] }, { id: "appearance", fields: ["radius", "opacity"] }],
      more: ["rotation", "border", "background", "padding"],
    };
  }
  if (type === "code") {
    return {
      sections: [{ id: "text", fields: ["fontSize"] }, { id: "size", fields: ["width"] }],
      more: ["height", "radius", "background", "padding", "opacity"],
    };
  }
  if (formulas.has(type)) {
    const typeset = type.startsWith("latex") || type.startsWith("typst");
    return {
      sections: [
        ...(typeset ? [] : [{ id: "text" as const, fields: ["fontSize", "color"] }]),
        { id: "size", fields: ["width"] },
      ],
      more: [...(typeset ? ["fontSize", "color"] : []), "height", "background", "padding", "opacity", "rotation"],
    };
  }
  if (type === "icon") {
    return {
      sections: [{ id: "appearance", fields: ["color"] }, { id: "size", fields: ["width", "height"] }],
      more: ["background", "radius", "opacity", "rotation"],
    };
  }
  if (type === "metric" || type === "table") {
    return {
      sections: [{ id: "text", fields: ["fontSize", "color"] }, { id: "size", fields: ["width"] }],
      more: ["height", "background", "padding", "radius", "opacity"],
    };
  }
  if (containers.has(type)) {
    return {
      sections: [
        { id: "layout", fields: ["gap", "align", "justify", "padding"] },
        { id: "appearance", fields: ["background", "radius", "border"] },
        { id: "size", fields: ["width", "height"] },
      ],
      more: ["color", "fontSize", "margin", "opacity"],
    };
  }
  return {
    sections: [{ id: "size", fields: ["width", "height"] }],
    more: ["color", "background", "fontSize", "radius", "padding", "opacity"],
  };
}

/** Which methods each kind of object has, so the panel never writes one its builder lacks. */
export function hasMethod(type: string, method: string): boolean {
  if (method === "fill") return shapes.has(type);
  if (method === "tone") return shapes.has(type);
  if (method === "stroke" || method === "strokeWidth") return shapes.has(type) || type === "line";
  if (method === "arrow") return type === "line";
  return true;
}

/** The roles of a text object, which only text() itself takes. */
export function takesRole(object: InspectObject): boolean {
  return object.type === "text" && Boolean(object.append);
}

/** The last value written for a setting: later calls win, as they do when the slide runs. */
export function lastProperty(object: InspectObject, name: string): InspectProperty | undefined {
  return object.properties.filter((property) => property.name === name).pop();
}

/** The method call a literal sits in. */
export function methodOf(object: InspectObject, start: number): InspectMethod | undefined {
  return (object.methods ?? []).filter((method) => method.start <= start && start < method.end).pop();
}

/** The quote the document writes strings with, judged from the object's own text. */
export function quoteFor(object: InspectObject): string {
  const written = object.texts?.find((text) => !text.raw)?.expected[0];
  return written === "'" ? "'" : '"';
}

/** A string as a literal in the quote it is written with; undefined when it cannot be one. */
export function stringLiteral(value: string, quote: string, raw = false): string | undefined {
  if (raw) {
    // A tagged template receives its text as written, so there is nothing to escape, and some
    // texts cannot be written at all.
    if (value.includes("`") || value.includes("${") || /(^|[^\\])(\\\\)*\\$/.test(value)) return undefined;
    return `\`${value}\``;
  }
  if (quote === "`") {
    return `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
  }
  if (quote === "'") {
    return `'${value
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029")}'`;
  }
  return JSON.stringify(value);
}

const cssLength = /^-?(?:\d+\.?\d*|\.\d+)(?:px|%|em|rem|vw|vh|pt|mm|cm|in|fr|ch)$/;
const plainNumber = /^-?(?:\d+\.?\d*|\.\d+)$/;

/**
 * The literal a field writes for what was typed, or undefined when it is not a value of that
 * kind. A length is a number of pixels or a CSS length; a string keeps the document's quotes.
 */
export function fieldLiteral(field: FieldSpec, input: string, quote: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;
  if (field.kind === "number") {
    if (!plainNumber.test(value)) return undefined;
    let number = Number(value);
    if (field.min !== undefined) number = Math.max(field.min, number);
    if (field.max !== undefined) number = Math.min(field.max, number);
    return String(number);
  }
  if (field.kind === "length") {
    if (plainNumber.test(value)) {
      const number = Math.max(field.min ?? -Infinity, Number(value));
      return String(number);
    }
    return cssLength.test(value) || value === "auto" ? stringLiteral(value, quote) : undefined;
  }
  if (field.kind === "choice" && field.choices && !field.choices.includes(value)) return undefined;
  if (/[\n\r]/.test(value)) return undefined;
  return stringLiteral(value, quote);
}

/** A literal from what it means, as the report states values. */
export function literalValue(literal: string): number | string {
  if (plainNumber.test(literal)) return Number(literal);
  const quote = literal[0];
  if (quote === '"') return JSON.parse(literal) as string;
  return literal.slice(1, -1);
}

/** An edit to the editor's text, in the positions of the text the panel was drawn from. */
export interface SourceEdit {
  from: number;
  to: number;
  insert: string;
}

/** A piece of text that must still read as the panel expects, or the edit is refused. */
export interface SourceCheck {
  from: number;
  to: number;
  text: string;
}

export interface SourcePlan {
  edits: SourceEdit[];
  checks: SourceCheck[];
}

/** Where the object's command name stands, so an edit made on a stale picture is refused. */
export function commandCheck(object: InspectObject): SourceCheck | undefined {
  const start = object.source.start;
  if (start === undefined) return undefined;
  return { from: start, to: start + object.type.length, text: object.type };
}

/** Add a method call after the object's last one, with its own line when the last one has one. */
export function appendCall(object: InspectObject, call: string): SourcePlan | undefined {
  if (!object.append) return undefined;
  const { at, indent } = object.append;
  const last = object.methods?.[object.methods.length - 1];
  const checks: SourceCheck[] = [];
  const command = commandCheck(object);
  if (command) checks.push(command);
  if (last && last.end === at) checks.push({ from: last.nameStart, to: last.nameEnd, text: last.name });
  return {
    edits: [{ from: at, to: at, insert: `${indent === undefined ? "" : `\n${indent}`}.${call}` }],
    checks,
  };
}

/** Take method calls away, with the whitespace that put each on a line of its own. */
export function removeCalls(object: InspectObject, methods: InspectMethod[]): SourcePlan {
  const command = commandCheck(object);
  return {
    edits: methods.map((method) => ({ from: method.removeFrom, to: method.end, insert: "" })),
    checks: [
      ...(command ? [command] : []),
      ...methods.map((method) => ({ from: method.nameStart, to: method.nameEnd, text: method.name })),
    ],
  };
}

/** Rewrite one literal in place. */
export function replaceLiteral(target: { source: { start: number; end: number }; expected: string }, literal: string): SourcePlan {
  return {
    edits: [{ from: target.source.start, to: target.source.end, insert: literal }],
    checks: [{ from: target.source.start, to: target.source.end, text: target.expected }],
  };
}

/**
 * Carry the panel's picture of a slide through an edit it made, so the next edit lines up
 * before the inspector has read the text again. Anything inside a replaced range is gone.
 */
export function shiftSlide(slide: InspectSlide, edits: SourceEdit[]): void {
  // A position where text was inserted stays before it when `before` is set: the end of the
  // last method call stays put while the end of the whole chain moves past the new call.
  const map = (position: number, before = false): number => {
    let delta = 0;
    for (const edit of edits) {
      if (position > edit.from && position < edit.to) return Number.NaN;
      const after = position > edit.to || (position === edit.to && (edit.from !== edit.to || !before));
      if (after) delta += edit.insert.length - (edit.to - edit.from);
    }
    return position + delta;
  };
  const range = <T extends { start?: number; end?: number }>(value: T, endBefore = true): T => {
    const start = value.start === undefined ? undefined : map(value.start);
    const finish = value.end === undefined ? undefined : map(value.end, endBefore);
    return { ...value, ...(start === undefined ? {} : { start }), ...(finish === undefined ? {} : { end: finish }) };
  };
  const valid = (value: { start?: number; end?: number }): boolean => (
    !Number.isNaN(value.start ?? 0) && !Number.isNaN(value.end ?? 0)
  );
  for (const object of slide.objects) {
    object.source = range(object.source, false);
    object.properties = object.properties
      .map((property) => ({ ...property, source: range(property.source) }))
      .filter((property) => valid(property.source));
    if (object.texts) {
      object.texts = object.texts
        .map((text) => ({ ...text, source: range(text.source) }))
        .filter((text) => valid(text.source)) as InspectText[];
    }
    if (object.computed) {
      object.computed = object.computed
        .map((value) => ({ ...value, source: range(value.source) }))
        .filter((value) => valid(value.source));
    }
    if (object.methods) {
      object.methods = object.methods
        .map((method) => {
          const shifted = range(method);
          return {
            ...shifted,
            nameStart: map(method.nameStart),
            nameEnd: map(method.nameEnd, true),
            removeFrom: map(method.removeFrom),
          };
        })
        .filter((method) => valid(method) && !Number.isNaN(method.nameStart) && !Number.isNaN(method.removeFrom));
    }
    if (object.append) object.append = { ...object.append, at: map(object.append.at) };
    if (object.statement) object.statement = range(object.statement, false);
  }
  for (const region of slide.regions ?? []) {
    region.properties = (region.properties ?? [])
      .map((property) => ({ ...property, source: range(property.source) }))
      .filter((property) => valid(property.source));
  }
}
