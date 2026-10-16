const { contextBridge, ipcRenderer } = require("electron");

// Only the Studio's top-level page gets window controls. Slide code stays in its iframe.
if (process.isMainFrame) {
  const call = (name, ...args) => ipcRenderer.invoke(`frameseq:${name}`, ...args);
  contextBridge.exposeInMainWorld("frameseqShell", {
    chrome: "native",
    platform: "harmonyos",
    minimize: () => call("minimize"),
    toggleMaximize: () => call("toggle-maximize"),
    isMaximized: () => call("is-maximized"),
    startDragging: async () => {}, // The system owns the title bar.
    close: () => call("close"),
    onResized(callback) {
      const listener = () => callback();
      ipcRenderer.on("frameseq:resized", listener);
      return Promise.resolve();
    },
    onCloseRequested(decide) {
      ipcRenderer.removeAllListeners("frameseq:close-request");
      ipcRenderer.on("frameseq:close-request", async (_event, nonce) => {
        let accepted = false;
        try { accepted = await decide(); } catch (error) { console.error(error); }
        finally { ipcRenderer.send("frameseq:close-answer", nonce, accepted === true); }
      });
      ipcRenderer.send("frameseq:guard-ready");
      return Promise.resolve();
    },
    openExternal: (url) => call("open-external", url),
    screens: () => call("screens"),
    startShow: (show) => call("start-show", show),
    endShow: () => call("end-show"),
  });
}
