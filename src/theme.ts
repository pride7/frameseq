export type BuiltInThemeName =
  | "blank"
  | "midnight"
  | "paper"
  | "beamer-default"
  | "beamer-madrid"
  | "beamer-cambridge-us";

export type ThemeFamily = "frameseq" | "beamer";

export interface ThemeColors {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  accent: string;
  accentForeground: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  codeBackground: string;
  codeForeground: string;
  error: string;
  stage: string;
  shadow: string;
}

export interface ThemeFonts {
  body: string;
  heading: string;
  mono: string;
}

export interface ThemeSpacing {
  slideX: string;
  slideY: string;
  coverX: string;
  coverY: string;
  contentGap: string;
  regionGap: string;
  splitGap: string;
  gridGap: string;
  cardPadding: string;
}

export interface ThemeRadii {
  small: string;
  medium: string;
  large: string;
  pill: string;
}

export interface ThemeChrome {
  titleBar: boolean;
  footer: boolean;
  slideNumber: boolean;
  showOnCover: boolean;
  titleBarHeight: string;
  footerHeight: string;
  titleBarBackground: string;
  titleBarForeground: string;
  footerBackground: string;
  footerForeground: string;
  footerAccentBackground: string;
  footerAccentForeground: string;
}

export interface ThemeDefinition {
  name: string;
  family: ThemeFamily;
  colors: ThemeColors;
  fonts: ThemeFonts;
  spacing: ThemeSpacing;
  radii: ThemeRadii;
  chrome: ThemeChrome;
  coverBackground: string;
}

export interface ThemeOptions {
  name: string;
  extends?: BuiltInThemeName | ThemeDefinition;
  family?: ThemeFamily;
  colors?: Partial<ThemeColors>;
  fonts?: Partial<ThemeFonts>;
  spacing?: Partial<ThemeSpacing>;
  radii?: Partial<ThemeRadii>;
  chrome?: Partial<ThemeChrome>;
  coverBackground?: string;
}

export type ThemeInput = BuiltInThemeName | ThemeDefinition;

const defaultFonts: ThemeFonts = {
  body: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  heading: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
};

const defaultSpacing: ThemeSpacing = {
  slideX: "84px",
  slideY: "68px",
  coverX: "96px",
  coverY: "84px",
  contentGap: "24px",
  regionGap: "18px",
  splitGap: "38px",
  gridGap: "20px",
  cardPadding: "24px",
};

const defaultRadii: ThemeRadii = {
  small: "12px",
  medium: "18px",
  large: "24px",
  pill: "999px",
};

const defaultChrome: ThemeChrome = {
  titleBar: false,
  footer: false,
  slideNumber: false,
  showOnCover: false,
  titleBarHeight: "54px",
  footerHeight: "30px",
  titleBarBackground: "#f1f5f9",
  titleBarForeground: "#111827",
  footerBackground: "#f1f5f9",
  footerForeground: "#4b5563",
  footerAccentBackground: "#2563eb",
  footerAccentForeground: "#ffffff",
};

const blank: ThemeDefinition = {
  name: "blank",
  family: "frameseq",
  colors: {
    background: "#ffffff",
    foreground: "#111827",
    muted: "#4b5563",
    subtle: "#6b7280",
    accent: "#2563eb",
    accentForeground: "#ffffff",
    surface: "#f8fafc",
    surfaceStrong: "#f1f5f9",
    border: "#e2e8f0",
    codeBackground: "#f8fafc",
    codeForeground: "#0f172a",
    error: "#dc2626",
    stage: "#e5e7eb",
    shadow: "0 24px 80px rgb(15 23 42 / 0.18)",
  },
  fonts: defaultFonts,
  spacing: defaultSpacing,
  radii: defaultRadii,
  chrome: defaultChrome,
  coverBackground: "#ffffff",
};

const midnight: ThemeDefinition = {
  name: "midnight",
  family: "frameseq",
  colors: {
    background: "#020617",
    foreground: "#f8fafc",
    muted: "#94a3b8",
    subtle: "#64748b",
    accent: "#22d3ee",
    accentForeground: "#020617",
    surface: "rgb(15 23 42 / 0.72)",
    surfaceStrong: "rgb(15 23 42 / 0.78)",
    border: "rgb(148 163 184 / 0.15)",
    codeBackground: "#090e1a",
    codeForeground: "#dbeafe",
    error: "#f87171",
    stage: "#09090b",
    shadow: "0 24px 80px rgb(0 0 0 / 0.35)",
  },
  fonts: defaultFonts,
  spacing: defaultSpacing,
  radii: defaultRadii,
  chrome: defaultChrome,
  coverBackground:
    "radial-gradient(circle at 78% 22%, rgb(34 211 238 / 0.16), transparent 24%), radial-gradient(circle at 22% 78%, rgb(99 102 241 / 0.16), transparent 28%), #020617",
};

