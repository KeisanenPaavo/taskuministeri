import { createContext, useContext } from "react";
import type { Source } from "../types";

// Lähdeviitteet: tekstiin pieni yläindeksinumero, joka vie sivun lopun numeroituun lähdeluetteloon.

export const SourcesContext = createContext<Source[]>([]);

export default function Cite({ ids }: { ids: string[] }) {
  const sources = useContext(SourcesContext);
  const refs = ids
    .map((id) => ({ id, n: sources.findIndex((s) => s.id === id) + 1 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => a.n - b.n);
  if (refs.length === 0) return null;
  return (
    <sup className="cite">
      {refs.map((r, i) => (
        <span key={r.id}>
          {i > 0 && ","}
          <a
            href={`#lahde-${r.id}`}
            title={sources[r.n - 1].name}
            aria-label={`Lähde ${r.n}: ${sources[r.n - 1].name}`}
          >
            {r.n}
          </a>
        </span>
      ))}
    </sup>
  );
}
