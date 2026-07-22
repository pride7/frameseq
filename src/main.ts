import "katex/dist/katex.min.css";
import "./index.css";
import slides from "virtual:frameseq-entry";
import { mountSlides } from "./renderer";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app element");

mountSlides(slides, app);
