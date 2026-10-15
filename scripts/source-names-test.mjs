#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// The VS Code extension compiles the shared module as it ships, so this tests what both editors run.
const {
  analyzeNames,
  formulaEscapes,
  nameCompletions,
  nameDefinition,
  nameDiagnostics,
  nameHover,
  nameReferences,
  prepareNameRename,
  renameName,
} = require(resolve(packageRoot, "packages", "vscode-frameseq", "out", "shared", "source-names.js"));

const source = `presentation("Names");

slide("Pipeline").canvas();
// rect("Ignored").as("comment")
rect("Encoder").as("encoder").position({ x: 80, y: 120 });
rect("Decoder").fill("#fff").as("decoder").rightOf("encoder", 120);
line().from("encoder.right").to("decoder").arrow("end");
text("ref(\\"not a name\\")").below("decodr");
at("legend").row();
text("Legend");
at("legend/key");
ref("legend/key").gap(8);

slide("Grid").grid(2);
at("cell1/now").card();
at("left");
group("first", "second");
line().from("cell1/now.middle");

slide("Helpers");
stages.forEach((stage) => rect(stage).as(stage));
ref("anything");
`;

const at = (needle, shift = 0) => {
  const found = source.indexOf(needle);
  assert.notEqual(found, -1, `Missing fixture text: ${needle}`);
  return found + shift;
};
const text = ({ start, end }) => source.slice(start, end);

const [pipeline, grid, helpers] = analyzeNames(source);
assert.deepEqual(
  pipeline.definitions.map(({ name, kind, command }) => ({ name, kind, command })),
  [
    { name: "encoder", kind: "object", command: "rect" },
    { name: "decoder", kind: "object", command: "rect" },
    { name: "legend", kind: "region", command: "at" },
    { name: "legend/key", kind: "region", command: "at" },
  ],
);
assert.deepEqual(
  pipeline.references.map(({ name, side, command }) => ({ name, side, command })),
  [
    { name: "encoder", side: undefined, command: "rightOf" },
    { name: "encoder", side: "right", command: "from" },
    { name: "decoder", side: undefined, command: "to" },
    { name: "decodr", side: undefined, command: "below" },
    { name: "legend/key", side: undefined, command: "ref" },
  ],
);
assert.equal(pipeline.dynamic, false);
assert.deepEqual(grid.layoutRegions, ["main", "cell0", "cell1"]);
assert.equal(helpers.dynamic, true, "a name built at runtime makes the slide's names unknowable");

// Diagnostics: a mistyped name with a suggestion, a layout region the slide does not have, an
// object referred to by a region path, an unknown anchor side, and nothing on the helper slide.
const diagnostics = nameDiagnostics(source);
assert.deepEqual(
  diagnostics.map((diagnostic) => [text(diagnostic), diagnostic.message.split(".")[0]]),
  [
    ["decodr", 'No object or region on this slide is named "decodr"'],
    ["left", 'at("left") needs a split layout; call slide()'],
    ["first", 'No object or region on this slide is named "first"'],
    ["second", 'No object or region on this slide is named "second"'],
    ["middle", '"middle" is not an anchor'],
  ],
);
assert.match(diagnostics[0].message, /Did you mean "decoder"\?/);

// Completion: names where a name is expected, anchor sides after a dot, regions in at().
const names = nameCompletions(source, at('below("decodr', 'below("'.length));
assert.deepEqual(names.items.map((item) => item.label), ["encoder", "decoder", "legend", "legend/key"]);
assert.equal(text({ start: names.from, end: names.to }), "decodr");
const sides = nameCompletions(source, at('from("encoder.right', 'from("encoder.'.length));
assert.ok(sides.items.some((item) => item.label === "top-left"));
assert.equal(text({ start: sides.from, end: sides.to }), "right");
const regions = nameCompletions(source, at('at("cell1/now', 'at("'.length));
assert.deepEqual(regions.items.map((item) => item.label), ["main", "cell0", "cell1", "cell1/now"]);
assert.equal(nameCompletions(source, at('as("encoder', 'as("'.length)), undefined, "a new name has nothing to complete");
// A string still being typed completes too.
const typing = 'presentation("T");\nslide("S");\nrect("A").as("alpha");\nref("al';
assert.deepEqual(nameCompletions(typing, typing.length).items.map((item) => item.label), ["alpha"]);

