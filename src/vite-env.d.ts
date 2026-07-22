/// <reference types="vite/client" />

declare const __FRAMESEQ_REMOTE_ENABLED__: boolean;

declare module "virtual:frameseq-entry" {
  import type { DeckDefinition } from "./core";

  const deck: DeckDefinition;
  export default deck;
}
