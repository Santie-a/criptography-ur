import { Fragment, useEffect, useRef } from "react";
import { shortHex } from "./ui";

export interface StripBlock {
  index: number;
  hash: string;
  prev_hash: string;
  tx_count?: number;
  nonce?: number;
  difficulty?: number;
  ok?: boolean;
}

/** Bloques enlazados por hash. Si el prev_hash no coincide, el enlace se dibuja roto. */
export function ChainStrip({ blocks, selected, onSelect }: {
  blocks: StripBlock[];
  selected?: number | null;
  onSelect?: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Desplaza la tira para que el bloque seleccionado quede a la vista.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(".block-card.selected");
    const strip = ref.current;
    if (el && strip) strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [selected, blocks.length]);
  return (
    <div className="chain-strip" ref={ref}>
      {blocks.map((b, i) => {
        const linkOk = i === 0 || blocks[i - 1].hash === b.prev_hash;
        const status = b.ok === undefined ? "" : b.ok ? "ok" : "bad";
        return (
          <Fragment key={b.index}>
            {i > 0 && <div className={`chain-link ${linkOk ? "" : "bad"}`} title={linkOk ? "prev_hash coincide" : "enlace roto"} />}
            <button
              type="button"
              className={`block-card ${selected === b.index ? "selected" : ""} ${status}`}
              onClick={() => onSelect?.(b.index)}
            >
              <div className="bnum">
                <span>{b.index === 0 ? "Génesis" : `Bloque ${b.index}`}</span>
                {b.tx_count !== undefined && <span className="xs faint num">{b.tx_count} tx</span>}
              </div>
              <div className="bline"><span>hash</span><code className="mono">{shortHex(b.hash, 5)}</code></div>
              <div className="bline"><span>prev</span><code className="mono">{shortHex(b.prev_hash, 5)}</code></div>
              {b.nonce !== undefined && (
                <div className="bline"><span>nonce · bits</span><span className="num">{b.nonce} · {b.difficulty}</span></div>
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Árbol de Merkle en SVG. `highlight` marca el camino de una prueba de inclusión. */
export function MerkleTree({ levels, leafLabels, highlightLeaf }: {
  levels: string[][];
  leafLabels: string[];
  highlightLeaf?: number | null;
}) {
  const leaves = levels[0].length;
  const W = Math.max(leaves * 100, 300);
  const levelH = 64;
  const H = levels.length * levelH + 8;
  const nodeW = 80;

  // Posiciones: cada nivel reparte sus nodos entre los hijos.
  const xs: number[][] = [levels[0].map((_, i) => (W / leaves) * (i + 0.5))];
  for (let l = 1; l < levels.length; l++) {
    const prev = xs[l - 1];
    xs.push(levels[l].map((_, i) => {
      const a = prev[2 * i];
      const b = prev[2 * i + 1] ?? prev[2 * i];
      return (a + b) / 2;
    }));
  }
  const y = (l: number) => H - 28 - l * levelH;

  // Camino de la prueba y nodos hermanos.
  const path = new Set<string>();
  const siblings = new Set<string>();
  if (highlightLeaf != null) {
    let idx = highlightLeaf;
    for (let l = 0; l < levels.length; l++) {
      path.add(`${l}:${idx}`);
      if (l < levels.length - 1) {
        const sib = idx ^ 1;
        siblings.add(`${l}:${sib < levels[l].length ? sib : idx}`);
      }
      idx = Math.floor(idx / 2);
    }
  }

  return (
    <svg className="plot" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W * 1.25 }} role="img" aria-label="Árbol de Merkle">
      {levels.slice(1).map((lvl, l) =>
        lvl.map((_, i) => {
          const kids = [2 * i, 2 * i + 1].filter((k) => k < levels[l].length);
          if (kids.length === 1) kids.push(kids[0]);
          return kids.map((k, j) => (
            <line key={`${l}-${i}-${j}`} x1={xs[l + 1][i]} y1={y(l + 1) + 12} x2={xs[l][k]} y2={y(l) - 12}
              stroke={path.has(`${l}:${k}`) && path.has(`${l + 1}:${i}`) ? "var(--accent)" : "var(--border)"}
              strokeWidth={path.has(`${l}:${k}`) && path.has(`${l + 1}:${i}`) ? 2 : 1}
              strokeDasharray={j === 1 && kids[0] === kids[1] ? "3 3" : undefined} />
          ));
        }),
      )}
      {levels.map((lvl, l) =>
        lvl.map((h, i) => {
          const key = `${l}:${i}`;
          const onPath = path.has(key);
          const isSib = siblings.has(key) && !onPath;
          const fill = onPath ? "var(--accent-soft)" : isSib ? "var(--warn-soft)" : "var(--surface)";
          const stroke = onPath ? "var(--accent)" : isSib ? "var(--warn)" : "var(--border)";
          const isRoot = l === levels.length - 1;
          return (
            <g key={key}>
              <rect x={xs[l][i] - nodeW / 2} y={y(l) - 12} width={nodeW} height={24} rx={6}
                fill={fill} stroke={stroke} />
              <text x={xs[l][i]} y={y(l) + 4} textAnchor="middle" className="label"
                style={{ fill: "var(--text)", fontSize: 10 }}>
                {isRoot ? "raíz " : ""}{h.slice(0, isRoot ? 6 : 8)}
              </text>
              {l === 0 && (
                <text x={xs[l][i]} y={y(l) + 26} textAnchor="middle" className="label">{leafLabels[i]}</text>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}
