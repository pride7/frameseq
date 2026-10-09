/** What the development server says about the Studio it is serving. */
export interface StudioSession {
  token: string;
  entry: string;
  /** The slide document relative to the directory the server runs in. */
  file: string;
  name: string;
  directory: string;
  version: string;
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
  region: string;
  parentId?: string;
  properties: InspectProperty[];
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
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const base = "/__frameseq/studio";
let token = "";

export async function openSession(): Promise<StudioSession> {
  const response = await fetch(`${base}/session`, { cache: "no-store" });
  const data = await response.json().catch(() => ({})) as Partial<StudioSession> & { error?: string };
  if (!response.ok || typeof data.token !== "string") {
    throw new StudioRequestError(data.error ?? `The Studio could not start (HTTP ${response.status}).`, response.status);
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
    throw new StudioRequestError(data.error ?? `HTTP ${response.status}`, response.status);
  }
  return data as T;
}

export function downloadUrl(job: string): string {
  return `${base}/download?job=${encodeURIComponent(job)}&token=${encodeURIComponent(token)}`;
}
