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
  "line",
  "row",
  "column",
  "stack",
]);

const layoutPriority = ["cover", "canvas", "split", "grid", "center", "fullBleed"];
const regionContentCommands = new Set([
  "lead", "text", "bullets", "steps", "code", "math", "image", "caption", "quote", "metric", "custom",
]);
const editableMethods = new Map([
  ["width", ["width"]], ["height", ["height"]],
  ["minWidth", ["minWidth"]], ["minHeight", ["minHeight"]],
  ["gap", ["gap"]], ["padding", ["padding", "paddingHorizontal"]],
  ["margin", ["margin", "marginHorizontal"]],
  ["fontSize", ["fontSize"]], ["size", ["fontSize"]],
  ["rotate", ["rotation"]], ["strokeWidth", ["strokeWidth"]],
  ["color", ["color"]], ["background", ["background"]],
  ["fill", ["fill"]], ["stroke", ["stroke"]], ["border", ["border"]],
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

function objectString(node, name) {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || propertyName(property.name) !== name) continue;
    return staticString(property.initializer);
  }
  return undefined;
}

function findIdentifierCall(root, name) {
  let result;
  const visit = (node) => {
    if (result) return;
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === name) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
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

function objectProperties(sourceFile, node, chain) {
  const properties = [];
  const addObjectProperties = (object, names) => {
    if (!object || !ts.isObjectLiteralExpression(object)) return;
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = propertyName(property.name);
      if (!name || !names.includes(name)) continue;
      const editable = editableProperty(sourceFile, name, property.initializer);
      if (editable) properties.push(editable);
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
    method.node.arguments.forEach((argument, index) => {
      const editable = editableProperty(sourceFile, names[index] ?? `${method.name}${index + 1}`, argument);
      if (editable) properties.push(editable);
    });
  }
  return properties;
}

function objectName(node, chain) {
  const named = chain.methods.find((method) => method.name === "as");
  return staticString(named?.node.arguments[0]);
}

function contentObjects(sourceFile, root, after = 0) {
  const objects = [];
  const seen = new Set();
  const add = (type, node, label, parentStart) => {
    if (node.getStart() < after || seen.has(node.getStart())) return;
    seen.add(node.getStart());
    const chain = callChain(node);
    const name = objectName(node, chain);
    objects.push({
      type,
      ...(label ? { label } : {}),
      ...(name ? { name } : {}),
      source: sourceRange(sourceFile, chain.root),
      properties: objectProperties(sourceFile, node, chain),
      parentStart,
    });
  };
  const visit = (node, parentStart) => {
    let nextParent = parentStart;
    const type = contentType(node);
    if (type) {
      add(type, node, staticString(node.arguments[0]), parentStart);
      nextParent = node.getStart();
    } else if (ts.isTaggedTemplateExpression(node)
      && ts.isIdentifier(node.tag)
      && contentCommands.has(node.tag.text)) {
      add(
        node.tag.text,
        node,
        ts.isNoSubstitutionTemplateLiteral(node.template) ? node.template.text : undefined,
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

function presentationMetadata(sourceFile) {
  const call = findIdentifierCall(sourceFile, "presentation");
  const argument = call?.arguments[0];
  return {
    title: staticString(argument) ?? objectString(argument, "title") ?? "FrameSeq",
  };
}

export async function inspectSlides(entry, cwd = process.cwd()) {
  const source = await readFile(entry, "utf8");
  const sourceFile = ts.createSourceFile(
    entry,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const slides = [];
  let currentSlide;

  const finishSlide = (endLine) => {
    if (!currentSlide) return;
    currentSlide.source.endLine = Math.max(currentSlide.source.line, endLine);
    currentSlide.objectCount = currentSlide.objects.length;
    const objectIds = new Map();
    for (const [objectIndex, object] of currentSlide.objects.entries()) {
      object.id = object.name
        ? `slide:${currentSlide.index}:name:${object.name}`
        : `slide:${currentSlide.index}:object:${object.source.start}:${objectIndex}`;
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
        id: `slide:${currentSlide.index}:region:${region.path}`,
        visits: 1,
      });
    }
    currentSlide.regions = [...namedRegions.values()];
    delete currentSlide.regionReferences;
    delete currentSlide.cursorReferences;
    slides.push(currentSlide);
    currentSlide = undefined;
  };

  for (const statement of sourceFile.statements) {
    const slideCall = findIdentifierCall(statement, "slide");
    if (slideCall) {
      const slideSource = location(sourceFile, slideCall);
      finishSlide(slideSource.line - 1);

      const argument = slideCall.arguments[0];
      const stringTitle = staticString(argument);
      const name = stringTitle ?? objectString(argument, "name");
      const title = stringTitle ?? objectString(argument, "title");
      const methods = methodCalls(statement, slideCall.getEnd()).map((call) => call.name);
      const layoutMethod = layoutPriority.find((method) => methods.includes(method));
      const index = slides.length + 1;
      const layout = layoutMethod === "fullBleed" ? "full-bleed" : (layoutMethod ?? "default");
      currentSlide = {
        index,
        label: name ?? title ?? (layout === "cover" ? "Cover" : `Slide ${index}`),
        name,
        title,
        layout,
        notes: methods.includes("notes"),
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
    if (findIdentifierCall(statement, "note")) currentSlide.notes = true;
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
    },
    slides,
  };
}
