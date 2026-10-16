// The packaged Studio uses this small event bridge instead of a development server.
// Keep the interface the preview already uses for replacing a deck and reporting saves.
import "virtual:frameseq-icons";

type Listener = (data: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
let accept: Listener | undefined;
let replacing = 0;
let socket: WebSocket;
let stopped = false;

function emit(event: string, data?: unknown): void {
  for (const callback of listeners.get(event) ?? []) callback(data);
}

const hot = {
  on(event: string, callback: Listener) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(callback);
  },
  off(event: string, callback: Listener) { listeners.get(event)?.delete(callback); },
  accept(_dependency: string, callback: Listener) { accept = callback; },
  send(event: string, data: unknown) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, data }));
  },
};

(globalThis as typeof globalThis & { __frameseqHot: typeof hot }).__frameseqHot = hot;

function connect(): void {
  socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/__frameseq/hot`);
  socket.addEventListener("open", () => emit("vite:ws:connect"));
  socket.addEventListener("close", () => {
    emit("vite:ws:disconnect");
    if (!stopped) setTimeout(connect, 1000);
  });
  socket.addEventListener("message", (message) => {
    const envelope = JSON.parse(String(message.data)) as { event: string; data?: unknown };
    if (envelope.event === "frameseq:reload") {
      emit("vite:beforeFullReload");
      location.reload();
    } else if (envelope.event === "frameseq:entry" && accept) {
      const version = ++replacing;
      void import(/* @vite-ignore */ `/__frameseq/entry.js?v=${encodeURIComponent(String(envelope.data))}`).then(
        (module) => { if (version === replacing) accept?.(module); },
        (error: unknown) => {
          if (version !== replacing) return;
          emit("vite:error", { err: { message: error instanceof Error ? error.message : String(error) } });
          accept?.(undefined);
        },
      );
    } else {
      emit(envelope.event, envelope.data);
    }
  });
}

addEventListener("beforeunload", () => { stopped = true; socket.close(); });
connect();
