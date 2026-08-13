import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import * as vscode from "vscode";
import {
  ancestorDirectories,
  entryExcludeGlob,
  entrySearchGlob,
  isSlidesPath,
  rankEntryCandidates,
} from "./entry";
import {
  cursorRegionAt,
  formatPropertyValue,
  regionsForOffset,
  selectionHasStructureBoundary,
} from "./regions";

interface SourceLocation {
  line: number;
  character: number;
  endLine?: number;
  endCharacter?: number;
  start?: number;
  end?: number;
}

interface InspectProperty {
  name: string;
  kind: "number" | "string" | "boolean";
  value: number | string | boolean;
  source: SourceLocation & { start: number; end: number };
  expected: string;
}

interface InspectObject {
  id: string;
  type: string;
  label?: string;
  name?: string;
  region: string;
  parentId?: string;
  properties: InspectProperty[];
  source: SourceLocation;
}

interface InspectRegion {
  id: string;
  path: string;
  source: SourceLocation;
  sources?: SourceLocation[];
  properties?: InspectProperty[];
  visits: number;
}

interface InspectSlide {
  index: number;
  label: string;
  name?: string;
  title?: string;
  layout: string;
  notes: boolean;
  source: SourceLocation & { endLine: number };
  objects: InspectObject[];
  regions?: InspectRegion[];
  objectCount: number;
}

interface InspectReport {
  version: number;
  file: string;
  presentation: { title: string };
  summary: { slides: number; objects: number };
  slides: InspectSlide[];
}

interface LayoutIssue {
  severity: "error" | "warning";
  rule: string;
  message: string;
  slide: { index: number; label: string };
  element: { type: string; path: string; text?: string };
  suggestions: string[];
}

interface LayoutReport {
  summary: { slides: number; errors: number; warnings: number };
  issues: LayoutIssue[];
}

interface EntryDocument {
  uri: vscode.Uri;
  root: string;
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

type OutlineItem = SlideItem | RegionItem | ObjectItem | IssueItem;
type CurrentSlideItem = CurrentSlideSummaryItem | CurrentSlideSectionItem | RegionGroupItem | RegionPropertyItem | ObjectItem | PropertyItem;

let previewProcess: ChildProcessWithoutNullStreams | undefined;
let previewWasStopped = false;
let previewAddress: string | undefined;
let previewOpenTimer: NodeJS.Timeout | undefined;
let previewSlideIndex = 1;
let previewPanel: vscode.WebviewPanel | undefined;
let pendingPreviewFocus: PreviewComponentTarget | undefined;
let activeSlidesProvider: SlidesProvider | undefined;
let activeCurrentSlideProvider: CurrentSlideProvider | undefined;
let activeCurrentSlideTree: vscode.TreeView<CurrentSlideItem> | undefined;
let editorSelectionTimer: NodeJS.Timeout | undefined;
let lastEditorSelectionId: string | undefined;
let previewLineDecoration: vscode.TextEditorDecorationType | undefined;
let previewSourceMarker: { uri: string; line: number; slideIndex: number; label: string } | undefined;
let lastResolvedEntry: EntryDocument | undefined;
let entryStore: vscode.Memento | undefined;
const pinnedEntryKey = "frameseq.pinnedEntry";

interface PreviewComponentTarget {
  slideIndex: number;
  line?: number;
  column?: number;
  name?: string;
}

interface PreviewSelectionTarget {
  line: number;
  column: number;
  start: number;
  end: number;
}

function applyPreviewSourceMarker(editor?: vscode.TextEditor): void {
  if (!previewLineDecoration) return;
  const editors = editor ? [editor] : vscode.window.visibleTextEditors;
  for (const candidate of editors) {
    const marker = previewSourceMarker;
    if (!marker || candidate.document.uri.toString() !== marker.uri) {
      candidate.setDecorations(previewLineDecoration, []);
      continue;
    }
    const line = Math.max(0, Math.min(marker.line, candidate.document.lineCount - 1));
    candidate.setDecorations(previewLineDecoration, [{
      range: candidate.document.lineAt(line).range,
      hoverMessage: `FrameSeq preview is showing slide ${marker.slideIndex}: ${marker.label}`,
      renderOptions: {
        after: {
          contentText: `  ← Previewing slide ${marker.slideIndex}`,
          color: new vscode.ThemeColor("editorInfo.foreground"),
          fontWeight: "bold",
          margin: "0 0 0 1rem",
        },
      },
    }]);
  }
}

function setPreviewSourceMarker(
  entry: EntryDocument,
  slide: InspectSlide,
  source: SourceLocation = slide.source,
): void {
  previewSourceMarker = {
    uri: entry.uri.toString(),
    line: Math.max(0, source.line - 1),
    slideIndex: slide.index,
    label: slide.label,
  };
  applyPreviewSourceMarker();
}

function refreshPreviewSourceMarker(provider: SlidesProvider): void {
  if (!previewSourceMarker || !provider.entry || !provider.report) return;
  const slide = provider.report.slides[previewSlideIndex - 1];
  if (slide) setPreviewSourceMarker(provider.entry, slide);
}

function isSlidesDocument(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && isSlidesPath(uri.fsPath);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The directory FrameSeq commands run from: the closest ancestor of the entry that
 * carries the CLI, otherwise the closest package, otherwise the workspace folder.
 * A deck nested in a subdirectory therefore keeps working without configuration.
 */
async function resolveRoot(uri: vscode.Uri): Promise<string> {
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  const directories = ancestorDirectories(dirname(uri.fsPath), workspaceRoot);
  for (const directory of directories) {
    const installedCli = join(directory, "node_modules", "@pride7", "frameseq", "scripts", "frameseq.mjs");
    if (await fileExists(installedCli)) return directory;
    if (await fileExists(join(directory, "scripts", "frameseq.mjs"))) return directory;
  }
  for (const directory of directories) {
    if (await fileExists(join(directory, "package.json"))) return directory;
  }
  return workspaceRoot ?? dirname(uri.fsPath);
}

async function entryFor(uri: vscode.Uri): Promise<EntryDocument> {
  const entry: EntryDocument = { uri, root: await resolveRoot(uri) };
  lastResolvedEntry = entry;
  return entry;
}

function configuredEntries(): { folder: vscode.WorkspaceFolder; entry: string }[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
    folder,
    entry: vscode.workspace
      .getConfiguration("frameseq", folder.uri)
      .get<string>("entry", "slides.ts")
      .trim() || "slides.ts",
  }));
}

/** Every deck the workspace offers, closest to the current file first. */
async function entryCandidates(): Promise<vscode.Uri[]> {
  const found = await vscode.workspace.findFiles(
    entrySearchGlob(configuredEntries().map(({ entry }) => entry)),
    entryExcludeGlob,
    64,
  );
  const byPath = new Map(found.map((uri) => [uri.fsPath, uri]));
  for (const { folder, entry } of configuredEntries()) {
    const configuredPath = isAbsolute(entry) ? entry : join(folder.uri.fsPath, entry);
    if (!byPath.has(configuredPath) && await fileExists(configuredPath)) {
      byPath.set(configuredPath, vscode.Uri.file(configuredPath));
    }
  }
  for (const document of vscode.workspace.textDocuments) {
    if (isSlidesDocument(document.uri)) byPath.set(document.uri.fsPath, document.uri);
  }
  const reference = vscode.window.activeTextEditor?.document.uri.fsPath
    ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return rankEntryCandidates([...byPath.keys()], reference)
    .map((path) => byPath.get(path))
    .filter((uri): uri is vscode.Uri => uri !== undefined);
}

async function discoverEntry(): Promise<vscode.Uri | undefined> {
  return (await entryCandidates())[0];
}

function pinnedEntryPath(): string | undefined {
  return entryStore?.get<string>(pinnedEntryKey) || undefined;
}

async function pinEntry(path: string | undefined): Promise<void> {
  await entryStore?.update(pinnedEntryKey, path);
}

async function resolveEntry(): Promise<EntryDocument | undefined> {
  const pinned = pinnedEntryPath();
  if (pinned) {
    if (await fileExists(pinned)) return entryFor(vscode.Uri.file(pinned));
    await pinEntry(undefined);
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri && isSlidesDocument(activeUri)) return entryFor(activeUri);

  for (const editor of vscode.window.visibleTextEditors) {
    if (isSlidesDocument(editor.document.uri)) return entryFor(editor.document.uri);
  }

  for (const { folder, entry: configured } of configuredEntries()) {
    const configuredPath = isAbsolute(configured)
      ? configured
      : join(folder.uri.fsPath, configured);
    if (await fileExists(configuredPath)) {
      return entryFor(vscode.Uri.file(configuredPath));
    }
  }

  const discovered = await discoverEntry();
  if (discovered) return entryFor(discovered);

  // The preview panel or a settings tab can be focused while a deck is still open.
  for (const document of vscode.workspace.textDocuments) {
    if (isSlidesDocument(document.uri)) return entryFor(document.uri);
  }

  if (lastResolvedEntry && await fileExists(lastResolvedEntry.uri.fsPath)) {
    return lastResolvedEntry;
  }
  return undefined;
}

