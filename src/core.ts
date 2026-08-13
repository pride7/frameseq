import { resolveTheme, type ThemeDefinition, type ThemeInput } from "./theme";
import { attachNode } from "./node-tree";

export type Length = number | string;

export type ComponentType =
  | "slides"
  | "slide"
  | "row"
  | "column"
  | "stack"
  | "text"
  | "image"
  | "code"
  | "equation"
  | "typst"
  | "latex"
  | "rect"
  | "circle"
  | "line"
  | "spacer";

export interface FrameSeqNode {
  type: ComponentType;
  props: Record<string, unknown>;
  styles: Record<string, string>;
  children: FrameSeqNode[];
}

/** A number the slide document states literally, which the preview can rewrite in place. */
export interface SourceField {
  /** Character offset of the number's first character. */
  start: number;
  /** Character offset just past the number's last character. */
  end: number;
  /** The number exactly as it is written, so a stale edit can be recognised and refused. */
  text: string;
  value: number;
}

/** Where the command that created an object was written in the slide document. */
export interface SourceSpan {
  /** One-based line of the command's first character. */
  line: number;
  /** One-based column of the command's first character. */
  column: number;
  /** Character offset of the command's first character. */
  start: number;
  /** Character offset just past the command's last character. */
  end: number;
  /** Coordinates and sizes written as plain numbers, by name: x, y, width, height. */
  fields?: Record<string, SourceField>;
  /** The whole lines the command occupies, which is what a drag between neighbours moves. */
  statement?: { start: number; end: number; text: string };
  /**
   * The run of the document the command belongs to. Commands share a run when nothing between
   * them decides where objects belong, so only commands from one run can trade places.
   */
  region?: number;
}

/**
 * @internal Records where a command was written, so the preview can point back at the source.
 * The development transform wraps every content command with this; anything that is not a
 * content object passes through untouched. A command inside a loop or a helper function runs
 * more than once, so several objects can share one span.
 */
export function markSource<T>(value: T, span: SourceSpan): T {
  const node = (value as { node?: FrameSeqNode } | null | undefined)?.node;
  // Not props.source: Typst and LaTeX objects already keep their fragment text under that name.
  if (node && Array.isArray(node.children)) node.props.sourceSpan = span;
  return value;
}

export interface FontStyleOptions {
  family?: string;
  size?: Length;
  weight?: number | string;
  lineHeight?: number | string;
}

export interface PresentationFontOptions extends FontStyleOptions {
  heading?: FontStyleOptions;
  code?: FontStyleOptions;
}

export interface SlidesOptions {
  title?: string;
  subtitle?: string;
  author?: string;
  institute?: string;
  date?: string;
  ratio?: "16:9" | "4:3";
  width?: number;
  height?: number;
  background?: string;
  theme?: ThemeInput;
  font?: PresentationFontOptions;
}

export interface SlideOptions {
  title?: string;
  name?: string;
  notes?: string;
  allowEmpty?: boolean;
}

export interface GridPosition {
  x?: Length;
  y?: Length;
}

/** Individual sides for padding() and margin(). A side left out is zero. */
export interface Edges {
  top?: Length;
  right?: Length;
  bottom?: Length;
  left?: Length;
}

export type Alignment = "start" | "center" | "end" | "stretch";

export type Distribution =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";

export interface LinePoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type ArrowPlacement = "none" | "start" | "end" | "both";

export type AnchorSide =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export const anchorSides: readonly AnchorSide[] = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

export interface AnchorOffset {
  dx?: number;
  dy?: number;
}

export interface AnchorReference extends AnchorOffset {
  target: string;
  side?: AnchorSide;
}

export type PlacementRelation =
  | "rightOf"
  | "leftOf"
  | "above"
  | "below"
  | "centerOn"
  | "alignTop"
  | "alignLeft";

export interface PlacementStep {
  relation: PlacementRelation;
  target: string;
  gap: number;
}

const segmentPattern = "[A-Za-z_][A-Za-z0-9_-]*";
const namePattern = new RegExp(`^${segmentPattern}(?:/${segmentPattern})*$`);

export function assertName(name: string, command: string): string {
  if (!namePattern.test(name)) {
    throw new Error(
      `${command} expects a name such as "encoder" or a region path such as "stages/first": `
      + `letters, digits, "_" and "-", starting with a letter`,
    );
  }
  return name;
}

