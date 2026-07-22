import assert from "node:assert/strict";
import {
  defineTheme,
  presentation,
  themes,
} from "../lib/index.js";

const blankSlides = presentation("Blank by default");
assert.equal(blankSlides.theme.name, "blank");
assert.equal(blankSlides.theme.colors.background, "#ffffff");

const midnightSlides = presentation({
  title: "Built-in theme",
  theme: "midnight",
});
assert.equal(midnightSlides.theme.name, "midnight");
assert.equal(midnightSlides.theme.colors.accent, "#22d3ee");

const ocean = defineTheme({
  name: "ocean",
  extends: "blank",
  colors: {
    background: "#effcff",
    accent: "#007c91",
  },
  radii: {
    medium: "4px",
  },
});
const customSlides = presentation({ title: "Custom theme", theme: ocean });
assert.equal(customSlides.theme.name, "ocean");
assert.equal(customSlides.theme.colors.background, "#effcff");
assert.equal(customSlides.theme.colors.foreground, themes.blank.colors.foreground);
assert.equal(customSlides.theme.radii.medium, "4px");

const overriddenSlides = presentation({
  title: "Legacy background override",
  theme: "paper",
  background: "hotpink",
});
assert.equal(overriddenSlides.theme.colors.background, "hotpink");
assert.equal(overriddenSlides.theme.coverBackground, "hotpink");
assert.equal(themes.paper.colors.background, "#f7f3e8");

const madridSlides = presentation({
  title: "Academic talk",
  author: "Ada Lovelace",
  institute: "Analytical Engine Institute",
  date: "2026",
  theme: "beamer-madrid",
});
assert.equal(madridSlides.author, "Ada Lovelace");
assert.equal(madridSlides.institute, "Analytical Engine Institute");
assert.equal(madridSlides.date, "2026");
assert.equal(madridSlides.theme.family, "beamer");
assert.equal(madridSlides.theme.chrome.titleBar, true);
assert.equal(madridSlides.theme.chrome.footer, true);
assert.equal(madridSlides.theme.chrome.slideNumber, true);

const quietMadrid = defineTheme({
  name: "quiet-madrid",
  extends: "beamer-madrid",
  chrome: {
    footer: false,
  },
});
assert.equal(quietMadrid.family, "beamer");
assert.equal(quietMadrid.chrome.titleBar, true);
assert.equal(quietMadrid.chrome.footer, false);
assert.equal(themes["beamer-cambridge-us"].colors.accent, "#8b1e3f");

const minimalAcademicSlides = presentation({
  title: "Minimal Academic Theme",
  subtitle: "A restrained presentation style",
  theme: "minimal-academic",
  font: {
    family: "Inter, sans-serif",
    size: 24,
    heading: { family: "Georgia, serif", weight: 700 },
    code: { family: "Consolas, monospace", size: 17 },
  },
});
assert.equal(minimalAcademicSlides.subtitle, "A restrained presentation style");
assert.equal(minimalAcademicSlides.theme.coverLayout, "academic-left");
assert.equal(minimalAcademicSlides.theme.colors.accent, "#24528b");
assert.equal(minimalAcademicSlides.theme.colors.error, "#b4322f");
assert.equal(minimalAcademicSlides.theme.chrome.titleBarStyle, "underline");
assert.equal(minimalAcademicSlides.theme.chrome.footerLayout, "title");
assert.equal(minimalAcademicSlides.theme.chrome.autoTitlePage, true);
assert.equal(minimalAcademicSlides.font?.family, "Inter, sans-serif");
assert.equal(minimalAcademicSlides.font?.size, 24);
assert.equal(minimalAcademicSlides.font?.heading?.family, "Georgia, serif");
assert.equal(minimalAcademicSlides.font?.heading?.weight, 700);
assert.equal(minimalAcademicSlides.font?.code?.family, "Consolas, monospace");
assert.equal(minimalAcademicSlides.font?.code?.size, 17);

console.log("Theme test passed: default, built-in, Beamer, custom, metadata, and override behavior.");
