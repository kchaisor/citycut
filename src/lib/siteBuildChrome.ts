export type SiteBuildChromeSink = {
  setSiteBuildActive: (active: boolean) => void;
  setHandoffUnderlay: (value: "none" | "holding" | "fading") => void;
};

export function dispatchIntroBridgeDone(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("citycut:intro-done"));
}

export function releaseSiteBuildChrome(sink: SiteBuildChromeSink): void {
  sink.setSiteBuildActive(false);
  sink.setHandoffUnderlay("none");
}

export function finishIntroBridgeHandoff(sink: SiteBuildChromeSink): void {
  releaseSiteBuildChrome(sink);
  dispatchIntroBridgeDone();
}
