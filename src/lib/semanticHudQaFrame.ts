export type SemanticSceneFrame = {
  groundY: number;
  siteY: number;
  topY: number;
  sideM: number;
};

export type BuildingCameraRow = {
  east: number;
  north: number;
  height: number;
  baseY: number;
};

export function semanticOverviewPose(frame: SemanticSceneFrame): {
  eye: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
} {
  const dist = frame.sideM * 0.92;
  return {
    eye: { x: dist * 0.62, y: frame.siteY + frame.sideM * 0.52, z: dist * 0.62 },
    target: { x: 0, y: frame.siteY, z: 0 },
  };
}

export function semanticBuildingPose(row: BuildingCameraRow): {
  eye: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
} {
  const z = -row.north;
  const midY = row.baseY + row.height * 0.48;
  return {
    eye: { x: row.east - 48, y: midY + 22, z: z + 62 },
    target: { x: row.east + 6, y: row.baseY + row.height * 0.35, z: z - 4 },
  };
}

export function semanticWalkPose(frame: SemanticSceneFrame): {
  eye: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
} {
  const eyeY = frame.groundY + 2.2;
  const lookY = frame.groundY + 2.0;
  return {
    eye: { x: -120, y: eyeY, z: 95 },
    target: { x: 140, y: lookY, z: -110 },
  };
}
