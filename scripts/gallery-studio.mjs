import { spawn } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");

/** The window every picture is taken in, at twice its size so it stays sharp on a high-density screen. */
const viewport = { width: 1680, height: 1000, deviceScaleFactor: 2 };

async function waitFor(check, message, timeout = 60_000) {
  const started = Date.now();
  for (;;) {
    const value = await check().catch(() => undefined);
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Studio capture timed out: ${message}`);
    await delay(150);
  }
}

function startStudio(workspace) {
  const child = spawn(process.execPath, [cli, "studio", "talk.slides.ts", "--no-open"], {
    cwd: workspace,
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1" },
    windowsHide: true,
  });
  let output = "";
  const address = new Promise((resolveAddress, rejectAddress) => {
    const timer = setTimeout(() => rejectAddress(new Error(`The Studio did not start.\n${output}`)), 60_000);
    const read = (chunk) => {
      output += chunk.toString();
      const match = output.match(/Studio:\s+(https?:\/\/\S+studio\.html)/);
      if (match) {
        clearTimeout(timer);
        resolveAddress(match[1]);
      }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("close", (code) => rejectAddress(new Error(`The Studio exited with ${code}.\n${output}`)));
  });
  return { child, address };
}

/** The Studio's own words, which differ by the language it is shown in. */
const locales = {
  en: {
    deck: "studio.slides.ts",
    checked: "Layout checked",
    shape: "Edge gateway",
    rightClick: "Vector renderer",
    viewMenu: "View",
    mastersItem: "Slide master",
    request: "Turn the roadmap into four chevrons, one per quarter, and say what each quarter brings.",
    context: "Slide 5 “What comes next”",
    plan: "I'll draw each quarter as a chevron in its own colour, with the quarter above it, so the steps read left to right.",
    report: "Slide 5 now shows the roadmap as four chevrons, **Offline maps**, **3D buildings**, **Live traffic**, and **Open API**, from teal to purple, with the quarter above each. The layout check passes, and the picture of the slide looks right.",
  },
  zh: {
    deck: "studio-zh.slides.ts",
    checked: "布局已检查",
    shape: "边缘网关",
    rightClick: "矢量渲染器",
    viewMenu: "视图",
    mastersItem: "幻灯片母版",
    request: "把路线图改成四个箭头，每季度一个，并写上每季度要做什么。",
    context: "第 5 页「下一步」",
    plan: "我会把每个季度画成一个不同颜色的箭头，季度写在上方，从左往右读。",
    report: "第 5 页现在用四个箭头展示路线图：**离线地图**、**3D 建筑**、**实时路况**和**开放 API**，颜色从青绿渐变到紫色，上方标着季度。布局检查通过了，幻灯片的截图看起来也没问题。",
  },
};

/**
 * What the assistant panel shows in its picture: one request carried out, as Claude Code reports
 * it. The build machine has no agent signed in, so the panel is given this conversation in place
 * of the Studio's own; everything else in the picture is the Studio as it runs.
 */
const assistantState = (words) => ({
  agents: [
    { id: "claude", name: "Claude Code", available: true, version: "2.1" },
    { id: "codex", name: "Codex", available: false },
  ],
  conversation: {
    agent: "claude",
    running: false,
    events: [
      { type: "user", text: words.request, context: words.context },
      { type: "tool", id: "1", name: "mcp__frameseq__outline", status: "done" },
      { type: "tool", id: "2", name: "Read", input: "talk.slides.ts", status: "done" },
      { type: "text", text: words.plan },
      { type: "break" },
      { type: "tool", id: "3", name: "Edit", input: "talk.slides.ts", status: "done" },
      { type: "tool", id: "4", name: "mcp__frameseq__check", status: "done" },
      { type: "tool", id: "5", name: "mcp__frameseq__screenshot", input: "5", status: "done" },
      { type: "text", text: words.report },
      { type: "break" },
      { type: "done", ok: true, seconds: 41 },
    ],
  },
});

const assistantChoices = {
  models: [
    { id: "opus", label: "Opus", efforts: ["low", "medium", "high", "xhigh", "max"], defaultEffort: "xhigh", fast: true },
    { id: "sonnet", label: "Sonnet", efforts: ["low", "medium", "high"], defaultEffort: "high", fast: false },
  ],
  defaults: { model: "opus", effort: "xhigh", fast: false },
};

/**
 * Photograph FrameSeq Studio for the landing page, editing the gallery's product review: the whole
 * window, the window with the code folded away, the Insert gallery, a right-click menu, the slide
 * masters, the assistant, and presenter view. Like the recipe pictures, they are taken on every
 * build, so the page never shows an older Studio. The Chinese landing page has its own, of the
 * Studio in Chinese editing the review in Chinese.
 */
export async function captureStudio(imagesDirectory, language = "en") {
  const words = locales[language];
  const workspace = resolve(packageRoot, "tmp", `gallery-studio-${language}`);
  await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  await mkdir(workspace, { recursive: true });
  await mkdir(imagesDirectory, { recursive: true });
  await copyFile(resolve(packageRoot, "gallery", "slides", words.deck), resolve(workspace, "talk.slides.ts"));
  const picture = (name) => resolve(imagesDirectory, name);

  const studio = startStudio(workspace);
  const browser = await puppeteer.launch(puppeteerLaunchOptions());
  try {
    const address = await studio.address;

    /**
     * A fresh Studio window: light, in the page's language, the problems folded, its panes at fixed
     * sizes. The windows share their storage, so each starts with the code and the assistant as a
     * new Studio has them, whatever the window before it left.
     */
    async function openStudio({ intercept } = {}) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      await page.evaluateOnNewDocument((language) => {
        localStorage.setItem("frameseq-studio-theme", "light");
        // The page's language, whatever language the computer building it speaks.
        localStorage.setItem("frameseq-studio-language", language);
        localStorage.setItem("frameseq-studio-panel-collapsed", "1");
        localStorage.setItem("frameseq-studio-editor-collapsed", "0");
        localStorage.setItem("frameseq-studio-assistant-open", "0");
        localStorage.setItem("frameseq-studio-layout", JSON.stringify({
          "--studio-rail-width": 250,
          "--studio-inspector-height": 470,
          "--studio-preview-width": 760,
        }));
      }, language);
      if (intercept) await intercept(page);
      await page.goto(address, { waitUntil: "networkidle2" });
      await page.waitForFunction(
        (checked) => document.querySelector("[data-slot='check-state']")?.textContent?.includes(checked),
        { timeout: 120_000 },
        words.checked,
      );
      // The pictures sell the Studio, so a problem in the slides, such as a label that a wider
      // font than expected pushes out of its shape, stops the build rather than showing in them.
      await waitFor(
        () => page.$eval("[data-slot='problem-badge']", (badge) => badge.textContent?.trim() === "0"),
        `the ${language} review to have no problems; run frameseq check on gallery/slides/${words.deck}`,
        15_000,
      );
      return page;
    }

    const framesOf = (page) => ({
      rail: page.frames().find((frame) => frame.url().includes("thumbnails=1")),
      preview: page.frames().find((frame) => /frameseq-preview=studio(&|#|$)/.test(frame.url())),
    });

    async function showSlide(page, index) {
      await waitFor(async () => {
        const { rail, preview } = framesOf(page);
        const active = await preview.evaluate(
          () => Number(document.querySelector(".frameseq-slide-frame.is-active")?.dataset.index),
        );
        if (active === index) return true;
        (await rail.$$(".frameseq-thumbnail"))[index]?.click();
        await delay(400);
        return false;
      }, `slide ${index + 1} to show`);
      await waitFor(
        () => page.$eval("[data-slot='inspector-meta']", (element, n) => element.textContent?.startsWith(`${n} /`), index + 1),
        "the inspector to follow the slide",
      );
    }

    /**
     * Choose an object by its row in Current slide, which opens its settings below the row. A
     * second click on an open row folds them again, so a row already open is left alone.
     */
    async function chooseObject(page, title) {
      await waitFor(() => page.evaluate((title) => {
        const row = [...document.querySelectorAll(".studio-tree-row")]
          .find((candidate) => candidate.querySelector(".studio-tree-title")?.textContent?.trim().startsWith(title));
        if (!row) return false;
        if (row.nextElementSibling?.classList.contains("studio-object-card")) return true;
        row.click();
        return false;
      }, title), `the settings of ${title}`);
    }

    async function chooseMenu(page, menu, item) {
      await page.evaluate((menu) => [...document.querySelectorAll(".studio-menubar button")]
        .find((button) => button.textContent?.trim().startsWith(menu))?.click(), menu);
      await page.waitForSelector(".studio-menu-item");
      await page.evaluate((item) => [...document.querySelectorAll(".studio-menu-item")]
        .find((button) => button.querySelector(".studio-menu-label")?.textContent?.trim().startsWith(item))?.click(), item);
    }

    async function hideCode(page) {
      await page.click("[data-action='toggle-editor']");
      await waitFor(
        () => page.$eval("[data-action='toggle-editor']", (button) => button.getAttribute("aria-pressed") === "false"),
        "the code to fold away",
      );
    }

    /** Let the preview settle and the pointer leave, then take the picture. */
    async function settle(page) {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        for (const toast of document.querySelectorAll(".studio-toast")) toast.remove();
      });
      await page.mouse.move(1, 1);
      await delay(1200);
    }

    const rectOf = (page, selector) => page.$eval(selector, (element) => element.getBoundingClientRect().toJSON());
    /**
     * A close-up for the landing page's tour of the Studio, which shows its pictures in one frame
     * shaped like the window: the given width, ending at the given right and bottom edges, kept
     * inside the window.
     */
    const closeUp = ({ right, bottom, width }) => {
      const height = Math.round(width * viewport.height / viewport.width);
      return {
        x: Math.max(0, Math.min(right, viewport.width) - width),
        y: Math.max(0, Math.min(bottom, viewport.height) - height),
        width,
        height,
      };
    };
    const shot = (page, name, clip) => page.screenshot({
      path: picture(name),
      type: "webp",
      quality: 86,
      // Taking a picture past the window's edge resizes it, which closes an open menu.
      captureBeyondViewport: false,
      ...(clip ? { clip: { x: Math.round(clip.x), y: Math.round(clip.y), width: Math.round(clip.width), height: Math.round(clip.height) } } : {}),
    });

    // The whole window: a shape chosen on the diagram, its settings open, and its code in view.
    const page = await openStudio();
    await showSlide(page, 1);
    await chooseObject(page, words.shape);
    await settle(page);
    await shot(page, "studio.webp");
    // The card a link preview shows: 1200 x 630, cut from the top of the same window.
    await page.screenshot({
      path: picture("studio-card.jpg"),
      type: "jpeg",
      quality: 86,
      clip: { x: 0, y: 0, width: viewport.width, height: Math.round(viewport.width * 630 / 1200), scale: 1200 / (viewport.width * 2) },
    });

    // The same moment with the code folded away, as someone who never opens it works.
    await hideCode(page);
    await chooseObject(page, words.shape);
    await settle(page);
    await shot(page, "studio-design.webp");
    // A phone shows the slide being edited, which reads at that size where the window does not.
    const preview = await rectOf(page, ".studio-preview-pane");
    await shot(page, "studio-phone.webp", { x: preview.left, y: preview.top, width: preview.width, height: 720 });

    // The Insert gallery, open over the slide.
    await page.click("[data-action='insert']");
    await page.waitForSelector(".studio-insert-gallery");
    await settle(page);
    const gallery = await rectOf(page, ".studio-insert-gallery");
    await shot(page, "studio-insert.webp", closeUp({
      right: gallery.right + 24,
      bottom: Math.max(gallery.bottom + 160, 40 + (gallery.width + 400) * viewport.height / viewport.width),
      width: Math.round(gallery.width + 400),
    }));
    await page.keyboard.press("Escape");

    // A right-click on a shape in the preview.
    const { preview: slideFrame } = framesOf(page);
    const frame = await rectOf(page, ".studio-preview-body iframe");
    const target = await slideFrame.evaluate((name) => {
      const slide = document.querySelector(".frameseq-slide-frame.is-active");
      const label = [...slide.querySelectorAll("*")]
        .find((element) => element.children.length === 0 && element.textContent?.trim() === name);
      return label?.getBoundingClientRect().toJSON();
    }, words.rightClick);
    if (!target) throw new Error(`The diagram has no ${words.rightClick} to right-click`);
    await page.mouse.click(frame.left + target.left + target.width / 2, frame.top + target.top + target.height / 2, { button: "right" });
    await page.waitForSelector(".studio-menu");
    await delay(800);
    const menu = await rectOf(page, ".studio-menu");
    await shot(page, "studio-menu.webp", closeUp({ right: menu.right + 32, bottom: menu.bottom + 32, width: 960 }));
    await page.keyboard.press("Escape");

    // The format pane beside the slide it formats.
    await chooseObject(page, words.shape);
    await settle(page);
    await shot(page, "studio-format.webp", closeUp({ right: 1080, bottom: 940, width: 1080 }));
    await page.close();

    // The slide masters, with the cover master in the preview.
    const masters = await openStudio();
    await hideCode(masters);
    await chooseMenu(masters, words.viewMenu, words.mastersItem);
    await masters.waitForSelector("[data-slot='master-bar']:not([hidden])");
    await waitFor(async () => {
      const { rail, preview: masterPreview } = framesOf(masters);
      const shown = await masterPreview.evaluate(
        () => document.querySelector(".frameseq-slide-frame.is-active")?.textContent ?? "",
      );
      if (shown.includes("Atlas 2.0")) return true;
      (await rail.$$(".frameseq-thumbnail"))[1]?.click();
      await delay(400);
      return false;
    }, "the cover master to show");
    await settle(masters);
    await shot(masters, "studio-masters.webp");
    await masters.close();

    // The assistant beside the roadmap it has just redrawn.
    const assistant = await openStudio({
      intercept: async (assistantPage) => {
        await assistantPage.setRequestInterception(true);
        assistantPage.on("request", (request) => {
          const path = new URL(request.url()).pathname;
          const answer = path.endsWith("/assistant") ? assistantState(words)
            : path.endsWith("/assistant/options") ? assistantChoices
              : path.endsWith("/assistant/usage") ? { usage: null }
                : undefined;
          if (answer) {
            void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
          } else {
            void request.continue();
          }
        });
      },
    });
    await hideCode(assistant);
    await showSlide(assistant, 4);
    await assistant.click("[data-action='toggle-assistant']");
    await assistant.waitForSelector(".studio-assistant-done");
    await settle(assistant);
    await shot(assistant, "studio-assistant.webp");
    await assistant.close();

    // Presenter view, as the speaker's screen shows it: the diagram, its notes, and what comes next.
    const presenter = await browser.newPage();
    await presenter.setViewport({ width: 1680, height: 820, deviceScaleFactor: 2 });
    await presenter.goto(new URL(`/?presenter=1&lang=${language}#2`, address).href, { waitUntil: "networkidle2" });
    await presenter.waitForFunction(() => document.documentElement.dataset.ready === "true", { timeout: 60_000 });
    await presenter.evaluate(() => document.fonts.ready);
    await delay(1500);
    await presenter.mouse.move(1, 1);
    await shot(presenter, "studio-presenter.webp");
    await presenter.close();

    console.log(`Captured the Studio for the ${language} landing page`);
  } finally {
    await browser.close();
    studio.child.kill();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await captureStudio(resolve(process.argv[2] ?? resolve(packageRoot, "tmp", "gallery-studio-images")), process.argv[3]);
}
