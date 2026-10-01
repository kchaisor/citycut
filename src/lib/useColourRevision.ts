import { useSyncExternalStore } from "react";
import { colourRevision, subscribeColours } from "./colours";

/** Re-render when a fill in the Colours panel changes. */
export function useColourRevision(): number {
  return useSyncExternalStore(subscribeColours, colourRevision, colourRevision);
}
