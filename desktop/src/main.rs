//! FrameSeq Studio in a window of its own, as the FrameSeq app opens it.
//!
//! The window has no title bar of the system's on Windows: the Studio's menu bar takes its
//! place, with the window buttons beside it, as in other desktop programs. On macOS the
//! traffic lights sit over the menu bar's left end, and Linux keeps its own title bar.
//!
//!   frameseq-studio [file]       start the Studio with the app's own Node.js, then show it
//!   frameseq-studio --url <url>  show a Studio that `frameseq studio` has already started
//!   frameseq-studio --check      print "ok" and stop, to learn whether this computer runs it

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
  collections::VecDeque,
  fs::{self, File},
  io::{BufRead, BufReader, Read, Write},
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
  },
  thread,
  time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{
  webview::{NewWindowFeatures, NewWindowResponse, PageLoadEvent},
  window::Color,
  AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, RunEvent, Theme, Url, WebviewUrl,
  WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry,
};

const MAIN: &str = "main";
/// Presenter view beside a slide show on two screens.
const PRESENTER: &str = "presenter";

/// How the window's frame is drawn, as the Studio's page learns it from `frameseqShell.chrome`.
#[cfg(windows)]
const CHROME: &str = "custom";
#[cfg(target_os = "macos")]
const CHROME: &str = "overlay";
#[cfg(not(any(windows, target_os = "macos")))]
const CHROME: &str = "native";

/// What the window shows once it is open.
#[derive(Clone)]
enum Start {
  /// A Studio already running at this address.
  Address(Url),
  /// A Studio this program starts, on these files.
  Serve(Vec<String>),
}

/// The splash page, and what waits for it to load: the Studio's address, or why it did not start.
#[derive(Default)]
struct Splash {
  state: Mutex<SplashState>,
}

#[derive(Default)]
struct SplashState {
  loaded: bool,
  address: Option<Url>,
  failure: Option<String>,
}

/// A slide show on two screens: where the window was before it took the slides to the other
/// screen. One show starts or ends at a time.
#[derive(Default)]
struct Show {
  before: Mutex<Option<Placement>>,
}

struct Placement {
  position: PhysicalPosition<i32>,
  size: PhysicalSize<u32>,
  maximized: bool,
}

/// A screen as the Studio's page sees it, in the system's pixels.
#[derive(Serialize)]
struct Screen {
  name: String,
  x: i32,
  y: i32,
  width: u32,
  height: u32,
  primary: bool,
  /// The screen the window is on.
  current: bool,
}

/// The top left corner of a screen, which tells it from the others.
#[derive(Deserialize)]
struct Corner {
  x: i32,
  y: i32,
}

/// Presenter view's page, and the corner of the screen it opens over.
#[derive(Deserialize)]
struct PresenterAt {
  address: String,
  x: i32,
  y: i32,
}

/// The Node.js server this program started, and what it said last, for a failure to show.
#[derive(Default)]
struct Server {
  child: Mutex<Option<Child>>,
  recent: Mutex<VecDeque<String>>,
  log: Mutex<Option<PathBuf>>,
}

fn main() {
  let mut arguments = std::env::args().skip(1);
  let mut address = None;
  let mut files = Vec::new();
  while let Some(argument) = arguments.next() {
    match argument.as_str() {
      "--check" => {
        println!("ok");
        return;
      }
      "--url" => address = arguments.next(),
      flag if flag.starts_with("--") => {}
      file => files.push(file.to_owned()),
    }
  }
  let start = match address.as_deref().map(Url::parse) {
    Some(Ok(url)) if is_local(&url) => Start::Address(url),
    Some(_) => {
      eprintln!("frameseq-studio: --url takes the address of a Studio on this computer");
      std::process::exit(2);
    }
    None => Start::Serve(files),
  };

  let fallback = start.clone();
  let server = Arc::new(Server::default());
  let built = tauri::Builder::default()
    .manage(server.clone())
    .manage(Splash::default())
    .manage(Show::default())
    .invoke_handler(tauri::generate_handler![open_external, screens, start_show, end_show])
    .setup(move |app| {
      open_main_window(app.handle())?;
      match start {
        Start::Address(url) => show_studio(app.handle(), url),
        Start::Serve(files) => serve(app.handle().clone(), server.clone(), files),
      }
      Ok(())
    })
    .build(tauri::generate_context!());

  let app = match built {
    Ok(app) => app,
    Err(error) => {
      // Without a web view, as on a Windows that lacks WebView2, the Studio still opens, in
      // a browser's app window as `frameseq studio` opens it.
      eprintln!("frameseq-studio: {error}");
      fall_back_to_browser(&fallback);
      return;
    }
  };

  app.run(|app, event| match event {
    // Closing the Studio closes the windows it opened too, such as presenter view.
    RunEvent::WindowEvent { label, event: WindowEvent::Destroyed, .. } if label == MAIN => {
      app.exit(0);
    }
    RunEvent::Exit => stop_server(&app.state::<Arc<Server>>()),
    _ => {}
  });
}

