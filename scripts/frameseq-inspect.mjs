import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";
import ts from "typescript";

const contentCommands = new Set([
  "text",
  "bullets",
  "steps",
  "metric",
  "group",
  "card",
  "gridSection",
  "image",
  "code",
  "math",
  "typst",
  "typstFile",
  "latex",
  "latexFile",
  "rect",
  "circle",
  "shape",
  "polygon",
  "junction",
  "cells",
  "line",
  "table",
  "chart",
  "qr",
  "icon",
  "row",
  "column",
  "stack",
  "placeholder",
]);

const layoutPriority = ["cover", "canvas", "split", "grid", "center", "fullBleed"];
const regionContentCommands = new Set([
  "lead", "text", "bullets", "steps", "code", "math", "image", "caption", "quote", "metric", "custom",
]);
const editableMethods = new Map([
  ["width", ["width"]], ["height", ["height"]],
  ["minWidth", ["minWidth"]], ["minHeight", ["minHeight"]],
  ["maxWidth", ["maxWidth"]], ["maxHeight", ["maxHeight"]],
  ["gap", ["gap"]], ["padding", ["padding", "paddingHorizontal"]],
  ["margin", ["margin", "marginHorizontal"]],
  ["fontSize", ["fontSize"]], ["size", ["fontSize"]],
  ["fontWeight", ["fontWeight"]], ["weight", ["fontWeight"]],
  ["lineHeight", ["lineHeight"]], ["textAlign", ["textAlign"]],
  ["rotate", ["rotation"]], ["strokeWidth", ["strokeWidth"]],
  ["color", ["color"]], ["background", ["background"]],
  ["fill", ["fill"]], ["stroke", ["stroke"]], ["border", ["border"]],
  ["radius", ["radius"]], ["opacity", ["opacity"]], ["arrow", ["arrow"]],
  ["align", ["align"]], ["justify", ["justify"]],
  ["anchor", ["anchor", "anchorMargin"]], ["grid", ["columns", "gridGap"]],
]);

function location(sourceFile, node) {
  const value = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: value.line + 1,
    character: value.character + 1,
  };
}

function staticString(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function objectInitializer(node, name) {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || propertyName(property.name) !== name) continue;
    return property.initializer;
  }
  return undefined;
}

function objectString(node, name) {
  return staticString(objectInitializer(node, name));
}

function findIdentifierCall(root, name) {
  return findIdentifierCalls(root, name)[0];
}

function findIdentifierCalls(root, name) {
  const results = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === name) {
      results.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return results;
}

/**
 * Where a slide's speaker notes are written: the argument of each notes() or note() call, or the
 * notes option. The text is given only when it is a plain string the statement writes once, so
 * an editor can rewrite it; notes built from expressions, or in loops and functions, have none.
 */
function noteSource(sourceFile, node, direct) {
  if (!node) return undefined;
  const value = direct ? staticString(node) : undefined;
  const { start, end } = sourceRange(sourceFile, node);
  return value === undefined ? { start, end } : { start, end, value };
}

