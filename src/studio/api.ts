import { t } from "./i18n";

/** What the development server says about the Studio it is serving. */
export interface StudioSession {
  token: string;
  /** True on the start page, where no presentation is open and only the file routes answer. */
  start: boolean;
  /** True when the Studio stops once its window closes, as one started from a shortcut does. */
  quitOnClose: boolean;
  /** Whether the server can show this computer's own open and folder dialogs. */
  dialogs: boolean;
  /** Whether this page may open a terminal: only on the computer running the Studio. */
  terminal?: boolean;
  entry: string;
  /** The slide document relative to the directory the server runs in. */
  file: string;
  name: string;
  directory: string;
  version: string;
  /** The version of FrameSeq the Studio runs. */
  frameseq?: string;
  /** Whether this page may use the assistant, which only the computer running the Studio may. */
  assistant?: boolean;
}

export interface RecentPresentation {
  path: string;
  name: string;
  folder: string;
}

export interface FilesResponse {
  recent: RecentPresentation[];
  /** Where a new presentation goes unless the person picks another folder. */
  folder: string;
}

/** A path chosen in a native dialog, or why there is none. */
export interface ChooseResponse {
  path?: string;
  cancelled?: boolean;
  unavailable?: boolean;
}

export interface OpenResponse {
  ok: boolean;
  path: string;
  name: string;
  /** The presentation asked for is the one already open. */
  current?: boolean;
}

export interface SourceResponse {
  text: string;
  version: string;
}

export interface SaveResponse {
  ok: boolean;
  version?: string;
  conflict?: boolean;
  syntax?: LanguageDiagnostic[];
}

export interface LanguageDiagnostic {
  from: number;
  to: number;
  severity: "error" | "warning" | "info";
  message: string;
  code: number;
}

export interface CompletionEntry {
  name: string;
  kind: string;
  kindModifiers?: string;
  sortText: string;
  insertText?: string;
  replacementSpan?: { start: number; length: number };
  source?: string;
  data?: unknown;
}

export interface Documentation {
  signature: string;
  documentation: string;
  tags: Array<{ name: string; text: string }>;
}

export interface HoverInfo extends Documentation {
  from: number;
  to: number;
}

export interface SignatureHelp {
  from: number;
  to: number;
  argument: number;
  selected: number;
  items: Array<{
    prefix: string;
    separator: string;
    suffix: string;
    documentation: string;
    parameters: Array<{ label: string; documentation: string }>;
  }>;
}

/** A value written literally in a command, which the inspector can rewrite in place. */
export interface InspectProperty {
  name: string;
  kind: "number" | "string" | "boolean";
  value: number | string | boolean;
  source: { line: number; character: number; start: number; end: number };
  /** The literal exactly as written, so a stale edit can be recognised and refused. */
  expected: string;
}

/** A string a command was given, such as a text object's words; `raw` for a tagged template. */
export interface InspectText extends InspectProperty {
  raw?: boolean;
  /** Which of the command's arguments it is. */
  argument: number;
}

/** One method called on an object, with the range that removes it and where its name is. */
export interface InspectMethod {
  name: string;
  start: number;
  end: number;
  nameStart: number;
  nameEnd: number;
  arguments: number;
  removeFrom: number;
}

/** A value the code computes, which the inspector shows but does not overwrite. */
export interface InspectComputed {
  name: string;
  text: string;
  source: { start: number; end: number };
}

/** A named at() region of a slide, with the literal properties of its container. */
export interface InspectRegion {
  id: string;
  path: string;
  source: { line: number; character: number; start?: number; end?: number };
  sources?: Array<{ line: number; character: number; start?: number; end?: number }>;
  properties?: InspectProperty[];
  visits: number;
}

export interface InspectObject {
  id: string;
  type: string;
  label?: string;
  name?: string;
  /** The names it is placed against or connects, with rightOf() or from() and the like. */
  refers?: string[];
  region: string;
  parentId?: string;
  properties: InspectProperty[];
  texts?: InspectText[];
  computed?: InspectComputed[];
  methods?: InspectMethod[];
  /** Where a new method call goes: after the last one, on a line of its own when that has one. */
  append?: { at: number; indent?: string };
  /** The statement the object is, when it stands on its own and can be deleted whole. */
  statement?: { start: number; end: number };
  source: {
    line: number;
    character: number;
    endLine?: number;
    endCharacter?: number;
    start?: number;
    end?: number;
  };
}

export interface InspectSlide {
  index: number;
  label: string;
  layout: string;
  notes: boolean;
  /** Where the speaker notes are written, with the text when it is a plain string written once. */
  noteSources?: Array<{ start: number; end: number; value?: string }>;
  /** Where .notes() can be added to the slide() call, when the statement is that call. */
  notesAt?: number;
  source: { line: number; character: number; endLine: number };
  objects: InspectObject[];
  regions?: InspectRegion[];
  objectCount: number;
}

export interface InspectReport {
  presentation: { title?: string };
  summary: { slides: number; objects: number };
  slides: InspectSlide[];
  /** The top-level statements of the inspected text, which the preview names slides by. */
  statements: Array<{ start: number; end: number; runs: boolean }>;
}

export type ExportFormat = "html" | "html-single" | "pdf" | "pptx" | "pptx-flat" | "typst";

export interface ExportResult {
  ok: boolean;
  job?: string;
  label: string;
  path: string;
  display: string;
  directory: boolean;
  log: string;
  duration: number;
}

export class StudioRequestError extends Error {
  constructor(message: string, readonly status: number, readonly data: Record<string, unknown> = {}) {
    super(message);
  }
}

const base = "/__frameseq/studio";
let token = "";

export async function openSession(): Promise<StudioSession> {
  const response = await fetch(`${base}/session`, { cache: "no-store" });
  const data = await response.json().catch(() => ({})) as Partial<StudioSession> & { error?: string };
  if (!response.ok || typeof data.token !== "string") {
    throw new StudioRequestError(data.error ?? t.ui.couldNotStart(response.status), response.status);
  }
  token = data.token;
  return data as StudioSession;
}

export async function call<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${base}/${path}`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-FrameSeq-Studio": token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new StudioRequestError(data.error ?? `HTTP ${response.status}`, response.status, data);
  }
  return data as T;
}

export function downloadUrl(job: string): string {
  return `${base}/download?job=${encodeURIComponent(job)}&token=${encodeURIComponent(token)}`;
}
