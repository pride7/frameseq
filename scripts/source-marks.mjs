import ts from "typescript";

/**
 * Commands that create an object the preview can point back at. at() is included because its
 * returned region is itself a visual, editable container; other cursor moves are left out.
 */
const markableCommands = new Set([
  "slide",
  "text",
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
  "bullets",
  "steps",
  "metric",
  "group",
  "card",
  "gridSection",
  "at",
]);

/** The identifier a call chain such as text("x").lead().size(32) starts from. */
function chainRoot(node) {
  let current = node;
  for (;;) {
    if (ts.isCallExpression(current)) current = current.expression;
    else if (ts.isTaggedTemplateExpression(current)) current = current.tag;
    else if (ts.isPropertyAccessExpression(current)) current = current.expression;
    else if (ts.isParenthesizedExpression(current)) current = current.expression;
    else return ts.isIdentifier(current) ? current.text : undefined;
  }
}

/** Chain steps that take a single number the preview can rewrite in place. */
const numericSteps = new Set(["width", "height"]);

/** A number written literally in the source, which a drag can replace without reprinting. */
function numericField(sourceFile, node) {
  if (!node) return undefined;
  if (ts.isNumericLiteral(node)) {
    return {
      start: node.getStart(sourceFile),
      end: node.getEnd(),
      text: node.getText(sourceFile),
      value: Number(node.text),
    };
  }
  if (ts.isPrefixUnaryExpression(node)
    && node.operator === ts.SyntaxKind.MinusToken
    && ts.isNumericLiteral(node.operand)) {
    return {
      start: node.getStart(sourceFile),
      end: node.getEnd(),
      text: node.getText(sourceFile),
      value: -Number(node.operand.text),
    };
  }
  return undefined;
}

/**
 * The coordinates and sizes a chain states as plain numbers. Computed values are left out:
 * position({ x: cursor }) has nothing a drag could rewrite without changing what the code means.
 * The chain is walked from its end, so the call that wins at runtime is the one recorded.
 */
