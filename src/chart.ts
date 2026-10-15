import type { ChartKind, ChartSeries } from "./objects";

/** What a chart shows, as chart() stores it on its object. */
export interface ChartSpec {
  kind: ChartKind;
  labels: string[];
  series: ChartSeries[];
  colors?: string[];
  unit?: string;
  showValues?: boolean;
  legend?: boolean;
  max?: number;
}

/** Where a chart is drawn: its size in canvas pixels and the type and colours around it. */
export interface ChartFrame {
  width: number;
  height: number;
  fontSize: number;
  foreground: string;
  muted: string;
  grid: string;
  palette: string[];
}

/** Series colours after the theme's accent: distinct on light and dark backgrounds alike. */
export const chartPalette = ["#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#64748b"];

const round = (value: number): number => Math.round(value * 100) / 100;

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A value as the chart writes it: up to two decimals, grouped thousands, and the unit. */
export function chartValue(value: number, unit = ""): string {
  const written = Math.abs(value) >= 1000
    ? value.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : String(round(value));
  return `${written}${unit}`;
}

/** Axis ticks at round numbers from zero (or the lowest value) to at least the highest. */
function ticks(minimum: number, maximum: number, count = 5): number[] {
  const span = maximum - minimum || Math.abs(maximum) || 1;
  const rough = span / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ?? rough;
  const start = Math.floor(minimum / step) * step;
  const values: number[] = [];
  for (let value = start; value < maximum + step * 0.999; value += step) values.push(round(value));
  return values.length > 1 ? values : [start, start + step];
}

/** Text width, estimated: wide enough to keep labels apart without measuring a font. */
function textWidth(text: string, size: number): number {
  return [...text].reduce((total, character) => total + (/[⺀-￿]/.test(character) ? 1 : 0.58), 0) * size;
}

function text(x: number, y: number, content: string, size: number, fill: string, anchor = "middle", weight = 400, baseline = "middle"): string {
  return `<text x="${round(x)}" y="${round(y)}" font-size="${round(size)}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="${baseline}"${weight === 400 ? "" : ` font-weight="${weight}"`}>${escape(content)}</text>`;
}

function legendRow(items: Array<{ name: string; color: string }>, frame: ChartFrame, y: number): { svg: string; height: number } {
  const size = frame.fontSize * 0.85;
  const swatch = size * 0.8;
  const widths = items.map((item) => swatch + size * 0.4 + textWidth(item.name, size) + size * 1.2);
  const total = widths.reduce((sum, width) => sum + width, 0);
  let x = Math.max((frame.width - total) / 2, 0);
  const parts = items.map((item, index) => {
    const part = `<rect x="${round(x)}" y="${round(y - swatch / 2)}" width="${round(swatch)}" height="${round(swatch)}" rx="${round(swatch * 0.2)}" fill="${item.color}"/>${text(x + swatch + size * 0.4, y, item.name, size, frame.foreground, "start")}`;
    x += widths[index];
    return part;
  });
  return { svg: parts.join(""), height: size * 2 };
}

