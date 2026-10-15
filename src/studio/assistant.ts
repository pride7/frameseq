import { call } from "./api";
import { t } from "./i18n";
import { element, toast } from "./ui";

/**
 * The assistant panel: a conversation with Claude Code or Codex about the open presentation.
 * The Studio's server runs the agent and passes on what it does, which this panel draws; the
 * agent edits the file itself, and the Studio reloads it like any other change on disk.
 */

type AgentId = "claude" | "codex";

interface AgentInfo {
  id: AgentId;
  name: string;
  available: boolean;
  version?: string;
}

/** Where the person is, sent with a request so "this slide" means something to the agent. */
export interface AssistantContext {
  slide?: { index: number; label?: string; lines?: [number, number] };
  selection?: { from: number; to: number; text: string };
  problems?: string[];
  /** The same, as one line for the person to see. */
  summary: string;
}

type AssistantEvent =
  | { type: "user"; text: string; context?: string }
  | { type: "session"; id: string }
  | { type: "text"; text: string }
  | { type: "break" }
  | { type: "tool"; id: string; name: string; input?: string; status: "running" | "done" | "failed" }
  | { type: "file"; path: string }
  | { type: "notice"; text: string }
  | { type: "done"; ok: boolean; error?: string; seconds?: number; denied?: string[]; stopped?: boolean }
  | { type: "usage"; agent: AgentId; usage: AgentUsage }
  | { type: "idle" };

interface ModelChoice {
  id: string;
  label: string;
  efforts: string[];
  defaultEffort?: string;
  fast: boolean;
}

/** The models, efforts, and speed an agent offers, and what it uses unless a request says. */
interface AgentChoices {
  models: ModelChoice[];
  defaults: { model?: string; effort?: string; fast?: boolean; fastByDefault?: boolean };
}

/** How much of the plan is used, in windows such as five hours and seven days. */
interface AgentUsage {
  windows?: Array<{ minutes?: number; used: number; resetsAt?: number }>;
  limited?: boolean;
  overage?: boolean;
  at?: number;
}

/** What a request asks for; an empty model or effort leaves the agent's own default. */
interface AgentSettings {
  model: string;
  effort: string;
  fast: boolean;
}

interface AssistantState {
  agents: AgentInfo[];
  conversation: { agent?: AgentId; session?: string; running: boolean; events: AssistantEvent[] };
}

export interface AssistantOptions {
  context: () => AssistantContext;
  /** Save the editor's text before the agent reads the file; false when it cannot be saved. */
  beforeSend: () => Promise<boolean>;
  /** The agent started or stopped working, for the editor to hold typing off meanwhile. */
  onBusy: (busy: boolean) => void;
  /** Keep or undo every change still under review. */
  review: (keep: boolean) => void;
  onClose: () => void;
}

const agentKey = "frameseq-studio-assistant-agent";
const settingsKey = "frameseq-studio-assistant-settings";

function storedSettings(): Partial<Record<AgentId, AgentSettings>> {
  try {
    return JSON.parse(localStorage.getItem(settingsKey) ?? "{}") as Partial<Record<AgentId, AgentSettings>>;
  } catch {
    return {};
  }
}

function storedAgent(): AgentId | undefined {
  try {
    const value = localStorage.getItem(agentKey);
    return value === "claude" || value === "codex" ? value : undefined;
  } catch {
    return undefined;
  }
}

export class AssistantPanel {
  private readonly log: HTMLElement;
  private readonly picker: HTMLSelectElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly contextToggle: HTMLInputElement;
  private readonly contextLabel: HTMLElement;
  private readonly modelPicker: HTMLSelectElement;
  private readonly effortPicker: HTMLSelectElement;
  private readonly fastToggle: HTMLInputElement;
  private readonly usageButton: HTMLButtonElement;
  private readonly reviewBar: HTMLElement;
  private readonly choices = new Map<AgentId, AgentChoices>();
  private readonly usage = new Map<AgentId, AgentUsage | null>();
  private agents: AgentInfo[] = [];
  private loaded = false;
  private busy = false;
  /** The answer being written, and its text so far, drawn again as more arrives. */
  private message?: { node: HTMLElement; text: string };
  private readonly tools = new Map<string, HTMLElement>();
  private drawing = 0;