function entryLabel(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? relative(folder.uri.fsPath, uri.fsPath) : uri.fsPath;
}

function entryDescription(entry: EntryDocument | undefined): string | undefined {
  if (!entry) return undefined;
  const label = entryLabel(entry.uri);
  return pinnedEntryPath() ? `${label} (selected)` : label;
}

/**
 * Pick which deck the outline, preview, checks, and exports follow. The choice is
 * remembered per workspace and outranks the active editor until it is cleared.
 */
async function selectEntry(provider: SlidesProvider): Promise<boolean> {
  const candidates = await entryCandidates();
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      "FrameSeq: no slides.ts or *.slides.ts document was found in this workspace.",
    );
    return false;
  }

  const pinned = pinnedEntryPath();
  const current = provider.entry?.uri.fsPath;
  const items: (vscode.QuickPickItem & { path?: string })[] = candidates.map((uri) => ({
    label: entryLabel(uri),
    description: uri.fsPath === pinned
      ? "selected"
      : (uri.fsPath === current ? "in use" : undefined),
    detail: vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1
      ? vscode.workspace.getWorkspaceFolder(uri)?.name
      : undefined,
    path: uri.fsPath,
  }));
  if (pinned) {
    items.unshift({
      label: "$(history) Follow the active editor",
      detail: "Clear the selected deck and resolve the entry from the editor again.",
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: "FrameSeq: Select Entry",
    placeHolder: "Choose the presentation the FrameSeq views and commands follow",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return false;

  await pinEntry(picked.path);
  if (picked.path) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(picked.path));
    await vscode.window.showTextDocument(document, { preview: false });
  }
  return true;
}

async function cliInvocation(entry: EntryDocument, args: string[]): Promise<{ command: string; args: string[] }> {
  const installedCli = join(
    entry.root,
    "node_modules",
    "@pride7",
    "frameseq",
    "scripts",
    "frameseq.mjs",
  );
  const repositoryCli = join(entry.root, "scripts", "frameseq.mjs");
  const cli = await fileExists(installedCli)
    ? installedCli
    : (await fileExists(repositoryCli) ? repositoryCli : undefined);

  if (cli) return { command: "node", args: [cli, ...args] };
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["exec", "--offline", "--", "frameseq", "--", ...args],
  };
}

async function runCli(
  entry: EntryDocument,
  args: string[],
  output: vscode.OutputChannel,
  timeout = 120_000,
): Promise<CliResult> {
  const invocation = await cliInvocation(entry, args);
  return new Promise((resolveResult, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: entry.root,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`FrameSeq command timed out after ${Math.round(timeout / 1000)} seconds.`));
    }, timeout);

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      output.append(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      output.append(text);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveResult({ code: code ?? 1, stdout, stderr });
    });
  });
}

function parseJson<T>(output: string): T {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("FrameSeq returned no JSON report.");
  return JSON.parse(output.slice(start, end + 1)) as T;
}

