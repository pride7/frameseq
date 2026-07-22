/// <reference types="vite/client" />

declare const __FRAMESEQ_REMOTE_ENABLED__: boolean;

declare module "virtual:frameseq-entry" {
  import type { SlidesRootDefinition } from "./core";

  const slides: SlidesRootDefinition;
  export default slides;
}
