import {
  Code,
  Column,
  ContainerBuilder,
  SlidesRoot,
  SlidesRootDefinition,
  type SlidesOptions,
  type ElementBuilder,
  Equation,
  type FrameSeqNode,
  Image,
  type Length,
  Row,
  Slide,
  SlideBuilder,
  type SlideOptions,
  Text,
} from "./core";

export interface PlaceBounds {
  x: Length;
  y: Length;
  width?: Length;
  height?: Length;
}

export type SplitRatio = `${number}:${number}` | number | [number, number];
export type GridColumns = number | string;

function List(items: string[], ordered: boolean, reveal: boolean): ElementBuilder {
  const list = Column().className("frameseq-list");

  for (const [index, item] of items.entries()) {
    const marker = Text(ordered ? String(index + 1) : "•")
      .className("frameseq-list-marker");
    const content = Text(item).className("frameseq-list-copy");
    const row = Row(marker, content).className("frameseq-list-item");
    if (reveal) row.showAt(index + 1);
    list.add(row);
  }

  return list;
}

function columnsForRatio(ratio: SplitRatio): string {
  let left: number;
  let right: number;

  if (Array.isArray(ratio)) {
    [left, right] = ratio;
  } else if (typeof ratio === "string") {
    const values = ratio.split(":").map(Number);
    if (values.length !== 2) throw new Error(`Invalid split ratio: ${ratio}`);
    [left, right] = values;
  } else if (ratio > 0 && ratio < 1) {
    left = ratio;
    right = 1 - ratio;
  } else {
    left = ratio;
    right = 100 - ratio;
  }

  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) {
    throw new Error(`Split ratio must contain two positive values`);
  }
  return `${left}fr ${right}fr`;
}

export function Bullets(...items: string[]): ElementBuilder {
  return List(items, false, false);
}

export function Steps(...items: string[]): ElementBuilder {
  return List(items, true, true).className("frameseq-steps");
}

function gridTemplate(columns: GridColumns): string {
  if (typeof columns === "number") {
    if (!Number.isInteger(columns) || columns < 1 || columns > 12) {
      throw new Error("Grid columns must be an integer from 1 to 12");
    }
    return `repeat(${columns}, minmax(0, 1fr))`;
  }

  if (!columns.trim()) throw new Error("Grid columns cannot be empty");
  return columns;
}

export class GroupBuilder extends ContainerBuilder {
  card(): this {
    return this.className("frameseq-card");
  }
}

export class GridSectionBuilder extends ContainerBuilder {
  columns(value: GridColumns): this {
    this.node.styles.gridTemplateColumns = gridTemplate(value);
    return this;
  }
}

/** Create a detached vertical group for use inside another layout object. */
export function Group(...items: ElementBuilder[]): GroupBuilder {
  return new GroupBuilder(
    Column(...items).className("frameseq-group").node,
  );
}

/** Create a detached semantic card with a title and optional supporting copy. */
export function Card(title: string, content?: string): GroupBuilder {
  const children = [Text(title).className("frameseq-card-title")];
  if (content) children.push(Text(content).className("frameseq-card-copy"));
  return Group(...children).card();
}

/** Create a detached metric object. */
export function Metric(value: string, label: string): GroupBuilder {
  return Group(
    Text(value).className("frameseq-metric-value"),
    Text(label).className("frameseq-metric-label"),
  ).className("frameseq-metric");
}

/** Create a detached grid that treats each supplied object as one cell. */
export function GridSection(
  columns: GridColumns,
  ...items: ElementBuilder[]
): GridSectionBuilder {
  if (items.length === 0) throw new Error("GridSection() requires at least one item");
  const section = new GridSectionBuilder(
    Column(...items).className("frameseq-grid-section").node,
  );
  return section
    .style({ display: "grid" })
    .columns(columns);
}

export class RegionBuilder extends ContainerBuilder {
  lead(content: string): this {
    this.add(Text(content).className("frameseq-slide-lead"));
    return this;
  }

