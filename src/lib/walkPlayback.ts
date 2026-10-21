import { CELL_VISIBLE, frameVisibleShare, type HeightGrid } from "./viewshed";
import type { Pt } from "../types";

export type WalkPlaybackSnapshot = {
  /** Current viewpoint (sample) index. */
  index: number;
  /** Distance walked, metres, at the current viewpoint. */
  distanceM: number;
  visiblePercent: number | null;
  seenHa: number | null;
};

export type WalkPlaybackTarget = {
  paint: (frame: Uint8Array | null, seen: Uint8Array | null) => void;
  setWalker: (at: Pt | null, eyeHeight: number) => void;
};

const EMPTY: WalkPlaybackSnapshot = { index: 0, distanceM: 0, visiblePercent: null, seenHa: null };

/**
 * Walk playback outside React. The walker moves every animation frame along the spline
 * (interpolated between viewpoints); the overlay is repainted and the readouts change only when
 * the walk reaches a new viewpoint. Subscribers (the View panel) get a new snapshot then, so the
 * model page and the 3D scene never re-render during playback.
 */
export class WalkPlayback {
  private snapshot: WalkPlaybackSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private grid: HeightGrid | null = null;
  private frames: readonly (Uint8Array | null)[] = [];
  private samples: readonly Pt[] = [];
  private lengthM = 0;
  private eyeM = 0;
  private seen: Uint8Array | null = null;
  private seenUpTo = -1;
  private seenCount = 0;
  private shown = -1;
  /** Distance along the walk, metres (continuous). */
  private distance = 0;

  constructor(private readonly target: WalkPlaybackTarget) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): WalkPlaybackSnapshot => this.snapshot;

  private emit(next: WalkPlaybackSnapshot) {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  /** New result (or null to clear). Frames may still be arriving. */
  load(result: { grid: HeightGrid; frames: readonly (Uint8Array | null)[]; eyeM: number } | null, samples: readonly Pt[], lengthM: number) {
    this.grid = result?.grid ?? null;
    this.frames = result?.frames ?? [];
    this.eyeM = result?.eyeM ?? 0;
    this.samples = samples;
    this.lengthM = lengthM;
    this.seen = this.grid ? new Uint8Array(this.grid.cols * this.grid.rows) : null;
    this.seenUpTo = -1;
    this.seenCount = 0;
    this.shown = -1;
    this.distance = 0;
    if (!result) {
      this.target.setWalker(null, 0);
      this.emit(EMPTY);
    }
  }

  get count(): number {
    return this.samples.length;
  }

  private get step(): number {
    return this.samples.length > 1 ? this.lengthM / (this.samples.length - 1) : 0;
  }

  /** Highest index whose frame (and every earlier one) has arrived. */
  readyUpTo(): number {
    let i = 0;
    while (i < this.frames.length && this.frames[i]) i++;
    return i - 1;
  }

  get atEnd(): boolean {
    return this.samples.length < 2 || this.distance >= this.lengthM - 1e-6;
  }

  /** Called as frames arrive: shows the first one as soon as it is there. */
  frameArrived(index: number) {
    if (index === 0 && this.shown < 0) this.seekIndex(0);
  }

  /** Jump to a viewpoint (scrub). */
  seekIndex(index: number) {
    const i = Math.max(0, Math.min(this.samples.length - 1, Math.round(index)));
    this.distance = i * this.step;
    this.placeWalker();
    this.show(i);
  }

  restart() {
    this.seekIndex(0);
  }

  /**
   * Advance by `metres` (one animation frame). Never passes the last computed frame.
   * Returns false when the walk has reached its end.
   */
  advance(metres: number): boolean {
    if (!this.grid || this.samples.length < 2) return false;
    const ready = this.readyUpTo();
    if (ready < 0) return true;
    const limit = ready * this.step;
    this.distance = Math.max(0, Math.min(this.distance + metres, limit, this.lengthM));
    this.placeWalker();
    const i = Math.min(ready, Math.floor(this.distance / this.step + 1e-6));
    if (i !== this.shown) this.show(i);
    return !(ready === this.samples.length - 1 && this.distance >= this.lengthM - 1e-6);
  }

  private placeWalker() {
    const n = this.samples.length;
    if (n === 0) return;
    const step = this.step;
    const f = step > 0 ? this.distance / step : 0;
    const i = Math.min(n - 1, Math.floor(f));
    const a = this.samples[i]!;
    const b = this.samples[Math.min(n - 1, i + 1)]!;
    const t = Math.min(1, Math.max(0, f - i));
    this.target.setWalker([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], this.eyeM);
  }

  private show(index: number) {
    const frame = this.frames[index] ?? null;
    if (!frame || !this.grid || !this.seen) return;
    if (index < this.seenUpTo) {
      this.seen.fill(0);
      this.seenUpTo = -1;
      this.seenCount = 0;
    }
    for (let i = this.seenUpTo + 1; i <= index; i++) {
      const f = this.frames[i];
      if (!f) break;
      for (let k = 0; k < f.length; k++) {
        if (f[k] === CELL_VISIBLE && !this.seen[k]) {
          this.seen[k] = 1;
          this.seenCount++;
        }
      }
      this.seenUpTo = i;
    }
    this.shown = index;
    this.target.paint(frame, this.seen);
    const cellArea = this.grid.cell * this.grid.cell;
    this.emit({
      index,
      distanceM: index * this.step,
      visiblePercent: frameVisibleShare(frame).percent,
      seenHa: (this.seenCount * cellArea) / 10_000,
    });
  }
}
