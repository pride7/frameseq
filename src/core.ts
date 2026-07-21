import { resolveTheme, type ThemeDefinition, type ThemeInput } from "./theme";

export type Length = number | string;

export type ComponentType =
  | "deck"
  | "slide"
  | "row"
  | "column"
  | "stack"
  | "text"
  | "image"
  | "code"
  | "equation"
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

export interface DeckOptions {
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
}

export interface GridPosition {
  x?: Length;
  y?: Length;
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

function justifyValue(
  value: "start" | "center" | "end" | "space-between" | "space-around",
): string {
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  return value;
}

export class ElementBuilder {
  constructor(readonly node: FrameSeqNode) {}

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
    this.node.children.push(...children.map((child) => child.node));
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

  center(): this {
    this.node.styles.alignItems = "center";
    this.node.styles.justifyContent = "center";
    return this;
  }
}

export class SlideBuilder extends ContainerBuilder {}

export class DeckDefinition extends ElementBuilder {
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
    this.node.children.push(slide.node);
    return slide;
  }

  add(...slides: SlideBuilder[]): this {
    this.node.children.push(...slides.map((slide) => slide.node));
    return this;
  }
}

export function Deck(titleOrOptions: string | DeckOptions = {}): DeckDefinition {
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
  const root = node("deck", {
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
  return new DeckDefinition(root);
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
