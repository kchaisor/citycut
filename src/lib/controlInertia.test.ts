import { describe, expect, it } from "vitest";
import { flushControlInertia, holdControlPose } from "./controlInertia";

function vec(x: number, y: number, z: number) {
  return {
    x,
    y,
    z,
    clone() {
      return vec(this.x, this.y, this.z);
    },
    copy(value: { x: number; y: number; z: number }) {
      this.x = value.x;
      this.y = value.y;
      this.z = value.z;
    },
  };
}

describe("control inertia", () => {
  it("flushes a damped rotate by applying it once with damping off", () => {
    let delta = 0.4;
    const calls: boolean[] = [];
    const controls = {
      enableDamping: true,
      update() {
        calls.push(this.enableDamping);
        if (this.enableDamping) {
          delta *= 1 - 0.08;
        } else {
          delta = 0;
        }
      },
    };
    flushControlInertia(controls);
    expect(controls.enableDamping).toBe(true);
    expect(delta).toBe(0);
    expect(calls).toEqual([false]);
  });

  it("holds the saved pose after leftover inertia would have moved the camera", () => {
    let delta = 12;
    const position = vec(10, 20, 30);
    const target = vec(0, 4, 0);
    let zoom = 3.5;
    let lookedAt: unknown = null;
    const controls = {
      enableDamping: true,
      target,
      object: {
        position,
        get zoom() {
          return zoom;
        },
        set zoom(value: number) {
          zoom = value;
        },
        lookAt(next: { x: number; y: number; z: number }) {
          lookedAt = next;
        },
        updateProjectionMatrix() {},
      },
      update() {
        if (!this.enableDamping) {
          position.x += delta;
          delta = 0;
          return;
        }
        position.x += delta * 0.08;
        delta *= 1 - 0.08;
      },
    };
    holdControlPose(controls);
    expect(position.x).toBe(10);
    expect(position.y).toBe(20);
    expect(position.z).toBe(30);
    expect(target).toMatchObject({ x: 0, y: 4, z: 0 });
    expect(zoom).toBe(3.5);
    expect(delta).toBe(0);
    expect(controls.enableDamping).toBe(true);
    expect(lookedAt).toMatchObject({ x: 0, y: 4, z: 0 });
  });
});
