// window.frameseqShell: what the FrameSeq app's window offers the Studio's page, which draws the
// window's frame itself when `chrome` is "custom" and leaves room for the traffic lights when it
// is "overlay". Tauri's own API is looked up when it is used, since it may load after this.
(() => {
  if (window.top !== window || window.frameseqShell) return;
  const tauri = () => window.__TAURI__;
  const current = () => tauri().window.getCurrentWindow();
  window.frameseqShell = Object.freeze({
    chrome: "__CHROME__",
    platform: "__PLATFORM__",
    minimize: () => current().minimize(),
    toggleMaximize: () => current().toggleMaximize(),
    isMaximized: () => current().isMaximized(),
    startDragging: () => current().startDragging(),
    close: () => current().close(),
    onResized: (callback) => current().onResized(() => callback()),
    // The page decides whether the window may close, for instance after asking about unsaved edits.
    onCloseRequested: (decide) => current().onCloseRequested(async (event) => {
      if (!(await decide())) event.preventDefault();
    }),
    openExternal: (url) => tauri().core.invoke("open_external", { url }),
    screens: () => tauri().core.invoke("screens"),
    startShow: (show) => tauri().core.invoke("start_show", show),
    endShow: () => tauri().core.invoke("end_show"),
  });
})();
