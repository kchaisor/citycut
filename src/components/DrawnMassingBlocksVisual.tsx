import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildMassingBlockMesh, MASSING_BLOCK_GROUP } from "../lib/massingBlockMesh";
import { disposeObject } from "../lib/buildCity";
import type { MassingBlock } from "../lib/massingBlock";
import type { CityModel } from "../types";

export function DrawnMassingBlocksVisual({
  model,
  blocks,
}: {
  model: CityModel;
  blocks: readonly MassingBlock[];
}) {
  const group = useMemo(() => {
    const root = new THREE.Group();
    root.name = MASSING_BLOCK_GROUP;
    for (const block of blocks) {
      const mesh = buildMassingBlockMesh(model, block);
      if (mesh) root.add(mesh);
    }
    return root;
  }, [blocks, model]);

  useEffect(() => () => disposeObject(group), [group]);

  if (blocks.length === 0) return null;

  return <primitive object={group} />;
}
