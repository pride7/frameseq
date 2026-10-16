export const presentationExtension: ".fsq";

export function isPresentationFile(path: string): boolean;

export function presentationStem(name: string): string;

export function presentationFileName(title: string): string;

export function starterDeck(title?: string, language?: "en" | "zh"): string;

export interface PresentationTemplate {
  /** The template's name on the command line, which is also the theme it uses. */
  id: string;
  names: { en: string; zh: string };
  summaries: { en: string; zh: string };
}

export const presentationTemplates: readonly PresentationTemplate[];

export function presentationTemplate(id: string): PresentationTemplate | undefined;

export function templateDeck(id: string, title?: string, language?: "en" | "zh"): string;
