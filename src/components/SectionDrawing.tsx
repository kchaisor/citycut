import { Download, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { activeCut, lookingDirection, sectionNormalEN, sectionTitle, type SectionCutStore } from "../lib/sectionCut";
import { niceStep, type SectionProfile } from "../lib/sectionProfile";
import { useSectionSet } from "./SectionCutPanel";

const W = 1200;
const H = 300;
const PAD_L = 92;
const PAD_R = 40;
const PAD_T = 34;
const PAD_B = 46;
const FONT = "Geist Mono, ui-monospace, monospace";

export function sectionMirrored(angleDeg: number, flipped: boolean): boolean {
  const [ne, nn] = sectionNormalEN(angleDeg);
  const sign = flipped ? 1 : -1;
  const a = (angleDeg * Math.PI) / 180;
  const rightE = sign * nn;
  const rightN = -sign * ne;
  return Math.cos(a) * rightE + Math.sin(a) * rightN < 0;
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SectionDrawing({ store, profile, placeLabel }: { store: SectionCutStore; profile: SectionProfile | null; placeLabel: string }) {
  const set = useSectionSet(store);
  const cut = activeCut(set);
  const svgRef = useRef<SVGSVGElement>(null);
  const tick = useColourRevision();
  const ink = useMemo(
    () => ({
      sheet: getColour("--sheet-fill"),
      poche: getColour("--figure-fill"),
      hatchInk: getColour("--hatch-ink"),
      hatchPaper: getColour("--hatch-paper"),
      edge: getColour("--outline-building"),
      crown: getColour("--tree-crown"),
      crownEdge: getColour("--tree-crown-edge"),
      trunk: getColour("--tree-trunk"),
      hover: getColour("--site-building"),
      label: getColour("--contour-label"),
      cutLine: getColour("--cut-line"),
    }),
    [tick],
  );
  if (!set.enabled || !set.drawingOpen) return null;
  const title = sectionTitle(cut.label);
  const looking = lookingDirection(cut);
  const mirrored = sectionMirrored(cut.angleDeg, cut.flipped);
  const fileStem = `citycut-section-${cut.label}`;

  const body = (() => {
    if (!profile) return null;
    const zLo = Math.floor(profile.zMin - 4);
    const zHi = Math.ceil(Math.max(profile.zMax, profile.zMin + 10) + 4);
    const k = Math.min((W - PAD_L - PAD_R) / profile.lengthM, (H - PAD_T - PAD_B) / (zHi - zLo));
    const drawW = profile.lengthM * k;
    const left = PAD_L + (W - PAD_L - PAD_R - drawW) / 2;
    const bottom = H - PAD_B;
    const X = (s: number) => left + (mirrored ? profile.sEnd - s : s - profile.sStart) * k;
    const Y = (z: number) => bottom - (z - zLo) * k;
    const pocheFill = cut.fill === "hatch" ? "url(#section-hatch)" : ink.poche;
    const groundPts = profile.ground.map(([s, z]) => `${X(s).toFixed(1)},${Y(z).toFixed(1)}`);
    const groundPoly = `${X(profile.sStart).toFixed(1)},${bottom} ${groundPts.join(" ")} ${X(profile.sEnd).toFixed(1)},${bottom}`;
    const step = niceStep(zHi - zLo, 4);
    const levels: number[] = [];
    for (let z = Math.ceil(zLo / step) * step; z <= zHi; z += step) levels.push(z);
    const barM = niceStep(profile.lengthM / 5, 1);
    const ratio = Math.round(1 / (k * 0.00026458) / 50) * 50;
    const aX = X(profile.sStart);
    const bX = X(profile.sEnd);
    return (
      <>
        {levels.map((z) => (
          <g key={z}>
            <line x1={PAD_L - 6} x2={W - PAD_R} y1={Y(z)} y2={Y(z)} stroke={ink.label} strokeWidth={0.6} strokeDasharray="3 4" opacity={0.55} />
            <text x={PAD_L - 10} y={Y(z) + 3.5} textAnchor="end" fontSize={10} fontFamily={FONT} fill={ink.label}>
              {z.toFixed(0)}
            </text>
          </g>
        ))}
        {profile.beyond.map((b) => {
          const x1 = X(b.sFrom);
          const x2 = X(b.sTo);
          const fade = 1 - (b.depth / 60) * 0.65;
          const hot = set.hoverBuildingId === b.id;
          return (
            <rect
              key={`b${b.id}`}
              x={Math.min(x1, x2)}
              y={Y(b.top)}
              width={Math.max(0.6, Math.abs(x2 - x1))}
              height={Math.max(0.6, Y(b.base) - Y(b.top))}
              fill={hot ? ink.hover : ink.sheet}
              stroke={ink.edge}
              strokeWidth={0.5 + fade * 0.5}
              opacity={fade}
            />
          );
        })}
        {profile.trees.map((t) => {
          const x = X(t.s);
          const r = Math.max(1.2, (t.crown / 2) * k);
          const cy = Y(t.base + t.height) + r;
          return (
            <g key={`t${t.id}`} opacity={t.depth > 30 ? 0.55 : 0.9}>
              <line x1={x} x2={x} y1={Y(t.base)} y2={cy} stroke={ink.trunk} strokeWidth={1} />
              <circle cx={x} cy={cy} r={r} fill={ink.crown} fillOpacity={0.55} stroke={ink.crownEdge} strokeWidth={0.6} />
            </g>
          );
        })}
        <polygon points={groundPoly} fill={pocheFill} />
        <polyline points={groundPts.join(" ")} fill="none" stroke={ink.poche} strokeWidth={2} strokeLinejoin="round" />
        {profile.cut.map((b) =>
          b.spans.map(([s0, s1], i) => {
            const x1 = X(s0);
            const x2 = X(s1);
            const hot = set.hoverBuildingId === b.id;
            return (
              <rect
                key={`c${b.id}-${i}`}
                className={hot ? "section-drawing-cut is-hover" : "section-drawing-cut"}
                data-building-id={b.id}
                x={Math.min(x1, x2)}
                y={Y(b.top)}
                width={Math.max(1, Math.abs(x2 - x1))}
                height={Math.max(1, Y(b.base) - Y(b.top))}
                fill={hot ? ink.hover : pocheFill}
                stroke={ink.poche}
                strokeWidth={hot ? 2 : 1.4}
                onMouseEnter={() => store.update((s) => ({ ...s, hoverBuildingId: b.id }))}
                onMouseLeave={() => store.update((s) => ({ ...s, hoverBuildingId: null }))}
              />
            );
          }),
        )}
        <line x1={aX} x2={aX} y1={PAD_T - 8} y2={bottom} stroke={ink.cutLine} strokeWidth={1} strokeDasharray="6 3" />
        <line x1={bX} x2={bX} y1={PAD_T - 8} y2={bottom} stroke={ink.cutLine} strokeWidth={1} strokeDasharray="6 3" />
        <text x={aX} y={PAD_T - 14} textAnchor="middle" fontSize={14} fontWeight={700} fontFamily={FONT} fill={ink.poche}>
          {cut.label}
        </text>
        <text x={bX} y={PAD_T - 14} textAnchor="middle" fontSize={14} fontWeight={700} fontFamily={FONT} fill={ink.poche}>
          {cut.label}′
        </text>
        <text x={PAD_L - 10} y={PAD_T - 14} textAnchor="end" fontSize={9} fontFamily={FONT} fill={ink.label}>
          {profile.datumLabel.split(" · ")[0]}
        </text>
        <g transform={`translate(${left}, ${bottom + 20})`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={i * barM * k} y={0} width={barM * k} height={5} fill={i % 2 === 0 ? ink.poche : ink.sheet} stroke={ink.poche} strokeWidth={0.8} />
          ))}
          {[0, 5].map((i) => (
            <text key={i} x={i * barM * k} y={17} textAnchor="middle" fontSize={9} fontFamily={FONT} fill={ink.label}>
              {i * barM}
            </text>
          ))}
          <text x={5 * barM * k + 10} y={6} fontSize={9} fontFamily={FONT} fill={ink.label}>
            m · ≈1:{ratio.toLocaleString()} at 96 dpi · no vertical exaggeration
          </text>
        </g>
        <text x={W - PAD_R} y={H - 8} textAnchor="end" fontSize={9} fontFamily={FONT} fill={ink.label}>
          {profile.datumLabel} · beyond to 60 m · {placeLabel}
        </text>
      </>
    );
  })();

  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(W));
    clone.setAttribute("height", String(H));
    return new XMLSerializer().serializeToString(clone);
  };

  return (
    <div className="section-drawing hud-card" role="region" aria-label="Section drawing" data-cut={cut.label} data-buildings={profile?.cut.length ?? 0}>
      <div className="section-drawing-head">
        <span className="section-cut-tag mono">{title}</span>
        <strong>Section</strong>
        <span className="section-drawing-meta mono">
          looking {looking} · {profile ? `${Math.round(profile.lengthM)} m` : "off the site"}
        </span>
        <span className="section-drawing-spacer" />
        <button
          type="button"
          className="section-drawing-btn"
          aria-label="Download section SVG"
          onClick={() => {
            const text = exportSvg();
            if (text) download(`${fileStem}.svg`, new Blob([text], { type: "image/svg+xml" }));
          }}
        >
          <Download size={12} strokeWidth={2.2} aria-hidden="true" />
          SVG
        </button>
        <button
          type="button"
          className="section-drawing-btn"
          aria-label="Download section PNG"
          onClick={() => {
            const text = exportSvg();
            if (!text) return;
            const image = new Image();
            const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
            image.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = W * 2;
              canvas.height = H * 2;
              const context = canvas.getContext("2d");
              if (!context) return;
              context.scale(2, 2);
              context.drawImage(image, 0, 0, W, H);
              URL.revokeObjectURL(url);
              canvas.toBlob((blob) => blob && download(`${fileStem}.png`, blob), "image/png");
            };
            image.src = url;
          }}
        >
          <Download size={12} strokeWidth={2.2} aria-hidden="true" />
          PNG
        </button>
        <button type="button" className="section-drawing-close" aria-label="Close section drawing" onClick={() => store.update((s) => ({ ...s, drawingOpen: false }))}>
          <X size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <svg ref={svgRef} className="section-drawing-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Section ${title}`}>
        <defs>
          <pattern id="section-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={6} height={6} fill={ink.hatchPaper} />
            <line x1={0} y1={0} x2={0} y2={6} stroke={ink.hatchInk} strokeWidth={1.6} />
          </pattern>
        </defs>
        <rect width={W} height={H} fill={ink.sheet} />
        {body ?? (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fontFamily={FONT} fill={ink.label}>
            This cut runs outside the site. Move it back over the model.
          </text>
        )}
      </svg>
    </div>
  );
}
