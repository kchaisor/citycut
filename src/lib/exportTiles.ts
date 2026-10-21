/**
 * Export tab tiles: one tile per format CityCut can write today. Pure, so the enable rules
 * and wording are tested without the page.
 */
export type ExportTileId = "3dm" | "ai" | "sun-zip" | "png";
export type ExportBusy = "3dm" | "png" | "ai-site" | "ai-figure" | "ai-exploded" | "ai-sun" | null;
export type DrawingKindForExport = "site" | "figure-ground" | "exploded-axo";

export type ExportTile = {
  id: ExportTileId;
  /** App name, e.g. "Rhino 5+". */
  app: string;
  /** File extension with the dot. */
  ext: string;
  /** Shown on hover / focus. */
  description: string;
  enabled: boolean;
  /** Why it is disabled; shown instead of the description. */
  disabledReason: string | null;
  /** Kept identical to the old Export cards so QA scripts and screen readers still find them. */
  ariaLabel: string;
  busy: boolean;
};

export type ExportTileInput = {
  tab: "3d" | "drawing" | "satellite";
  drawing: DrawingKindForExport;
  busy: ExportBusy;
  figureScale: number;
  sunStudyDate: string;
  buildingsAsMesh: boolean;
  crsName: string;
};

export const ILLUSTRATOR_DISABLED_TOOLTIP =
  "Illustrator exports the vector drawings. Open the Drawing tab: site plan, figure-ground or exploded axo.";
export const PNG_DISABLED_TOOLTIP = "PNG captures the 3D view. Open the 3D model tab.";

const AI_BY_DRAWING: Record<DrawingKindForExport, { aria: string; busy: ExportBusy; text: (scale: number) => string }> = {
  site: {
    aria: "Download site plan Illustrator",
    busy: "ai-site",
    text: (scale) => `Site plan as layered vectors at 1:${scale}: buildings, roads and kerbs, contours and the frame, in the sheet line styles.`,
  },
  "figure-ground": {
    aria: "Download figure-ground Illustrator",
    busy: "ai-figure",
    text: () => "Figure-ground as vectors: black footprints on white with the footpath strips, true scale.",
  },
  "exploded-axo": {
    aria: "Download exploded axo Illustrator",
    busy: "ai-exploded",
    text: (scale) => `Exploded axo as stacked isometric layers at 1:${scale}, with guides and labels.`,
  },
};

export function exportTiles(input: ExportTileInput): ExportTile[] {
  const anyBusy = input.busy !== null;
  const vector = input.tab === "drawing";
  const ai = AI_BY_DRAWING[input.drawing];
  return [
    {
      id: "3dm",
      app: "Rhino 5+",
      ext: ".3dm",
      description: `${input.buildingsAsMesh ? "Buildings as meshes" : "Buildings as closed extrusions, one per part"}; terrain, roads and trees as meshes. ${input.crsName}, metres, Z-up, plus a FigureGround layer.`,
      enabled: !anyBusy,
      disabledReason: null,
      ariaLabel: "Download Rhino",
      busy: input.busy === "3dm",
    },
    {
      id: "ai",
      app: "Illustrator",
      ext: ".ai",
      description: vector ? ai.text(input.figureScale) : ILLUSTRATOR_DISABLED_TOOLTIP,
      enabled: vector && !anyBusy,
      disabledReason: vector ? null : ILLUSTRATOR_DISABLED_TOOLTIP,
      ariaLabel: vector ? ai.aria : "Download Illustrator",
      busy: input.busy === ai.busy,
    },
    {
      id: "sun-zip",
      app: "Sun study",
      ext: ".zip",
      description: `Site plan .ai with shadows at 1:${input.figureScale} for each hour 9am–3pm on ${input.sunStudyDate}, seven files in one zip.`,
      enabled: !anyBusy,
      disabledReason: null,
      ariaLabel: "Download sun study Illustrator zip",
      busy: input.busy === "ai-sun",
    },
    {
      id: "png",
      app: "Image",
      ext: ".png",
      description:
        input.tab === "3d" ? "The current 3D view, in perspective or isometric, at twice the canvas resolution." : PNG_DISABLED_TOOLTIP,
      enabled: input.tab === "3d" && !anyBusy,
      disabledReason: input.tab === "3d" ? null : PNG_DISABLED_TOOLTIP,
      ariaLabel: "Download PNG",
      busy: input.busy === "png",
    },
  ];
}
