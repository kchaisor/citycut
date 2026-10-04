export type SceneFallbackKind =
  | "webgl-unavailable"
  | "webgl2-unsupported"
  | "context-lost"
  | "scene-build"
  | "unknown";

export type SceneFallbackDetail = {
  kind: SceneFallbackKind;
  errorName: string;
  errorMessage: string;
};

function errorParts(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "Error", message: String(error) };
}

/** Map a render-time failure to a short user-facing reason. */
export function classifySceneFailure(error: unknown): SceneFallbackDetail {
  const { name, message } = errorParts(error);
  const text = `${name} ${message}`.toLowerCase();

  if (text.includes("context lost") || text.includes("contextlost")) {
    return { kind: "context-lost", errorName: name, errorMessage: message };
  }
  if (text.includes("webgl2") || text.includes("webgl 2")) {
    return { kind: "webgl2-unsupported", errorName: name, errorMessage: message };
  }
  if (
    text.includes("webgl context") ||
    text.includes("error creating webgl") ||
    text.includes("could not create a webgl") ||
    text.includes("could not get webgl") ||
    (text.includes("webgl") && (text.includes("could not") || text.includes("disabled")))
  ) {
    return { kind: "webgl-unavailable", errorName: name, errorMessage: message };
  }
  if (
    text.includes("buildcity") ||
    text.includes("mergegeometries") ||
    text.includes("extrudegeometry") ||
    text.includes("buffergeometry") ||
    text.includes("theme.css is missing") ||
    text.includes("drawing-style.css is missing") ||
    text.includes("colours.css is missing")
  ) {
    return { kind: "scene-build", errorName: name, errorMessage: message };
  }
  return { kind: "unknown", errorName: name, errorMessage: message };
}

export function sceneFallbackMessage(detail: SceneFallbackDetail): { lead: string; hint: string | null } {
  switch (detail.kind) {
    case "webgl-unavailable":
      return {
        lead: "WebGL is unavailable in this browser, so the 3D view could not start.",
        hint:
          "Turn on hardware acceleration in your browser settings, or if you use Brave, lower Shields for this site (fingerprinting protection can block WebGL).",
      };
    case "webgl2-unsupported":
      return {
        lead: "This browser does not support WebGL 2, which the 3D view needs.",
        hint: "Try a current Chrome, Edge, or Firefox, or update your graphics drivers.",
      };
    case "context-lost":
      return {
        lead: "The 3D view lost its graphics context (often from memory pressure or a driver reset).",
        hint: "Reload the page. Closing other GPU-heavy tabs can help.",
      };
    case "scene-build":
      return {
        lead: `The 3D scene failed to build (${detail.errorName}).`,
        hint: "The drawing and the PNG, Rhino, and Illustrator downloads still work.",
      };
    default:
      return {
        lead: "The 3D view could not start in this browser.",
        hint: "The drawing and the PNG, Rhino, and Illustrator downloads still work.",
      };
  }
}

/** Best-effort WebGL renderer string for console diagnostics. */
export function readWebGlRendererLabel(): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const gl = (canvas.getContext("webgl2") ??
    canvas.getContext("webgl") ??
    canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  if (!gl) return null;
  const debug = gl.getExtension("WEBGL_debug_renderer_info") as
    | { UNMASKED_RENDERER_WEBGL: number; UNMASKED_VENDOR_WEBGL: number }
    | null;
  if (!debug) return "WebGL (renderer string hidden)";
  const vendor = gl.getParameter(debug.UNMASKED_VENDOR_WEBGL);
  const renderer = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
  return `${vendor} — ${renderer}`;
}
