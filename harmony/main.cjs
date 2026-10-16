const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, systemPreferences } = require("electron");
const { randomUUID } = require("node:crypto");
const { mkdir, copyFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");

let studio;
let presenter;
let service;
let guardReady = false;
let closeNonce;
let closeApproved = false;
let showBounds;
let wasMaximized = false;

function trusted(event) {
  return studio && event.sender === studio.webContents && event.senderFrame === studio.webContents.mainFrame
    && new URL(event.senderFrame.url).origin === service.origin;
}

function handle(name, run) {
  ipcMain.handle(`frameseq:${name}`, (event, ...args) => {
    if (!trusted(event)) throw new Error("Only the Studio window may use this operation.");
    return run(...args);
  });
}

function external(url) {
  const address = new URL(url);
  if (!["https:", "http:", "mailto:"].includes(address.protocol)) throw new Error("Unsupported external link.");
  return shell.openExternal(address.href);
}

function protect(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && new URL(url).origin !== service.origin) void external(url).catch(console.error);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== service.origin) {
      event.preventDefault();
      if (/^(https?:|mailto:)/.test(url)) void external(url).catch(console.error);
    }
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
}

async function choose(kind, folder) {
  const answer = await dialog.showOpenDialog(studio, {
    defaultPath: folder,
    properties: kind === "folder" ? ["openDirectory", "createDirectory"] : ["openFile"],
    ...(kind === "folder" ? {} : { filters: kind === "image"
      ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp"] }]
      : [{ name: "FrameSeq", extensions: ["ts"] }] }),
  });
  if (answer.canceled || !answer.filePaths[0]) return { cancelled: true };
  const paths = answer.filePaths.map((path) => path.startsWith("file:") ? fileURLToPath(path) : path);
  // This extension is supplied by the HarmonyOS Electron runtime. Other platforms omit it.
  if (typeof systemPreferences.fileAccessPersist === "function") await systemPreferences.fileAccessPersist(paths);
  return { path: paths[0] };
}

function endShow() {
  presenter?.destroy();
  presenter = undefined;
  if (!showBounds || !studio || studio.isDestroyed()) return;
  studio.setFullScreen(false);
  studio.setBounds(showBounds);
  if (wasMaximized) studio.maximize();
  showBounds = undefined;
  studio.focus();
}

function displayAt(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
  return screen.getAllDisplays().find(({ bounds }) => bounds.x === point.x && bounds.y === point.y);
}

async function startShow(show) {
  if (!show || typeof show !== "object") throw new Error("Invalid slide show.");
  if (!showBounds) { showBounds = studio.getBounds(); wasMaximized = studio.isMaximized(); }
  const display = displayAt(show.slides);
  if (display) {
    studio.unmaximize();
    studio.setBounds(display.bounds);
  }
  studio.setFullScreen(true);
  if (show.presenter) {
    const address = new URL(show.presenter.address);
    if (address.origin !== service.origin || address.pathname !== "/" || !address.searchParams.has("presenter")) throw new Error("Invalid presenter address.");
    presenter?.destroy();
    const target = displayAt(show.presenter);
    presenter = new BrowserWindow({
      title: "FrameSeq Presenter", width: 1100, height: 760,
      ...(target ? { x: target.bounds.x, y: target.bounds.y } : {}),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    protect(presenter);
    await presenter.loadURL(address.href);
    presenter.focus();
  } else studio.focus();
}

app.whenReady().then(async () => {
  // Studio already draws the same localized menu bar as the Windows app.
  Menu.setApplicationMenu(null);
  process.env.FRAMESEQ_CONFIG_DIR = app.getPath("userData");
  const documents = join(app.getPath("userData"), "Presentations");
  await mkdir(documents, { recursive: true });
  const example = join(documents, "Welcome.slides.ts");
  try { await copyFile(join(__dirname, "examples/welcome.slides.ts"), example, require("node:fs").constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const argument = process.argv.slice(app.isPackaged ? 1 : 2).find((value) => !value.startsWith("-") && value.endsWith(".ts"));
  const entry = argument ? resolve(argument) : example;
  process.chdir(documents);
  const { createHarmonyServer } = await import(pathToFileURL(join(__dirname, "scripts/harmony-server.mjs")).href);
  service = await createHarmonyServer({ packageRoot: __dirname, entry, host: {
    choose,
    reveal: (path, directory) => directory ? shell.openPath(path) : shell.showItemInFolder(path),
  } });
  studio = new BrowserWindow({
    title: "FrameSeq Studio", width: 1500, height: 960, minWidth: 480, minHeight: 320, show: false,
    icon: join(__dirname, "icon.png"),
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  protect(studio);
  handle("minimize", () => studio.minimize());
  handle("toggle-maximize", () => studio.isMaximized() ? studio.unmaximize() : studio.maximize());
  handle("is-maximized", () => studio.isMaximized());
  handle("close", () => studio.close());
  handle("open-external", external);
  handle("screens", () => {
    const primary = screen.getPrimaryDisplay().id;
    const current = screen.getDisplayMatching(studio.getBounds()).id;
    return screen.getAllDisplays().map((display) => ({ name: display.label || `Display ${display.id}`, ...display.bounds, primary: display.id === primary, current: display.id === current }));
  });
  handle("start-show", startShow);
  handle("end-show", endShow);
  ipcMain.on("frameseq:guard-ready", (event) => { if (trusted(event)) guardReady = true; });
  ipcMain.on("frameseq:close-answer", (event, nonce, accepted) => {
    if (!trusted(event) || nonce !== closeNonce) return;
    closeNonce = undefined;
    if (accepted === true) { closeApproved = true; studio.close(); }
  });
  studio.on("close", (event) => {
    if (closeApproved || !guardReady) return;
    event.preventDefault();
    if (closeNonce) return;
    closeNonce = randomUUID();
    studio.webContents.send("frameseq:close-request", closeNonce);
  });
  studio.webContents.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {
    if (mainFrame) { guardReady = false; closeNonce = undefined; }
  });
  studio.on("resize", () => studio.webContents.send("frameseq:resized"));
  studio.on("closed", () => { presenter?.destroy(); studio = undefined; });
  await studio.loadURL(`${service.origin}/studio.html`);
  studio.show();
}).catch((error) => {
  dialog.showErrorBox("FrameSeq Studio", error.stack || String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (service) void service.close().finally(() => { service = undefined; app.quit(); });
  else app.quit();
});
