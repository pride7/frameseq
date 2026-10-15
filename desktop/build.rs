fn main() {
  // Help › Documentation and the other links reach the default browser through these commands,
  // and a slide show takes the window full screen and to another screen; the Studio's page,
  // served from localhost, is allowed to call them.
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(
      tauri_build::AppManifest::new().commands(&["open_external", "screens", "start_show", "end_show"]),
    ),
  )
  .expect("failed to build the FrameSeq Studio window");
}