class SlideItem extends vscode.TreeItem {
  constructor(
    readonly slide: InspectSlide,
    readonly issues: LayoutIssue[],
  ) {
    super(
      `${slide.index}. ${slide.label}`,
      issues.length > 0 || (slide.regions?.length ?? 0) > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    const notes = slide.notes ? " · notes" : "";
    this.description = `${slide.layout} · ${slide.objectCount} objects${notes}`;
    this.contextValue = "frameseqSlide";
    this.iconPath = new vscode.ThemeIcon(
      issues.some((issue) => issue.severity === "error")
        ? "error"
        : (issues.length > 0 ? "warning" : "preview"),
    );
    this.tooltip = new vscode.MarkdownString([
      `**${slide.label}**`,
      "",
      `Layout: \`${slide.layout}\`  `,
      `Objects: ${slide.objectCount}  `,
      `Source: line ${slide.source.line}${slide.notes ? "  \nSpeaker notes: yes" : ""}`,
    ].join("\n"));
    this.command = {
      command: "frameseq.openSlide",
      title: "Open Slide",
      arguments: [this],
    };
  }
}

class RegionItem extends vscode.TreeItem {
  constructor(
    readonly region: InspectRegion,
    readonly slide: InspectSlide,
  ) {
    super(region.path, vscode.TreeItemCollapsibleState.None);
    this.description = region.visits > 1 ? `${region.visits} visits` : "region";
    this.contextValue = "frameseqRegion";
    this.iconPath = new vscode.ThemeIcon("symbol-namespace");
    this.tooltip = new vscode.MarkdownString([
      `**${region.path}**`,
      "",
      `Slide: ${slide.index}. ${slide.label}  `,
      `Source: line ${region.source.line}  `,
      `Cursor visits: ${region.visits}`,
    ].join("\n"));
    this.command = {
      command: "frameseq.focusComponent",
      title: "Focus Region",
      arguments: [this],
    };
  }
}

class ObjectItem extends vscode.TreeItem {
  constructor(
    readonly object: InspectObject,
    readonly slide: InspectSlide,
    readonly ordinal: number,
    hasChildren = false,
  ) {
    const label = object.label?.replace(/\s+/g, " ").trim();
    super(
      `${ordinal}. ${object.type}${label ? ` · ${label}` : ""}`,
      object.properties.length > 0 || hasChildren
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.id = object.id;
    this.description = `${object.name ? `${object.name} · ` : ""}line ${object.source.line}`;
    this.contextValue = "frameseqObject";
    this.iconPath = new vscode.ThemeIcon(
      object.type === "text" ? "symbol-string"
        : (object.type === "image" ? "file-media"
          : (["rect", "circle", "line"].includes(object.type) ? "symbol-structure" : "symbol-method")),
    );
    this.tooltip = new vscode.MarkdownString([
      `**${object.type}**${label ? ` — ${label}` : ""}`,
      "",
      `Open source line ${object.source.line}`,
    ].join("\n"));
    this.command = {
      command: "frameseq.focusComponent",
      title: "Focus Object",
      arguments: [this],
    };
  }
}

class PropertyItem extends vscode.TreeItem {
  constructor(
    readonly property: InspectProperty,
    readonly object: InspectObject,
    readonly slide: InspectSlide,
  ) {
    const formatted = typeof property.value === "string"
      ? property.value
      : String(property.value);
    super(`${property.name}: ${formatted}`, vscode.TreeItemCollapsibleState.None);
    this.id = `${object.id}:property:${property.name}:${property.source.start}`;
    this.description = property.kind;
    this.contextValue = "frameseqProperty";
    this.iconPath = new vscode.ThemeIcon("symbol-property");
    this.tooltip = `Edit ${property.name} on source line ${property.source.line}`;
    this.command = {
      command: "frameseq.editProperty",
      title: "Edit Property",
      arguments: [this],
    };
  }
}

class RegionPropertyItem extends vscode.TreeItem {
  constructor(
    readonly property: InspectProperty,
    readonly region: InspectRegion,
    readonly slide: InspectSlide,
  ) {
    super(`${property.name}: ${String(property.value)}`, vscode.TreeItemCollapsibleState.None);
    this.id = `${region.id}:property:${property.name}:${property.source.start}`;
    this.description = property.kind;
    this.contextValue = "frameseqProperty";
    this.iconPath = new vscode.ThemeIcon("symbol-property");
    this.tooltip = `Edit ${property.name} on named region ${region.path}`;
    this.command = {
      command: "frameseq.editProperty",
      title: "Edit Region Property",
      arguments: [this],
    };
  }
}

class RegionGroupItem extends vscode.TreeItem {
  constructor(
    readonly path: string,
    readonly objects: InspectObject[],
    readonly slide: InspectSlide,
    readonly region?: InspectRegion,
  ) {
    super(`${path} (${objects.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.id = `${slide.index}:component-region:${path}`;
    this.contextValue = region ? "frameseqRegionGroup" : "frameseqLayoutRegion";
    this.iconPath = new vscode.ThemeIcon(region ? "symbol-namespace" : "layout");
    this.description = region
      ? `named region${region.properties?.length ? ` · ${region.properties.length} properties` : ""}`
      : "layout region";
    this.tooltip = region
      ? `Named region ${path}. Expand to edit its properties; Shift-drag a child in preview edit mode to move the positioned group.`
      : `Layout region ${path}`;
    if (region) {
      this.command = {
        command: "frameseq.focusComponent",
        title: "Focus Region",
        arguments: [new RegionItem(region, slide)],
      };
    }
  }
}

class CurrentSlideSummaryItem extends vscode.TreeItem {
  constructor(readonly slide: InspectSlide, totalSlides: number) {
    super(`${slide.index}/${totalSlides} · ${slide.label}`, vscode.TreeItemCollapsibleState.None);
    this.description = `${slide.layout} · ${slide.objectCount} objects${slide.notes ? " · notes" : ""}`;
    this.iconPath = new vscode.ThemeIcon("preview");
    this.tooltip = "Preview the slide containing the cursor";
    this.command = {
      command: "frameseq.previewCurrentSlide",
      title: "Preview Current Slide",
    };
  }
}

class CurrentSlideSectionItem extends vscode.TreeItem {
  constructor(
    readonly section: "components",
    count: number,
  ) {
    super(
      `Components (${count})`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    this.contextValue = "frameseqCurrentComponents";
    this.iconPath = new vscode.ThemeIcon("list-tree");
  }
}

class IssueItem extends vscode.TreeItem {
  constructor(
    readonly issue: LayoutIssue,
    readonly slide: InspectSlide,
  ) {
    super(issue.message, vscode.TreeItemCollapsibleState.None);
    this.description = issue.rule;
    this.contextValue = "frameseqIssue";
    this.iconPath = new vscode.ThemeIcon(issue.severity === "error" ? "error" : "warning");
    this.tooltip = [issue.message, ...issue.suggestions].join("\n");
    this.command = {
      command: "frameseq.openSlide",
      title: "Open Slide",
      arguments: [this],
    };
  }
}

class SlidesProvider implements vscode.TreeDataProvider<OutlineItem> {
  private readonly changeEmitter = new vscode.EventEmitter<OutlineItem | undefined>();
  private readonly messageEmitter = new vscode.EventEmitter<string | undefined>();
  private issues = new Map<number, LayoutIssue[]>();
  report: InspectReport | undefined;
  entry: EntryDocument | undefined;

  readonly onDidChangeTreeData = this.changeEmitter.event;
  readonly onDidChangeMessage = this.messageEmitter.event;

  constructor(private readonly output: vscode.OutputChannel) {}

  getTreeItem(element: OutlineItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: OutlineItem): OutlineItem[] {
    if (element instanceof SlideItem) {
      return [
        ...(element.slide.regions ?? []).map((region) => new RegionItem(region, element.slide)),
        ...element.issues.map((issue) => new IssueItem(issue, element.slide)),
      ];
    }
    if (element) return [];
    return (this.report?.slides ?? []).map((slide) => (
      new SlideItem(slide, this.issues.get(slide.index) ?? [])
    ));
  }

  setIssues(issues: LayoutIssue[]): void {
    this.issues.clear();
    for (const issue of issues) {
      const group = this.issues.get(issue.slide.index) ?? [];
      group.push(issue);
      this.issues.set(issue.slide.index, group);
    }
    this.changeEmitter.fire(undefined);
  }

  async refresh(showError = false): Promise<void> {
    const entry = await resolveEntry();
    this.entry = entry;
    if (!entry) {
      this.report = undefined;
      this.messageEmitter.fire("Open a FrameSeq slides.ts document.");
      this.changeEmitter.fire(undefined);
      return;
    }

    try {
      const relativeEntry = relative(entry.root, entry.uri.fsPath);
      const result = await runCli(entry, ["inspect", relativeEntry, "--json"], this.output, 30_000);
      if (result.code !== 0) throw new Error(result.stderr.trim() || "FrameSeq inspect failed.");
      this.report = parseJson<InspectReport>(result.stdout);
      this.messageEmitter.fire(undefined);
      this.changeEmitter.fire(undefined);
    } catch (error) {
      this.report = undefined;
      const message = error instanceof Error ? error.message : String(error);
      this.messageEmitter.fire(message);
      this.changeEmitter.fire(undefined);
      if (showError) void vscode.window.showErrorMessage(`FrameSeq: ${message}`);
    }
  }
}

function slideForEditor(
  provider: SlidesProvider,
  editor = vscode.window.activeTextEditor,
): InspectSlide | undefined {
  if (!editor || !provider.entry || !provider.report) return undefined;
  if (editor.document.uri.toString() !== provider.entry.uri.toString()) return undefined;
  const line = editor.selection.active.line + 1;
  return provider.report.slides.find((slide) => (
    line >= slide.source.line && line <= slide.source.endLine
  )) ?? [...provider.report.slides].reverse().find((slide) => line >= slide.source.line);
}

function updateStatusBar(
  status: vscode.StatusBarItem,
  provider: SlidesProvider,
  editor = vscode.window.activeTextEditor,
): void {
  const slide = slideForEditor(provider, editor);
  if (!slide || !provider.report) {
    status.hide();
    return;
  }
  status.text = `$(open-preview) ${slide.index}/${provider.report.summary.slides} ${slide.label}`;
  status.tooltip = "Preview the slide containing the cursor";
  status.show();
}

function updateCurrentSlide(
  current: CurrentSlideProvider,
  provider: SlidesProvider,
  editor = vscode.window.activeTextEditor,
): void {
  const editorSlide = slideForEditor(provider, editor);
  const previewSlide = previewPanel && provider.report
    ? provider.report.slides[previewSlideIndex - 1]
    : undefined;
  current.setSlide(editorSlide ?? previewSlide, provider.report?.summary.slides ?? 0);
}

class CurrentSlideProvider implements vscode.TreeDataProvider<CurrentSlideItem> {
  private readonly changeEmitter = new vscode.EventEmitter<CurrentSlideItem | undefined>();
  private slide: InspectSlide | undefined;
  private totalSlides = 0;

  readonly onDidChangeTreeData = this.changeEmitter.event;

  setSlide(slide: InspectSlide | undefined, totalSlides: number): void {
    if (this.slide === slide && this.totalSlides === totalSlides) return;
    this.slide = slide;
    this.totalSlides = totalSlides;
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(element: CurrentSlideItem): vscode.TreeItem {
    return element;
  }

  private objectItem(object: InspectObject): ObjectItem {
    const slide = this.slide as InspectSlide;
    const ordinal = slide.objects.findIndex((candidate) => candidate.id === object.id) + 1;
    return new ObjectItem(
      object,
      slide,
      ordinal,
      slide.objects.some((candidate) => candidate.parentId === object.id),
    );
  }

  private regionGroup(path: string): RegionGroupItem {
    const slide = this.slide as InspectSlide;
    return new RegionGroupItem(
      path,
      slide.objects.filter((object) => object.region === path),
      slide,
      (slide.regions ?? []).find((region) => region.path === path),
    );
  }

  private regionPaths(): string[] {
    const slide = this.slide;
    if (!slide) return [];
    return [...new Set([
      ...slide.objects.map((object) => object.region || "main"),
      ...(slide.regions ?? []).map((region) => region.path),
    ])];
  }

  getParent(element: CurrentSlideItem): CurrentSlideItem | undefined {
    const slide = this.slide;
    if (!slide) return undefined;
    if (element instanceof RegionGroupItem) {
      return new CurrentSlideSectionItem("components", slide.objects.length);
    }
    if (element instanceof RegionPropertyItem) {
      return this.regionGroup(element.region.path);
    }
    if (element instanceof ObjectItem) {
      const parent = element.object.parentId
        ? slide.objects.find((object) => object.id === element.object.parentId)
        : undefined;
      return parent ? this.objectItem(parent) : this.regionGroup(element.object.region || "main");
    }
    if (element instanceof PropertyItem) {
      return this.objectItem(element.object);
    }
    return undefined;
  }

  itemAt(line: number, column?: number): RegionGroupItem | ObjectItem | undefined {
    const slide = this.slide;
    if (!slide) return undefined;
    const region = (slide.regions ?? []).find((candidate) => (
      (candidate.sources ?? [candidate.source]).some((source) => (
        source.line === line
        && (column === undefined || source.character === column)
      ))
    ));
    if (region) return this.regionGroup(region.path);
    const exact = slide.objects.findIndex((object) => (
      object.source.line === line
      && (column === undefined || object.source.character === column)
    ));
    const index = exact >= 0
      ? exact
      : slide.objects.findIndex((object) => object.source.line === line);
    return index >= 0 ? this.objectItem(slide.objects[index]) : undefined;
  }

  itemAtOffset(offset: number): RegionGroupItem | RegionPropertyItem | ObjectItem | PropertyItem | undefined {
    const slide = this.slide;
    if (!slide) return undefined;
    const region = (slide.regions ?? []).find((candidate) => (
      (candidate.sources ?? [candidate.source]).some((source) => (
        typeof source.start === "number"
        && typeof source.end === "number"
        && offset >= source.start
        && offset <= source.end
      ))
    ));
    if (region) {
      const property = region.properties?.find((candidate) => (
        offset >= candidate.source.start && offset <= candidate.source.end
      ));
      return property
        ? new RegionPropertyItem(property, region, slide)
        : this.regionGroup(region.path);
    }
    const containing = slide.objects
      .filter((object) => (
        typeof object.source.start === "number"
        && typeof object.source.end === "number"
        && offset >= object.source.start
        && offset <= object.source.end
      ))
      .sort((left, right) => (
        ((left.source.end ?? 0) - (left.source.start ?? 0))
        - ((right.source.end ?? 0) - (right.source.start ?? 0))
      ));
    const object = containing[0];
    if (!object) return undefined;
    const property = object.properties.find((candidate) => (
      offset >= candidate.source.start && offset <= candidate.source.end
    ));
    return property
      ? new PropertyItem(property, object, slide)
      : this.objectItem(object);
  }

  getChildren(element?: CurrentSlideItem): CurrentSlideItem[] {
    const slide = this.slide;
    if (!slide) return [];
    if (element instanceof CurrentSlideSectionItem) {
      return this.regionPaths().map((path) => this.regionGroup(path));
    }
    if (element instanceof RegionGroupItem) {
      return [
        ...(element.region?.properties ?? []).map((property) => (
          new RegionPropertyItem(property, element.region as InspectRegion, slide)
        )),
        ...element.objects
          .filter((object) => !object.parentId)
          .map((object) => this.objectItem(object)),
      ];
    }
    if (element instanceof ObjectItem) {
      return [
        ...element.object.properties.map((property) => new PropertyItem(property, element.object, slide)),
        ...slide.objects
          .filter((object) => object.parentId === element.object.id)
          .map((object) => this.objectItem(object)),
      ];
    }
    if (element) return [];

    const items: CurrentSlideItem[] = [new CurrentSlideSummaryItem(slide, this.totalSlides)];
    if (slide.objects.length > 0) {
      items.push(new CurrentSlideSectionItem("components", slide.objects.length));
    }
    return items;
  }
}

function updateRegionStatusBar(
  status: vscode.StatusBarItem,
  editor = vscode.window.activeTextEditor,
): void {
  if (!editor || !isSlidesDocument(editor.document.uri)) {
    status.hide();
    return;
  }
  const region = cursorRegionAt(editor.document.getText(), editor.document.offsetAt(editor.selection.active));
  if (!region) {
    status.hide();
    return;
  }
  status.text = `$(symbol-namespace) ${region}`;
  status.tooltip = `Current FrameSeq region: ${region}\nClick to jump to a named region on this slide.`;
  status.show();
}

async function goToRegion(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isSlidesDocument(editor.document.uri)) {
    void vscode.window.showInformationMessage("FrameSeq: open a slides.ts document first.");
    return;
  }
  const source = editor.document.getText();
  const offset = editor.document.offsetAt(editor.selection.active);
  const regions = regionsForOffset(source, offset);
  if (regions.length === 0) {
    void vscode.window.showInformationMessage("FrameSeq: this slide has no named at() regions yet.");
    return;
  }
  const selected = await vscode.window.showQuickPick(
    regions.map((region) => ({
      label: `$(symbol-namespace) ${region.path}`,
      description: `line ${region.line + 1}${region.visits > 1 ? ` · visited ${region.visits} times` : ""}`,
      region,
    })),
    {
      title: "Go to FrameSeq region",
      placeHolder: "Choose a named at() region on the current slide",
      matchOnDescription: true,
    },
  );
  if (!selected) return;
  const position = new vscode.Position(selected.region.line, selected.region.character);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

function selectedWholeLines(editor: vscode.TextEditor): vscode.Range | undefined {
  if (editor.selection.isEmpty) return undefined;
  const startLine = editor.selection.start.line;
  const endLine = editor.selection.end.character === 0 && editor.selection.end.line > startLine
    ? editor.selection.end.line - 1
    : editor.selection.end.line;
  const start = new vscode.Position(startLine, 0);
  const end = endLine + 1 < editor.document.lineCount
    ? new vscode.Position(endLine + 1, 0)
    : editor.document.lineAt(endLine).range.end;
  return new vscode.Range(start, end);
}

function suggestedRegionPath(source: string, offset: number): string {
  const parent = cursorRegionAt(source, offset);
  const prefix = parent && parent !== "main" ? `${parent}/` : "";
  const existing = new Set(regionsForOffset(source, offset).map((region) => region.path));
  let suffix = "group";
  let index = 2;
  while (existing.has(`${prefix}${suffix}`)) {
    suffix = `group${index}`;
    index += 1;
  }
  return `${prefix}${suffix}`;
}

/** Turn consecutive source lines into one named container without nesting the TypeScript. */
async function bindSelectionToRegion(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isSlidesDocument(editor.document.uri)) {
    void vscode.window.showInformationMessage("FrameSeq: select content in a slides.ts document first.");
    return;
  }
  const range = selectedWholeLines(editor);
  if (!range) {
    void vscode.window.showInformationMessage("FrameSeq: select the content lines to bind.");
    return;
  }
  const document = editor.document;
  const selectedSource = document.getText(range);
  if (selectionHasStructureBoundary(selectedSource)) {
    void vscode.window.showWarningMessage(
      "FrameSeq: the selection contains slide or region cursor commands. Select consecutive content commands only.",
    );
    return;
  }

  const source = document.getText();
  const startOffset = document.offsetAt(range.start);
  const previousRegion = cursorRegionAt(source, startOffset);
  if (!previousRegion) {
    void vscode.window.showWarningMessage("FrameSeq: the selection must be inside a slide.");
    return;
  }
  const existing = new Set(regionsForOffset(source, startOffset).map((region) => region.path));
  const path = await vscode.window.showInputBox({
    title: "Bind selection to a named FrameSeq region",
    prompt: "The selected commands will move together when this region is positioned or anchored.",
    value: suggestedRegionPath(source, startOffset),
    validateInput: (value) => {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*(?:\/[A-Za-z_][A-Za-z0-9_-]*)*$/.test(value)) {
        return "Use path segments made from letters, digits, _ or -, starting with a letter.";
      }
      if (existing.has(value)) return `The region “${value}” already exists on this slide.`;
      return undefined;
    },
  });
  if (!path) return;

  const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
  const indentation = document.lineAt(range.start.line).text.match(/^\s*/)?.[0] ?? "";
  const restore = previousRegion === "main" ? "main();" : `at(${JSON.stringify(previousRegion)});`;
  const hasTrailingLineBreak = selectedSource.endsWith("\n");
  const replacement = `${indentation}at(${JSON.stringify(path)}).column();${eol}`
    + selectedSource
    + (hasTrailingLineBreak ? "" : eol)
    + `${indentation}${restore}${hasTrailingLineBreak ? eol : ""}`;

  const applied = await editor.edit((edit) => edit.replace(range, replacement), {
    undoStopBefore: true,
    undoStopAfter: true,
  });
  if (!applied) return;
  const pathOffset = document.offsetAt(range.start) + indentation.length + 4;
  const position = document.positionAt(pathOffset);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position));
}

/** Show the command an object in the live preview came from, sent there by an Alt-click. */
async function revealSourceLine(line: number, column: number): Promise<void> {
  const entry = await resolveEntry();
  if (!entry) return;
  const document = await vscode.workspace.openTextDocument(entry.uri);
  const editor = await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.One,
    preserveFocus: false,
    preview: false,
  });
  const position = new vscode.Position(
    Math.max(0, Math.min(line - 1, document.lineCount - 1)),
    Math.max(0, column - 1),
  );
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );
}

function readPreviewSelection(message: unknown): PreviewSelectionTarget[] | undefined {
  const values = (message as { targets?: unknown } | undefined)?.targets;
  if (!Array.isArray(values) || values.length === 0 || values.length > 50) return undefined;
  const targets: PreviewSelectionTarget[] = [];
  for (const value of values) {
    const { line, column, start, end } = (value ?? {}) as Record<string, unknown>;
    if (![line, column, start, end].every(Number.isInteger)) return undefined;
    if ((line as number) < 1 || (column as number) < 1 || (start as number) < 0) return undefined;
    if ((end as number) <= (start as number)) return undefined;
    targets.push({
      line: line as number,
      column: column as number,
      start: start as number,
      end: end as number,
    });
  }
  return targets;
}

async function selectPreviewTargets(
  message: unknown,
  provider: SlidesProvider,
  current: CurrentSlideProvider,
): Promise<void> {
  const targets = readPreviewSelection(message);
  const entry = targets && (provider.entry ?? await resolveEntry());
  if (!targets || !entry) return;
  const document = await vscode.workspace.openTextDocument(entry.uri);
  if (targets.some((target) => target.end > document.getText().length)) return;
  const primary = targets.at(-1) as PreviewSelectionTarget;
  const editor = vscode.window.visibleTextEditors.find((candidate) => (
    candidate.document.uri.toString() === entry.uri.toString()
  ));
  if (editor) {
    const ordered = [primary, ...targets.slice(0, -1)];
    editor.selections = ordered.map((target) => new vscode.Selection(
      document.positionAt(target.start),
      document.positionAt(target.end),
    ));
    const primaryRange = new vscode.Range(
      document.positionAt(primary.start),
      document.positionAt(primary.end),
    );
    editor.revealRange(primaryRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    updateCurrentSlide(current, provider, editor);
  } else {
    const slide = provider.report?.slides.find((candidate) => (
      primary.line >= candidate.source.line && primary.line <= candidate.source.endLine
    ));
    if (slide) current.setSlide(slide, provider.report?.summary.slides ?? slide.index);
  }
  selectCurrentSlideSource(primary.line, primary.column);
}

async function bindPreviewSelection(
  message: unknown,
  provider: SlidesProvider,
  current: CurrentSlideProvider,
): Promise<void> {
  const targets = readPreviewSelection(message);
  const entry = targets && (provider.entry ?? await resolveEntry());
  if (!targets || targets.length < 2 || !entry || !provider.report) return;
  const selectedStarts = new Set(targets.map((target) => target.start));
  const selectedObjects = provider.report.slides
    .flatMap((slide) => slide.objects.map((object) => ({ slide, object })))
    .filter(({ object }) => typeof object.source.start === "number" && selectedStarts.has(object.source.start));
  if (selectedObjects.length !== selectedStarts.size
    || selectedObjects.some(({ object }) => object.parentId)) {
    void vscode.window.showWarningMessage(
      "FrameSeq: bind top-level components from one region; nested or region-container selections are not supported.",
    );
    return;
  }
  const [{ slide }] = selectedObjects;
  if (selectedObjects.some((candidate) => (
    candidate.slide.index !== slide.index || candidate.object.region !== selectedObjects[0].object.region
  ))) {
    void vscode.window.showWarningMessage("FrameSeq: selected components must belong to one slide and one region.");
    return;
  }
  const siblings = slide.objects
    .filter((object) => !object.parentId && object.region === selectedObjects[0].object.region)
    .sort((left, right) => (left.source.start ?? 0) - (right.source.start ?? 0));
  const indices = selectedObjects
    .map(({ object }) => siblings.findIndex((candidate) => candidate.id === object.id))
    .sort((left, right) => left - right);
  if (indices.some((index) => index < 0)
    || indices.at(-1) as number - indices[0] + 1 !== indices.length) {
    void vscode.window.showWarningMessage(
      "FrameSeq: multi-selected components must be consecutive; select the components between them too.",
    );
    return;
  }

  const document = await vscode.workspace.openTextDocument(entry.uri);
  const first = siblings[indices[0]];
  const last = siblings[indices.at(-1) as number];
  const start = new vscode.Position(document.positionAt(first.source.start as number).line, 0);
  const lastLine = document.positionAt(last.source.end as number).line;
  const end = lastLine + 1 < document.lineCount
    ? new vscode.Position(lastLine + 1, 0)
    : document.lineAt(lastLine).range.end;
  const editor = await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.One,
    preserveFocus: false,
    preview: false,
  });
  editor.selection = new vscode.Selection(start, end);
  await bindSelectionToRegion();
  await provider.refresh();
  updateCurrentSlide(current, provider, editor);
}

function selectCurrentSlideSource(line: number, column?: number): void {
  setTimeout(() => {
    const item = activeCurrentSlideProvider?.itemAt(line, column);
    if (item && activeCurrentSlideTree) {
      void activeCurrentSlideTree.reveal(item, { select: true, focus: false, expand: true });
    }
  }, 50);
}

function previewFocus(target?: PreviewComponentTarget): void {
  if (!previewPanel) return;
  void previewPanel.webview.postMessage(target
    ? { type: "frameseq.focus-source", ...target }
    : { type: "frameseq.focus-source", clear: true });
}

function syncEditorComponent(
  current: CurrentSlideProvider,
  provider: SlidesProvider,
  editor: vscode.TextEditor,
): void {
  if (!isSlidesDocument(editor.document.uri)) return;
  const enabled = vscode.workspace
    .getConfiguration("frameseq", editor.document.uri)
    .get<boolean>("followCursor", true);
  if (!enabled) return;
  const slide = slideForEditor(provider, editor);
  const item = slide
    ? current.itemAtOffset(editor.document.offsetAt(editor.selection.active))
    : undefined;
  const object = item instanceof PropertyItem
    ? item.object
    : (item instanceof ObjectItem ? item.object : undefined);
  const region = item instanceof RegionPropertyItem
    ? item.region
    : (item instanceof RegionGroupItem ? item.region : undefined);
  const selectionId = item?.id;
  if (selectionId !== lastEditorSelectionId && item && activeCurrentSlideTree) {
    lastEditorSelectionId = selectionId;
    void activeCurrentSlideTree.reveal(item, { select: true, focus: false, expand: true });
  } else if (!item) {
    lastEditorSelectionId = undefined;
  }
  previewFocus(slide && region ? {
    slideIndex: slide.index,
    name: region.path,
  } : (object && slide ? {
    slideIndex: slide.index,
    line: object.source.line,
    column: object.source.character,
  } : undefined));
}

function scheduleEditorComponentSync(
  current: CurrentSlideProvider,
  provider: SlidesProvider,
  editor: vscode.TextEditor,
): void {
  if (editorSelectionTimer) clearTimeout(editorSelectionTimer);
  editorSelectionTimer = setTimeout(() => {
    editorSelectionTimer = undefined;
    syncEditorComponent(current, provider, editor);
  }, 80);
}

interface IncomingEdit {
  start: number;
  end: number;
  expected: string;
  value: number;
}

/**
 * Read the numbers a drag in the preview asks to rewrite. Only offsets and numbers are
 * accepted, so the preview can never introduce source text of its own choosing. The
 * development server applies the same rules; this path exists so the change lands in the
 * editor's undo history instead of arriving as a file that changed underneath it.
 */
function readIncomingEdits(message: unknown): IncomingEdit[] | undefined {
  const edits = (message as { edits?: unknown } | undefined)?.edits;
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > 100) return undefined;

  const parsed: IncomingEdit[] = [];
  for (const candidate of edits) {
    const { start, end, expected, value } = (candidate ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(start) || !Number.isInteger(end)) return undefined;
    if ((start as number) < 0 || (end as number) <= (start as number)) return undefined;
    if (typeof expected !== "string" || expected.length !== (end as number) - (start as number)) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    parsed.push({ start: start as number, end: end as number, expected, value });
  }

  const ordered = [...parsed].sort((a, b) => a.start - b.start);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end) return undefined;
  }
  return ordered;
}

/**
 * Apply a drag from the preview to the slide document, then save so the preview refreshes from
 * it. Going through the workspace means one Undo puts the object back where it was.
 */
interface IncomingMove {
  start: number;
  end: number;
  expected: string;
  at: number;
}

function readIncomingMove(message: unknown): IncomingMove | undefined {
  const move = (message as { move?: unknown } | undefined)?.move as
    Record<string, unknown> | undefined;
  if (!move) return undefined;
  const { start, end, expected, at } = move;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return undefined;
  if ((start as number) < 0 || (end as number) <= (start as number)) return undefined;
  if (typeof expected !== "string" || expected.length !== (end as number) - (start as number)) return undefined;
  if (!Number.isInteger(at) || (at as number) < 0) return undefined;
  if ((at as number) > (start as number) && (at as number) < (end as number)) return undefined;
  return { start: start as number, end: end as number, expected, at: at as number };
}

/**
 * Carry a command's lines to another place among its neighbours. The two halves are stated
 * against the document as it stands, which is how a workspace edit reads them, so they compose
 * without either having to account for the other.
 */
async function applyPreviewMove(message: unknown): Promise<boolean> {
  const move = readIncomingMove(message);
  const entry = move && await resolveEntry();
  if (!move || !entry) return false;

  const document = await vscode.workspace.openTextDocument(entry.uri);
  const range = new vscode.Range(document.positionAt(move.start), document.positionAt(move.end));
  if (document.getText(range) !== move.expected) return false;
  if (move.at === move.start || move.at === move.end) return true;

  const edit = new vscode.WorkspaceEdit();
  edit.delete(entry.uri, range);
  edit.insert(entry.uri, document.positionAt(move.at), move.expected);
  if (!await vscode.workspace.applyEdit(edit)) return false;
  return document.save();
}

async function applyPreviewEdits(message: unknown): Promise<boolean> {
  const edits = readIncomingEdits(message);
  const entry = edits && await resolveEntry();
  if (!edits || !entry) return false;

  const document = await vscode.workspace.openTextDocument(entry.uri);
  const ranges = edits.map((edit) => new vscode.Range(
    document.positionAt(edit.start),
    document.positionAt(edit.end),
  ));
  // Refuse a drag whose numbers have moved on rather than overwrite whatever is there now.
  if (ranges.some((range, index) => document.getText(range) !== edits[index].expected)) return false;

  const edit = new vscode.WorkspaceEdit();
  for (const [index, range] of ranges.entries()) {
    edit.replace(entry.uri, range, String(Math.round(edits[index].value)));
  }
  if (!await vscode.workspace.applyEdit(edit)) return false;
  return document.save();
}

async function editProperty(
  provider: SlidesProvider,
  current: CurrentSlideProvider,
  item?: PropertyItem | RegionPropertyItem,
): Promise<void> {
  if (!(item instanceof PropertyItem) && !(item instanceof RegionPropertyItem)) return;
  const entry = provider.entry ?? await resolveEntry();
  if (!entry) {
    void vscode.window.showErrorMessage("FrameSeq: no slides entry file was found.");
    return;
  }

  const { property } = item;
  const owner = item instanceof PropertyItem
    ? (item.object.name ?? item.object.type)
    : item.region.path;
  const value = await vscode.window.showInputBox({
    title: `Edit ${owner}.${property.name}`,
    prompt: `Updates the TypeScript literal on line ${property.source.line}; Undo restores it.`,
    value: String(property.value),
    valueSelection: [0, String(property.value).length],
    validateInput: (input) => formatPropertyValue(property.kind, property.expected, input) === undefined
      ? `Enter a valid ${property.kind} value.`
      : undefined,
  });
  if (value === undefined) return;
  const replacement = formatPropertyValue(property.kind, property.expected, value);
  if (replacement === undefined) return;

  const document = await vscode.workspace.openTextDocument(entry.uri);
  const range = new vscode.Range(
    document.positionAt(property.source.start),
    document.positionAt(property.source.end),
  );
  if (document.getText(range) !== property.expected) {
    await provider.refresh();
    updateCurrentSlide(current, provider);
    void vscode.window.showWarningMessage(
      "FrameSeq: this property moved since the inspector was refreshed. Save the file and try again.",
    );
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.replace(entry.uri, range, replacement);
  if (!await vscode.workspace.applyEdit(edit)) {
    void vscode.window.showErrorMessage("FrameSeq: the property edit could not be applied.");
    return;
  }
  await document.save();
  await provider.refresh();
  updateCurrentSlide(current, provider);
}

async function openSlide(
  provider: SlidesProvider,
  current: CurrentSlideProvider,
  item?: OutlineItem,
  followPreview = true,
): Promise<void> {
  const entry = provider.entry ?? await resolveEntry();
  const slide = item?.slide;
  if (!entry || !slide) return;
  const document = await vscode.workspace.openTextDocument(entry.uri);
  // Once a preview exists, outline navigation must not flash a hidden source tab before
  // returning to the preview. A source editor already visible beside it can still follow
  // silently; a source tab hidden behind the preview stays hidden.
  const visibleSourceEditor = vscode.window.visibleTextEditors.find((candidate) => (
    candidate.document.uri.toString() === entry.uri.toString()
  ));
  const editor = previewPanel
    ? visibleSourceEditor
    : await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
      preview: false,
    });
  const source = item instanceof RegionItem
    ? item.region.source
    : (item instanceof ObjectItem ? item.object.source : slide.source);
  const position = new vscode.Position(
    Math.max(0, source.line - 1),
    Math.max(0, source.character - 1),
  );
  if (editor) {
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
  previewSlideIndex = slide.index;
  setPreviewSourceMarker(entry, slide, source);
  current.setSlide(slide, provider.report?.summary.slides ?? slide.index);
  const followOutline = vscode.workspace
    .getConfiguration("frameseq", entry.uri)
    .get<boolean>("followOutline", true);
  if (followPreview && followOutline && previewProcess && previewAddress) {
    await openPreviewUrl(previewAddress, entry, slide.index);
  }
}

async function focusComponent(
  provider: SlidesProvider,
  current: CurrentSlideProvider,
  output: vscode.OutputChannel,
  item?: RegionItem | RegionGroupItem | ObjectItem,
): Promise<void> {
  if (!item) return;
  const target = item instanceof RegionGroupItem && item.region
    ? new RegionItem(item.region, item.slide)
    : item;
  if (target instanceof RegionGroupItem) return;
  pendingPreviewFocus = target instanceof RegionItem
    ? { slideIndex: target.slide.index, name: target.region.path }
    : {
      slideIndex: target.slide.index,
      line: target.object.source.line,
      column: target.object.source.character,
    };
  await openSlide(provider, current, target, false);
  await previewSlide(provider, output, target.slide.index);
}

async function openPreviewUrl(
  url: string,
  entry?: EntryDocument,
  slideIndex = previewSlideIndex,
): Promise<void> {
  const refreshedUrl = new URL(url);
  refreshedUrl.searchParams.set("frameseq-preview", Date.now().toString(36));
  refreshedUrl.hash = String(slideIndex);
  const previewBeside = entry
    ? vscode.workspace.getConfiguration("frameseq", entry.uri).get<boolean>("previewBeside", true)
    : true;
  const createsPanel = !previewPanel;
  const existingPanelColumn = previewPanel?.viewColumn;

  if (entry && previewBeside && createsPanel) {
    const document = await vscode.workspace.openTextDocument(entry.uri);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
      preview: false,
    });
  }

  const externalUri = await vscode.env.asExternalUri(vscode.Uri.parse(refreshedUrl.toString()));
  const externalUrl = externalUri.toString();
  const panelColumn = existingPanelColumn
    ?? (previewBeside ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active);
  const focus = pendingPreviewFocus?.slideIndex === slideIndex ? pendingPreviewFocus : undefined;
  if (!previewPanel) {
    previewPanel = vscode.window.createWebviewPanel(
      "frameseq.preview",
      "FrameSeq Preview",
      panelColumn,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    previewPanel.onDidDispose(() => {
      previewPanel = undefined;
    });
    previewPanel.webview.onDidReceiveMessage((message: unknown) => {
      const request = message as { type?: unknown; line?: unknown; column?: unknown } | undefined;
      if (request?.type === "frameseq.reveal" && typeof request.line === "number") {
        const line = request.line;
        const column = typeof request.column === "number" ? request.column : 1;
        void revealSourceLine(line, column).then(() => {
          selectCurrentSlideSource(line, column);
        });
        return;
      }
      if (request?.type === "frameseq.select") {
        if (activeSlidesProvider && activeCurrentSlideProvider) {
          void selectPreviewTargets(message, activeSlidesProvider, activeCurrentSlideProvider);
        }
        return;
      }
      if (request?.type === "frameseq.bind-selection") {
        if (activeSlidesProvider && activeCurrentSlideProvider) {
          void bindPreviewSelection(message, activeSlidesProvider, activeCurrentSlideProvider);
        }
        return;
      }
      if (request?.type === "frameseq.edit") {
        const applied = (message as { move?: unknown }).move
          ? applyPreviewMove(message)
          : applyPreviewEdits(message);
        void applied.then((ok) => {
          void previewPanel?.webview.postMessage({ type: "frameseq.edit-result", ok });
        });
      }
    });
  } else {
    previewPanel.reveal(panelColumn, false);
  }
  previewPanel.title = `FrameSeq · Slide ${slideIndex}`;
  if (createsPanel) {
    previewPanel.webview.html = previewWebviewHtml(externalUrl, focus);
  } else {
    const delivered = await previewPanel.webview.postMessage({
      type: "frameseq.navigate",
      url: externalUrl,
      focus,
    });
    if (!delivered) previewPanel.webview.html = previewWebviewHtml(externalUrl, focus);
  }
  if (focus) pendingPreviewFocus = undefined;
}

function previewWebviewHtml(url: string, focus?: PreviewComponentTarget): string {
  const origin = new URL(url).origin;
  const nonce = randomBytes(16).toString("hex");
  const escapeAttribute = (value: string): string => value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const initialFocus = JSON.stringify(focus ?? null).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escapeAttribute(origin)}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #09090b; }
      iframe { display: block; width: 100%; height: 100%; border: 0; background: #09090b; }
    </style>
  </head>
  <body>
    <iframe id="frameseq-preview"
      src="${escapeAttribute(url)}"
      title="FrameSeq live preview"
      sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox"
      allow="fullscreen; clipboard-read; clipboard-write"
      allowfullscreen
    ></iframe>
    <script nonce="${nonce}">
      const preview = document.getElementById("frameseq-preview");
      const editor = acquireVsCodeApi();
      let pendingFocus = ${initialFocus};
      preview.addEventListener("load", () => {
        if (pendingFocus) preview.contentWindow?.postMessage({ type: "frameseq.focus-source", ...pendingFocus }, "*");
      });
      window.addEventListener("message", (event) => {
        const message = event.data;
        if (!message) return;
        if (event.source === preview.contentWindow) {
          // Alt-clicking asks for a line; dragging asks for numbers to be rewritten.
          if (["frameseq.reveal", "frameseq.edit", "frameseq.select", "frameseq.bind-selection"].includes(message.type)) {
            editor.postMessage(message);
          }
          return;
        }
        if (message.type === "frameseq.navigate" && typeof message.url === "string") {
          pendingFocus = message.focus || null;
          preview.src = message.url;
          return;
        }
        if (message.type === "frameseq.focus-source") {
          pendingFocus = message;
          preview.contentWindow?.postMessage(message, "*");
          return;
        }
        if (message.type === "frameseq.edit-result") {
          preview.contentWindow?.postMessage(message, "*");
        }
      });
    </script>
  </body>
</html>`;
}

function schedulePreviewOpen(
  url: string,
  child: ChildProcessWithoutNullStreams,
  output: vscode.OutputChannel,
  entry: EntryDocument,
): void {
  if (previewOpenTimer) clearTimeout(previewOpenTimer);
  output.appendLine("FrameSeq preview is starting; waiting for Vite to finish preparing modules...");
  previewOpenTimer = setTimeout(() => {
    previewOpenTimer = undefined;
    if (previewProcess !== child) return;
    void openPreviewUrl(url, entry);
  }, 1_200);
}

async function stopPreview(): Promise<void> {
  previewWasStopped = true;
  if (previewOpenTimer) clearTimeout(previewOpenTimer);
  previewOpenTimer = undefined;
  previewPanel?.dispose();
  previewPanel = undefined;
  previewProcess?.kill();
  previewProcess = undefined;
  previewAddress = undefined;
  await vscode.commands.executeCommand("setContext", "frameseq.previewRunning", false);
}

async function startPreview(provider: SlidesProvider, output: vscode.OutputChannel): Promise<void> {
  const entry = provider.entry ?? await resolveEntry();
  if (!entry) {
    void vscode.window.showErrorMessage("FrameSeq: no slides entry file was found.");
    return;
  }
  if (previewProcess) {
    const configuredUrl = vscode.workspace
      .getConfiguration("frameseq", entry.uri)
      .get<string>("previewUrl", "http://localhost:5173");
    await openPreviewUrl(previewAddress ?? configuredUrl, entry);
    return;
  }

  const relativeEntry = relative(entry.root, entry.uri.fsPath);
  const invocation = await cliInvocation(entry, ["dev", relativeEntry, "--no-open"]);
  output.clear();
  output.appendLine(`> ${invocation.command} ${invocation.args.join(" ")}`);
  previewWasStopped = false;
  let openedUrl: string | undefined;
  const child = spawn(invocation.command, invocation.args, {
    cwd: entry.root,
    env: {
      ...process.env,
      BROWSER: "none",
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    },
    windowsHide: true,
  });
  previewProcess = child;
  await vscode.commands.executeCommand("setContext", "frameseq.previewRunning", true);

  const handleOutput = (chunk: Buffer) => {
    const text = chunk.toString();
    output.append(text);
    const url = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?/)?.[0];
    if (url && url !== openedUrl) {
      openedUrl = url;
      previewAddress = url;
      schedulePreviewOpen(url, child, output, entry);
    }
  };
  child.stdout.on("data", handleOutput);
  child.stderr.on("data", handleOutput);
  child.on("error", (error) => {
    output.show(true);
    void vscode.window.showErrorMessage(`FrameSeq preview failed: ${error.message}`);
  });
  child.on("close", (code) => {
    if (previewOpenTimer) clearTimeout(previewOpenTimer);
    previewOpenTimer = undefined;
    previewProcess = undefined;
    previewAddress = undefined;
    void vscode.commands.executeCommand("setContext", "frameseq.previewRunning", false);
    if (!previewWasStopped && code !== 0) {
      output.show(true);
      void vscode.window.showErrorMessage(`FrameSeq preview exited with code ${code ?? 1}.`);
    }
  });

  setTimeout(() => {
    if (!openedUrl && previewProcess === child) {
      const configuredUrl = vscode.workspace
        .getConfiguration("frameseq", entry.uri)
        .get<string>("previewUrl", "http://localhost:5173");
      openedUrl = configuredUrl;
      previewAddress = configuredUrl;
      void openPreviewUrl(configuredUrl, entry);
    }
  }, 2_000);
}

async function previewSlide(
  provider: SlidesProvider,
  output: vscode.OutputChannel,
  requestedIndex?: number,
): Promise<void> {
  const report = provider.report;
  const cursorSlide = slideForEditor(provider);
  const slideCount = report?.summary.slides ?? 1;
  const index = requestedIndex ?? cursorSlide?.index ?? previewSlideIndex;
  previewSlideIndex = Math.min(Math.max(index, 1), slideCount);
  const targetSlide = report?.slides[previewSlideIndex - 1];
  const markerEntry = provider.entry ?? await resolveEntry();
  if (targetSlide && markerEntry) setPreviewSourceMarker(markerEntry, targetSlide);
  if (!previewProcess) {
    await startPreview(provider, output);
    return;
  }
  const entry = provider.entry ?? await resolveEntry();
  if (!entry) return;
  const configuredUrl = vscode.workspace
    .getConfiguration("frameseq", entry.uri)
    .get<string>("previewUrl", "http://localhost:5173");
  await openPreviewUrl(previewAddress ?? configuredUrl, entry, previewSlideIndex);
}

async function insertSlide(provider: SlidesProvider): Promise<void> {
  await provider.refresh(true);
  const entry = provider.entry;
  const report = provider.report;
  if (!entry || !report) return;
  const document = await vscode.workspace.openTextDocument(entry.uri);
  const editor = await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.One,
    preserveFocus: false,
    preview: false,
  });
  const current = slideForEditor(provider, editor) ?? report.slides.at(-1);
  if (!current) return;
  const insertsBeforeFollowingSlide = current.source.endLine < document.lineCount;
  const position = insertsBeforeFollowingSlide
    ? new vscode.Position(current.source.endLine, 0)
    : document.lineAt(document.lineCount - 1).range.end;
  editor.selection = new vscode.Selection(position, position);
  await editor.insertSnippet(new vscode.SnippetString(
    `${insertsBeforeFollowingSlide ? "" : "\n\n"}slide("\${1:New slide}");\ntext("\${2:Start with one clear idea.}");\n\n`,
  ));
}

function diagnosticRange(slide: InspectSlide): vscode.Range {
  const line = Math.max(0, slide.source.line - 1);
  const character = Math.max(0, slide.source.character - 1);
  return new vscode.Range(line, character, line, character + 5);
}

async function checkLayout(
  provider: SlidesProvider,
  diagnostics: vscode.DiagnosticCollection,
  output: vscode.OutputChannel,
): Promise<void> {
  await provider.refresh(true);
  const entry = provider.entry;
  const inspect = provider.report;
  if (!entry || !inspect) return;
  const relativeEntry = relative(entry.root, entry.uri.fsPath);
  output.clear();
  output.appendLine(`Checking ${relativeEntry}...`);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "FrameSeq: checking layout" },
    async () => {
      const result = await runCli(entry, ["check", relativeEntry, "--json"], output);
      let report: LayoutReport;
      try {
        report = parseJson<LayoutReport>(result.stdout);
      } catch (error) {
        const detail = result.stderr.trim() || (error instanceof Error ? error.message : String(error));
        throw new Error(detail);
      }

      const editorDiagnostics: vscode.Diagnostic[] = [];
      for (const issue of report.issues) {
        const slide = inspect.slides[issue.slide.index - 1];
        if (!slide) continue;
        const diagnostic = new vscode.Diagnostic(
          diagnosticRange(slide),
          `[${issue.rule}] ${issue.message}${issue.suggestions[0] ? ` ${issue.suggestions[0]}` : ""}`,
          issue.severity === "error"
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = "FrameSeq";
        diagnostic.code = issue.rule;
        editorDiagnostics.push(diagnostic);
      }
      diagnostics.set(entry.uri, editorDiagnostics);
      provider.setIssues(report.issues);

      const summary = `${report.summary.errors} errors, ${report.summary.warnings} warnings`;
      if (report.issues.length === 0) {
        void vscode.window.showInformationMessage(`FrameSeq: ${report.summary.slides} slides checked; no layout issues.`);
      } else if (report.summary.errors > 0) {
        void vscode.window.showErrorMessage(`FrameSeq layout check: ${summary}.`);
      } else {
        void vscode.window.showWarningMessage(`FrameSeq layout check: ${summary}.`);
      }
    },
  );
}

