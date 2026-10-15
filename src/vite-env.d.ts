/// <reference types="vite/client" />

declare const __FRAMESEQ_REMOTE_ENABLED__: boolean;

declare module "virtual:frameseq-entry" {
  import type { SlidesRootDefinition } from "./core";

  const slides: SlidesRootDefinition;
  export default slides;
}

declare module "virtual:frameseq-templates" {
  import type { SlidesRootDefinition } from "./core";

  /** Each template's slides, keyed by its id and language, such as "poster:zh". */
  export const templates: Record<string, () => SlidesRootDefinition>;
}
