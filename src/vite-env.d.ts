/// <reference types="vite/client" />

declare module "virtual:frameseq-entry" {
  import type { DeckDefinition } from "./core";

  const deck: DeckDefinition;
  export default deck;
}
