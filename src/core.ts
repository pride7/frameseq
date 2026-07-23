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

export interface LinePoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type ArrowPlacement = "none" | "start" | "end" | "both";

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

function justifyValue(
  value: "start" | "center" | "end" | "space-between" | "space-around",
): string {
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  return value;
}

export class ElementBuilder {
  constructor(readonly node: FrameSeqNode) {}

  /** Move this object below another content object in the rendered hierarchy. */
  parent(parent: ElementBuilder): this {
    if (this.node.type === "slides" || this.node.type === "slide") {
      throw new Error("Only content objects can use parent()");
    }
    if (parent.node.type === "slides" || parent.node.type === "slide") {
      throw new Error("parent() expects a content object, group(), or gridSection()");
    }
    if (!parent.node.styles.position || parent.node.styles.position === "static") {
      parent.node.styles.position = "relative";
    }
    attachNode(parent.node, this.node);
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

  padding(value: Length, horizontal?: Length): this {
    this.node.styles.padding = horizontal === undefined
      ? length(value)
      : `${length(value)} ${length(horizontal)}`;
    return this;
  }

  margin(value: Length, horizontal?: Length): this {
    this.node.styles.margin = horizontal === undefined
      ? length(value)
      : `${length(value)} ${length(horizontal)}`;
    return this;
  }

  gap(value: Length): this {
    this.node.styles.gap = length(value);
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

  align(value: "start" | "center" | "end" | "stretch"): this {
    this.node.styles.alignItems = alignValue(value);
    return this;
  }

  justify(value: "start" | "center" | "end" | "space-between" | "space-around"): this {
    this.node.styles.justifyContent = justifyValue(value);
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

export function Line(points: LinePoints): LineBuilder {
  return new LineBuilder(node("line", {
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
