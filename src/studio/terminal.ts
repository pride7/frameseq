import type { FitAddon } from "@xterm/addon-fit";
import type { ITheme, Terminal } from "@xterm/xterm";
import { t } from "./i18n";

type State = "idle" | "connecting" | "open" | "exited" | "closed";

type ServerMessage =
  | { type: "ready"; id: string; shell: string; replay: string; pty?: { backend: "conpty"; buildNumber: number } }
  | { type: "output"; data: string }
  | { type: "exit"; code: number }
  | { type: "gone" }
  | { type: "error"; message: string };

export interface TerminalOptions {
  token: string;
  /** The slide document, so a reload of this presentation, and no other, finds its shell again. */
  entry: string;
  /** False on a page served to another computer, which never gets a shell. */
  available: boolean;
  dark: boolean;
  openLink: (url: string) => void;
}

const sessionKey = "frameseq-studio-terminal";
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
/** What the page keeps of a shell's output while the terminal is not drawn yet. */
const pendingLength = 256 * 1024;
/** Output drawn before the page tells the server, which holds a shell that runs ahead of the page. */
const acknowledgeEvery = 8 * 1024;
/**
 * The Studio's monospace fonts, then common Nerd Fonts ahead of the generic family, so the icons
 * of prompts such as Oh My Posh and Starship come from whichever one is installed.
 */
const fontFamily = [
  '"JetBrains Mono"', '"Cascadia Code"', '"Fira Code"', '"SF Mono"', "Consolas",
  '"Symbols Nerd Font Mono"', '"JetBrainsMono Nerd Font"', '"CaskaydiaCove Nerd Font"', '"MesloLGS NF"',
  '"FiraCode Nerd Font"', '"Hack Nerd Font"', '"0xProto Nerd Font"', "ui-monospace", "monospace",
].join(", ");

const palettes: Record<"light" | "dark", ITheme> = {
  dark: {
    black: "#1e293b", red: "#f87171", green: "#4ade80", yellow: "#fbbf24",
    blue: "#60a5fa", magenta: "#c084fc", cyan: "#22d3ee", white: "#cbd5e1",
    brightBlack: "#64748b", brightRed: "#fca5a5", brightGreen: "#86efac", brightYellow: "#fde68a",
    brightBlue: "#93c5fd", brightMagenta: "#d8b4fe", brightCyan: "#67e8f9", brightWhite: "#f8fafc",
  },
  light: {
    black: "#0f172a", red: "#dc2626", green: "#15803d", yellow: "#a16207",
    blue: "#1d4ed8", magenta: "#9333ea", cyan: "#0e7490", white: "#64748b",
    brightBlack: "#475569", brightRed: "#b91c1c", brightGreen: "#166534", brightYellow: "#854d0e",
    brightBlue: "#1e40af", brightMagenta: "#7e22ce", brightCyan: "#155e75", brightWhite: "#334155",
  },
};

function readSession(entry: string): string | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(sessionKey) ?? "null") as { entry?: string; id?: string } | null;
    return value?.entry === entry && typeof value.id === "string" ? value.id : undefined;
  } catch {
    return undefined;
  }
}

function storeSession(entry: string, id: string | undefined): void {
  try {
    if (id) sessionStorage.setItem(sessionKey, JSON.stringify({ entry, id }));
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // Only a convenience across reloads.
  }
}

/**
 * The bottom panel's terminal: a shell in the presentation's folder, run by the server in a
 * pseudo-terminal and drawn by xterm.js. The shell outlives a reload of the page, which picks it
 * up again with what it printed last. xterm.js loads the first time the terminal is shown, so a
 * Studio that never opens it never loads it.
 */
export class StudioTerminal {
  private term?: Terminal;
  private fit?: FitAddon;
  private loading?: Promise<void>;
  private socket?: WebSocket;
  private id: string | undefined;
  private state: State = "idle";
  private pending = "";
  private unacknowledged = 0;
  private dark: boolean;

  constructor(private readonly host: HTMLElement, private readonly options: TerminalOptions) {
    this.dark = options.dark;
    this.host.dataset.ownsKeys = "";
    this.id = readSession(options.entry);
    // A shell that ran before the page reloaded is picked up at once, even while the panel shows
    // something else, so it is not ended for want of a page.
    if (this.id && options.available) this.connect(true);
  }

  /** Draw the terminal, starting a shell the first time. */
  async show(focus: boolean): Promise<void> {
    await this.render();
    this.resize();
    if (this.state === "idle" && this.options.available) this.connect(false);
    if (focus) this.term?.focus();
  }

  focus(): void {
    this.term?.focus();
  }

  hasFocus(): boolean {
    return this.host.contains(document.activeElement);
  }

  /** End the shell; any key in the terminal then starts a new one. */
  kill(): void {
    this.send({ type: "kill" });
  }

  setDark(dark: boolean): void {
    this.dark = dark;
    if (!this.term) return;
    this.term.options.theme = this.theme();
    this.term.options.minimumContrastRatio = dark ? 1 : 4.5;
  }

  /** What the terminal shows, line by line, for tests. */
  get text(): string {
    const buffer = this.term?.buffer.active;
    if (!buffer) return this.pending;
    const lines: string[] = [];
    for (let index = 0; index < buffer.length; index += 1) lines.push(buffer.getLine(index)?.translateToString(true) ?? "");
    return lines.join("\n").trimEnd();
  }

  get status(): State {
    return this.state;
  }

  private theme(): ITheme {
    const style = getComputedStyle(document.documentElement);
    const token = (name: string): string => style.getPropertyValue(name).trim();
    return {
      ...palettes[this.dark ? "dark" : "light"],
      background: token("--studio-surface"),
      foreground: token("--studio-text"),
      cursor: token("--studio-accent"),
      cursorAccent: token("--studio-surface"),
      selectionBackground: token("--studio-selection"),
    };
  }