/** Split "encoder.right" into an object name and an optional anchor side. */
export function parseAnchorReference(reference: string, command: string): AnchorReference {
  const separator = reference.indexOf(".");
  if (separator < 0) return { target: assertName(reference, command) };

  const target = assertName(reference.slice(0, separator), command);
  const side = reference.slice(separator + 1);
  if (!anchorSides.includes(side as AnchorSide)) {
    throw new Error(
      `${command} does not know the anchor "${side}". Use one of: ${anchorSides.join(", ")}`,
    );
  }
  return { target, side: side as AnchorSide };
}

function length(value: Length): string {
  return typeof value === "number" ? `${value}px` : value;
}

function node(type: ComponentType, props: Record<string, unknown> = {}): FrameSeqNode {
  return { type, props, styles: {}, children: [] };
}

function alignValue(value: "start" | "center" | "end" | "stretch"): string {
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  return value;
}

function justifyValue(value: Distribution): string {
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  return value;
}

/**
 * One CSS shorthand covers both call forms, so a value that reaches the browser also
 * reaches the build-time layout engine, which reads the shorthand rather than the
 * per-side properties. Sides left out of the object form are zero, as in CSS.
 */
function edges(value: Length | Edges, symmetric?: Length): string {
  if (typeof value === "number" || typeof value === "string") {
    return symmetric === undefined ? length(value) : `${length(value)} ${length(symmetric)}`;
  }
  const { top = 0, right = 0, bottom = 0, left = 0 } = value;
  return `${length(top)} ${length(right)} ${length(bottom)} ${length(left)}`;
}

export class ElementBuilder {
  constructor(readonly node: FrameSeqNode) {}

  /** Name this object so connectors and relative placement can reference it. */
  as(name: string): this {
    if (this.node.type === "slides" || this.node.type === "slide") {
      throw new Error("as() names a content object, not a presentation or a slide");
    }
    this.node.props.name = assertName(name, "as()");
    return this;
  }

  private relate(relation: PlacementRelation, target: string, gap: number): this {
    if (this.node.type === "slides" || this.node.type === "slide") {
      throw new Error(`${relation}() places a content object, not a presentation or a slide`);
    }
    const steps = Array.isArray(this.node.props.place)
      ? this.node.props.place as PlacementStep[]
      : [];
    steps.push({ relation, target: assertName(target, `${relation}()`), gap });
    this.node.props.place = steps;
    this.node.styles.position = "absolute";
    return this;
  }

  /** Place this object to the right of a named object, vertically centred on it. */
  rightOf(target: string, gap = 40): this {
    return this.relate("rightOf", target, gap);
  }

  /** Place this object to the left of a named object, vertically centred on it. */
  leftOf(target: string, gap = 40): this {
    return this.relate("leftOf", target, gap);
  }

  /** Place this object above a named object, horizontally centred on it. */
  above(target: string, gap = 24): this {
    return this.relate("above", target, gap);
  }

  /** Place this object below a named object, horizontally centred on it. */
  below(target: string, gap = 24): this {
    return this.relate("below", target, gap);
  }

  /** Place this object on the centre of a named object. */
  centerOn(target: string): this {
    return this.relate("centerOn", target, 0);
  }

  /** Align this object's top edge with a named object, keeping its horizontal placement. */
  alignTop(target: string): this {
    return this.relate("alignTop", target, 0);
  }

  /** Align this object's left edge with a named object, keeping its vertical placement. */
  alignLeft(target: string): this {
    return this.relate("alignLeft", target, 0);
  }

  /**
   * Position this object against its container instead of by coordinates, for example
   * `anchor("center")` or `anchor("bottom-right", 40)`. The browser resolves it, so the
   * object becomes its own coordinate space: anchor connectors to the objects inside it.
   */
  anchor(position: AnchorSide, margin = 0): this {
    if (!anchorSides.includes(position)) {
      throw new Error(`anchor() does not know "${position}". Use one of: ${anchorSides.join(", ")}`);
    }
    const inset = margin === 0 ? "0px" : `${length(margin)}`;
    const far = margin === 0 ? "100%" : `calc(100% - ${length(margin)})`;
    const horizontal = position.endsWith("left")
      ? { value: inset, shift: "0" }
      : position.endsWith("right")
        ? { value: far, shift: "-100%" }
        : { value: "50%", shift: "-50%" };
    const vertical = position.startsWith("top")
      ? { value: inset, shift: "0" }
      : position.startsWith("bottom")
        ? { value: far, shift: "-100%" }
        : { value: "50%", shift: "-50%" };

    this.node.styles.position = "absolute";
    this.node.styles.left = horizontal.value;
    this.node.styles.top = vertical.value;
    this.node.styles.translate = `${horizontal.shift} ${vertical.shift}`;
    return this;
  }

