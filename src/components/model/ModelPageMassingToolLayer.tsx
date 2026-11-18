import { MassingToolLayer, floorsFromHeightDrag } from "../MassingToolLayer";
import type { ModelPageViewModel } from "./useModelPage";

export function ModelPageMassingToolLayer({ vm }: { vm: ModelPageViewModel }) {
  const {
    displayModel,
    massingDraw,
    massingGroundPointerMove,
    massingHeightDragFloors,
    massingParcels,
    massingSceneCanvasRef,
    selectedMassingBlock,
    setMassingCursor,
    tab,
  } = vm;

  return (
    <MassingToolLayer
      model={displayModel}
      blocks={massingDraw.blocks}
      tool={massingDraw.tool}
      previewRing={massingDraw.previewRing}
      previewLine={massingDraw.draftPolyline}
      active={tab === "3d"}
      parcelOutlineObjects={massingParcels.outlineObjects}
      parcelOutlineLineMaterials={massingParcels.outlineLineMaterials}
      onPointerDown={(east, north, hitBlockId) => {
        if (massingDraw.tool.toolEnabled && !massingDraw.tool.drawArmed && !hitBlockId) {
          const parcelId = massingParcels.pickAt(east, north);
          if (parcelId) {
            massingParcels.toggleParcel(parcelId);
            return;
          }
        }
        massingDraw.pointerDown(east, north, hitBlockId);
      }}
      onSceneCanvasMount={(el) => {
        massingSceneCanvasRef.current = el;
      }}
      onPointerMove={(east, north, clientX, clientY, hitBlockId) => {
        setMassingCursor({ x: clientX, y: clientY });
        massingGroundPointerMove(east, north, clientX, clientY, hitBlockId);
        if (east != null && north != null) massingDraw.pointerMove(east, north);
      }}
      onPointerUp={() => massingDraw.pointerUp()}
      onCancel={() => massingDraw.dispatchTool({ type: "CANCEL" })}
      onHeightDragStart={(blockId) => {
        const block = massingDraw.blocks.find((item) => item.id === blockId);
        if (!block) return;
        massingHeightDragFloors.current = block.floors;
        massingDraw.dispatchTool({ type: "START_HEIGHT_DRAG", floors: block.floors });
      }}
      onHeightDrag={(clientY, startY) => {
        const floors = floorsFromHeightDrag(
          clientY - startY,
          massingHeightDragFloors.current,
          selectedMassingBlock?.floorHeight_m ?? 3.1,
        );
        massingDraw.updateSelected({ floors });
        massingDraw.dispatchTool({ type: "HEIGHT_DRAG", floors });
      }}
      onHeightDragEnd={() => massingDraw.dispatchTool({ type: "END_HEIGHT_DRAG" })}
    />
  );
}