const paper: ThemeDefinition = {
  name: "paper",
  family: "frameseq",
  colors: {
    background: "#f7f3e8",
    foreground: "#292524",
    muted: "#57534e",
    subtle: "#78716c",
    accent: "#b45309",
    accentForeground: "#fff7ed",
    surface: "#fffdf7",
    surfaceStrong: "#eee7d8",
    border: "#d6ccba",
    codeBackground: "#292524",
    codeForeground: "#fef3c7",
    error: "#b91c1c",
    stage: "#d6d3d1",
    shadow: "0 24px 80px rgb(68 64 60 / 0.2)",
  },
  fonts: {
    ...defaultFonts,
    body: 'Georgia, Cambria, "Times New Roman", serif',
    heading: 'Georgia, Cambria, "Times New Roman", serif',
  },
  spacing: defaultSpacing,
  radii: {
    ...defaultRadii,
    small: "4px",
    medium: "6px",
    large: "8px",
  },
  chrome: defaultChrome,
  coverBackground:
    "linear-gradient(135deg, rgb(180 83 9 / 0.08), transparent 45%), #f7f3e8",
};

const beamerFonts: ThemeFonts = {
  body: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  heading: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  mono: defaultFonts.mono,
};

const beamerSpacing: ThemeSpacing = {
  slideX: "62px",
  slideY: "62px",
  coverX: "80px",
  coverY: "70px",
  contentGap: "18px",
  regionGap: "14px",
  splitGap: "30px",
  gridGap: "16px",
  cardPadding: "20px",
};

const beamerRadii: ThemeRadii = {
  small: "0px",
  medium: "0px",
  large: "0px",
  pill: "999px",
};

const beamerDefault: ThemeDefinition = {
  name: "beamer-default",
  family: "beamer",
  colors: {
    background: "#ffffff",
    foreground: "#202020",
    muted: "#4a4a4a",
    subtle: "#666666",
    accent: "#3333b3",
    accentForeground: "#ffffff",
    surface: "#f4f4fb",
    surfaceStrong: "#e8e8f5",
    border: "#b8b8d8",
    codeBackground: "#f5f5f5",
    codeForeground: "#202020",
    error: "#b91c1c",
    stage: "#d8d8d8",
    shadow: "0 24px 80px rgb(15 23 42 / 0.18)",
  },
  fonts: beamerFonts,
  spacing: beamerSpacing,
  radii: beamerRadii,
  chrome: defaultChrome,
  coverBackground: "#ffffff",
};

const beamerMadrid: ThemeDefinition = {
  ...beamerDefault,
  name: "beamer-madrid",
  colors: {
    ...beamerDefault.colors,
    foreground: "#172033",
    muted: "#46516b",
    accent: "#273c75",
    surface: "#f2f4f9",
    surfaceStrong: "#e3e8f2",
    border: "#aeb9d1",
  },
  chrome: {
    ...defaultChrome,
    titleBar: true,
    footer: true,
    slideNumber: true,
    titleBarBackground: "#dfe5f2",
    titleBarForeground: "#17264d",
    footerBackground: "#dfe5f2",
    footerForeground: "#17264d",
    footerAccentBackground: "#273c75",
    footerAccentForeground: "#ffffff",
  },
  coverBackground: "linear-gradient(180deg, #ffffff 0 82%, #dfe5f2 82% 100%)",
};

const beamerCambridgeUs: ThemeDefinition = {
  ...beamerDefault,
  name: "beamer-cambridge-us",
  colors: {
    ...beamerDefault.colors,
    background: "#fffdf7",
    foreground: "#2d1b20",
    muted: "#654b52",
    subtle: "#7a6268",
    accent: "#8b1e3f",
    surface: "#f8f0e8",
    surfaceStrong: "#ede0d1",
    border: "#d8b8b8",
    codeBackground: "#f6efe7",
    stage: "#d8d0c5",
  },
  chrome: {
    ...defaultChrome,
    titleBar: true,
    footer: true,
    slideNumber: true,
    titleBarBackground: "#8b1e3f",
    titleBarForeground: "#ffffff",
    footerBackground: "#e7d7bd",
    footerForeground: "#4a2732",
    footerAccentBackground: "#8b1e3f",
    footerAccentForeground: "#ffffff",
  },
  coverBackground: "linear-gradient(180deg, #fffdf7 0 82%, #8b1e3f 82% 100%)",
};

