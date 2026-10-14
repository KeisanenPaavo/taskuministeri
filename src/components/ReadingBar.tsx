import { useEffect, useState } from "react";

// Lukusijainti pitkällä sivulla: ohut palkki yläreunassa, kun lehden otsikko on vieritetty pois näkyvistä.
// Palkki näyttää nykyisen luvun ja edistymisen; samaa tietoa käytetään yläpalkin valikon korostukseen.

export const CHAPTERS = [
  { id: "arvaa", name: "Arvaa" },
  { id: "paljon", name: "Paljon vai vähän" },
  { id: "velka", name: "Velka" },
  { id: "naapurit", name: "Naapurit" },
  { id: "kokeile", name: "Kokeile ja pelaa" },
  { id: "vastaus", name: "Lopuksi" },
];

export function useReadingPosition() {
  const [pos, setPos] = useState({ chapter: -1, progress: 0, past: false });
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = innerHeight * 0.3;
      let chapter = -1;
      CHAPTERS.forEach((c, i) => {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top <= line) chapter = i;
      });
      const max = document.documentElement.scrollHeight - innerHeight;
      const header = document.querySelector(".masthead-wrap");
      setPos({
        chapter,
        progress: max > 0 ? Math.min(1, scrollY / max) : 0,
        past: header ? header.getBoundingClientRect().bottom < 0 : false,
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return pos;
}

export default function ReadingBar({ chapter, progress, past }: ReturnType<typeof useReadingPosition>) {
  const current = CHAPTERS[chapter];
  return (
    <div className={`reading-bar ${past ? "show" : ""}`} aria-hidden={!past}>
      <div className="wrap reading-bar-inner">
        <a href="#" className="reading-bar-name" tabIndex={past ? 0 : -1}>
          Taskuministeri
        </a>
        {current && (
          <span className="reading-bar-chapter">
            {chapter < 5 ? `Luku ${chapter + 1} · ` : ""}
            {current.name}
          </span>
        )}
      </div>
      <div className="reading-bar-progress" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