  text(content: string): this {
    this.add(Text(content).className("frameseq-body-copy"));
    return this;
  }

  bullets(...items: string[]): this {
    this.add(Bullets(...items));
    return this;
  }

  steps(...items: string[]): this {
    this.add(Steps(...items));
    return this;
  }

  code(content: string, language = "ts"): this {
    this.add(Code(content, language).className("frameseq-semantic-code"));
    return this;
  }

  math(content: string): this {
    this.add(Equation(content).className("frameseq-semantic-math"));
    return this;
  }

  image(src: string, alt = ""): this {
    this.add(Image(src, alt).className("frameseq-semantic-image"));
    return this;
  }

  caption(content: string): this {
    this.add(Text(content).className("frameseq-caption"));
    return this;
  }

  quote(content: string): this {
    this.add(Text(content).className("frameseq-quote"));
    return this;
  }

  metric(value: string, label: string): this {
    this.add(Metric(value, label));
    return this;
  }

  card(): this {
    this.className("frameseq-region-card");
    return this;
  }

  custom(...elements: ElementBuilder[]): this {
    this.add(...elements);
    return this;
  }
}

function region(className: string): RegionBuilder {
  return new RegionBuilder(Column().className(`frameseq-region ${className}`).node);
}

export class ContentSlideBuilder extends SlideBuilder {
  readonly content: RegionBuilder;
  private splitRegions?: [RegionBuilder, RegionBuilder];
  private gridRegions?: RegionBuilder[];
  private structuredLayout?: "split" | "grid";
  private canvasEnabled = false;

  constructor(node: FrameSeqNode, content: RegionBuilder) {
    super(node);
    this.content = content;
  }

  private takeExistingContent(layout: "split" | "grid"): FrameSeqNode[] {
    if (this.structuredLayout) {
      throw new Error(`Slide already uses the ${this.structuredLayout} layout`);
    }
    this.structuredLayout = layout;
    return this.content.node.children.splice(0);
  }

  private defaultRegion(): RegionBuilder {
    return this.splitRegions?.[0] ?? this.gridRegions?.[0] ?? this.content;
  }

  /** The region used by linear document commands such as text() and code(). */
  get defaultContent(): RegionBuilder {
    return this.defaultRegion();
  }

  cover(): this {
    const classes = typeof this.node.props.className === "string"
      ? this.node.props.className.split(/\s+/).filter((name) => name !== "frameseq-content-slide")
      : [];
    this.node.props.className = classes.join(" ");
    this.className("frameseq-cover-slide");
    return this;
  }

  lead(content: string): this {
    this.defaultRegion().lead(content);
    return this;
  }

  text(content: string): this {
    this.defaultRegion().text(content);
    return this;
  }

  bullets(...items: string[]): this {
    this.defaultRegion().bullets(...items);
    return this;
  }

  steps(...items: string[]): this {
    this.defaultRegion().steps(...items);
    return this;
  }

  code(content: string, language = "ts"): this {
    this.defaultRegion().code(content, language);
    return this;
  }

  math(content: string): this {
    this.defaultRegion().math(content);
    return this;
  }

  image(src: string, alt = ""): this {
    this.defaultRegion().image(src, alt);
    return this;
  }

  caption(content: string): this {
    this.defaultRegion().caption(content);
    return this;
  }

  quote(content: string): this {
    this.defaultRegion().quote(content);
    return this;
  }

  metric(value: string, label: string): this {
    this.defaultRegion().metric(value, label);
    return this;
  }

  custom(...elements: ElementBuilder[]): this {
    this.defaultRegion().custom(...elements);
    return this;
  }

  split(ratio: SplitRatio = "1:1"): this {
    const existing = this.takeExistingContent("split");
    const left = region("frameseq-region-left");
    const right = region("frameseq-region-right");
    left.node.children.push(...existing);
    this.content
      .className("frameseq-layout-split")
      .style({ display: "grid", gridTemplateColumns: columnsForRatio(ratio) })
      .add(left, right);
    this.splitRegions = [left, right];
    return this;
  }

