import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import type { FinanceData } from "./types";
import "./styles.css";

// Sivu on esirenderöity valmiiksi HTML:ksi (scripts/prerender.mjs). Haetaan data ennen React-renderöintiä,
// jotta esirenderöity sisältö pysyy näkyvissä eikä välissä näy latausviestiä.
const root = createRoot(document.getElementById("root")!);
const render = (data?: FinanceData) =>
  root.render(
    <StrictMode>
      <App initialData={data} />
    </StrictMode>,
  );

fetch(`${import.meta.env.BASE_URL}data/finance.json`)
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then((d: FinanceData) => render(d))
  .catch(() => render());