  private render(): Promise<void> {
    this.loading ??= (async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
        import("@xterm/xterm/css/xterm.css"),
      ]);
      const term = new Terminal({
        fontFamily,
        fontSize: 12.5,
        lineHeight: 1.2,
        cursorBlink: true,
        scrollback: 5000,
        minimumContrastRatio: this.dark ? 1 : 4.5,
        theme: this.theme(),
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon((_event, uri) => this.options.openLink(uri)));
      term.attachCustomKeyEventHandler((event) => this.keepKey(event));
      term.onData((data) => {
        if (this.state === "open") this.send({ type: "input", data });
        else if (this.state !== "connecting" && this.options.available) this.connect(false);
      });
      term.onResize(({ cols, rows }) => this.send({ type: "resize", cols, rows }));
      term.open(this.host);
      this.term = term;
      this.fit = fit;
      new ResizeObserver(() => this.resize()).observe(this.host);
      if (this.pending) {
        term.write(this.pending);
        this.pending = "";
      }
      if (!this.options.available) this.notice(t.terminal.remote);
    })();
    return this.loading;
  }

  /**
   * The keys the Studio keeps from the shell, which return false so xterm.js lets them through to
   * the page: Ctrl+` and the bottom panel's shortcut, and copy and paste outside macOS, where Ctrl+C
   * copies a selection and interrupts the program only when nothing is selected.
   */
  private keepKey(event: KeyboardEvent): boolean {
    if (event.type !== "keydown") return true;
    const primary = isMac ? event.metaKey : event.ctrlKey;
    if (event.ctrlKey && !event.altKey && !event.metaKey && event.code === "Backquote") return false;
    if (primary && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "j") return false;
    if (isMac || !event.ctrlKey || event.altKey) return true;
    const key = event.key.toLowerCase();
    if (key === "c" && event.shiftKey) {
      // Ctrl+Shift+C would open the browser's inspector, so the terminal copies by itself.
      event.preventDefault();
      const selection = this.term?.getSelection() ?? "";
      if (selection) void navigator.clipboard?.writeText(selection).catch(() => undefined);
      return false;
    }
    if (key === "c" && this.term?.hasSelection()) {
      // The browser copies through xterm.js's own text area, which hands it the selection, and the
      // selection then clears, as in Windows Terminal.
      setTimeout(() => this.term?.clearSelection());
      return false;
    }
    // The browser pastes into that text area too, which sends the text on to the shell.
    return key !== "v";
  }

  private resize(): void {
    if (!this.fit || this.host.offsetWidth === 0 || this.host.offsetHeight === 0) return;
    requestAnimationFrame(() => {
      if (this.host.offsetWidth > 0) this.fit?.fit();
    });
  }

  private connect(attach: boolean): void {
    if (this.socket) return;
    const url = new URL("/__frameseq/studio/terminal", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("token", this.options.token);
    if (this.id) url.searchParams.set("id", this.id);
    if (attach) url.searchParams.set("attach", "1");
    if (this.term) {
      url.searchParams.set("cols", String(this.term.cols));
      url.searchParams.set("rows", String(this.term.rows));
    }
    const socket = new WebSocket(url);
    this.socket = socket;
    this.state = "connecting";
    socket.addEventListener("message", (event) => {
      try {
        this.receive(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        // Not a message of the terminal's.
      }
    });
    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (this.state === "exited" || this.state === "idle") return;
      const wasOpen = this.state === "open";
      this.state = "closed";
      if (event.code === 4000) this.notice(t.terminal.takenOver);
      else if (wasOpen) this.notice(t.terminal.disconnected);
    });
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case "ready":
        this.id = message.id;
        this.state = "open";
        this.unacknowledged = 0;
        storeSession(this.options.entry, message.id);
        if (this.term && message.pty) this.term.options.windowsPty = message.pty;
        if (message.replay) {
          // The shell's recent output stands in for whatever this page showed of it before.
          this.term?.reset();
          this.write(message.replay, false);
        }
        if (this.term) this.send({ type: "resize", cols: this.term.cols, rows: this.term.rows });
        break;
      case "output":
        this.write(message.data, true);
        break;
      case "exit":
        this.ended();
        this.notice(t.terminal.exited(message.code));
        break;
      case "gone":
        this.ended();
        this.state = "idle";
        // A terminal on show starts a shell of its own in place of the one that ended. The server
        // closes the socket that said so, which this page lets go of first.
        if (this.term && this.host.offsetWidth > 0) {
          this.socket = undefined;
          this.connect(false);
        }
        break;
      case "error":
        this.ended();
        this.state = "closed";
        this.notice(t.terminal.failed(message.message), true);
        break;
    }
  }

  private ended(): void {
    this.id = undefined;
    this.state = "exited";
    storeSession(this.options.entry, undefined);
  }

  private write(data: string, acknowledge: boolean): void {
    if (!this.term) {
      this.pending = `${this.pending}${data}`.slice(-pendingLength);
      if (acknowledge) this.acknowledge(data.length);
      return;
    }
    this.term.write(data, acknowledge ? () => this.acknowledge(data.length) : undefined);
  }

  private acknowledge(count: number): void {
    this.unacknowledged += count;
    if (this.unacknowledged < acknowledgeEvery) return;
    this.send({ type: "ack", count: this.unacknowledged });
    this.unacknowledged = 0;
  }

  /** A line from the Studio rather than the shell, set apart in a dim or red colour. */
  private notice(text: string, error = false): void {
    const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).join("\r\n");
    this.write(`\r\n\x1b[${error ? "31" : "2"}m${lines}\x1b[0m\r\n`, false);
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