fn open_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
  let builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
    .title("FrameSeq Studio")
    .inner_size(1440.0, 900.0)
    .min_inner_size(760.0, 520.0)
    .center()
    .visible(false)
    .initialization_script(shell_script())
    // Files dropped on the window reach the page, as in a browser, for the assistant to attach.
    .disable_drag_drop_handler()
    .on_document_title_changed(|window, title| {
      let _ = window.set_title(&title);
    })
    .on_navigation(allow_navigation)
    .on_new_window(popup(app.clone()))
    .on_page_load(|window, payload| {
      if payload.event() == PageLoadEvent::Finished && is_bundled(payload.url()) {
        splash_loaded(&window);
      }
    });
  #[cfg(windows)]
  let builder = builder.decorations(false).shadow(true);
  #[cfg(target_os = "macos")]
  let builder = builder
    .title_bar_style(tauri::TitleBarStyle::Overlay)
    .hidden_title(true)
    .traffic_light_position(tauri::LogicalPosition::new(14.0, 20.0));

  let window = builder.build()?;
  // The page paints the window's background before the Studio has drawn: dark for a dark system.
  let background = match window.theme() {
    Ok(Theme::Light) => Color(246, 248, 251, 255),
    _ => Color(10, 14, 23, 255),
  };
  let _ = window.set_background_color(Some(background));
  Ok(window)
}

/// The window is shown once the splash page has drawn, so it never opens blank, and then goes
/// where it was waiting to go.
fn splash_loaded(window: &WebviewWindow) {
  let splash = window.state::<Splash>();
  let mut state = splash.state.lock().unwrap();
  if !state.loaded {
    state.loaded = true;
    fit_to_screen(window);
    let _ = window.show();
    let _ = window.set_focus();
  }
  if let Some(url) = state.address.take() {
    let _ = window.navigate(url);
  } else if let Some(message) = state.failure.take() {
    let text = serde_json::to_string(&message).unwrap_or_default();
    let _ = window.eval(format!("window.showStartupError({text})"));
  }
}

/// Show the Studio at this address, now or once the splash page is up.
fn show_studio(app: &AppHandle, url: Url) {
  let Some(window) = app.get_webview_window(MAIN) else { return };
  let splash = app.state::<Splash>();
  let mut state = splash.state.lock().unwrap();
  if state.loaded {
    let _ = window.navigate(url);
  } else {
    state.address = Some(url);
  }
}

/// Say on the splash page why the Studio did not start, now or once the page is up.
fn show_failure(app: &AppHandle, message: &str) {
  let Some(window) = app.get_webview_window(MAIN) else { return };
  let splash = app.state::<Splash>();
  let mut state = splash.state.lock().unwrap();
  if state.loaded {
    let text = serde_json::to_string(message).unwrap_or_default();
    let _ = window.eval(format!("window.showStartupError({text})"));
  } else {
    state.failure = Some(message.to_owned());
  }
}

/// A screen smaller than the window's usual size gets the whole screen instead.
fn fit_to_screen(window: &WebviewWindow) {
  let Ok(Some(monitor)) = window.current_monitor() else { return };
  let area = monitor.work_area().size.to_logical::<f64>(monitor.scale_factor());
  if area.width < 1500.0 || area.height < 960.0 {
    let _ = window.maximize();
  }
}

/// `window.frameseqShell`, which the Studio's page uses to draw and work the window's frame.
fn shell_script() -> String {
  let platform = if cfg!(windows) {
    "windows"
  } else if cfg!(target_os = "macos") {
    "macos"
  } else {
    "linux"
  };
  include_str!("shell.js").replace("__CHROME__", CHROME).replace("__PLATFORM__", platform)
}

/// The Studio's own pages stay in the window; anything else opens in the default browser.
fn allow_navigation(url: &Url) -> bool {
  if is_local(url) || is_bundled(url) {
    return true;
  }
  open_outside(url);
  false
}

