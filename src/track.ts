// Kävijäseuranta Umamilla (evästeetön). Skripti ladataan index.html:ssä vain taskuministeri.fi-osoitteessa,
// joten kehityksessä kutsut eivät tee mitään.

declare global {
  interface Window {
    umami?: { track: (name: string, data?: Record<string, string | number>) => void };
  }
}

const sent = new Set<string>();
// Jos Umami ei ole vielä latautunut, tapahtumat odottavat jonossa enintään noin 10 sekuntia.
const queue: [string, Record<string, string | number> | undefined][] = [];
let tries = 0;

function flush() {
  if (!window.umami) {
    if (++tries < 20) setTimeout(flush, 500);
    return;
  }
  try {
    for (const [name, data] of queue.splice(0)) window.umami.track(name, data);
  } catch {
    /* seuranta ei saa koskaan rikkoa sivua */
  }
}

export function track(name: string, data?: Record<string, string | number>) {
  if (typeof window === "undefined") return;
  queue.push([name, data]);
  if (queue.length === 1) flush();
}

/** Lähettää tapahtuman vain kerran sivulatauksen aikana (key erottaa saman tapahtuman eri kohteet). */
export function trackOnce(name: string, data?: Record<string, string | number>, key = name) {
  if (sent.has(key)) return;
  sent.add(key);
  track(name, data);
}

/** Lähdelinkit ja "lue lisää" -osiot seurataan koko sivulta yhdellä kuuntelijalla. */
export function trackReading() {
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.("a");
    if (!a) return;
    if (a.closest(".cite")) track("Lähdeviite", { lahde: a.title || a.textContent || "" });
    else if (a.host && a.host !== location.host) track("Lähdelinkki", { sivusto: a.host.replace(/^www\./, "") });
  };
  // toggle ei kupli, joten kuunnellaan capture-vaiheessa.
  const onToggle = (e: Event) => {
    const d = e.target as HTMLDetailsElement;
    if (d.tagName !== "DETAILS" || !d.open) return;
    const osio = d.querySelector("summary")?.textContent?.trim() ?? "";
    trackOnce("Lue lisää", { osio }, `Lue lisää:${osio}`);
  };
  document.addEventListener("click", onClick);
  document.addEventListener("toggle", onToggle, true);
  return () => {
    document.removeEventListener("click", onClick);
    document.removeEventListener("toggle", onToggle, true);
  };
}

/** Merkitsee, kuinka pitkälle juttua luetaan: tapahtuma, kun luku tulee näkyviin. */
export function trackChapters(chapters: Record<string, string>) {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        trackOnce(chapters[e.target.id]);
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -40% 0px" },
  );
  for (const id of Object.keys(chapters)) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
  return () => io.disconnect();
}