  constructor(private readonly host: HTMLElement, private readonly options: AssistantOptions) {
    host.innerHTML = `
      <header class="studio-pane-header">
        <span class="studio-pane-title">${t.assistant.title}</span>
        <select class="studio-assistant-agent" aria-label="${t.assistant.agent}"></select>
        <span class="studio-pane-spacer"></span>
        <button type="button" class="studio-icon-button" data-assistant="new" title="${t.assistant.newConversation}">+</button>
        <button type="button" class="studio-icon-button" data-assistant="close" title="${t.ui.close}">×</button>
      </header>
      <div class="studio-assistant-settings">
        <select class="studio-assistant-select" data-setting="model" aria-label="${t.assistant.model}" title="${t.assistant.model}"></select>
        <select class="studio-assistant-select" data-setting="effort" aria-label="${t.assistant.effort}" title="${t.assistant.effort}"></select>
        <label class="studio-assistant-fast" title="${t.assistant.fastTitle}"><input type="checkbox" data-setting="fast"><span>${t.assistant.fast}</span></label>
        <button type="button" class="studio-assistant-usage" data-assistant="usage"></button>
      </div>
      <div class="studio-assistant-log" role="log" aria-live="polite"></div>
      <form class="studio-assistant-composer">
        <div class="studio-assistant-review" hidden>
          <span class="studio-assistant-review-text"></span>
          <button type="button" class="studio-button" data-review="reject">${t.review.rejectAll}</button>
          <button type="button" class="studio-button is-primary" data-review="accept">${t.review.acceptAll}</button>
        </div>
        <label class="studio-assistant-context"><input type="checkbox" checked><span></span></label>
        <textarea rows="3" placeholder="${t.assistant.placeholder}"></textarea>
        <div class="studio-assistant-actions">
          <span class="studio-assistant-hint">${t.assistant.hint}</span>
          <button type="submit" class="studio-button is-primary">${t.assistant.send}</button>
        </div>
      </form>`;
    this.log = host.querySelector<HTMLElement>(".studio-assistant-log")!;
    this.picker = host.querySelector<HTMLSelectElement>(".studio-assistant-agent")!;
    this.input = host.querySelector<HTMLTextAreaElement>("textarea")!;
    this.sendButton = host.querySelector<HTMLButtonElement>("button[type='submit']")!;
    this.contextToggle = host.querySelector<HTMLInputElement>(".studio-assistant-context input")!;
    this.contextLabel = host.querySelector<HTMLElement>(".studio-assistant-context span")!;
    this.modelPicker = host.querySelector<HTMLSelectElement>("[data-setting='model']")!;
    this.effortPicker = host.querySelector<HTMLSelectElement>("[data-setting='effort']")!;
    this.fastToggle = host.querySelector<HTMLInputElement>("[data-setting='fast']")!;
    this.usageButton = host.querySelector<HTMLButtonElement>("[data-assistant='usage']")!;
    this.reviewBar = host.querySelector<HTMLElement>(".studio-assistant-review")!;
    this.reviewBar.querySelector("[data-review='accept']")!.addEventListener("click", () => this.options.review(true));
    this.reviewBar.querySelector("[data-review='reject']")!.addEventListener("click", () => this.options.review(false));
    this.modelPicker.addEventListener("change", () => {
      this.fillEfforts();
      this.storeSettings();
    });
    this.effortPicker.addEventListener("change", () => this.storeSettings());
    this.fastToggle.addEventListener("change", () => this.storeSettings());
    this.usageButton.addEventListener("click", () => void this.loadUsage(true));

    host.querySelector("[data-assistant='close']")!.addEventListener("click", () => this.options.onClose());
    host.querySelector("[data-assistant='new']")!.addEventListener("click", () => void this.startOver());
    this.picker.addEventListener("change", () => {
      try {
        localStorage.setItem(agentKey, this.picker.value);
      } catch {
        // Only a convenience.
      }
      void this.loadChoices();
      void this.loadUsage();
    });
    host.querySelector("form")!.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.busy) void this.stop();
      else void this.send();
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!this.busy) void this.send();
      }
    });
    this.input.addEventListener("focus", () => this.refreshContext());

    import.meta.hot?.on("frameseq:assistant", (event: AssistantEvent) => this.receive(event));
  }

  /** Fill the panel the first time it is shown: the agents found, and the conversation so far. */
  async show(): Promise<void> {
    this.refreshContext();
    if (!this.loaded) {
      this.loaded = true;
      try {
        const state = await call<AssistantState>("GET", "assistant");
        this.setAgents(state.agents, state.conversation.agent);
        void this.loadChoices();
        void this.loadUsage();
        this.log.replaceChildren();
        for (const event of state.conversation.events) this.draw(event);
        this.setBusy(state.conversation.running);
      } catch (error) {
        this.loaded = false;
        this.log.replaceChildren(element("p", "studio-assistant-error", error instanceof Error ? error.message : String(error)));
        return;
      }
      if (this.log.childElementCount === 0) this.showWelcome();
    }
    this.input.focus();
  }

  /** How many of the agent's changes wait in the editor to be kept or undone, if any. */
  setReview(count: number | undefined): void {
    this.reviewBar.hidden = count === undefined;
    if (count !== undefined) this.reviewBar.querySelector(".studio-assistant-review-text")!.textContent = `${t.review.changes(count)} · ${t.review.inEditor}`;
  }

  refreshContext(): void {
    this.contextLabel.textContent = t.assistant.context(this.options.context().summary);
  }

  private setAgents(agents: AgentInfo[], current?: AgentId): void {
    this.agents = agents;
    const available = agents.filter((agent) => agent.available);
    this.picker.replaceChildren(...available.map((agent) => {
      const option = element("option", "", agent.version ? `${agent.name} ${agent.version}` : agent.name);
      option.value = agent.id;
      return option;
    }));
    const wanted = current ?? storedAgent();
    if (wanted && available.some((agent) => agent.id === wanted)) this.picker.value = wanted;
    this.picker.hidden = available.length === 0;
    this.input.disabled = available.length === 0;
    this.sendButton.disabled = available.length === 0;
  }

  private get agent(): AgentId | undefined {
    const value = this.picker.value;
    return value === "claude" || value === "codex" ? value : undefined;
  }

  /** The models and efforts of the chosen agent, asked for once. */
  private async loadChoices(): Promise<void> {
    const agent = this.agent;
    if (!agent) return;
    if (!this.choices.has(agent)) {
      try {
        this.choices.set(agent, await call<AgentChoices>("POST", "assistant/options", { agent }));
      } catch {
        this.choices.set(agent, { models: [], defaults: {} });
      }
    }
    if (agent !== this.agent) return;
    const choices = this.choices.get(agent)!;
    const saved = storedSettings()[agent];
    const option = (value: string, label: string) => {
      const node = element("option", "", label);
      node.value = value;
      return node;
    };
    this.modelPicker.replaceChildren(
      option("", t.assistant.byDefault(choices.defaults.model)),
      ...choices.models.map((model) => option(model.id, model.label)),
    );
    this.modelPicker.value = saved?.model && choices.models.some((model) => model.id === saved.model) ? saved.model : "";
    this.fillEfforts(saved?.effort);
    this.fastToggle.checked = Boolean(saved?.fast ?? choices.defaults.fast) && !this.fastToggle.disabled;
  }

  /** The efforts the chosen model offers, and whether it has a fast mode. */
  private fillEfforts(wanted = this.effortPicker.value): void {
    const agent = this.agent;
    const choices = agent ? this.choices.get(agent) : undefined;
    if (!choices) return;
    const model = choices.models.find((candidate) => candidate.id === this.modelPicker.value)
      ?? choices.models.find((candidate) => candidate.id === choices.defaults.model);
    const efforts = model?.efforts ?? choices.models[0]?.efforts ?? [];
    const label = (effort: string) => t.assistant.efforts[effort] ?? effort;
    const defaultEffort = choices.defaults.effort ?? model?.defaultEffort;
    const options = [["", t.assistant.byDefault(defaultEffort ? label(defaultEffort) : undefined)], ...efforts.map((effort) => [effort, label(effort)])];
    this.effortPicker.replaceChildren(...options.map(([value, text]) => {
      const node = element("option", "", text);
      node.value = value;
      return node;
    }));
    this.effortPicker.value = wanted && efforts.includes(wanted) ? wanted : "";
    this.effortPicker.hidden = efforts.length === 0;
    const fast = this.modelPicker.value ? Boolean(model?.fast) : Boolean(choices.defaults.fastByDefault ?? model?.fast);
    this.fastToggle.disabled = !fast;
    if (!fast) this.fastToggle.checked = false;
    this.modelPicker.hidden = choices.models.length === 0;
  }

  private settings(): AgentSettings {
    return { model: this.modelPicker.value, effort: this.effortPicker.value, fast: this.fastToggle.checked && !this.fastToggle.disabled };
  }

  private storeSettings(): void {
    const agent = this.agent;
    if (!agent) return;
    try {
      localStorage.setItem(settingsKey, JSON.stringify({ ...storedSettings(), [agent]: this.settings() }));
    } catch {
      // Only a convenience.
    }
  }

  /** How much of the plan the chosen agent has used; Codex can say at any time, Claude Code after a request. */
  private async loadUsage(fresh = false): Promise<void> {
    const agent = this.agent;
    if (!agent) return;
    if (fresh || !this.usage.has(agent)) {
      try {
        const { usage } = await call<{ usage: AgentUsage | null }>("POST", "assistant/usage", { agent });
        this.usage.set(agent, usage);
      } catch {
        this.usage.set(agent, null);
      }
    }
    this.drawUsage();
  }

  private drawUsage(): void {
    const agent = this.agent;
    const usage = agent ? this.usage.get(agent) : undefined;
    const windows = usage?.windows ?? [];
    this.usageButton.classList.toggle("is-high", windows.some((window) => window.used >= 0.8));
    this.usageButton.classList.toggle("is-limited", Boolean(usage?.limited));
    if (windows.length === 0) {
      this.usageButton.textContent = t.assistant.usageUnknown;
      this.usageButton.title = t.assistant.usageRefresh;
      return;
    }
    const percent = (used: number) => Math.round(used * 100);
    const when = (seconds?: number) => seconds ? new Date(seconds * 1000).toLocaleString(document.documentElement.lang || undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : undefined;
    this.usageButton.textContent = windows.map((window) => `${t.assistant.window(window.minutes)} ${percent(window.used)}%`).join(" · ");
    this.usageButton.title = [
      ...windows.map((window) => t.assistant.usageLine(t.assistant.window(window.minutes), percent(window.used), when(window.resetsAt))),
      ...(usage?.limited ? [t.assistant.limited] : []),
      ...(usage?.overage ? [t.assistant.overage] : []),
      ...(usage?.at ? [t.assistant.usageAt(new Date(usage.at).toLocaleString(document.documentElement.lang || undefined))] : []),
      t.assistant.usageRefresh,
    ].join("\n");
  }

  /** What the panel says before the first request: what it can do, or how to get an agent. */
  private showWelcome(): void {
    const box = element("div", "studio-assistant-welcome");
    if (!this.agents.some((agent) => agent.available)) {
      box.append(element("p", "", t.assistant.noAgent));
      const list = element("ul");
      list.append(
        element("li", "", t.assistant.installClaude),
        element("li", "", t.assistant.installCodex),
      );
      const again = element("button", "studio-button", t.assistant.lookAgain);
      again.type = "button";
      again.addEventListener("click", () => void this.lookAgain());
      box.append(list, again);
    } else {
      box.append(element("p", "", t.assistant.welcome));
      const examples = element("div", "studio-assistant-examples");
      for (const example of t.assistant.examples) {
        const chip = element("button", "studio-assistant-example", example);
        chip.type = "button";
        chip.addEventListener("click", () => {
          this.input.value = example;
          this.input.focus();
        });
        examples.append(chip);
      }
      box.append(examples);
    }
    this.log.replaceChildren(box);
  }

  private async lookAgain(): Promise<void> {
    const { agents } = await call<{ agents: AgentInfo[] }>("POST", "assistant/refresh");
    this.setAgents(agents);
    this.showWelcome();
  }

  private async startOver(): Promise<void> {
    await call("POST", "assistant/new");
    this.message = undefined;
    this.tools.clear();
    this.setBusy(false);
    this.showWelcome();
    this.input.focus();
  }

  private async send(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || !this.picker.value) return;
    if (!await this.options.beforeSend()) return;
    const context = this.contextToggle.checked ? this.options.context() : undefined;
    this.log.querySelector(".studio-assistant-welcome")?.remove();
    this.setBusy(true);
    try {
      await call("POST", "assistant/send", { agent: this.picker.value, text, context, settings: this.settings() });
      this.input.value = "";
    } catch (error) {
      this.setBusy(false);
      toast(error instanceof Error ? error.message : String(error), { tone: "error" });
    }
  }

  private async stop(): Promise<void> {
    await call("POST", "assistant/stop").catch(() => undefined);
  }

  private setBusy(busy: boolean): void {
    if (this.busy === busy) return;
    this.busy = busy;
    this.host.classList.toggle("is-busy", busy);
    this.sendButton.textContent = busy ? t.assistant.stop : t.assistant.send;
    this.sendButton.classList.toggle("is-primary", !busy);
    this.picker.disabled = busy;
    this.modelPicker.disabled = busy;
    this.effortPicker.disabled = busy;
    this.options.onBusy(busy);
  }

  private receive(event: AssistantEvent): void {
    if (event.type === "idle") {
      this.setBusy(false);
      return;
    }
    if (event.type === "usage") {
      this.usage.set(event.agent, event.usage);
      this.drawUsage();
      return;
    }
    if (event.type === "user") this.setBusy(true);
    this.log.querySelector(".studio-assistant-welcome")?.remove();
    this.draw(event);
  }

  /** Add one event to the conversation, keeping the newest in view while the person reads there. */
  private draw(event: AssistantEvent): void {
    const following = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    switch (event.type) {
      case "user": {
        this.message = undefined;
        const bubble = element("div", "studio-assistant-user");
        bubble.append(element("p", "", event.text));
        if (event.context) bubble.append(element("small", "", event.context));
        this.log.append(bubble);
        break;
      }
      case "text": {
        if (!this.message) {
          const node = element("div", "studio-assistant-message");
          this.log.append(node);
          this.message = { node, text: "" };
        }
        this.message.text += event.text;
        const message = this.message;
        cancelAnimationFrame(this.drawing);
        this.drawing = requestAnimationFrame(() => {
          message.node.innerHTML = renderMarkdown(message.text);
        });
        break;
      }
      case "break":
        if (this.message) this.message.node.innerHTML = renderMarkdown(this.message.text);
        this.message = undefined;
        break;
      case "tool": {
        this.message = undefined;
        let row = this.tools.get(event.id);
        if (!row) {
          row = element("div", "studio-assistant-tool");
          row.append(element("span", "studio-assistant-tool-state"), element("span", "studio-assistant-tool-label"));
          this.tools.set(event.id, row);
          this.log.append(row);
        }
        row.dataset.status = event.status;
        row.querySelector(".studio-assistant-tool-state")!.textContent = event.status === "running" ? "…" : event.status === "done" ? "✓" : "✗";
        row.querySelector(".studio-assistant-tool-label")!.textContent = toolLabel(event.name, event.input ?? "");
        break;
      }
      case "notice":
        this.log.append(element("p", "studio-assistant-notice", event.text));
        break;
      case "done": {
        this.message = undefined;
        if (event.stopped) this.log.append(element("p", "studio-assistant-notice", t.assistant.stopped));
        else if (!event.ok) this.log.append(element("pre", "studio-assistant-error", event.error || t.assistant.failed));
        if (event.denied?.length) this.log.append(element("p", "studio-assistant-notice", t.assistant.denied([...new Set(event.denied)].join(", "))));
        if (event.ok) this.log.append(element("p", "studio-assistant-done", t.assistant.finished(Math.max(1, event.seconds ?? 0))));
        break;
      }
      default:
        break;
    }
    if (following) this.log.scrollTop = this.log.scrollHeight;
  }
}