/** Draw a chart as SVG markup sized to its frame. */
export function chartSvg(spec: ChartSpec, frame: ChartFrame): string {
  const width = Math.max(frame.width, 40);
  const height = Math.max(frame.height, 40);
  const size = frame.fontSize;
  const colors = spec.colors && spec.colors.length > 0 ? spec.colors : frame.palette;
  const color = (index: number): string => colors[index % colors.length];
  const unit = spec.unit ?? "";
  const parts: string[] = [];
  const pie = spec.kind === "pie" || spec.kind === "donut";
  const named = spec.series.filter((item) => item.name);
  const showLegend = spec.legend ?? (pie || named.length > 1);
  let top = size * 0.6;
  if (showLegend) {
    const items = pie
      ? spec.labels.map((label, index) => ({ name: label, color: color(index) }))
      : spec.series.map((item, index) => ({ name: item.name || `Series ${index + 1}`, color: color(index) }));
    const legend = legendRow(items, { ...frame, width }, top + size * 0.5);
    parts.push(legend.svg);
    top += legend.height;
  }

  if (pie) {
    const values = spec.series[0].values;
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const radius = Math.max(Math.min(width, height - top) / 2 - size * 0.8, 10);
    const cx = width / 2;
    const cy = top + (height - top) / 2;
    const inner = spec.kind === "donut" ? radius * 0.58 : 0;
    let angle = -Math.PI / 2;
    const showValues = spec.showValues ?? true;
    values.forEach((value, index) => {
      const sweep = value / total * Math.PI * 2;
      const end = angle + sweep;
      const point = (r: number, a: number): string => `${round(cx + r * Math.cos(a))} ${round(cy + r * Math.sin(a))}`;
      const large = sweep > Math.PI ? 1 : 0;
      const path = sweep >= Math.PI * 2 - 1e-6
        ? `M ${point(radius, angle)} A ${radius} ${radius} 0 1 1 ${point(radius, angle + Math.PI)} A ${radius} ${radius} 0 1 1 ${point(radius, angle)} Z`
        : inner > 0
          ? `M ${point(radius, angle)} A ${radius} ${radius} 0 ${large} 1 ${point(radius, end)} L ${point(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, angle)} Z`
          : `M ${cx} ${cy} L ${point(radius, angle)} A ${radius} ${radius} 0 ${large} 1 ${point(radius, end)} Z`;
      parts.push(`<path d="${path}" fill="${color(index)}" stroke="${frame.grid}" stroke-width="1"/>`);
      const labelSize = size * 0.85;
      const label = unit ? chartValue(value, unit) : `${Math.round(value / total * 100)}%`;
      const labelRadius = inner > 0 ? (radius + inner) / 2 : radius * 0.64;
      // A value is written on its slice only where the slice has room for it.
      const room = inner > 0 ? radius - inner : radius * 0.7;
      if (showValues && room > labelSize * 1.6 && sweep * labelRadius > textWidth(label, labelSize) * 1.2) {
        const middle = angle + sweep / 2;
        parts.push(text(cx + labelRadius * Math.cos(middle), cy + labelRadius * Math.sin(middle), label, labelSize, "#ffffff", "middle", 700));
      }
      angle = end;
    });
  } else {
    const horizontal = spec.kind === "hbar";
    const values = spec.series.flatMap((item) => item.values);
    const highest = spec.max ?? Math.max(...values, 0);
    const lowest = Math.min(...values, 0);
    const scale = ticks(lowest, highest);
    const minimum = scale[0];
    const maximum = Math.max(scale[scale.length - 1], spec.max ?? -Infinity);
    const tickLabels = scale.map((value) => chartValue(value, unit));
    const valueSize = size * 0.8;
    const categorySize = size * 0.85;
    const left = horizontal
      ? Math.max(...spec.labels.map((label) => textWidth(label, categorySize))) + size * 0.8
      : Math.max(...tickLabels.map((label) => textWidth(label, valueSize))) + size * 0.8;
    const bottom = horizontal ? valueSize * 2 : categorySize * 2.2;
    const plot = { x: left, y: top + size * 0.6, width: Math.max(width - left - size, 10), height: Math.max(height - top - size * 0.6 - bottom, 10) };
    const along = (value: number): number => (value - minimum) / (maximum - minimum || 1);

    // Grid lines and value labels, then the categories along the other axis.
    for (const [index, value] of scale.entries()) {
      if (horizontal) {
        const x = plot.x + along(value) * plot.width;
        parts.push(`<line x1="${round(x)}" y1="${round(plot.y)}" x2="${round(x)}" y2="${round(plot.y + plot.height)}" stroke="${frame.grid}" stroke-width="1"/>`);
        parts.push(text(x, plot.y + plot.height + valueSize, tickLabels[index], valueSize, frame.muted));
      } else {
        const y = plot.y + plot.height - along(value) * plot.height;
        parts.push(`<line x1="${round(plot.x)}" y1="${round(y)}" x2="${round(plot.x + plot.width)}" y2="${round(y)}" stroke="${frame.grid}" stroke-width="1"/>`);
        parts.push(text(plot.x - size * 0.4, y, tickLabels[index], valueSize, frame.muted, "end"));
      }
    }

    const count = spec.labels.length;
    const band = (horizontal ? plot.height : plot.width) / count;
    spec.labels.forEach((label, index) => {
      const middle = (horizontal ? plot.y : plot.x) + band * (index + 0.5);
      if (horizontal) parts.push(text(plot.x - size * 0.4, middle, label, categorySize, frame.foreground, "end"));
      else parts.push(text(middle, plot.y + plot.height + categorySize * 1.1, label, categorySize, frame.foreground));
    });

    const zero = along(Math.max(minimum, 0));
    const showValues = spec.showValues ?? (spec.kind !== "line" && spec.series.length === 1 && count <= 12);
    if (spec.kind === "line") {
      spec.series.forEach((item, seriesIndex) => {
        const points = item.values.map((value, index) => ({
          x: plot.x + band * (index + 0.5),
          y: plot.y + plot.height - along(value) * plot.height,
          value,
        }));
        const stroke = Math.max(size * 0.16, 2);
        parts.push(`<polyline points="${points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ")}" fill="none" stroke="${color(seriesIndex)}" stroke-width="${round(stroke)}" stroke-linejoin="round" stroke-linecap="round"/>`);
        for (const point of points) {
          parts.push(`<circle cx="${round(point.x)}" cy="${round(point.y)}" r="${round(stroke * 1.6)}" fill="${color(seriesIndex)}"/>`);
          if (showValues) parts.push(text(point.x, point.y - valueSize, chartValue(point.value, unit), valueSize, frame.foreground));
        }
      });
    } else {
      const groups = spec.series.length;
      const barBand = band * 0.72;
      const thickness = barBand / groups;
      spec.series.forEach((item, seriesIndex) => {
        item.values.forEach((value, index) => {
          const offset = band * index + (band - barBand) / 2 + thickness * seriesIndex;
          const start = Math.min(along(value), zero);
          const length = Math.abs(along(value) - zero);
          const radius = Math.min(thickness * 0.12, size * 0.25);
          if (horizontal) {
            const x = plot.x + start * plot.width;
            const y = plot.y + offset;
            parts.push(`<rect x="${round(x)}" y="${round(y)}" width="${round(length * plot.width)}" height="${round(thickness * 0.92)}" rx="${round(radius)}" fill="${color(seriesIndex)}"/>`);
            if (showValues) parts.push(text(x + length * plot.width + size * 0.3, y + thickness * 0.46, chartValue(value, unit), valueSize, frame.foreground, "start", 600));
          } else {
            const x = plot.x + offset;
            const y = plot.y + plot.height - (start + length) * plot.height;
            parts.push(`<rect x="${round(x)}" y="${round(y)}" width="${round(thickness * 0.92)}" height="${round(length * plot.height)}" rx="${round(radius)}" fill="${color(seriesIndex)}"/>`);
            if (showValues) parts.push(text(x + thickness * 0.46, y - valueSize * 0.8, chartValue(value, unit), valueSize, frame.foreground, "middle", 600));
          }
        });
      });
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}" role="img" font-family="inherit">${parts.join("")}</svg>`;
}
