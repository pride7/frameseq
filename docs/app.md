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

## Using it

Open FrameSeq Studio from the Start menu, Applications, or the applications menu. It starts on its start page, where a new presentation is one click away; see [FrameSeq Studio](studio.md).

The `frameseq` command does everything the [CLI reference](cli.md) describes:

```bash
frameseq new talk.slides.ts
frameseq studio talk.slides.ts
frameseq pdf talk.slides.ts
```

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

## Updating and removing

Install a newer version over the old one. On Windows, FrameSeq is removed from **Settings › Apps**; on macOS, move FrameSeq Studio to the Bin; on Linux, delete `~/.local/share/frameseq` and `~/.local/bin/frameseq`, and run `frameseq shortcut --remove` first to take Studio out of the menu.

## The app or npm?

Both run the same FrameSeq. Install with npm, as [Getting started](getting-started.md) describes, when the presentation lives in a project with its own dependencies, or when coding agents and CI should run it the way they run everything else. Install the app to write presentations without setting up a development environment.

The installers are not signed yet. On Windows 11 with **Smart App Control** turned on, Windows may now and then refuse to start the unsigned installer, depending on what Microsoft's online check answers at that moment; try again a little later, or use the portable zip, whose Node.js is signed by the OpenJS Foundation. Elsewhere on Windows, SmartScreen may ask before running the installer (**More info › Run anyway**). macOS asks to confirm the first opening (open it from Finder with **Control-click › Open**). Signing the installers would end all three.

## Building the app

`node scripts/app-bundle.mjs` builds the app for this computer from a checkout of the repository; `--platform` and `--arch` build it for another. The Windows installer needs Inno Setup 6, from its own installer, Chocolatey, or Scoop (`scoop install extras/inno-setup`); without it, only the zip is made. Version tags build every platform on GitHub Actions and attach the downloads to the release. See [Release automation](releasing.md).
