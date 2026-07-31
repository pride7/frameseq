import assert from "node:assert/strict";
import { note, presentation, slide, text } from "../lib/index.js";

const slides = presentation("Notes test");

// note() is the linear form of slide().notes().
const first = slide("Linear notes");
note("Introduce the idea, then pause.");
assert.equal(slides.slides[0].props.notes, "Introduce the idea, then pause.");
assert.equal(slide("Chained notes").notes("Same result").node.props.notes, "Same result");

// It returns the slide, so slide-level modifiers still chain.
slide("Returns the slide");
assert.equal(note("Details").allowEmpty().node.props.allowEmpty, true);

// Repeated calls append a line, so notes can sit beside the content they explain.
slide("Notes beside content");
text("First point");
note("Explain the first point.");
text("Second point");
note("Compare it with the first.");
assert.equal(
  slides.slides[3].props.notes,
  "Explain the first point.\nCompare it with the first.",
);

// Notes written on the slide itself are kept and extended, not replaced.
slide("Existing notes").notes("Written on the slide.");
note("Added later.");
assert.equal(slides.slides[4].props.notes, "Written on the slide.\nAdded later.");

// Notes belong to the current slide only.
assert.equal(first.node.props.notes, "Introduce the idea, then pause.");

console.log("notes-test: all checks passed");
