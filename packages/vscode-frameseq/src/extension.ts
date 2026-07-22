import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import * as vscode from "vscode";

interface SourceLocation {
  line: number;
  character: number;
  endLine?: number;
}

interface InspectObject {
  type: string;
  source: SourceLocation;
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
  folder: vscode.WorkspaceFolder;
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

type OutlineItem = SlideItem | IssueItem;

let previewProcess: ChildProcessWithoutNullStreams | undefined;
let previewWasStopped = false;
let previewAddress: string | undefined;
let previewOpenTimer: NodeJS.Timeout | undefined;
let previewSlideIndex = 1;
let previewPanel: vscode.WebviewPanel | undefined;

function isSlidesDocument(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && /(?:^|[\\/])(?:slides|[^\\/]+\.slides)\.ts$/i.test(uri.fsPath);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveEntry(): Promise<EntryDocument | undefined> {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri && isSlidesDocument(activeUri)) {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) return { uri: activeUri, folder };
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const configured = vscode.workspace
      .getConfiguration("frameseq", folder.uri)
      .get<string>("entry", "slides.ts");
    const configuredPath = isAbsolute(configured)
      ? configured
      : join(folder.uri.fsPath, configured);
    if (await fileExists(configuredPath)) {
      return { uri: vscode.Uri.file(configuredPath), folder };
    }
  }

  const candidates = await vscode.workspace.findFiles(
    "**/*.slides.ts",
    "**/{node_modules,dist,tmp,output}/**",
    1,
  );
  const uri = candidates[0];
  const folder = uri ? vscode.workspace.getWorkspaceFolder(uri) : undefined;
  return uri && folder ? { uri, folder } : undefined;
}

async function cliInvocation(entry: EntryDocument, args: string[]): Promise<{ command: string; args: string[] }> {
  const installedCli = join(
    entry.folder.uri.fsPath,
    "node_modules",
    "@pride7",
    "frameseq",
    "scripts",
    "frameseq.mjs",
  );
  const repositoryCli = join(entry.folder.uri.fsPath, "scripts", "frameseq.mjs");
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
      cwd: entry.folder.uri.fsPath,
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
      issues.length > 0
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
      return element.issues.map((issue) => new IssueItem(issue, element.slide));
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
      const relativeEntry = relative(entry.folder.uri.fsPath, entry.uri.fsPath);
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

async function openSlide(provider: SlidesProvider, item?: OutlineItem): Promise<void> {
  const entry = provider.entry ?? await resolveEntry();
  const slide = item instanceof IssueItem ? item.slide : item?.slide;
  if (!entry || !slide) return;
  const document = await vscode.workspace.openTextDocument(entry.uri);
  const editor = await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.One,
    preserveFocus: false,
    preview: false,
  });
  const position = new vscode.Position(
    Math.max(0, slide.source.line - 1),
    Math.max(0, slide.source.character - 1),
  );
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  previewSlideIndex = slide.index;
  const followOutline = vscode.workspace
    .getConfiguration("frameseq", entry.uri)
    .get<boolean>("followOutline", true);
  if (followOutline && previewProcess && previewAddress) {
    await openPreviewUrl(previewAddress, entry, slide.index);
  }
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

  if (entry && previewBeside) {
    const document = await vscode.workspace.openTextDocument(entry.uri);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
      preview: false,
    });
  }

  const externalUri = await vscode.env.asExternalUri(vscode.Uri.parse(refreshedUrl.toString()));
  const externalUrl = externalUri.toString();
  const panelColumn = previewBeside ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
  const createsPanel = !previewPanel;
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
  } else {
    previewPanel.reveal(panelColumn, false);
  }
  previewPanel.title = `FrameSeq · Slide ${slideIndex}`;
  if (createsPanel) {
    previewPanel.webview.html = previewWebviewHtml(externalUrl);
  } else {
    const delivered = await previewPanel.webview.postMessage({
      type: "frameseq.navigate",
      url: externalUrl,
    });
    if (!delivered) previewPanel.webview.html = previewWebviewHtml(externalUrl);
  }
}

