import { existsSync, readFileSync, statSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";
import { configDirectory } from "./studio-files.mjs";

/**
 * The person's own templates: presentations kept in a folder to start new ones from. A template
 * is an `.fsq` or `.slides.ts` file, or a folder holding one beside the pictures and other files it uses.
 * Its title is replaced by the new presentation's, and everything else is kept as written,
 * masters and theme included. The CLI and FrameSeq Studio share these rules.
 */

/** New templates are written as .fsq files; ones kept as .slides.ts are found all the same. */
const extension = ".fsq";
const extensions = [".fsq", ".slides.ts"];

/** The extension a template file is named with, or undefined for any other file. */
function deckExtension(name) {
  return extensions.find((item) => name.toLowerCase().endsWith(item) && name.length > item.length);
}

/** The files a template called `name` may be kept as in `directory`. */
const templateFiles = (directory, name) => extensions.map((item) => join(directory, `${name}${item}`));

/** Documents, wherever Windows put it: in the home folder, or moved into OneDrive. */
function documentsFolder(environment) {
  const candidates = [join(homedir(), "Documents")];
  if (process.platform === "win32" && environment.OneDrive) candidates.push(join(environment.OneDrive, "Documents"));
  return candidates.find((folder) => existsSync(folder)) ?? candidates[0];
}

/** The templates folder chosen in the Studio, kept with its other settings. */
function chosenFolder() {
  try {
    const settings = JSON.parse(readFileSync(join(configDirectory(), "studio.json"), "utf8"));
    return typeof settings?.templates === "string" && settings.templates ? settings.templates : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Where the templates are kept: FRAMESEQ_TEMPLATES, the folder chosen in the Studio, or
 * FrameSeq/Templates in Documents. Nothing is written there until a template is saved.
 */
export function templateDirectory(environment = process.env) {
  if (environment.FRAMESEQ_TEMPLATES) return resolve(environment.FRAMESEQ_TEMPLATES);
  return chosenFolder() ?? join(documentsFolder(environment), "FrameSeq", "Templates");
}

const reservedNames = /^(?:con|prn|aux|nul|com\d|lpt\d)$/i;

/** Why a name cannot be a template's, or undefined when it can: it names a file on every system. */
export function templateNameProblem(name) {
  const value = String(name ?? "");
  if (!value.trim()) return "empty";
  if (value !== value.trim() || value.endsWith(".")) return "edges";
  // eslint-disable-next-line no-control-regex
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(value)) return "characters";
  if (reservedNames.test(value) || value === "." || value === "..") return "reserved";
  if (value.length > 80) return "long";
  return undefined;
}

/** Every template in the folder, by name: the .fsq and .slides.ts files and the folders holding one. */
export async function userTemplates(directory = templateDirectory()) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const templates = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const found = entry.isFile() ? deckExtension(entry.name) : undefined;
    if (found) {
      templates.push({ name: entry.name.slice(0, -found.length), path: join(directory, entry.name) });
    } else if (entry.isDirectory()) {
      const inside = await readdir(join(directory, entry.name)).catch(() => []);
      const decks = inside.filter((name) => deckExtension(name));
      // A folder with one presentation in it is that presentation and the files it uses.
      if (decks.length === 1) templates.push({ name: entry.name, path: join(directory, entry.name, decks[0]), folder: join(directory, entry.name) });
    }
  }
  return templates.sort((left, right) => left.name.localeCompare(right.name));
}

/** The template of this name, matched exactly and then regardless of case. */
export async function findUserTemplate(name, directory = templateDirectory()) {
  const templates = await userTemplates(directory);
  return templates.find((template) => template.name === name)
    ?? templates.find((template) => template.name.toLowerCase() === String(name).toLowerCase());
}