  get left(): RegionBuilder {
    if (!this.splitRegions) throw new Error("Call split() before using page.left");
    return this.splitRegions[0];
  }

  get right(): RegionBuilder {
    if (!this.splitRegions) throw new Error("Call split() before using page.right");
    return this.splitRegions[1];
  }

  grid(columns: number, gap?: Length): this {
    if (!Number.isInteger(columns) || columns < 1 || columns > 12) {
      throw new Error("grid() columns must be an integer from 1 to 12");
    }
    const existing = this.takeExistingContent("grid");
    const cells = Array.from({ length: columns }, (_, index) =>
      region(`frameseq-grid-cell frameseq-grid-cell-${index}`));
    cells[0].node.children.push(...existing);
    this.content
      .className("frameseq-layout-grid")
      .style({
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      })
      .add(...cells);
    if (gap !== undefined) this.content.gap(gap);
    this.gridRegions = cells;
    return this;
  }

  cell(index: number): RegionBuilder {
    const cell = this.gridRegions?.[index];
    if (!cell) throw new Error(`No grid cell ${index}; call grid() first`);
    return cell;
  }

  override center(): this {
    this.content.className("frameseq-layout-center").center();
    return this;
  }

  fullBleed(src: string, alt = ""): this {
    this.content.className("frameseq-layout-full-bleed");
    this.content.add(Image(src, alt).className("frameseq-full-bleed-image"));
    return this;
  }

  canvas(): this {
    this.canvasEnabled = true;
    this.content.className("frameseq-layout-canvas").stack();
    return this;
  }

  place(element: ElementBuilder, bounds: PlaceBounds): this {
    if (!this.canvasEnabled) this.canvas();
    element.position({ x: bounds.x, y: bounds.y });
    if (bounds.width !== undefined) element.width(bounds.width);
    if (bounds.height !== undefined) element.height(bounds.height);
    this.content.add(element);
    return this;
  }
}

export class CoverSlideBuilder extends RegionBuilder {
  notes(content: string): this {
    this.node.props.notes = content;
    return this;
  }

  eyebrow(content: string): this {
    this.add(Text(content.toUpperCase()).className("frameseq-cover-eyebrow"));
    return this;
  }

  subtitle(content: string): this {
    this.add(Text(content).className("frameseq-cover-subtitle"));
    return this;
  }

  author(content: string): this {
    this.add(Text(content).className("frameseq-cover-author"));
    return this;
  }
}

export class SlidesDefinition extends SlidesRootDefinition {
  cover(title: string): CoverSlideBuilder {
    const slide = new CoverSlideBuilder(Slide({ name: "Cover", title }).node)
      .className("frameseq-cover-slide");
    slide.add(Text(title).className("frameseq-cover-title"));
    this.node.children.push(slide.node);
    return slide;
  }

  override slide(nameOrOptions: string | SlideOptions = {}): ContentSlideBuilder {
    const options = typeof nameOrOptions === "string"
      ? { name: nameOrOptions, title: nameOrOptions }
      : nameOrOptions;
    const title = options.title;
    const rawSlide = Slide(options).className("frameseq-content-slide");
    const body = region("frameseq-slide-body");
    const slide = new ContentSlideBuilder(rawSlide.node, body);
    if (title) slide.add(Text(title).className("frameseq-slide-title"));
    slide.add(body);
    this.node.children.push(slide.node);
    return slide;
  }
}

export function Slides(titleOrOptions: string | SlidesOptions = {}): SlidesDefinition {
  const options: SlidesOptions = typeof titleOrOptions === "string"
    ? { title: titleOrOptions }
    : { ...titleOrOptions };
  return new SlidesDefinition(SlidesRoot(options).node);
}
