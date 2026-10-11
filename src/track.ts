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

/** Lähettää tapahtuman vain kerran sivulatauksen aikana. */
export function trackOnce(name: string, data?: Record<string, string | number>) {
  if (sent.has(name)) return;
  sent.add(name);
  track(name, data);
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
