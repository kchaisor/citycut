export type ExportTileId = "3dm" | "ai" | "svg" | "sun-zip" | "png";
export type ExportBusy =
  | "3dm"
  | "png"
  | "ai-site"
  | "ai-figure"
  | "ai-exploded"
  | "ai-isometric"
  | "ai-sun"
  | "svg-site"
  | "svg-figure"
  | "svg-isometric"
  | null;
export type DrawingKindForExport = "site" | "figure-ground" | "exploded-axo" | "isometric";

export type ExportTile = {
  id: ExportTileId;
  app: string;
  ext: string;
  description: string;
  enabled: boolean;
  disabledReason: string | null;
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
  sunStudy?: boolean;
};

export const ILLUSTRATOR_DISABLED_TOOLTIP =
  "Illustrator exports the vector drawings. Open the Drawing tab: site plan, figure-ground or exploded axo.";
export const SVG_DISABLED_TOOLTIP =
  "SVG exports the site plan or figure-ground. Open the Drawing tab and pick one of those drawings.";
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
  isometric: {
    aria: "Download isometric Illustrator",
    busy: "ai-isometric",
    text: (scale) => `Isometric 3D vector drawing as layered vectors at 1:${scale}: extruded buildings, trees, terrain and streets.`,
  },
};

export function exportTiles(input: ExportTileInput): ExportTile[] {
  const anyBusy = input.busy !== null;
  const vector = input.tab === "drawing";
  const ai = AI_BY_DRAWING[input.drawing];
  const hourly = input.sunStudy && input.drawing === "site";
  const svgOn = vector && input.drawing !== "exploded-axo";
  const svgBusy: ExportBusy =
    input.drawing === "figure-ground"
      ? "svg-figure"
      : input.drawing === "isometric"
        ? "svg-isometric"
        : "svg-site";
  const svgAria =
    input.drawing === "figure-ground"
      ? "Download figure-ground SVG"
      : input.drawing === "isometric"
        ? "Download isometric SVG"
        : input.drawing === "site"
          ? "Download site plan SVG"
          : "Download SVG";
  const svgLabel =
    input.drawing === "site"
      ? "site plan"
      : input.drawing === "isometric"
        ? "isometric 3D drawing"
        : "figure-ground";
  const hourlyNote = " With the sun study on, shadows come as one layer per hour 9am–3pm, each at 20% opacity.";
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
      description: vector ? ai.text(input.figureScale) + (hourly ? hourlyNote : "") : ILLUSTRATOR_DISABLED_TOOLTIP,
      enabled: vector && !anyBusy,
      disabledReason: vector ? null : ILLUSTRATOR_DISABLED_TOOLTIP,
      ariaLabel: vector ? ai.aria : "Download Illustrator",
      busy: input.busy === ai.busy,
    },
    {
      id: "svg",
      app: "SVG",
      ext: ".svg",
      description: svgOn
        ? `The ${svgLabel} as a layered SVG in millimetres at 1:${input.figureScale}, the same layers as the .ai.` + (hourly ? hourlyNote : "")
        : SVG_DISABLED_TOOLTIP,
      enabled: svgOn && !anyBusy,
      disabledReason: svgOn ? null : SVG_DISABLED_TOOLTIP,
      ariaLabel: svgAria,
      busy: input.busy === svgBusy,
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
