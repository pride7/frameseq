export {};

declare global {
  const presentation: typeof import("./script").presentation;
  const slide: typeof import("./script").slide;
  const text: typeof import("./script").text;
  const image: typeof import("./script").image;
  const code: typeof import("./script").code;
  const math: typeof import("./script").math;
  const typst: typeof import("./script").typst;
  const typstFile: typeof import("./script").typstFile;
  const rect: typeof import("./script").rect;
  const circle: typeof import("./script").circle;
  const line: typeof import("./script").line;
  const bullets: typeof import("./script").bullets;
  const steps: typeof import("./script").steps;
  const metric: typeof import("./script").metric;
  const main: typeof import("./script").main;
  const left: typeof import("./script").left;
  const right: typeof import("./script").right;
  const cell: typeof import("./script").cell;
  const gap: typeof import("./script").gap;

  const px: typeof import("./core").px;
  const pt: typeof import("./core").pt;
  const rem: typeof import("./core").rem;
  const percent: typeof import("./core").percent;
  const vw: typeof import("./core").vw;
  const vh: typeof import("./core").vh;
  const defineTheme: typeof import("./theme").defineTheme;
  const themes: typeof import("./theme").themes;
}