/// `window.open`: another page of the Studio, such as presenter view, opens in a window of its
/// own, with the usual title bar; any other address opens in the default browser.
fn popup(app: AppHandle) -> impl Fn(Url, NewWindowFeatures) -> NewWindowResponse<Wry> + Send + 'static {
  static NEXT: AtomicUsize = AtomicUsize::new(1);
  move |url, features| {
    if !is_local(&url) {
      open_outside(&url);
      return NewWindowResponse::Deny;
    }
    let label = format!("window-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let built = WebviewWindowBuilder::new(&app, label, WebviewUrl::External("about:blank".parse().unwrap()))
      .title("FrameSeq")
      .inner_size(1280.0, 800.0)
      .window_features(features)
      .on_document_title_changed(|window, title| {
        let _ = window.set_title(&title);
      })
      .on_navigation(allow_navigation)
      .on_new_window(popup(app.clone()))
      .build();
    match built {
      Ok(window) => NewWindowResponse::Create { window },
      Err(_) => NewWindowResponse::Deny,
    }
  }
}

fn is_local(url: &Url) -> bool {
  matches!(url.scheme(), "http" | "https")
    && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
}

/// The splash page, served from this program: tauri:// on macOS and Linux, tauri.localhost on Windows.
fn is_bundled(url: &Url) -> bool {
  url.scheme() == "tauri" || url.scheme() == "about" || url.host_str() == Some("tauri.localhost")
}

fn open_outside(url: &Url) {
  if matches!(url.scheme(), "http" | "https" | "mailto") {
    let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
  }
}

/// Help › Documentation and the other links: the Studio's page asks for them by name, since its
/// own `window.open` is kept for the Studio's pages.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
  let url = Url::parse(&url).map_err(|error| error.to_string())?;
  if !matches!(url.scheme(), "http" | "https" | "mailto") {
    return Err(format!("{} is not a web address", url));
  }
  tauri_plugin_opener::open_url(url.as_str(), None::<&str>).map_err(|error| error.to_string())
}

/// The screens, for Present › Show screen to list and a slide show to place its windows on.
#[tauri::command]
async fn screens(app: AppHandle) -> Result<Vec<Screen>, String> {
  let window = app.get_webview_window(MAIN).ok_or("The Studio's window is gone")?;
  let here = window.current_monitor().map_err(text)?.map(|monitor| *monitor.position());
  let primary = window.primary_monitor().map_err(text)?.map(|monitor| *monitor.position());
  let screens = window.available_monitors().map_err(text)?;
  Ok(
    screens
      .into_iter()
      .map(|monitor| {
        let corner = *monitor.position();
        let size = *monitor.size();
        Screen {
          name: monitor.name().cloned().unwrap_or_default(),
          x: corner.x,
          y: corner.y,
          width: size.width,
          height: size.height,
          primary: Some(corner) == primary,
          current: Some(corner) == here,
        }
      })
      .collect(),
  )
}

/// A slide show from the Studio: the window goes full screen, onto the screen at `slides` when
/// the page names one, and presenter view opens over the screen at `presenter`, as PowerPoint's
/// does on a second screen.
#[tauri::command]
async fn start_show(
  app: AppHandle,
  slides: Option<Corner>,
  presenter: Option<PresenterAt>,
) -> Result<(), String> {
  let show = app.state::<Show>();
  let mut before = show.before.lock().unwrap();
  let window = app.get_webview_window(MAIN).ok_or("The Studio's window is gone")?;
  match slides {
    Some(corner) => {
      *before = Some(Placement {
        position: window.outer_position().map_err(text)?,
        size: window.inner_size().map_err(text)?,
        maximized: window.is_maximized().map_err(text)?,
      });
      window
        .set_fullscreen_on_monitor(PhysicalPosition::new(corner.x as f64, corner.y as f64))
        .map_err(text)?;
    }
    None => window.set_fullscreen(true).map_err(text)?,
  }
  let Some(presenter) = presenter else { return Ok(()) };
  let url = window.url().map_err(text)?.join(&presenter.address).map_err(|error| error.to_string())?;
  if !is_local(&url) {
    return Err(format!("{url} is not a page of the Studio"));
  }
  let corner = PhysicalPosition::new(presenter.x, presenter.y);
  let screen = window
    .available_monitors()
    .map_err(text)?
    .into_iter()
    .find(|monitor| *monitor.position() == corner);
  if let Some(screen) = screen {
    open_presenter(&app, url, &screen).map_err(text)?;
  }
  Ok(())
}