function previewWebviewHtml(url: string): string {
  const origin = new URL(url).origin;
  const nonce = randomBytes(16).toString("hex");
  const escapeAttribute = (value: string): string => value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escapeAttribute(origin)}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #09090b; }
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
      window.addEventListener("message", (event) => {
        const message = event.data;
        if (!message || message.type !== "frameseq.navigate" || typeof message.url !== "string") return;
        preview.src = message.url;
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

  const relativeEntry = relative(entry.folder.uri.fsPath, entry.uri.fsPath);
  const invocation = await cliInvocation(entry, ["dev", relativeEntry, "--no-open"]);
  output.clear();
  output.appendLine(`> ${invocation.command} ${invocation.args.join(" ")}`);
  previewWasStopped = false;
  let openedUrl: string | undefined;
  const child = spawn(invocation.command, invocation.args, {
    cwd: entry.folder.uri.fsPath,
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
  const relativeEntry = relative(entry.folder.uri.fsPath, entry.uri.fsPath);
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
  format: "html" | "pdf" | "pptx",
): Promise<void> {
  const entry = provider.entry ?? await resolveEntry();
  if (!entry) {
    void vscode.window.showErrorMessage("FrameSeq: no slides entry file was found.");
    return;
  }
  const relativeEntry = relative(entry.folder.uri.fsPath, entry.uri.fsPath);
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
  ], {
    placeHolder: "Choose a FrameSeq export format",
    title: "Export presentation",
  });
  if (selected) await exportPresentation(provider, output, selected.format);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("FrameSeq");
  const diagnostics = vscode.languages.createDiagnosticCollection("frameseq");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.name = "FrameSeq current slide";
  status.command = "frameseq.previewCurrentSlide";
  const provider = new SlidesProvider(output);
  const tree = vscode.window.createTreeView("frameseq.slides", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(output, diagnostics, status, tree);
  context.subscriptions.push(provider.onDidChangeMessage((message) => {
    tree.message = message;
  }));
  context.subscriptions.push(vscode.commands.registerCommand("frameseq.refresh", async () => {
    await provider.refresh(true);
    updateStatusBar(status, provider);
  }));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.openSlide",
    (item?: OutlineItem) => openSlide(provider, item),
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
    },
  ));
  context.subscriptions.push(vscode.commands.registerCommand("frameseq.stopPreview", stopPreview));
  context.subscriptions.push(vscode.commands.registerCommand(
    "frameseq.check",
    async () => {
      try {
        await checkLayout(provider, diagnostics, output);
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

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
    const autoRefresh = vscode.workspace
      .getConfiguration("frameseq", document.uri)
      .get<boolean>("autoRefresh", true);
    if (autoRefresh && isSlidesDocument(document.uri)) {
      diagnostics.delete(document.uri);
      provider.setIssues([]);
      void provider.refresh().then(() => updateStatusBar(status, provider));
    }
  }));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && isSlidesDocument(editor.document.uri)) {
      void provider.refresh().then(() => {
        const slide = slideForEditor(provider, editor);
        if (slide) previewSlideIndex = slide.index;
        updateStatusBar(status, provider, editor);
      });
    } else {
      updateStatusBar(status, provider, editor);
    }
  }));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => {
    const slide = slideForEditor(provider, event.textEditor);
    if (slide) previewSlideIndex = slide.index;
    updateStatusBar(status, provider, event.textEditor);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("frameseq")) {
      void provider.refresh().then(() => updateStatusBar(status, provider));
    }
  }));

  await vscode.commands.executeCommand("setContext", "frameseq.previewRunning", false);
  await provider.refresh();
  const initialSlide = slideForEditor(provider);
  if (initialSlide) previewSlideIndex = initialSlide.index;
  updateStatusBar(status, provider);
}

export function deactivate(): void {
  previewWasStopped = true;
  if (previewOpenTimer) clearTimeout(previewOpenTimer);
  previewOpenTimer = undefined;
  previewPanel?.dispose();
  previewPanel = undefined;
  previewProcess?.kill();
  previewProcess = undefined;
  previewAddress = undefined;
}