/** What a tool call did, in the person's words. */
function toolLabel(name: string, input: string): string {
  const tool = name.replace(/^mcp__frameseq__/, "");
  switch (tool) {
    case "Read": return t.assistant.tools.read(input);
    case "Edit":
    case "MultiEdit":
    case "Write": return t.assistant.tools.edit(input);
    case "Glob":
    case "Grep": return t.assistant.tools.search(input);
    case "outline": return t.assistant.tools.outline;
    case "check": return t.assistant.tools.check;
    case "screenshot": return t.assistant.tools.screenshot(input);
    case "guide": return t.assistant.tools.guide;
    case "Command": return t.assistant.tools.command(input);
    default: {
      // Another MCP server the agent has, such as Codex's own: its name and the tool's.
      const label = name.replace(/^mcp__([^_]+(?:_[^_]+)*?)__/, "$1 · ");
      return input ? `${label} ${input}` : label;
    }
  }
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]!);

/** Inline Markdown: code, bold, and italics, on text already escaped. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}

/**
 * The little Markdown agents answer in: paragraphs, lists, headings, and code. Everything is
 * escaped first, so an answer can never put markup of its own into the page.
 */
export function renderMarkdown(source: string): string {
  const out: string[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;
  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.ordered ? "ol" : "ul"}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.ordered ? "ol" : "ul"}>`);
    list = undefined;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^\s*```/);
    if (fence) {
      flushParagraph();
      flushList();
      const code: string[] = [];
      for (index += 1; index < lines.length && !/^\s*```/.test(lines[index]); index += 1) code.push(lines[index]);
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const item = line.match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/);
    if (item) {
      flushParagraph();
      const ordered = Boolean(item[2]);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item[3]);
      continue;
    }
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      out.push(`<p><strong>${inline(heading[1])}</strong></p>`);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return out.join("");
}