  style(classes: string): this;
  style(properties: Record<string, string | number>): this;
  style(value: string | Record<string, string | number>): this {
    if (typeof value === "string") return this.className(value);

    for (const [property, propertyValue] of Object.entries(value)) {
      this.node.styles[property] = String(propertyValue);
    }
    return this;
  }

  width(value: Length): this {
    this.node.styles.width = length(value);
    return this;
  }

  height(value: Length): this {
    this.node.styles.height = length(value);
    return this;
  }

  minWidth(value: Length): this {
    this.node.styles.minWidth = length(value);
    return this;
  }

  minHeight(value: Length): this {
    this.node.styles.minHeight = length(value);
    return this;
  }

  /** Cap the width, which is how a line of text is kept to a readable measure. */
  maxWidth(value: Length): this {
    this.node.styles.maxWidth = length(value);
    return this;
  }

  maxHeight(value: Length): this {
    this.node.styles.maxHeight = length(value);
    return this;
  }

  padding(value: Length, horizontal?: Length): this;
  padding(sides: Edges): this;
  padding(value: Length | Edges, horizontal?: Length): this {
    this.node.styles.padding = edges(value, horizontal);
    return this;
  }

  margin(value: Length, horizontal?: Length): this;
  margin(sides: Edges): this;
  margin(value: Length | Edges, horizontal?: Length): this {
    this.node.styles.margin = edges(value, horizontal);
    return this;
  }

  /** Spacing between the children of a row, column, or grid. */
  gap(value: Length, horizontal?: Length): this {
    this.node.styles.gap = horizontal === undefined
      ? length(value)
      : `${length(value)} ${length(horizontal)}`;
    return this;
  }

  background(value: string): this {
    this.node.styles.background = value;
    return this;
  }

  color(value: string): this {
    this.node.styles.color = value;
    return this;
  }

  border(value: string): this {
    this.node.styles.border = value;
    return this;
  }

  radius(value: Length): this {
    this.node.styles.borderRadius = length(value);
    return this;
  }

  fontSize(value: Length): this {
    this.node.styles.fontSize = length(value);
    return this;
  }

  size(value: Length): this {
    return this.fontSize(value);
  }

  fontWeight(value: number | string): this {
    this.node.styles.fontWeight = String(value);
    return this;
  }

  weight(value: number | string): this {
    return this.fontWeight(value);
  }

  bold(): this {
    return this.fontWeight(700);
  }

  lineHeight(value: number | string): this {
    this.node.styles.lineHeight = String(value);
    return this;
  }

  textAlign(value: "left" | "center" | "right"): this {
    this.node.styles.textAlign = value;
    return this;
  }

  /**
   * Align this object across the axis of the row or column that holds it, without
   * moving its siblings. A column aligns horizontally and a row aligns vertically.
   */
  selfAlign(value: Alignment): this {
    this.node.styles.alignSelf = alignValue(value);
    return this;
  }

  /** Centre this object across the axis of the row or column that holds it. */
  centerSelf(): this {
    return this.selfAlign("center");
  }

  /** Align the children of this row or column across its axis: down a row, across a column. */
  align(value: Alignment): this {
    this.node.styles.alignItems = alignValue(value);
    return this;
  }

  /** Distribute the children of this row or column along its axis: across a row, down a column. */
  justify(value: Distribution): this {
    this.node.styles.justifyContent = justifyValue(value);
    return this;
  }

  /** Align the lines of a wrapped row or column against each other. Needs wrap(). */
  alignContent(value: Alignment | "space-between" | "space-around" | "space-evenly"): this {
    this.node.styles.alignContent = value === "start"
      ? "flex-start"
      : value === "end" ? "flex-end" : value;
    return this;
  }

  grow(value = 1): this {
    this.node.styles.flexGrow = String(value);
    return this;
  }

  wrap(enabled = true): this {
    this.node.styles.flexWrap = enabled ? "wrap" : "nowrap";
    return this;
  }

  opacity(value: number): this {
    this.node.styles.opacity = String(value);
    return this;
  }

  /** Clip child content to this object's bounds. */
  clip(enabled = true): this {
    this.node.styles.overflow = enabled ? "hidden" : "visible";
    return this;
  }

  position({ x = 0, y = 0 }: GridPosition): this {
    this.node.styles.position = "absolute";
    this.node.styles.left = length(x);
    this.node.styles.top = length(y);
    return this;
  }

