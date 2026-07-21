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

Synchronization uses the browser's `BroadcastChannel` API. The windows must use the same origin, browser profile, and device. Cross-device remote control requires a separate network transport and is not part of the current presenter mode.

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

The responsive layout makes the panel readable on a small device, but navigation synchronization still requires the audience and presenter pages to run on the same device.

## Static HTML

Presenter view is included in `frameseq build` output. After hosting the generated `dist/` directory, open the regular page and press `P`, or append `?presenter=1` to its URL. No presenter server is required for same-device synchronization.