/// The show is over: presenter view closes, and the window leaves full screen for where it was.
#[tauri::command]
async fn end_show(app: AppHandle) -> Result<(), String> {
  let show = app.state::<Show>();
  let mut before = show.before.lock().unwrap();
  let window = app.get_webview_window(MAIN).ok_or("The Studio's window is gone")?;
  window.set_fullscreen(false).map_err(text)?;
  let started = Instant::now();
  if let Some(presenter) = app.get_webview_window(PRESENTER) {
    let _ = presenter.destroy();
    // Gone before this answers, so that a show started at once opens presenter view anew.
    while app.get_webview_window(PRESENTER).is_some() && started.elapsed() < Duration::from_secs(1) {
      thread::sleep(Duration::from_millis(20));
    }
  }
  let Some(placement) = before.take() else { return Ok(()) };
  // Windows puts the window back by itself. macOS leaves full screen with an animation, and the
  // window can move only after it, onto the screen it came from.
  while window.is_fullscreen().unwrap_or(false) && started.elapsed() < Duration::from_secs(2) {
    thread::sleep(Duration::from_millis(50));
  }
  if window.outer_position().ok() != Some(placement.position) && !window.is_maximized().unwrap_or(false) {
    let _ = window.set_position(placement.position);
    let _ = window.set_size(placement.size);
    if placement.maximized {
      let _ = window.maximize();
    }
  }
  let _ = window.set_focus();
  Ok(())
}

fn text(error: tauri::Error) -> String {
  error.to_string()
}

/// Presenter view, maximised on this screen, with the keyboard, as a presentation remote's keys
/// should reach it.
fn open_presenter(app: &AppHandle, url: Url, screen: &Monitor) -> tauri::Result<()> {
  let window = match app.get_webview_window(PRESENTER) {
    Some(window) => {
      window.navigate(url)?;
      window
    }
    None => WebviewWindowBuilder::new(app, PRESENTER, WebviewUrl::External(url))
      .title("FrameSeq")
      .inner_size(1280.0, 800.0)
      .visible(false)
      .on_document_title_changed(|window, title| {
        let _ = window.set_title(&title);
      })
      .on_navigation(allow_navigation)
      .on_new_window(popup(app.clone()))
      .build()?,
  };
  let _ = window.unmaximize();
  window.set_position(screen.work_area().position)?;
  window.maximize()?;
  window.show()?;
  window.set_focus()?;
  Ok(())
}

// ── The server ─────────────────────────────────────────────────────────────────────────────

/// The Node.js and FrameSeq the app ships: beside this program on Windows and Linux, and in the
/// bundle's Resources on macOS. The app's entry, app-launch.mjs, runs the newest update the app
/// has installed. FRAMESEQ_DESKTOP_NODE and FRAMESEQ_DESKTOP_CLI name others, as a FrameSeq
/// checkout does when it tries the window out.
fn runtime() -> Option<(PathBuf, PathBuf)> {
  if let Ok(cli) = std::env::var("FRAMESEQ_DESKTOP_CLI") {
    let node = std::env::var("FRAMESEQ_DESKTOP_NODE").unwrap_or_else(|_| "node".to_owned());
    return Some((PathBuf::from(node), PathBuf::from(cli)));
  }
  let here = std::env::current_exe().ok()?.parent()?.to_path_buf();
  let roots = [here.clone(), here.join("..").join("Resources").join("frameseq")];
  roots.into_iter().find_map(|root| {
    let node = if cfg!(windows) { root.join("node").join("node.exe") } else { root.join("node").join("bin").join("node") };
    let scripts = root.join("app").join("scripts");
    let cli = ["app-launch.mjs", "frameseq.mjs"].iter().map(|name| scripts.join(name)).find(|cli| cli.is_file())?;
    node.is_file().then_some((node, cli))
  })
}

/// FrameSeq's settings folder, as the CLI chooses it, where the server's output is kept.
fn config_directory() -> Option<PathBuf> {
  if let Some(folder) = std::env::var_os("FRAMESEQ_CONFIG_DIR") {
    return Some(PathBuf::from(folder));
  }
  if cfg!(windows) {
    return std::env::var_os("APPDATA").map(|folder| PathBuf::from(folder).join("FrameSeq"));
  }
  let home = PathBuf::from(std::env::var_os("HOME")?);
  if cfg!(target_os = "macos") {
    return Some(home.join("Library").join("Application Support").join("FrameSeq"));
  }
  Some(std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".config")).join("frameseq"))
}

/// Documents, where a Studio started without a file begins, as the shortcut always started it.
fn documents() -> PathBuf {
  let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
  let home = home.unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
  let documents = home.join("Documents");
  if documents.is_dir() { documents } else { home }
}

