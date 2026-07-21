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

console.log("Theme test passed: default, built-in, custom, and background override behavior.");