  rotate(degrees: number): this {
    this.node.styles.transform = `rotate(${degrees}deg)`;
    return this;
  }

  showAt(step: number): this {
    this.node.props.step = step;
    return this;
  }

  className(value: string): this {
    const current = typeof this.node.props.className === "string"
      ? this.node.props.className.split(/\s+/)
      : [];
    const next = value.split(/\s+/).filter(Boolean);
    this.node.props.className = [...new Set([...current, ...next])].join(" ");
    return this;
  }
}

export type GridColumns = number | string;

/** Turn a column count or a CSS template into a grid-template-columns value. */
export function gridTemplate(columns: GridColumns): string {
  if (typeof columns === "number") {
    if (!Number.isInteger(columns) || columns < 1 || columns > 12) {
      throw new Error("Grid columns must be an integer from 1 to 12");
    }
    return `repeat(${columns}, minmax(0, 1fr))`;
  }

  if (!columns.trim()) throw new Error("Grid columns cannot be empty");
  return columns;
}

export class ContainerBuilder extends ElementBuilder {
  add(...children: ElementBuilder[]): this {
    for (const child of children) attachNode(this.node, child.node);
    return this;
  }

  row(): this {
    this.node.styles.display = "flex";
    this.node.styles.flexDirection = "row";
    return this;
  }

  column(): this {
    this.node.styles.display = "flex";
    this.node.styles.flexDirection = "column";
    return this;
  }

  stack(): this {
    this.node.styles.display = "block";
    return this;
  }

  /** Arrange the contents in a grid, filling each row before the next. */
  grid(columns: GridColumns, gap?: Length): this {
    this.node.styles.display = "grid";
    this.node.styles.gridTemplateColumns = gridTemplate(columns);
    if (gap !== undefined) this.node.styles.gap = length(gap);
    return this;
  }

  /** Use this container as a local positioned coordinate system. */
  canvas(): this {
    if (!this.node.styles.position || this.node.styles.position === "static") {
      this.node.styles.position = "relative";
    }
    this.node.styles.display = "block";
    return this;
  }

  center(): this {
    this.node.styles.alignItems = "center";
    this.node.styles.justifyContent = "center";
    return this;
  }
}

export class ShapeBuilder extends ElementBuilder {
  /**
   * A shape carries a minimum height from the stylesheet so an unsized node still
   * looks like one. A minimum always clamps an explicit height, so asking for a
   * shorter shape has to release it; an explicit minHeight() set first still wins.
   */
  override height(value: Length): this {
    if (this.node.styles.minHeight === undefined) this.node.styles.minHeight = "0px";
    return super.height(value);
  }

  fill(value: string): this {
    this.node.styles.background = value;
    return this;
  }

  stroke(value: string): this {
    this.node.styles.borderColor = value;
    this.node.styles.borderStyle = "solid";
    return this;
  }

  strokeWidth(value: Length): this {
    this.node.styles.borderWidth = length(value);
    return this;
  }
}

export class LineBuilder extends ElementBuilder {
  stroke(value: string): this {
    this.node.props.stroke = value;
    return this;
  }

  strokeWidth(value: Length): this {
    this.node.props.strokeWidth = length(value);
    return this;
  }

  arrow(value: ArrowPlacement = "end"): this {
    this.node.props.arrow = value;
    return this;
  }

  /** Start this connector at a named object, for example "encoder" or "encoder.right". */
  from(reference: string, offset: AnchorOffset = {}): this {
    this.node.props.from = { ...parseAnchorReference(reference, "from()"), ...offset };
    return this;
  }

  /** End this connector at a named object, for example "decoder" or "decoder.left". */
  to(reference: string, offset: AnchorOffset = {}): this {
    this.node.props.to = { ...parseAnchorReference(reference, "to()"), ...offset };
    return this;
  }
}

export class SlideBuilder extends ContainerBuilder {
  notes(content: string): this {
    this.node.props.notes = content;
    return this;
  }

  allowEmpty(enabled = true): this {
    this.node.props.allowEmpty = enabled;
    return this;
  }
}

export class SlidesRootDefinition extends ElementBuilder {
  get canvasWidth(): number {
    return this.node.props.width as number;
  }

  get canvasHeight(): number {
    return this.node.props.height as number;
  }

  get title(): string {
    return this.node.props.title as string;
  }

  get author(): string | undefined {
    return this.node.props.author as string | undefined;
  }

  get subtitle(): string | undefined {
    return this.node.props.subtitle as string | undefined;
  }

