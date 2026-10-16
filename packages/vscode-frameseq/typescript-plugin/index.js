"use strict";

/**
 * A TypeScript server plugin that lets VS Code check `.fsq` presentations as TypeScript.
 *
 * The extension contributes it for the `frameseq` language, so VS Code's TypeScript extension
 * hands `.fsq` documents to tsserver, which reads a file of an unknown extension as TypeScript.
 * No tsconfig includes `.fsq` files, so each lands in an inferred project, which lacks the
 * FrameSeq globals that declare `slide()`, `text()`, and the rest. This plugin adds those
 * declarations to the program of every inferred project that holds an `.fsq` file.
 *
 * `getExternalFiles` cannot do this: tsserver makes external files program roots only in
 * configured projects, and an inferred project merely keeps them open. So the plugin extends
 * the project's own list of root files, which the language service reads to build the program.
 *
 * VS Code puts the loose files of a workspace folder in one inferred project, so a `.ts` file
 * outside any tsconfig shares the globals while an `.fsq` file beside it is open.
 */

const fs = require("fs");
const path = require("path");

/** The global FrameSeq install's declarations, as the extension last configured them. */
let configuredGlobals;

function setConfiguration(config) {
  if (config && typeof config === "object" && "globals" in config) {
    configuredGlobals = typeof config.globals === "string" && config.globals ? config.globals : undefined;
  }
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** tsserver keeps file names with forward slashes, so a name it compares must match. */
function normalized(file) {
  return file.replace(/\\/g, "/");
}

/**
 * The FrameSeq declarations nearest to a folder: the project's own install, which the deck's
 * imports also resolve to, or, inside a checkout of the FrameSeq repository, its source.
 */
function localGlobals(folder) {
  for (let directory = path.resolve(folder); ; directory = path.dirname(directory)) {
    const installed = path.join(directory, "node_modules", "@pride7", "frameseq", "lib", "globals.d.ts");
    if (isFile(installed)) return installed;
    const source = path.join(directory, "src", "globals.ts");
    if (isFile(path.join(directory, "scripts", "frameseq.mjs")) && isFile(source)) return source;
    if (path.dirname(directory) === directory) return undefined;
  }
}

/**
 * The one declarations file for a project's `.fsq` roots. One file only, whichever deck it
 * came from: two copies of the globals would redeclare every command.
 */
function globalsFor(roots) {
  const decks = roots.filter((file) => /\.fsq$/i.test(file));
  if (decks.length === 0) return undefined;
  for (const deck of decks) {
    const found = localGlobals(path.dirname(deck));
    if (found) return normalized(found);
  }
  return configuredGlobals && isFile(configuredGlobals) ? normalized(configuredGlobals) : undefined;
}

function init(modules) {
  const ts = modules.typescript;
  // One inferred project per workspace folder, each to refresh when the configuration changes.
  const projects = new Set();
  return {
    create(info) {
      setConfiguration(info.config);
      if (info.project.projectKind !== ts.server.ProjectKind.Inferred) return info.languageService;
      const project = info.project;
      projects.add(project);
      // The project is the language service's host, so its list of roots is what builds the program.
      const roots = project.getScriptFileNames;
      project.getScriptFileNames = function getScriptFileNames() {
        const names = roots.call(this);
        try {
          const globals = globalsFor(names);
          if (!globals) return names;
          const fold = (name) => (this.useCaseSensitiveFileNames() ? name : name.toLowerCase());
          return names.some((name) => fold(name) === fold(globals)) ? names : [...names, globals];
        } catch (error) {
          info.project.projectService.logger.info(`frameseq-typescript-plugin: ${error}`);
          return names;
        }
      };
      return info.languageService;
    },

    onConfigurationChanged(config) {
      setConfiguration(config);
      for (const project of projects) {
        if (project.isClosed()) {
          projects.delete(project);
          continue;
        }
        // A new version makes the language service read the roots again on its next request,
        // and the refresh asks VS Code for new diagnostics, which makes that request. Both are
        // tsserver's own, though not all public, so a workspace TypeScript may lack one.
        if (typeof project.markAsDirty === "function") project.markAsDirty();
        if (typeof project.refreshDiagnostics === "function") project.refreshDiagnostics();
      }
    },
  };
}

module.exports = init;