function editableFields(sourceFile, node) {
  const fields = {};
  const remember = (name, field) => {
    if (field && !fields[name]) fields[name] = field;
  };

  let current = node;
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    const step = current.expression.name.text;
    const [argument] = current.arguments;
    if (step === "position" && argument && ts.isObjectLiteralExpression(argument)) {
      for (const property of argument.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
          ? property.name.text
          : undefined;
        if (key === "x" || key === "y") remember(key, numericField(sourceFile, property.initializer));
      }
    } else if (numericSteps.has(step)) {
      remember(step, numericField(sourceFile, argument));
    }
    current = current.expression.expression;
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

/**
 * Calls that decide where the objects after them belong. Reordering across one of these would
 * move an object into another region or another slide, which is not what a drag between
 * neighbours means, so they divide the document into runs that reordering stays inside.
 */
function isRegionBarrier(node) {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return false;
  const name = node.expression.text;
  if (["presentation", "slide", "main", "left", "right", "cell", "at"].includes(name)) return true;
  // group(a, b) and gridSection(2, a, b) collect objects written above them into a container.
  if (name === "group") return node.arguments.length > 0;
  if (name === "gridSection") return node.arguments.length > 1;
  return false;
}

function lineStartAt(text, index) {
  let start = index;
  while (start > 0 && text[start - 1] !== "\n") start -= 1;
  return start;
}

/**
 * The whole lines a command occupies, which is the unit a drag between neighbours moves.
 * A command sharing its line with anything else has no such unit and cannot be reordered.
 * Comment lines directly above travel with it, since they were written about it.
 */
function statementBlock(sourceFile, node) {
  let statement = node;
  while (statement.parent && !ts.isSourceFile(statement.parent)) statement = statement.parent;
  if (!statement.parent || !ts.isSourceFile(statement.parent)) return undefined;
  if (!ts.isExpressionStatement(statement) || statement.expression !== node) return undefined;

  const text = sourceFile.text;
  const start = lineStartAt(text, statement.getStart(sourceFile));
  if (text.slice(start, statement.getStart(sourceFile)).trim()) return undefined;

  const blank = (index) => text[index] === " " || text[index] === "\t";
  let end = statement.getEnd();
  while (end < text.length && blank(end)) end += 1;
  if (text[end] === ";") end += 1;
  while (end < text.length && blank(end)) end += 1;
  // A remark written after the command on the same line was written about it.
  if (text.startsWith("//", end)) {
    while (end < text.length && text[end] !== "\r" && text[end] !== "\n") end += 1;
  }
  if (text[end] === "\r") end += 1;
  if (text[end] === "\n") end += 1;
  // Anything else still on the line means the command has no whole lines of its own.
  else if (end !== text.length) return undefined;

  let blockStart = start;
  while (blockStart > 0) {
    const previousStart = lineStartAt(text, blockStart - 1);
    if (!text.slice(previousStart, blockStart).trim().startsWith("//")) break;
    blockStart = previousStart;
  }

  return { start: blockStart, end, text: text.slice(blockStart, end) };
}

/** True while the call is still being chained, so only the whole chain gets marked. */
function chainedFurther(node) {
  const parent = node.parent;
  return Boolean(parent)
    && ts.isPropertyAccessExpression(parent)
    && parent.expression === node;
}

/**
 * Find every document command in a slide file, with the source range of its full call chain.
 * Ranges never overlap partially: a nested command such as the rect() inside group(rect())
 * is fully contained in the outer one, which keeps them safe to apply as text edits.
 */
export function sourceMarks(source, fileName = "slides.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const marks = [];
  const barriers = [];

  function visit(node) {
    if (isRegionBarrier(node)) barriers.push(node.getStart(sourceFile));
    if ((ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node))
      && markableCommands.has(chainRoot(node) ?? "")
      && !chainedFurther(node)) {
      const start = node.getStart(sourceFile);
      const position = sourceFile.getLineAndCharacterOfPosition(start);
      marks.push({
        start,
        end: node.getEnd(),
        line: position.line + 1,
        column: position.character + 1,
        fields: editableFields(sourceFile, node),
        // A slide is not one object among neighbours; its content lives in later statements.
        // Neither is a call that collects the objects written above it: moving it past them
        // would leave it reaching for objects that do not exist yet.
        statement: ["slide", "at"].includes(chainRoot(node) ?? "") || isRegionBarrier(node)
          ? undefined
          : statementBlock(sourceFile, node),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Two commands can only trade places when no barrier stands between them.
  barriers.sort((a, b) => a - b);
  for (const mark of marks) {
    if (!mark.statement) continue;
    mark.region = barriers.filter((position) => position < mark.start).length;
  }
  return marks;
}

/**
 * The pair of zero-width edits that wrap one command in a call recording where it was written.
 * Wrapping keeps every line number intact, so the transformed file still matches the source.
 */
export function markEdits(mark) {
  const span = {
    line: mark.line,
    column: mark.column,
    start: mark.start,
    end: mark.end,
    ...(mark.fields ? { fields: mark.fields } : {}),
    ...(mark.statement ? { statement: mark.statement, region: mark.region } : {}),
  };
  return [
    { start: mark.start, end: mark.start, rank: 1, text: "__frameSeqMark(" },
    { start: mark.end, end: mark.end, rank: 2, text: `, ${JSON.stringify(span)})` },
  ];
}

/**
 * Apply text edits to a source file. Ranges may nest but must not partially overlap.
 * Editing from the end keeps earlier offsets valid; where edits meet, the wider one goes
 * first and an opening wrapper goes before the closing wrapper beside it.
 */
export function applySourceEdits(source, edits) {
  const ordered = [...edits].sort((a, b) => (
    b.start - a.start || b.end - a.end || (a.rank ?? 0) - (b.rank ?? 0)
  ));
  let result = source;
  for (const edit of ordered) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

export { markableCommands };