// Definition and references: a connector leads to the .as() that named the object, and a
// segment of a path leads to the at() that made that region.
assert.equal(text(nameDefinition(source, at('to("decoder', 'to("'.length))), "decoder");
assert.equal(nameDefinition(source, at('to("decoder', 'to("'.length)).start, at('as("decoder', 'as("'.length));
assert.equal(nameDefinition(source, at('ref("legend/key', 'ref("le'.length)).name, "legend");
assert.deepEqual(
  nameReferences(source, at('as("encoder', 'as("'.length)).map(text),
  ["encoder", "encoder", "encoder"],
);
assert.equal(nameReferences(source, at('at("legend")', 'at("'.length)).length, 3);

// Rename: every use on the slide, including the paths of regions inside a renamed region.
const renamed = (edits) => {
  let result = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
};
const encoder = renamed(renameName(source, at('as("encoder', 'as("'.length), "source"));
assert.match(encoder, /\.as\("source"\)/);
assert.match(encoder, /\.rightOf\("source", 120\)/);
assert.match(encoder, /\.from\("source\.right"\)/);
const legend = renamed(renameName(source, at('at("legend")', 'at("'.length), "key"));
assert.match(legend, /at\("key"\)\.row\(\);/);
assert.match(legend, /at\("key\/key"\);/);
assert.match(legend, /ref\("key\/key"\)/);
assert.match(renameName(source, at('as("encoder', 'as("'.length), "decoder").error, /already named "decoder"/);
assert.match(renameName(source, at('as("encoder', 'as("'.length), "two words").error, /is not a name/);
assert.match(renameName(source, at('at("legend/key', 'at("legend/k'.length), "other/key").error, /keeps that parent/);
assert.match(prepareNameRename(source, at('at("cell1/now', 'at("ce'.length)).error, /layout owns/);
assert.equal(prepareNameRename(source, at('at("cell1/now', 'at("cell1/n'.length)).name, "cell1/now");

// Hover says what a name is and how often it is used.
assert.match(nameHover(source, at('as("encoder', 'as("'.length)).text, /Object "encoder": rect\(\) named on line 5\. Referred to 2 times/);
assert.match(nameHover(source, at('at("legend")', 'at("'.length)).text, /Region "legend": region made by at\(\) on line 9/);

// A formula in a quoted string loses the backslashes its escapes take; a template keeps them.
// A doubled backslash, a character code, a template, code(), and prices are left alone.
const formulaLines = [
  String.raw`text("Area $\frac{1}{2}ab$ and $\alpha$").lead();`,
  String.raw`text("$\\frac{1}{2}$ is escaped");`,
  String.raw`text${"`"}$\frac{1}{2}$ is a template${"`"};`,
  String.raw`bullets("$\theta$", "plain");`,
  String.raw`code("echo $HOME\n$PATH");`,
  String.raw`math("\sqrt{2}");`,
  String.raw`text("Costs $5 and $10, or é $x²$");`,
  String.raw`at("side").text("$\delta \, x$");`,
];
const formulaSource = formulaLines.join("\n");
const formulas = formulaEscapes(formulaSource);
const fixedLine = (item, line) => (
  formulaSource.slice(0, item.fix.start) + item.fix.text + formulaSource.slice(item.fix.end)
).split("\n")[line];
assert.deepEqual(formulas.map((item) => [item.command, item.escapes, item.fix.kind]), [
  ["text", ["\\frac", "\\alpha"], "template"],
  ["bullets", ["\\theta"], "double"],
  ["math", ["\\sqrt"], "template"],
  ["text", ["\\delta", "\\,"], "double"],
]);
assert.equal(fixedLine(formulas[0], 0), String.raw`text${"`"}Area $\frac{1}{2}ab$ and $\alpha$${"`"}.lead();`);
assert.equal(fixedLine(formulas[1], 3), String.raw`bullets("$\\theta$", "plain");`);
assert.equal(fixedLine(formulas[2], 5), String.raw`math${"`"}\sqrt{2}${"`"};`);
assert.equal(fixedLine(formulas[3], 7), String.raw`at("side").text("$\\delta \\, x$");`);
// The escapes that were meant are read as JavaScript reads them when the string becomes a template.
const [meant] = formulaEscapes(String.raw`text("Line one\nsays \"$\beta$\"");`);
assert.equal(meant.fix.text, "`Line one\nsays \"$\\beta$\"`");

console.log("Source names test passed: definitions, references, layout regions, diagnostics, completion, definition, references, rename, hover, and formulas that lost a backslash.");
