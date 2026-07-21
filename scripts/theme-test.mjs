import assert from "node:assert/strict";
import {
  defineTheme,
  presentation,
  themes,
} from "../lib/index.js";

const blankDeck = presentation("Blank by default");
assert.equal(blankDeck.theme.name, "blank");
assert.equal(blankDeck.theme.colors.background, "#ffffff");

const midnightDeck = presentation({
  title: "Built-in theme",
  theme: "midnight",
});
assert.equal(midnightDeck.theme.name, "midnight");
assert.equal(midnightDeck.theme.colors.accent, "#22d3ee");

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
const customDeck = presentation({ title: "Custom theme", theme: ocean });
assert.equal(customDeck.theme.name, "ocean");
assert.equal(customDeck.theme.colors.background, "#effcff");
assert.equal(customDeck.theme.colors.foreground, themes.blank.colors.foreground);
assert.equal(customDeck.theme.radii.medium, "4px");

const overriddenDeck = presentation({
  title: "Legacy background override",
  theme: "paper",
  background: "hotpink",
});
assert.equal(overriddenDeck.theme.colors.background, "hotpink");
assert.equal(overriddenDeck.theme.coverBackground, "hotpink");
assert.equal(themes.paper.colors.background, "#f7f3e8");

const madridDeck = presentation({
  title: "Academic talk",
  author: "Ada Lovelace",
  institute: "Analytical Engine Institute",
  date: "2026",
  theme: "beamer-madrid",
});
assert.equal(madridDeck.author, "Ada Lovelace");
assert.equal(madridDeck.institute, "Analytical Engine Institute");
assert.equal(madridDeck.date, "2026");
assert.equal(madridDeck.theme.family, "beamer");
assert.equal(madridDeck.theme.chrome.titleBar, true);
assert.equal(madridDeck.theme.chrome.footer, true);
assert.equal(madridDeck.theme.chrome.slideNumber, true);

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

const minimalAcademicDeck = presentation({
  title: "Minimal Academic Theme",
  subtitle: "A restrained presentation style",
  theme: "minimal-academic",
});
assert.equal(minimalAcademicDeck.subtitle, "A restrained presentation style");
assert.equal(minimalAcademicDeck.theme.coverLayout, "academic-left");
assert.equal(minimalAcademicDeck.theme.colors.accent, "#24528b");
assert.equal(minimalAcademicDeck.theme.colors.error, "#b4322f");
assert.equal(minimalAcademicDeck.theme.chrome.titleBarStyle, "underline");
assert.equal(minimalAcademicDeck.theme.chrome.footerLayout, "title");
assert.equal(minimalAcademicDeck.theme.chrome.autoTitlePage, true);

console.log("Theme test passed: default, built-in, Beamer, custom, metadata, and override behavior.");