  get institute(): string | undefined {
    return this.node.props.institute as string | undefined;
  }

  get date(): string | undefined {
    return this.node.props.date as string | undefined;
  }

  get theme(): ThemeDefinition {
    return this.node.props.theme as ThemeDefinition;
  }

  get font(): PresentationFontOptions | undefined {
    return this.node.props.font as PresentationFontOptions | undefined;
  }

  get slides(): FrameSeqNode[] {
    return this.node.children;
  }

  slide(nameOrOptions: string | SlideOptions = {}): SlideBuilder {
    const slide = Slide(nameOrOptions);
    attachNode(this.node, slide.node);
    return slide;
  }

  add(...slides: SlideBuilder[]): this {
    for (const slide of slides) attachNode(this.node, slide.node);
    return this;
  }
}

export function SlidesRoot(titleOrOptions: string | SlidesOptions = {}): SlidesRootDefinition {
  const options = typeof titleOrOptions === "string"
    ? { title: titleOrOptions }
    : titleOrOptions;
  const ratio = options.ratio ?? "16:9";
  const width = options.width ?? 1280;
  const height = options.height ?? Math.round(width * (ratio === "4:3" ? 3 / 4 : 9 / 16));
  const theme = resolveTheme(options.theme);
  if (options.background) {
    theme.colors.background = options.background;
    theme.coverBackground = options.background;
  }
  const root = node("slides", {
    title: options.title ?? "FrameSeq",
    subtitle: options.subtitle,
    author: options.author,
    institute: options.institute,
    date: options.date,
    ratio,
    width,
    height,
    theme,
    font: options.font
      ? {
        ...options.font,
        heading: options.font.heading ? { ...options.font.heading } : undefined,
        code: options.font.code ? { ...options.font.code } : undefined,
      }
      : undefined,
  });
  return new SlidesRootDefinition(root);
}

export function Slide(nameOrOptions: string | SlideOptions = {}): SlideBuilder {
  const options = typeof nameOrOptions === "string"
    ? { name: nameOrOptions }
    : nameOrOptions;
  const item = node("slide", { ...options });
  item.styles.display = "flex";
  item.styles.flexDirection = "column";
  return new SlideBuilder(item);
}

function container(type: "row" | "column" | "stack", children: ElementBuilder[]): ContainerBuilder {
  const item = node(type);
  const builder = new ContainerBuilder(item).add(...children);
  if (type === "row") builder.row();
  if (type === "column") builder.column();
  if (type === "stack") builder.stack();
  return builder;
}

export function Row(...children: ElementBuilder[]): ContainerBuilder {
  return container("row", children);
}

export function Column(...children: ElementBuilder[]): ContainerBuilder {
  return container("column", children);
}

export function Stack(...children: ElementBuilder[]): ContainerBuilder {
  return container("stack", children);
}

export function Text(content: string): ElementBuilder {
  return new ElementBuilder(node("text", { content }));
}

export function Image(src: string, alt = ""): ElementBuilder {
  return new ElementBuilder(node("image", { src, alt }));
}

export function Code(content: string, language = "text"): ElementBuilder {
  return new ElementBuilder(node("code", { content, language }));
}

export function Equation(content: string, displayMode = true): ElementBuilder {
  return new ElementBuilder(node("equation", { content, displayMode }));
}

export function Typst(source: string, svg?: string): ElementBuilder {
  return new ElementBuilder(node("typst", { source, svg }));
}

export function Latex(source: string, svg?: string): ElementBuilder {
  return new ElementBuilder(node("latex", { source, svg }));
}

export function Rect(label = ""): ShapeBuilder {
  return new ShapeBuilder(node("rect", { label }));
}

export function Circle(label = ""): ShapeBuilder {
  return new ShapeBuilder(node("circle", { label }));
}

export function Line(points: Partial<LinePoints> = {}): LineBuilder {
  return new LineBuilder(node("line", {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    ...points,
    stroke: "var(--frameseq-accent)",
    strokeWidth: "3px",
    arrow: "none",
  }));
}

export function Spacer(size = 1): ElementBuilder {
  const item = node("spacer");
  item.styles.flexGrow = String(size);
  return new ElementBuilder(item);
}

export const px = (value: number): string => `${value}px`;
export const pt = (value: number): string => `${value}pt`;
export const rem = (value: number): string => `${value}rem`;
export const percent = (value: number): string => `${value}%`;
export const vw = (value: number): string => `${value}vw`;
export const vh = (value: number): string => `${value}vh`;
