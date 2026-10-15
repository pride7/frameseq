export type SlidesReading =
  | { slides: number[]; problem?: undefined }
  | { slides?: undefined; problem: "empty" }
  | { slides?: undefined; problem: "unreadable" | "zero"; part: string };

export function readSlides(text: string): SlidesReading;
export function slideBeyond(slides: number[], total: number): number | undefined;
export function slidesLabel(slides: number[]): string;
export function slidesFileSuffix(slides: number[] | undefined): string;
export function checkSlides(slides: number[], total: number): void;
