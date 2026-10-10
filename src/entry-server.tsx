import { renderToString } from "react-dom/server";
import App from "./App";
import type { FinanceData } from "./types";

/** Esirenderöinti: koko sivu HTML:ksi annetulla datalla (scripts/prerender.mjs). */
export function render(data: FinanceData) {
  return renderToString(<App initialData={data} />);
}