function sourceFile(source) {
  return ts.createSourceFile("template.slides.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function isText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** A string as a literal written with the same quote as `original`. */
function quoteLike(original, value) {
  const quote = original[0];
  if (quote === "'") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
  if (quote === "`") return `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
  return JSON.stringify(value);
}

/**
 * A template's text with the new presentation's title in place of its own: in presentation() or
 * poster(), and in every string written exactly as the old title, such as a cover's hero.
 */
export function retitle(source, title) {
  const file = sourceFile(source);
  let call;
  const find = (node) => {
    if (call) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["presentation", "poster"].includes(node.expression.text)) {
      call = node;
      return;
    }
    ts.forEachChild(node, find);
  };
  find(file);
  const value = String(title ?? "").trim();
  if (!call || !value) return source;
  const [argument] = call.arguments;
  let literal;
  if (argument && isText(argument)) literal = argument;
  else if (argument && ts.isObjectLiteralExpression(argument)) {
    const property = argument.properties.find((item) => (
      ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === "title"
    ));
    if (property && isText(property.initializer)) literal = property.initializer;
    else if (!property) {
      const open = argument.getStart(file) + 1;
      return `${source.slice(0, open)} title: ${JSON.stringify(value)},${source.slice(open)}`;
    }
  } else if (!argument) {
    const open = call.arguments.pos;
    return `${source.slice(0, open)}${JSON.stringify(value)}${source.slice(open)}`;
  }
  if (!literal) return source;
  const old = literal.text;
  const matches = [];
  const collect = (node) => {
    if (isText(node) && (node === literal || (old.trim() && node.text === old))) matches.push(node);
    ts.forEachChild(node, collect);
  };
  collect(file);
  let result = source;
  for (const node of matches.sort((left, right) => right.getStart(file) - left.getStart(file))) {
    const start = node.getStart(file);
    result = `${result.slice(0, start)}${quoteLike(source.slice(start, node.getEnd()), value)}${result.slice(node.getEnd())}`;
  }
  return result;
}

/** Every file under a folder, leaving out hidden ones and installed packages. */
async function filesUnder(folder) {
  const found = [];
  for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

/**
 * Write a new presentation at `target` from a template, titled `title`, and copy the files a
 * folder template holds beside it, never over one already there. Fails when `target` exists.
 */
export async function createFromTemplate(template, target, title) {
  const source = retitle(await readFile(template.path, "utf8"), title);
  await writeFile(target, source, { encoding: "utf8", flag: "wx" });
  const copied = [];
  if (template.folder) {
    for (const file of await filesUnder(template.folder)) {
      if (resolve(file) === resolve(template.path)) continue;
      const within = relative(template.folder, file);
      const destination = join(dirname(target), within);
      if (existsSync(destination)) continue;
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(file, destination);
      copied.push(within.replaceAll("\\", "/"));
    }
  }
  return { copied };
}

/**
 * The files beside a presentation that its text names, such as pictures, a bibliography, or a
 * Typst file: every string that is the relative path of a file inside the presentation's folder.
 */
export function localFiles(source, folder, entry) {
  const files = new Set();
  const visit = (node) => {
    if (isText(node)) {
      const value = node.text.trim();
      if (value && value.length < 400 && !/[\r\n]/.test(value) && !/^[a-z][a-z0-9+.-]*:/i.test(value) && !isAbsolute(value)) {
        const path = resolve(folder, value);
        const within = relative(folder, path);
        if (within && !within.startsWith("..") && !isAbsolute(within) && path !== resolve(entry ?? "")) {
          try {
            if (statSync(path).isFile()) files.add(within.replaceAll("\\", "/"));
          } catch {
            // Not a file: an ordinary string.
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(source));
  return [...files].sort();
}

/**
 * Keep a presentation as a template named `name`: its text alone, or, when it names files beside
 * it, a folder holding the text and those files. An existing template of that name is replaced
 * only with `overwrite`; otherwise the result says it exists.
 */
export async function saveTemplate({ entry, name, directory = templateDirectory(), overwrite = false }) {
  const problem = templateNameProblem(name);
  if (problem) return { problem };
  const source = await readFile(entry, "utf8");
  const folder = dirname(entry);
  const assets = localFiles(source, folder, entry);
  const fileTarget = join(directory, `${name}${extension}`);
  const fileTargets = templateFiles(directory, name);
  const folderTarget = join(directory, name);
  const here = resolve(entry);
  const within = relative(folderTarget, here);
  // Saved from the template itself, there is nothing to copy: the template is that file.
  if (fileTargets.some((file) => here === resolve(file)) || (within && !within.startsWith("..") && !isAbsolute(within))) {
    return { path: here, assets: [], same: true };
  }
  const existing = [folderTarget, ...fileTargets].find((path) => existsSync(path));
  if (existing && !overwrite) return { exists: true, path: existing };
  await mkdir(directory, { recursive: true });
  if (existing) {
    for (const file of fileTargets) await rm(file, { force: true });
    await rm(folderTarget, { recursive: true, force: true });
  }
  if (assets.length === 0) {
    await writeFile(fileTarget, source, "utf8");
    return { path: fileTarget, assets };
  }
  await mkdir(folderTarget, { recursive: true });
  const path = join(folderTarget, `${name}${extension}`);
  await writeFile(path, source, "utf8");
  for (const asset of assets) {
    const destination = join(folderTarget, asset);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(folder, asset), destination);
  }
  return { path, assets };
}

/** Write a template from text, such as a copy of a built-in one, under a name not yet taken. */
export async function writeTemplate({ name, source, directory = templateDirectory() }) {
  const problem = templateNameProblem(name);
  if (problem) return { problem };
  const fileTarget = join(directory, `${name}${extension}`);
  const existing = [...templateFiles(directory, name), join(directory, name)].find((path) => existsSync(path));
  if (existing) return { exists: true, path: existing };
  await mkdir(directory, { recursive: true });
  await writeFile(fileTarget, source, { encoding: "utf8", flag: "wx" });
  return { path: fileTarget };
}

/** Remove a template: its file, or its folder and everything in it. */
export async function deleteTemplate(template) {
  await rm(template.folder ?? template.path, { recursive: Boolean(template.folder), force: true });
}
