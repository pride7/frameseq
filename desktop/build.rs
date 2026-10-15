fn main() {
  // Help › Documentation and the other links reach the default browser through this command,
  // which the Studio's page, served from localhost, is allowed to call.
  tauri_build::try_build(
    tauri_build::Attributes::new()
      .app_manifest(tauri_build::AppManifest::new().commands(&["open_external"])),
  )
  .expect("failed to build the FrameSeq Studio window");
}