async function exportPresentation(
  provider: SlidesProvider,
  output: vscode.OutputChannel,
  format: "html" | "pdf" | "pptx" | "typst",
): Promise<void> {
  const entry = provider.entry ?? await resolveEntry();
  if (!entry) {
    void vscode.window.showErrorMessage("FrameSeq: no slides entry file was found.");
    return;
  }
  const relativeEntry = relative(entry.root, entry.uri.fsPath);
  output.clear();
  output.show(true);
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `FrameSeq: exporting ${format.toUpperCase()}`,
      cancellable: false,
    },
    async () => {
      const command = format === "html" ? "build" : format;
      const result = await runCli(entry, [command, relativeEntry], output);
      if (result.code !== 0) throw new Error(result.stderr.trim() || `FrameSeq ${format} export failed.`);
    },
  );
  void vscode.window.showInformationMessage(`FrameSeq ${format.toUpperCase()} export completed.`);
}

async function chooseExportFormat(
  provider: SlidesProvider,
  output: vscode.OutputChannel,
): Promise<void> {
  const selected = await vscode.window.showQuickPick([
    { label: "$(globe) HTML", description: "Static website", format: "html" as const },
    { label: "$(file-pdf) PDF", description: "Portable document", format: "pdf" as const },
    { label: "$(file-binary) PPTX", description: "Editable PowerPoint", format: "pptx" as const },
    { label: "$(code) Typst", description: "Editable Typst source", format: "typst" as const },
  ], {
    placeHolder: "Choose a FrameSeq export format",
    title: "Export presentation",
  });
  if (selected) await exportPresentation(provider, output, selected.format);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  entryStore = context.workspaceState;
  const output = vscode.window.createOutputChannel("FrameSeq");
  const diagnostics = vscode.languages.createDiagnosticCollection("frameseq");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.name = "FrameSeq current slide";
  status.command = "frameseq.previewCurrentSlide";
  const regionStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  regionStatus.name = "FrameSeq current region";
  regionStatus.command = "frameseq.goToRegion";
  previewLineDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("editor.wordHighlightStrongBackground"),
    borderColor: new vscode.ThemeColor("editorInfo.foreground"),
    borderStyle: "solid",
    borderWidth: "0 0 0 3px",
    overviewRulerColor: new vscode.ThemeColor("editorInfo.foreground"),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });
  const provider = new SlidesProvider(output);
  const current = new CurrentSlideProvider();
  const tree = vscode.window.createTreeView("frameseq.slides", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  const currentTree = vscode.window.createTreeView("frameseq.currentSlide", {
    treeDataProvider: current,
    showCollapseAll: true,
  });
  activeSlidesProvider = provider;
  activeCurrentSlideProvider = current;
  activeCurrentSlideTree = currentTree;
  context.subscriptions.push(
    output,
    diagnostics,
    status,
    regionStatus,
    tree,
    currentTree,
    previewLineDecoration,
  );
  context.subscriptions.push(provider.onDidChangeMessage((message) => {
    tree.message = message;
  }));
  context.subscriptions.push(provider.onDidChangeTreeData(() => {
    tree.description = entryDescription(provider.entry);
  }));
  context.subscriptions.push(vscode.commands.registerCommand("frameseq.refresh", async () => {
    await provider.refresh(true);
    refreshPreviewSourceMarker(provider);
    updateStatusBar(status, provider);
    updateCurrentSlide(current, provider);
  }));
  context.subscriptions.push(vscode.commands.registerCommand("frameseq.selectEntry", async () => {
    const previous = provider.entry?.uri.toString();
    if (!await selectEntry(provider)) return;
    await provider.refresh(true);
    const changed = provider.entry !== undefined && provider.entry.uri.toString() !== previous;
    if (changed) {
      diagnostics.clear();
      provider.setIssues([]);
      previewSlideIndex = 1;
      previewSourceMarker = undefined;
      applyPreviewSourceMarker();
      // A running preview still serves the previous deck, so move it to the new one.
      if (previewProcess) {
        await stopPreview();
        await startPreview(provider, output);
      }
    }
    refreshPreviewSourceMarker(provider);
    updateStatusBar(status, provider);
    updateCurrentSlide(current, provider);
    if (provider.entry) {
      void vscode.window.showInformationMessage(
        pinnedEntryPath()
          ? `FrameSeq follows ${entryLabel(provider.entry.uri)} until you select another entry.`
          : "FrameSeq follows the active editor again.",
      );
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.openSlide",
    (item?: OutlineItem) => openSlide(provider, current, item),
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.focusComponent",
    (item?: RegionItem | RegionGroupItem | ObjectItem) => focusComponent(provider, current, output, item),
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.editProperty",
    (item?: PropertyItem | RegionPropertyItem) => editProperty(provider, current, item),
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.preview",
    () => previewSlide(provider, output),
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.previewCurrentSlide",
    () => previewSlide(provider, output, slideForEditor(provider)?.index),
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.previousSlide",
    () => previewSlide(provider, output, previewSlideIndex - 1),
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.nextSlide",
    () => previewSlide(provider, output, previewSlideIndex + 1),
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.insertSlide",
    async () => {
      await insertSlide(provider);
      updateStatusBar(status, provider);
      updateCurrentSlide(current, provider);
    },
  ));
  context.subscriptions.push(vscode.commands.registerCommand("frameseq.goToRegion", goToRegion));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.bindSelectionToRegion",
    bindSelectionToRegion,
  ));
  context.subscriptions.push(vscode.commands.registerCommand("frameseq.stopPreview", stopPreview));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.check",
    async () => {
      try {
        await checkLayout(provider, diagnostics, output);
        updateCurrentSlide(current, provider);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.show(true);
        void vscode.window.showErrorMessage(`FrameSeq check failed: ${message}`);
      }
    },
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.export",
    async () => {
      try {
        await chooseExportFormat(provider, output);
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    },
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.exportHtml",
    async () => {
      try {
        await exportPresentation(provider, output, "html");
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    },
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.exportPdf",
    async () => {
      try {
        await exportPresentation(provider, output, "pdf");
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    },
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.exportPptx",
    async () => {
      try {
        await exportPresentation(provider, output, "pptx");
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    },
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.exportTypst",
    async () => {
      try {
        await exportPresentation(provider, output, "typst");
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    },
  ));

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
    const autoRefresh = vscode.workspace
      .getConfiguration("frameseq", document.uri)
      .get<boolean>("autoRefresh", true);
    if (autoRefresh && isSlidesDocument(document.uri)) {
      diagnostics.delete(document.uri);
      provider.setIssues([]);
      void provider.refresh().then(() => {
        refreshPreviewSourceMarker(provider);
        updateStatusBar(status, provider);
        updateCurrentSlide(current, provider);
      });
      updateRegionStatusBar(regionStatus, vscode.window.activeTextEditor);
    }
  }));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) applyPreviewSourceMarker(editor);
    if (editor && isSlidesDocument(editor.document.uri)) {
      void provider.refresh().then(() => {
        const slide = slideForEditor(provider, editor);
        if (slide) previewSlideIndex = slide.index;
        refreshPreviewSourceMarker(provider);
        updateStatusBar(status, provider, editor);
        updateRegionStatusBar(regionStatus, editor);
        updateCurrentSlide(current, provider, editor);
        scheduleEditorComponentSync(current, provider, editor);
      });
    } else {
      updateStatusBar(status, provider, editor);
      updateRegionStatusBar(regionStatus, editor);
      updateCurrentSlide(current, provider, editor);
    }
  }));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => {
    const slide = slideForEditor(provider, event.textEditor);
    if (slide) previewSlideIndex = slide.index;
    updateStatusBar(status, provider, event.textEditor);
    updateRegionStatusBar(regionStatus, event.textEditor);
    updateCurrentSlide(current, provider, event.textEditor);
    scheduleEditorComponentSync(current, provider, event.textEditor);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("frameseq")) {
      void provider.refresh().then(() => {
        refreshPreviewSourceMarker(provider);
        updateStatusBar(status, provider);
        updateCurrentSlide(current, provider);
      });
    }
  }));

  await vscode.commands.executeCommand("setContext", "frameseq.previewRunning", false);
  await provider.refresh();
  const initialSlide = slideForEditor(provider);
  if (initialSlide) previewSlideIndex = initialSlide.index;
  updateStatusBar(status, provider);
  updateRegionStatusBar(regionStatus);
  updateCurrentSlide(current, provider);
  if (vscode.window.activeTextEditor) {
    scheduleEditorComponentSync(current, provider, vscode.window.activeTextEditor);
  }
}

export function deactivate(): void {
  if (editorSelectionTimer) clearTimeout(editorSelectionTimer);
  previewWasStopped = true;
  if (previewOpenTimer) clearTimeout(previewOpenTimer);
  previewOpenTimer = undefined;
  previewPanel?.dispose();
  previewPanel = undefined;
  previewProcess?.kill();
  previewProcess = undefined;
  previewAddress = undefined;
  previewSourceMarker = undefined;
  previewLineDecoration = undefined;
  activeSlidesProvider = undefined;
  activeCurrentSlideProvider = undefined;
  activeCurrentSlideTree = undefined;
}
