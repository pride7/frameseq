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

function contentObjects(sourceFile, root, after = 0) {
  const objects = [];
  const seen = new Set();
  const add = (type, node) => {
    if (node.getStart() < after || seen.has(node.getStart())) return;
    seen.add(node.getStart());
    objects.push({
      type,
      source: location(sourceFile, node),
    });
  };
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && contentCommands.has(node.expression.text)) {
        add(node.expression.text, node);
      } else if (ts.isPropertyAccessExpression(node.expression)
        && contentCommands.has(node.expression.name.text)) {
        add(node.expression.name.text, node);
      }
    } else if (ts.isTaggedTemplateExpression(node)
      && ts.isIdentifier(node.tag)
      && contentCommands.has(node.tag.text)) {
      add(node.tag.text, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return objects.sort((left, right) => (
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
        objectCount: 0,
      };
      continue;
    }

    if (currentSlide) currentSlide.objects.push(...contentObjects(sourceFile, statement));
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