export const themes: Record<BuiltInThemeName, ThemeDefinition> = {
  blank,
  midnight,
  paper,
  "beamer-default": beamerDefault,
  "beamer-madrid": beamerMadrid,
  "beamer-cambridge-us": beamerCambridgeUs,
};

function cloneTheme(theme: ThemeDefinition): ThemeDefinition {
  return {
    name: theme.name,
    family: theme.family,
    colors: { ...theme.colors },
    fonts: { ...theme.fonts },
    spacing: { ...theme.spacing },
    radii: { ...theme.radii },
    chrome: { ...theme.chrome },
    coverBackground: theme.coverBackground,
  };
}

export function resolveTheme(theme: ThemeInput = "blank"): ThemeDefinition {
  if (typeof theme !== "string") {
    return cloneTheme(theme);
  }

  const definition = themes[theme];
  if (!definition) {
    throw new Error(`Unknown FrameSeq theme: ${theme}`);
  }

  return cloneTheme(definition);
}

export function defineTheme(options: ThemeOptions): ThemeDefinition {
  const base = resolveTheme(options.extends ?? "blank");

  return {
    name: options.name,
    family: options.family ?? base.family,
    colors: { ...base.colors, ...options.colors },
    fonts: { ...base.fonts, ...options.fonts },
    spacing: { ...base.spacing, ...options.spacing },
    radii: { ...base.radii, ...options.radii },
    chrome: { ...base.chrome, ...options.chrome },
    coverBackground: options.coverBackground ?? base.coverBackground,
  };
}

export function themeCssVariables(theme: ThemeDefinition): Record<string, string> {
  return {
    "--frameseq-background": theme.colors.background,
    "--frameseq-foreground": theme.colors.foreground,
    "--frameseq-muted": theme.colors.muted,
    "--frameseq-subtle": theme.colors.subtle,
    "--frameseq-accent": theme.colors.accent,
    "--frameseq-accent-foreground": theme.colors.accentForeground,
    "--frameseq-surface": theme.colors.surface,
    "--frameseq-surface-strong": theme.colors.surfaceStrong,
    "--frameseq-border": theme.colors.border,
    "--frameseq-code-background": theme.colors.codeBackground,
    "--frameseq-code-foreground": theme.colors.codeForeground,
    "--frameseq-error": theme.colors.error,
    "--frameseq-stage": theme.colors.stage,
    "--frameseq-shadow": theme.colors.shadow,
    "--frameseq-cover-background": theme.coverBackground,
    "--frameseq-font-body": theme.fonts.body,
    "--frameseq-font-heading": theme.fonts.heading,
    "--frameseq-font-mono": theme.fonts.mono,
    "--frameseq-slide-x": theme.spacing.slideX,
    "--frameseq-slide-y": theme.spacing.slideY,
    "--frameseq-cover-x": theme.spacing.coverX,
    "--frameseq-cover-y": theme.spacing.coverY,
    "--frameseq-content-gap": theme.spacing.contentGap,
    "--frameseq-region-gap": theme.spacing.regionGap,
    "--frameseq-split-gap": theme.spacing.splitGap,
    "--frameseq-grid-gap": theme.spacing.gridGap,
    "--frameseq-card-padding": theme.spacing.cardPadding,
    "--frameseq-radius-small": theme.radii.small,
    "--frameseq-radius-medium": theme.radii.medium,
    "--frameseq-radius-large": theme.radii.large,
    "--frameseq-radius-pill": theme.radii.pill,
    "--frameseq-title-bar-height": theme.chrome.titleBarHeight,
    "--frameseq-footer-height": theme.chrome.footerHeight,
    "--frameseq-title-bar-background": theme.chrome.titleBarBackground,
    "--frameseq-title-bar-foreground": theme.chrome.titleBarForeground,
    "--frameseq-footer-background": theme.chrome.footerBackground,
    "--frameseq-footer-foreground": theme.chrome.footerForeground,
    "--frameseq-footer-accent-background": theme.chrome.footerAccentBackground,
    "--frameseq-footer-accent-foreground": theme.chrome.footerAccentForeground,
  };
}