/// Start `frameseq studio --desktop`, and show the Studio once it prints its address.
fn serve(app: AppHandle, server: Arc<Server>, files: Vec<String>) {
  let Some((node, cli)) = runtime() else {
    show_failure(&app, "This copy of FrameSeq Studio has no Node.js or FrameSeq beside it. Reinstall FrameSeq.");
    return;
  };
  // A file opens with its own folder as the Studio's, so exports land beside it.
  // Not canonicalised: on Windows that gives \\?\ paths, which Node.js and Vite do not read.
  let files: Vec<PathBuf> = files.iter().map(|file| std::path::absolute(file).unwrap_or_else(|_| PathBuf::from(file))).collect();
  let folder = files.first().and_then(|file| file.parent().map(Path::to_path_buf)).unwrap_or_else(documents);

  let mut command = Command::new(&node);
  command
    .arg(&cli)
    .arg("studio")
    .args(&files)
    .arg("--desktop")
    .current_dir(&folder)
    .env("NO_COLOR", "1")
    .env("FORCE_COLOR", "0")
    // The server stops when this pipe closes, even if this program never gets to stop it.
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
  }

  let mut child = match command.spawn() {
    Ok(child) => child,
    Err(error) => {
      show_failure(&app, &format!("FrameSeq Studio could not start {}: {error}", node.display()));
      return;
    }
  };

  let log_path = config_directory().map(|folder| folder.join("studio.log"));
  let log = log_path.as_ref().and_then(|path| {
    fs::create_dir_all(path.parent()?).ok()?;
    File::create(path).ok()
  });
  *server.log.lock().unwrap() = log_path;
  let log = Arc::new(Mutex::new(log));

  let stdout = child.stdout.take();
  let stderr = child.stderr.take();
  *server.child.lock().unwrap() = Some(child);

  if let Some(stderr) = stderr {
    let (server, log) = (server.clone(), log.clone());
    thread::spawn(move || read_lines(stderr, &server, &log, |_| {}));
  }
  if let Some(stdout) = stdout {
    thread::spawn(move || {
      let mut opened = false;
      read_lines(stdout, &server, &log, |line| {
        if opened {
          return;
        }
        if let Some(url) = studio_address(line) {
          opened = true;
          show_studio(&app, url);
        }
      });
      // The server stopped. Before the Studio opened, that is a failure to report.
      if !opened {
        let recent: Vec<String> = server.recent.lock().unwrap().iter().cloned().collect();
        let mut message = recent.join("\n");
        if let Some(path) = server.log.lock().unwrap().as_ref() {
          message.push_str(&format!("\n\nLog: {}", path.display()));
        }
        show_failure(&app, &message);
      }
    });
  }
}

fn read_lines(stream: impl Read, server: &Server, log: &Mutex<Option<File>>, mut each: impl FnMut(&str)) {
  for line in BufReader::new(stream).lines() {
    let Ok(line) = line else { break };
    if let Some(file) = log.lock().unwrap().as_mut() {
      let _ = writeln!(file, "{line}");
    }
    {
      let mut recent = server.recent.lock().unwrap();
      recent.push_back(line.clone());
      while recent.len() > 30 {
        recent.pop_front();
      }
    }
    each(&line);
  }
}

/// The address in the server's "➜  Studio:  http://localhost:5173/studio.html" line.
fn studio_address(line: &str) -> Option<Url> {
  let rest = &line[line.find("Studio:")? + "Studio:".len()..];
  let url = Url::parse(rest.trim().split_whitespace().next()?).ok()?;
  is_local(&url).then_some(url)
}

/// Close the server's input, which stops it, and wait a moment for it to finish.
fn stop_server(server: &Server) {
  let Some(mut child) = server.child.lock().unwrap().take() else { return };
  drop(child.stdin.take());
  let deadline = Instant::now() + Duration::from_secs(3);
  while Instant::now() < deadline {
    if let Ok(Some(_)) = child.try_wait() {
      return;
    }
    thread::sleep(Duration::from_millis(50));
  }
  let _ = child.kill();
  let _ = child.wait();
}

/// Without a web view: a Studio already running opens in the default browser, and one to start
/// opens in the browser's app window that `frameseq studio --background` opens.
fn fall_back_to_browser(start: &Start) {
  let files = match start {
    Start::Address(url) => {
      open_outside(url);
      return;
    }
    Start::Serve(files) => files,
  };
  let Some((node, cli)) = runtime() else { return };
  let files: Vec<PathBuf> = files.iter().map(|file| std::path::absolute(file).unwrap_or_else(|_| PathBuf::from(file))).collect();
  let folder = files.first().and_then(|file| file.parent().map(Path::to_path_buf)).unwrap_or_else(documents);
  let mut command = Command::new(node);
  command.arg(cli).arg("studio").args(&files).arg("--background").current_dir(folder);
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000);
  }
  let _ = command.spawn();
}
