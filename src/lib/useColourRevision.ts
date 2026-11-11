import { useSyncExternalStore } from "react";
import { colourRevision, subscribeColours } from "./colours";

export function useColourRevision(): number {
  return useSyncExternalStore(subscribeColours, colourRevision, colourRevision);
}
