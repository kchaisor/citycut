export function signalTraceViewportLighting(): {
  fillAmbient: number;
  fillHemi: number;
  fillKeyLight: number;
  sunIntensity: number;
  noToneMapping: boolean;
} {
  return {
    fillAmbient: 0.06,
    fillHemi: 0.1,
    fillKeyLight: 0.28,
    sunIntensity: 0,
    noToneMapping: true,
  };
}
