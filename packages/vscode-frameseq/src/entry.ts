import { dirname } from "node:path";

/** Matches `slides.ts` and `<name>.slides.ts` in any directory, not just a workspace root. */
export const slidesFilePattern = /(?:^|[\\/])(?:slides|[^\\/]+\.slides)\.ts$/i;

export const entryExcludeGlob = "**/{node_modules,dist,out,tmp,output,.git}/**";

const caseInsensitivePaths = process.platform === "win32";

export function isSlidesPath(path: string): boolean {
  return slidesFilePattern.test(path);
}

export function samePath(left: string, right: string): boolean {
  return caseInsensitivePaths ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export function pathSegments(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean);
}

/** The directory itself and every parent, stopping at `stopAt` (inclusive) when given. */
export function ancestorDirectories(path: string, stopAt?: string): string[] {
  const directories: string[] = [];
  let current = path;
  while (true) {
    directories.push(current);
    if (stopAt && samePath(current, stopAt)) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return directories;
}

/** Searches every directory, so a deck nested below the workspace root is still found. */
export function entrySearchGlob(configured: Iterable<string> = []): string {
  const names = new Set(["slides.ts", "*.slides.ts"]);
  for (const entry of configured) {
    const name = pathSegments(entry).pop();
    if (name && name.toLowerCase().endsWith(".ts")) names.add(name);
  }
  return `**/{${[...names].join(",")}}`;
}

function sharedSegments(path: string, reference: string): number {
  const candidate = pathSegments(path);
  const target = pathSegments(reference);
  let shared = 0;
  while (
    shared < target.length
    && shared < candidate.length - 1
    && samePath(target[shared], candidate[shared])
  ) shared += 1;
  return shared;
}

/**
 * Orders discovered entries by how close they sit to what the user is editing, then by
 * how shallow they are, so a single-deck workspace keeps its root `slides.ts`.
 */
export function rankEntryCandidates(paths: string[], reference?: string): string[] {
  return [...paths].sort((left, right) => (
    (reference ? sharedSegments(right, reference) - sharedSegments(left, reference) : 0)
    || pathSegments(left).length - pathSegments(right).length
    || left.localeCompare(right)
  ));
}
