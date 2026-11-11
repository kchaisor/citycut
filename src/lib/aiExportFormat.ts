export function useNativeAi8Export(): boolean {
  return import.meta.env.VITE_CITYCUT_AI_NATIVE === "true";
}
