fn main() {
  // Help › Documentation and the other links reach the default browser through these commands,
  // a slide show takes the window full screen and to another screen, and a presentation opened
  // again from outside brings the window to the front; the Studio's page, served from localhost,
  // is allowed to call them.
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(
      tauri_build::AppManifest::new().commands(&["open_external", "screens", "start_show", "end_show", "focus_window"]),
    ),
  )
  .expect("failed to build the FrameSeq Studio window");
}
