# FrameSeq app

The FrameSeq app installs everything FrameSeq needs in one download, Node.js included, so nothing else has to be installed first. It puts FrameSeq Studio where programs open from, and adds the same `frameseq` command an npm install provides.

Download it from the [releases page](https://github.com/pride7/frameseq/releases/latest):

| System | Download | Installs |
| --- | --- | --- |
| Windows | `FrameSeq-Setup-<version>-win-x64.exe` | For the current user, without administrator rights: Studio in the Start menu, and optionally on the desktop and `frameseq` on the PATH. |
| Windows, portable | `FrameSeq-<version>-win-x64.zip` | Nothing: unzip it anywhere and run `bin\frameseq.cmd`. |
| macOS | `FrameSeq-<version>-mac-arm64.dmg` (Apple silicon), `…-mac-x64.dmg` (Intel) | Drag FrameSeq Studio to Applications. |
| Linux | `FrameSeq-<version>-linux-x64.tar.gz`, `…-linux-arm64.tar.gz` | Unpack it and run `./FrameSeq/install.sh`: the app under `~/.local/share`, `frameseq` in `~/.local/bin`, Studio in the applications menu. |

## What is inside

- **Node.js**, the runtime FrameSeq is written for, used only by FrameSeq.
- **FrameSeq** and everything it depends on, the same package npm installs.
- **The Typst compiler and Tectonic**, so Typst fragments and LaTeX tables work without installing either. Tectonic downloads the TeX files a fragment needs the first time it compiles one.
- **A headless browser** on macOS and Linux, for PDF, PowerPoint, and layout checks. Windows uses Microsoft Edge, which every Windows computer has.
- **FrameSeq Studio's window**, a small program that shows the Studio in the system's own web view: WebView2 on Windows, WebKit on macOS and Linux.

## Using it

Open FrameSeq Studio from the Start menu, Applications, or the applications menu. It starts on its start page, where a new presentation is one click away; see [FrameSeq Studio](studio.md).

The Studio opens in a window of its own, as a desktop program does. On Windows its menu bar is the title bar: drag it to move the window, double-click it to maximize, and minimize, maximize, and close sit at its right end. On macOS the traffic lights sit at the menu bar's left end. On Linux the window keeps the desktop's own title bar, and needs WebKitGTK 4.1 (`libwebkit2gtk-4.1`), which most desktops have. Closing the window stops the Studio, after asking about unsaved edits. Where the window cannot open, as on a Windows without WebView2 or a Linux without WebKitGTK, the Studio opens in a browser's app window instead; `FRAMESEQ_NO_STUDIO_WINDOW=1` asks for that anyway.

The `frameseq` command does everything the [CLI reference](cli.md) describes:

```bash
frameseq new talk.slides.ts
frameseq studio talk.slides.ts
frameseq pdf talk.slides.ts
```

`frameseq studio` opens the same window when it runs from the app.

On macOS, the command is inside the app. To have it on the PATH:

```bash
sudo ln -s "/Applications/FrameSeq Studio.app/Contents/Resources/frameseq/bin/frameseq" /usr/local/bin/frameseq
```

The VS Code extension finds the app's `frameseq` command on the PATH, as it finds a global npm install.

## Exports and browsers

PDF, PowerPoint, and `frameseq check` render with a Chromium browser. The app looks for one in this order:

1. the one named by the `FRAMESEQ_BROWSER` environment variable;
2. the one shipped with the app;
3. Chrome, Edge, Chromium, or Brave installed on the computer.

## Updates

The app keeps itself up to date. Once a day FrameSeq Studio asks whether a newer FrameSeq is out, and most new versions change only FrameSeq itself, which the app installs by itself. It downloads the FrameSeq package from the npm registry, a few hundred kilobytes, checks the registry's signature on it, and keeps it beside the app's own dependencies, in `%LOCALAPPDATA%\FrameSeq\updates` on Windows, `~/Library/Application Support/FrameSeq/updates` on macOS, and `~/.local/state/frameseq/updates` on Linux. The new version runs from the next start of FrameSeq Studio or `frameseq`, and the Studio says so. An update brings no program of its own, only FrameSeq's scripts, which the app's Node.js runs, so Smart App Control and Gatekeeper have nothing new to check. The app itself stays as it was installed.

A version that also changes what the app ships around FrameSeq, such as Node.js, the Studio's window, or a dependency, comes as a new app: the Studio says so, and its **Download** button opens the release page. The new version installs over the old one, which also retires the updates.

**Help › Check for updates…** checks at once, **Help › Automatic updates** turns the daily check off, and [`frameseq update`](cli.md#update-frameseq) does the same from a terminal; see also [Updates](studio.md#updates) in the Studio. `frameseq update --revert` goes back to the app as installed, and `FRAMESEQ_APP_LAYER=installed` runs it so for one start.

## Removing

On Windows, FrameSeq is removed from **Settings › Apps**, its updates included. On macOS, move FrameSeq Studio to the Bin, and delete `~/Library/Application Support/FrameSeq/updates`. On Linux, run `frameseq shortcut --remove` to take Studio out of the menu, then delete `~/.local/share/frameseq`, `~/.local/bin/frameseq`, and `~/.local/state/frameseq`.

## The app or npm?

Both run the same FrameSeq. Install with npm, as [Getting started](getting-started.md) describes, when the presentation lives in a project with its own dependencies, or when coding agents and CI should run it the way they run everything else. Install the app to write presentations without setting up a development environment.

The installers are not signed yet. On Windows 11 with **Smart App Control** turned on, Windows may now and then refuse to start the unsigned installer, depending on what Microsoft's online check answers at that moment; try again a little later, or use the portable zip. It may refuse the Studio's window, which is not signed either, in the same way. The Start menu's shortcut therefore runs Node.js, which the OpenJS Foundation signs, and Node.js opens the window; when Windows refuses it, the Studio opens in a browser's app window instead, and FrameSeq does not try the window again until it changes, as it does with an update. Elsewhere on Windows, SmartScreen may ask before running the installer (**More info › Run anyway**). macOS asks to confirm the first opening (open it from Finder with **Control-click › Open**). Signing the installers and the window would end all of these.

## Building the app

`node scripts/app-bundle.mjs` builds the app for this computer from a checkout of the repository; `--platform` and `--arch` build it for another. The Windows installer needs Inno Setup 6, from its own installer, Chocolatey, or Scoop (`scoop install extras/inno-setup`); without it, only the zip is made.

The Studio's window is the [Tauri](https://tauri.app) program in `desktop/`, built with Rust by `node scripts/desktop-build.mjs`, which the app build runs; on Linux it also needs WebKitGTK's development files (`libwebkit2gtk-4.1-dev`). It is built on the system it is for, so an app built for another system, or without Rust, or with `--no-window`, opens the Studio in a browser's app window. To try the window on a checkout, point it at the checkout's command:

```bash
node scripts/desktop-build.mjs
FRAMESEQ_DESKTOP_CLI=scripts/frameseq.mjs desktop/target/release/frameseq-studio talk.slides.ts
```

Version tags build every platform on GitHub Actions and attach the downloads to the release. See [Release automation](releasing.md).
