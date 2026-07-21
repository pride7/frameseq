import "katex/dist/katex.min.css";
import "./index.css";
import deck from "virtual:frameseq-entry";
import { mountDeck } from "./renderer";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app element");

mountDeck(deck, app);