function methodCalls(root, after) {
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.getStart() >= after) {
      calls.push({
        name: node.expression.name.text,
        node,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return calls.sort((left, right) => left.node.getStart() - right.node.getStart());
}

function staticValue(node) {
  if (!node) return undefined;
  if (ts.isNumericLiteral(node)) return { kind: "number", value: Number(node.text) };
  if (ts.isPrefixUnaryExpression(node)
    && node.operator === ts.SyntaxKind.MinusToken
    && ts.isNumericLiteral(node.operand)) {
    return { kind: "number", value: -Number(node.operand.text) };
  }
  const string = staticString(node);
  if (string !== undefined) return { kind: "string", value: string };
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { kind: "boolean", value: true };
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { kind: "boolean", value: false };
  return undefined;
}

function editableProperty(sourceFile, name, node) {
  const value = staticValue(node);
  if (!value) return undefined;
  return {
    name,
    ...value,
    source: sourceRange(sourceFile, node),
    expected: node.getText(sourceFile),
  };
}

function callChain(node) {
  const methods = [];
  let current = node;
  let root = node;
  while (current.parent) {
    if (ts.isPropertyAccessExpression(current.parent) && current.parent.expression === current) {
      current = current.parent;
      root = current;
      continue;
    }
    if (ts.isCallExpression(current.parent) && current.parent.expression === current) {
      current = current.parent;
      root = current;
      if (ts.isPropertyAccessExpression(current.expression)) {
        methods.push({ name: current.expression.name.text, node: current });
      }
      continue;
    }
    break;
  }
  return { root, methods };
}

function callOriginName(expression) {
  let current = expression;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  while (ts.isCallExpression(current)) {
    if (ts.isIdentifier(current.expression)) return current.expression.text;
    if (!ts.isPropertyAccessExpression(current.expression)) return undefined;
    current = current.expression.expression;
    while (ts.isPropertyAccessExpression(current)) current = current.expression;
  }
  // text`...`.lead() starts from the template's tag, as text("...").lead() does from its command.
  if (ts.isTaggedTemplateExpression(current)) current = current.tag;
  return ts.isIdentifier(current) ? current.text : undefined;
}

function contentType(node) {
  if (!ts.isCallExpression(node)) return undefined;
  if (ts.isIdentifier(node.expression) && contentCommands.has(node.expression.text)) {
    return node.expression.text;
  }
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  const name = node.expression.name.text;
  if (!contentCommands.has(name) && !regionContentCommands.has(name)) return undefined;
  const origin = callOriginName(node.expression.expression);
  if (origin && contentCommands.has(origin)) return undefined;
  if (["at", "main", "left", "right", "cell"].includes(origin)) {
    return regionContentCommands.has(name) ? name : undefined;
  }
  return name;
}

/**
 * The literal values an object's commands state. A value the code computes is collected in
 * `computed` instead, so an editor can show it without offering to overwrite it.
 */
function objectProperties(sourceFile, node, chain, computed = []) {
  const properties = [];
  const add = (name, value) => {
    const editable = editableProperty(sourceFile, name, value);
    if (editable) properties.push(editable);
    else computed.push({ name, text: value.getText(sourceFile), source: sourceRange(sourceFile, value) });
  };
  const addObjectProperties = (object, names) => {
    if (!object || !ts.isObjectLiteralExpression(object)) return;
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = propertyName(property.name);
      if (!name || !names.includes(name)) continue;
      add(name, property.initializer);
    }
  };

  if (ts.isCallExpression(node) && contentType(node) === "line") {
    addObjectProperties(node.arguments[0], ["x1", "y1", "x2", "y2"]);
  }
  for (const method of chain.methods) {
    if (method.name === "position") {
      addObjectProperties(method.node.arguments[0], ["x", "y"]);
      continue;
    }
    const names = editableMethods.get(method.name);
    if (!names) continue;
    method.node.arguments.forEach((argument, index) => add(names[index] ?? `${method.name}${index + 1}`, argument));
  }
  return properties;
}

/**
 * The path literal of a file beside the slide document, written as
 * new URL("./images/photo.png", import.meta.url).href so the build finds it.
 */
function assetPath(node) {
  if (!node || !ts.isPropertyAccessExpression(node) || node.name.text !== "href") return undefined;
  const url = node.expression;
  if (!ts.isNewExpression(url) || !ts.isIdentifier(url.expression) || url.expression.text !== "URL") return undefined;
  const [path, base] = url.arguments ?? [];
  if (!base || base.getText() !== "import.meta.url") return undefined;
  return path && (ts.isStringLiteral(path) || ts.isNoSubstitutionTemplateLiteral(path)) ? path : undefined;
}

/** The text of a literal as the command receives it: a tagged template keeps its backslashes. */
function templateText(node) {
  return node.rawText ?? node.getText().slice(1, -1);
}

/**
 * The strings an object's command was given, each a literal that can be rewritten in place: the
 * text of a text object, an image's path, the items of a list. A tagged template stands for its
 * raw text, since that is what latex`...` and text`...` receive.
 */
function objectTexts(sourceFile, node) {
  if (ts.isTaggedTemplateExpression(node)) {
    if (!ts.isNoSubstitutionTemplateLiteral(node.template)) return [];
    return [{
      name: "content",
      kind: "string",
      value: templateText(node.template),
      raw: true,
      argument: 0,
      source: sourceRange(sourceFile, node.template),
      expected: node.template.getText(sourceFile),
    }];
  }
  if (!ts.isCallExpression(node)) return [];
  return node.arguments.flatMap((argument, index) => {
    const literal = assetPath(argument) ?? argument;
    if (!ts.isStringLiteral(literal) && !ts.isNoSubstitutionTemplateLiteral(literal)) return [];
    return [{ ...editableProperty(sourceFile, "content", literal), argument: index }];
  });
}

/**
 * The cells of a table written as rows of literals, by row and column, so each can be typed
 * into on the slide. A cell the code works out is left out, and so is a row that is not an
 * array written in place.
 */
function tableCells(sourceFile, node) {
  const rows = ts.isCallExpression(node) ? node.arguments[0] : undefined;
  if (!rows || !ts.isArrayLiteralExpression(rows)) return [];
  return rows.elements.flatMap((row, rowIndex) => {
    if (!ts.isArrayLiteralExpression(row)) return [];
    return row.elements.flatMap((cell, column) => {
      const editable = ts.isStringLiteral(cell) || ts.isNoSubstitutionTemplateLiteral(cell) || staticValue(cell)?.kind === "number"
        ? editableProperty(sourceFile, "cell", cell)
        : undefined;
      return editable ? [{ ...editable, argument: 0, row: rowIndex, column }] : [];
    });
  });
}

/**
 * Where a table's rows and their cells are written, so rows and columns can be added and taken
 * away: the array of rows, and each row's array and its cells, by offset. Undefined unless every
 * row is an array written in place.
 */
function tableShape(sourceFile, node) {
  const rows = ts.isCallExpression(node) ? node.arguments[0] : undefined;
  if (!rows || !ts.isArrayLiteralExpression(rows) || !rows.elements.every((row) => ts.isArrayLiteralExpression(row))) return undefined;
  const range = (item) => ({ start: item.getStart(sourceFile), end: item.getEnd() });
  return {
    ...range(rows),
    rows: rows.elements.map((row) => ({ ...range(row), cells: row.elements.map(range) })),
  };
}

/** The argument a shape's label is, by its command: shape() and polygon() take it second. */
const labelArguments = new Map([["rect", 0], ["circle", 0], ["junction", 0], ["shape", 1], ["polygon", 1]]);

/**
 * Where a label goes in a shape written without one, such as rect() or shape("diamond"), so
 * words typed on it can be written in: the offset, and what goes before the string there.
 */
function labelInsertion(node, type) {
  const argument = labelArguments.get(type);
  if (argument === undefined || !ts.isCallExpression(node) || node.arguments.length !== argument) return undefined;
  const last = node.arguments[node.arguments.length - 1];
  return last ? { at: last.getEnd(), prefix: ", " } : { at: node.arguments.pos, prefix: "" };
}

/**
 * How the chain of methods after an object's command can change: each call with the range that
 * removes it, the whitespace before its dot included, and where a new call goes, on a line of
 * its own when the last call has one.
 */
function chainEdits(sourceFile, chain) {
  const text = sourceFile.text;
  const methods = chain.methods.map((method) => {
    const access = method.node.expression;
    const nameStart = access.name.getStart(sourceFile);
    const dot = text.lastIndexOf(".", nameStart);
    const before = access.expression.getEnd();
    return {
      name: method.name,
      start: dot,
      end: method.node.getEnd(),
      nameStart,
      nameEnd: access.name.getEnd(),
      arguments: method.node.arguments.length,
      removeFrom: text.slice(before, dot).trim() ? dot : before,
    };
  });
  const last = methods[methods.length - 1];
  let indent;
  if (last) {
    const lineStart = text.lastIndexOf("\n", last.start - 1) + 1;
    const leading = text.slice(lineStart, last.start);
    if (!leading.trim()) indent = leading;
  }
  const statement = chain.root.parent && ts.isExpressionStatement(chain.root.parent)
    ? { start: chain.root.parent.getStart(sourceFile), end: chain.root.parent.getEnd() }
    : undefined;
  return {
    methods,
    append: { at: chain.root.getEnd(), ...(indent === undefined ? {} : { indent }) },
    ...(statement ? { statement } : {}),
  };
}

function objectName(node, chain) {
  const named = chain.methods.find((method) => method.name === "as");
  return staticString(named?.node.arguments[0]);
}

const placementMethods = new Set(["rightOf", "leftOf", "above", "below", "centerOn", "alignTop", "alignLeft", "from", "to"]);

/** The names an object is placed against or connects, so deleting what they name can account for it. */
function objectRefers(chain) {
  return [...new Set(chain.methods
    .filter((method) => placementMethods.has(method.name))
    .map((method) => staticString(method.node.arguments[0]))
    .filter(Boolean))];
}

function contentObjects(sourceFile, root, after = 0) {
  const objects = [];
  const seen = new Set();
  const add = (type, node, label, parentStart) => {
    if (node.getStart() < after || seen.has(node.getStart())) return;
    seen.add(node.getStart());
    const chain = callChain(node);
    const name = objectName(node, chain);
    const computed = [];
    const properties = objectProperties(sourceFile, node, chain, computed);
    const refers = objectRefers(chain);
    const cells = type === "table" ? tableCells(sourceFile, node) : [];
    const grid = type === "table" ? tableShape(sourceFile, node) : undefined;
    const labelAt = labelInsertion(node, type);
    objects.push({
      type,
      ...(label ? { label } : {}),
      ...(name ? { name } : {}),
      ...(refers.length ? { refers } : {}),
      source: sourceRange(sourceFile, chain.root),
      properties,
      texts: objectTexts(sourceFile, node),
      ...(cells.length ? { cells } : {}),
      ...(grid ? { grid } : {}),
      ...(labelAt ? { labelAt } : {}),
      computed,
      // at("x").text("...") returns the region, so methods after it style the region instead.
      ...(ts.isTaggedTemplateExpression(node) || ts.isIdentifier(node.expression) ? chainEdits(sourceFile, chain) : {}),
      parentStart,
    });
  };
  const visit = (node, parentStart) => {
    let nextParent = parentStart;
    const type = contentType(node);
    if (type) {
      add(type, node, staticString(node.arguments[0]) ?? staticString(assetPath(node.arguments[0])), parentStart);
      nextParent = node.getStart();
    } else if (ts.isTaggedTemplateExpression(node)
      && ts.isIdentifier(node.tag)
      && contentCommands.has(node.tag.text)) {
      add(
        node.tag.text,
        node,
        ts.isNoSubstitutionTemplateLiteral(node.template) ? templateText(node.template) : undefined,
        parentStart,
      );
      nextParent = node.getStart();
    }
    ts.forEachChild(node, (child) => visit(child, nextParent));
  };
  visit(root, undefined);
  return objects.sort((left, right) => (
    left.source.line - right.source.line || left.source.character - right.source.character
  ));
}

function cursorReferences(sourceFile, root, after = 0) {
  const cursors = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.getStart() >= after) {
      const command = node.expression.text;
      let region;
      if (command === "at") region = staticString(node.arguments[0]) || "main";
      else if (command === "main") region = "main";
      else if (command === "left" || command === "right") region = command;
      else if (command === "cell" && ts.isNumericLiteral(node.arguments[0])) {
        region = `cell${node.arguments[0].text}`;
      }
      if (region) cursors.push({ region, offset: node.getStart() });
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return cursors.sort((left, right) => left.offset - right.offset);
}

function sourceRange(sourceFile, node) {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const first = sourceFile.getLineAndCharacterOfPosition(start);
  const last = sourceFile.getLineAndCharacterOfPosition(end);
  return {
    line: first.line + 1,
    character: first.character + 1,
    endLine: last.line + 1,
    endCharacter: last.character + 1,
    start,
    end,
  };
}

function regionReferences(sourceFile, root, after = 0) {
  const regions = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "at"
      && node.getStart() >= after) {
      const path = staticString(node.arguments[0]);
      if (path) {
        const chain = callChain(node);
        regions.push({
          path,
          source: sourceRange(sourceFile, chain.root),
          properties: objectProperties(sourceFile, node, chain),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return regions.sort((left, right) => (
    left.source.line - right.source.line || left.source.character - right.source.character
  ));
}

/**
 * How the presentation() call, or poster() or figure(), states its options, so an editor can
 * set one, such as the subtitle a cover shows or the size of the page, where it is written:
 * nothing yet, a title alone, or an object of options, each with the range that replaces its
 * value and the range that removes it. An argument the code works out is "other", and is left
 * alone.
 */
function presentationOptions(sourceFile, call) {
  if (!call) return undefined;
  const text = sourceFile.text;
  const [argument] = call.arguments;
  const options = {
    command: call.expression.text,
    // Just inside the parentheses, where options go when there are none.
    arguments: { start: call.arguments.pos, end: call.arguments.end },
  };
  if (!argument) return { ...options, form: "none" };
  if (staticString(argument) !== undefined) {
    return { ...options, form: "title", title: editableProperty(sourceFile, "title", argument) };
  }
  if (!ts.isObjectLiteralExpression(argument)) return { ...options, form: "other" };
  const open = argument.getStart(sourceFile);
  const close = argument.getEnd();
  const properties = argument.properties.map((property) => {
    const start = property.getStart(sourceFile);
    const end = property.getEnd();
    const entry = { start, end };
    if (!ts.isPropertyAssignment(property)) return entry;
    const initializer = property.initializer;
    const value = staticValue(initializer);
    return {
      ...entry,
      name: propertyName(property.name),
      ...(value ? { kind: value.kind, value: value.value } : {}),
      code: initializer.getText(sourceFile),
      source: sourceRange(sourceFile, initializer),
    };
  });
  const inside = text.slice(open + 1, close - 1);
  const first = properties[0];
  const lineStart = first ? text.lastIndexOf("\n", first.start - 1) + 1 : -1;
  const indent = first && !text.slice(lineStart, first.start).trim() ? text.slice(lineStart, first.start) : undefined;
  return {
    ...options,
    form: "object",
    object: {
      start: open,
      end: close,
      multiline: inside.includes("\n"),
      ...(indent === undefined ? {} : { indent }),
    },
    properties,
  };
}

function presentationMetadata(sourceFile) {
  const call = findIdentifierCall(sourceFile, "presentation")
    ?? findIdentifierCall(sourceFile, "poster")
    ?? findIdentifierCall(sourceFile, "figure");
  const argument = call?.arguments[0];
  const options = presentationOptions(sourceFile, call);
  return {
    title: staticString(argument) ?? objectString(argument, "title") ?? "FrameSeq",
    ...(options ? { options } : {}),
  };
}

export async function inspectSlides(entry, cwd = process.cwd()) {
  return inspectSource(entry, await readFile(entry, "utf8"), cwd);
}

/**
 * Inspect slide document text that has not necessarily been saved, such as the buffer an
 * editor holds. Offsets and lines in the report refer to that text.
 */
export function inspectSource(entry, source, cwd = process.cwd()) {
  const sourceFile = ts.createSourceFile(
    entry,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const slides = [];
  // Master pages, written like slides but drawn behind them, are reported beside the slides.
  const masters = [];
  let currentSlide;

  const finishSlide = (endLine) => {
    if (!currentSlide) return;
    currentSlide.source.endLine = Math.max(currentSlide.source.line, endLine);
    currentSlide.objectCount = currentSlide.objects.length;
    const prefix = currentSlide.master ? `master:${currentSlide.master}` : `slide:${currentSlide.index}`;
    const objectIds = new Map();
    for (const [objectIndex, object] of currentSlide.objects.entries()) {
      object.id = object.name
        ? `${prefix}:name:${object.name}`
        : `${prefix}:object:${object.source.start}:${objectIndex}`;
      objectIds.set(object.source.start, object.id);
    }
    let cursorIndex = 0;
    let activeRegion = "main";
    for (const object of currentSlide.objects) {
      while (cursorIndex < currentSlide.cursorReferences.length
        && currentSlide.cursorReferences[cursorIndex].offset <= object.source.start) {
        activeRegion = currentSlide.cursorReferences[cursorIndex].region;
        cursorIndex += 1;
      }
      object.region = activeRegion;
      if (object.parentStart !== undefined) object.parentId = objectIds.get(object.parentStart);
      delete object.parentStart;
    }
    const namedRegions = new Map();
    for (const region of currentSlide.regionReferences) {
      const existing = namedRegions.get(region.path);
      if (existing) {
        existing.visits += 1;
        existing.sources.push(region.source);
        const latest = new Map(existing.properties.map((property) => [property.name, property]));
        region.properties.forEach((property) => latest.set(property.name, property));
        existing.properties = [...latest.values()];
      }
      else namedRegions.set(region.path, {
        ...region,
        sources: [region.source],
        id: `${prefix}:region:${region.path}`,
        visits: 1,
      });
    }
    currentSlide.regions = [...namedRegions.values()];
    delete currentSlide.regionReferences;
    delete currentSlide.cursorReferences;
    (currentSlide.master ? masters : slides).push(currentSlide);
    currentSlide = undefined;
  };

  for (const statement of sourceFile.statements) {
    const masterCall = findIdentifierCall(statement, "master");
    if (masterCall && !findIdentifierCall(statement, "slide") && !findIdentifierCall(statement, "poster") && !findIdentifierCall(statement, "figure")) {
      const masterSource = location(sourceFile, masterCall);
      finishSlide(masterSource.line - 1);
      const name = staticString(masterCall.arguments[0]) ?? "master";
      currentSlide = {
        index: masters.length + 1,
        master: name,
        label: name,
        name,
        layout: "canvas",
        notes: false,
        noteSources: [],
        source: { ...masterSource, endLine: masterSource.line },
        objects: contentObjects(sourceFile, statement, masterCall.getEnd()),
        cursorReferences: cursorReferences(sourceFile, statement, masterCall.getEnd()),
        regionReferences: regionReferences(sourceFile, statement, masterCall.getEnd()),
        regions: [],
        objectCount: 0,
      };
      continue;
    }
    // A poster or a figure is a presentation whose one page poster() or figure() begins itself.
    const posterCall = findIdentifierCall(statement, "poster");
    const figureCall = findIdentifierCall(statement, "figure");
    const slideCall = findIdentifierCall(statement, "slide") ?? posterCall ?? figureCall;
    if (slideCall) {
      const slideSource = location(sourceFile, slideCall);
      finishSlide(slideSource.line - 1);

      const argument = posterCall === slideCall ? undefined : slideCall.arguments[0];
      const stringTitle = staticString(argument);
      const name = posterCall === slideCall
        ? "Poster"
        : figureCall === slideCall
          ? stringTitle ?? objectString(argument, "title") ?? "Figure"
          : stringTitle ?? objectString(argument, "name");
      const title = stringTitle ?? objectString(argument, "title");
      const methods = methodCalls(statement, slideCall.getEnd()).map((call) => call.name);
      const layoutMethod = layoutPriority.find((method) => methods.includes(method));
      const index = slides.length + 1;
      // figure() draws on a canvas of its own.
      const layout = figureCall === slideCall ? "canvas" : layoutMethod === "fullBleed" ? "full-bleed" : (layoutMethod ?? "default");
      // A statement that is the slide() call's own chain runs once; one wrapping it may not.
      const chain = callChain(slideCall);
      const direct = ts.isExpressionStatement(statement) && statement.expression === chain.root;
      const noteSources = [
        noteSource(sourceFile, objectInitializer(argument, "notes"), direct),
        ...chain.methods
          .filter((method) => method.name === "notes")
          .map((method) => noteSource(sourceFile, method.node.arguments[0], direct)),
      ].filter(Boolean);
      // The master the slide names with .master(), with the range that replaces or removes it.
      const masterMethod = direct ? chainEdits(sourceFile, chain).methods.findLast((method) => method.name === "master") : undefined;
      const masterArgument = masterMethod ? chain.methods.findLast((method) => method.name === "master")?.node.arguments[0] : undefined;
      const masterValue = masterArgument?.kind === ts.SyntaxKind.FalseKeyword ? false : staticString(masterArgument);
      currentSlide = {
        index,
        label: name ?? title ?? (layout === "cover" ? "Cover" : `Slide ${index}`),
        name,
        title,
        layout,
        notes: methods.includes("notes") || noteSources.length > 0,
        noteSources,
        // Where .notes() can be added to the slide() call, when the statement is that call.
        ...(direct ? { notesAt: chain.root.getEnd() } : {}),
        ...(masterMethod && masterValue !== undefined
          ? { masterChoice: { value: masterValue, start: masterMethod.removeFrom, end: masterMethod.end } }
          : {}),
        source: {
          ...slideSource,
          endLine: slideSource.line,
        },
        objects: contentObjects(sourceFile, statement, slideCall.getEnd()),
        cursorReferences: cursorReferences(sourceFile, statement, slideCall.getEnd()),
        regionReferences: regionReferences(sourceFile, statement, slideCall.getEnd()),
        regions: [],
        objectCount: 0,
      };
      continue;
    }

    if (!currentSlide) continue;
    // A function declared between slides runs only where it is called.
    const noteCalls = ts.isFunctionDeclaration(statement) ? [] : findIdentifierCalls(statement, "note");
    for (const noteCall of noteCalls) {
      currentSlide.notes = true;
      const direct = ts.isExpressionStatement(statement) && statement.expression === callChain(noteCall).root;
      const found = noteSource(sourceFile, noteCall.arguments[0], direct);
      if (found) currentSlide.noteSources.push(found);
    }
    currentSlide.objects.push(...contentObjects(sourceFile, statement));
    currentSlide.cursorReferences.push(...cursorReferences(sourceFile, statement));
    currentSlide.regionReferences.push(...regionReferences(sourceFile, statement));
  }

  const finalLine = sourceFile.getLineAndCharacterOfPosition(source.length).line + 1;
  finishSlide(finalLine);

  return {
    version: 1,
    file: (relative(cwd, entry) || basename(entry)).replaceAll("\\", "/"),
    presentation: presentationMetadata(sourceFile),
    summary: {
      slides: slides.length,
      objects: slides.reduce((total, slide) => total + slide.objectCount, 0),
      masters: masters.length,
    },
    slides,
    masters,
  };
}
