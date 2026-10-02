type InertiaControl = {
  enableDamping: boolean;
  update: () => void;
};

export type HeldControl<P> = InertiaControl & {
  target: { clone(): P; copy(value: P): void };
  object: {
    position: { clone(): P; copy(value: P): void };
    zoom: number;
    lookAt(target: P): void;
    updateProjectionMatrix(): void;
  };
};

/** Drop OrbitControls damping leftovers. One undamped update applies and clears them. */
export function flushControlInertia(controls: InertiaControl) {
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  try {
    controls.update();
  } finally {
    controls.enableDamping = damping;
  }
}

/**
 * Keep the current pose and throw away in-flight rotate or pan inertia.
 * Used when a camera is parked, so switching back does not resume a damped drag.
 */
export function holdControlPose<P>(controls: HeldControl<P>) {
  const position = controls.object.position.clone();
  const target = controls.target.clone();
  const zoom = controls.object.zoom;
  flushControlInertia(controls);
  controls.object.position.copy(position);
  controls.target.copy(target);
  controls.object.zoom = zoom;
  controls.object.updateProjectionMatrix();
  controls.object.lookAt(target);
  controls.update();
}
