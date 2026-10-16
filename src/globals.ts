/// <reference path="./modules.d.ts" preserve="true" />
export {};

declare global {
  const presentation: typeof import("./script").presentation;
  const poster: typeof import("./script").poster;
  const slide: typeof import("./script").slide;
  const master: typeof import("./script").master;
  const placeholder: typeof import("./script").placeholder;
  const note: typeof import("./script").note;
  const text: typeof import("./script").text;
  const image: typeof import("./script").image;
  const code: typeof import("./script").code;
  const math: typeof import("./script").math;
  const typst: typeof import("./script").typst;
  const typstFile: typeof import("./script").typstFile;
  const latex: typeof import("./script").latex;
  const latexFile: typeof import("./script").latexFile;
  const rect: typeof import("./script").rect;
  const circle: typeof import("./script").circle;
  const shape: typeof import("./script").shape;
  const polygon: typeof import("./script").polygon;
  const line: typeof import("./script").line;
  const bullets: typeof import("./script").bullets;
  const steps: typeof import("./script").steps;
  const metric: typeof import("./script").metric;
  const spacer: typeof import("./script").spacer;
  const table: typeof import("./script").table;
  const chart: typeof import("./script").chart;
  const qr: typeof import("./script").qr;
  const icon: typeof import("./script").icon;
  const cite: typeof import("./script").cite;
  const footnote: typeof import("./script").footnote;
  const references: typeof import("./script").references;
  const group: typeof import("./script").group;
  const ref: typeof import("./script").ref;
  const card: typeof import("./script").card;
  const gridSection: typeof import("./script").gridSection;
  const main: typeof import("./script").main;
  const left: typeof import("./script").left;
  const right: typeof import("./script").right;
  const cell: typeof import("./script").cell;
  const at: typeof import("./script").at;
  const gap: typeof import("./script").gap;

  const px: typeof import("./core").px;
  const pt: typeof import("./core").pt;
  const mm: typeof import("./core").mm;
  const rem: typeof import("./core").rem;
  const percent: typeof import("./core").percent;
  const vw: typeof import("./core").vw;
  const vh: typeof import("./core").vh;
  const defineTheme: typeof import("./theme").defineTheme;
  const themes: typeof import("./theme").themes;
}
