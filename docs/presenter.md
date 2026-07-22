# Presenter view

Presenter view provides a private control surface for a live talk or rehearsal. It includes the current slide, next-slide preview, speaker notes, elapsed timer, slide selector, and navigation controls.

## Add speaker notes

Chain `notes()` from the slide builder:

```ts
slide("Architecture")
  .notes(`
    Explain why FrameSeq owns the presentation structure.
    Reveal the compiler stages one at a time.
  `);

text("Compiler pipeline").lead();
steps("Parse", "Render", "Export");
```

Notes are slide metadata. They never appear in the audience view, static slide content, print mode, or PDF output.

The object form also accepts notes:

```ts
slide({
  name: "architecture",
  title: "System architecture",
  notes: "Spend about two minutes on this slide.",
});
```

## Open presenter view

Start the development server normally:

```bash
npm run dev
```

In the audience page, press `P` or select the `P` navigation button. FrameSeq opens presenter view in a second window using the same origin as the audience page. For example, if the audience URL is `http://localhost:5174/`, the presenter URL is:

```text
http://localhost:5174/?presenter=1
```

Do not assume that the development server is always on port `5173`. If that port is already in use, Vite may choose another one. Use the URL printed by `npm run dev`, press `P` from the working audience page, or append `?presenter=1` to its actual URL. A browser `connection refused` page usually means that the URL uses the wrong port or that the development server has stopped.

Move the presenter window to the speaker's display and keep the audience window on the projector or shared screen. In a video call with one physical monitor, share only the audience browser window.

## Synchronized navigation

Navigation is synchronized in both directions. The following actions update the other window:

- Arrow keys, Page Up, Page Down, and Space.
- Previous and Next controls.
- Incremental `steps()` and `showAt()` reveals.
- The presenter page selector.

Same-device synchronization uses the browser's `BroadcastChannel` API. The windows must use the same origin and browser profile.

## Pair a phone remote

Start FrameSeq with its local-network transport enabled:

```bash
npm run present
```

The generated `present` script runs `frameseq dev slides.ts --remote`. In this mode FrameSeq listens on the computer's local network interface and adds an `R` control to the audience page plus a **Phone remote** control to presenter view.

1. Connect the phone and presentation computer to the same Wi-Fi or local network.
2. Open the presentation on the computer.
3. Select `R` or **Phone remote**.
4. Scan the QR code with the phone.
5. If the computer has several network adapters, select another address in the pairing dialog when the first one is not reachable from the phone.

The QR code contains a random session identifier and a local IP address. It is generated in the browser and is not sent to a third-party QR service. The phone initially opens a compact remote with large Previous and Next buttons, the current slide and page number, and a touch-friendly laser control. Enable the laser and drag across the slide preview to place the pointer on the audience screen.

Select **Presenter view** at the top of the phone remote to see the complete presenter interface, including the next-slide preview, speaker notes, elapsed timer, slide selector, and navigation controls. On a narrow phone screen, the current slide stays visible while **Notes** and **Next slide** share a switchable panel; long notes scroll inside that panel instead of moving the current slide off screen. Select **Simple remote** to return to the touch-friendly controller. Both layouts keep the same pairing session and stay synchronized with the audience screen.

Navigation, reveal steps, and pointer coordinates travel through a WebSocket relay inside the running FrameSeq development server. No account, internet connection, or FrameSeq cloud service is involved. The server also bridges phone commands to any presenter window open on the computer.

The operating system may ask whether Node.js can accept connections on private networks; allow private-network access for phone pairing. Guest Wi-Fi networks with client isolation can prevent devices from reaching each other even when they show the same network name.

## Timer

The elapsed timer starts when presenter view opens. Use:

- **Pause** to freeze it.
- **Resume** to continue from the paused time.
- **Reset** to return to zero and start again.

The timer is private to presenter view and does not affect slide timing or reveal state.

## Laser pointer

Press `Ctrl+L` in presenter view or select `Laser: Off` to enable the virtual laser pointer. Move the pointer over the current-slide preview and a red laser dot appears at the corresponding position in the audience window. The position uses normalized slide coordinates, so it remains aligned when the two windows use different sizes or zoom levels.

Move outside the current-slide preview to hide the dot. Press `Ctrl+L` again to disable it. Mouse, pen, and touch pointer events are supported. The laser pointer is never included in PDF or print output.

## Rehearsal and small screens

Presenter view works without an audience window, which makes it useful for rehearsal. Below 900 pixels wide, the interface changes to a vertical layout containing the current slide, next slide, notes, and controls.

The responsive layout makes the panel readable on a small device. The QR-paired phone page lets you switch between this complete layout and the dedicated remote with larger controls.

## Static HTML

Presenter view is included in `frameseq build` output. After hosting the generated `dist/` directory, open the regular page and press `P`, or append `?presenter=1` to its URL. No presenter server is required for same-device synchronization.

Phone remote pairing is intentionally local-server only. A static GitHub Pages deployment has no WebSocket relay, so it does not show the remote-pairing control. Run `npm run present` on the presentation computer when a phone remote is needed.
