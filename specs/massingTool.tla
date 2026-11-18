---- MODULE massingTool ----
\* Massing tool state machine (mirrors src/lib/massingToolMachine.ts).
\* Polyline draw: vertices accumulate in preview; explicit finish commits.
EXTENDS Naturals

CONSTANT MaxBlocks
CONSTANT MaxParcels
CONSTANT MaxVertices

VARIABLES
  toolEnabled,
  drawArmed,
  phase,
  selected,
  blocks,
  vertexCount,
  parcelSelection,
  hasSiteBoundary

vars ==
  <<toolEnabled, drawArmed, phase, selected, blocks, vertexCount, parcelSelection, hasSiteBoundary>>

Phases == {"idle", "drawing", "drawingPreview", "selected", "draggingHeight"}
Drawing == {"drawing", "drawingPreview"}

TypeOK ==
  /\ toolEnabled \in BOOLEAN
  /\ drawArmed \in BOOLEAN
  /\ phase \in Phases
  /\ selected \in BOOLEAN
  /\ blocks \in 0..MaxBlocks
  /\ vertexCount \in 0..MaxVertices
  /\ parcelSelection \in 0..MaxParcels
  /\ hasSiteBoundary \in BOOLEAN

Init ==
  /\ toolEnabled = FALSE
  /\ drawArmed = FALSE
  /\ phase = "idle"
  /\ selected = FALSE
  /\ blocks = 0
  /\ vertexCount = 0
  /\ parcelSelection = 0
  /\ hasSiteBoundary = FALSE

EnableTool ==
  /\ ~toolEnabled
  /\ toolEnabled' = TRUE
  /\ UNCHANGED <<drawArmed, phase, selected, blocks, vertexCount, parcelSelection, hasSiteBoundary>>

DisableTool ==
  /\ toolEnabled
  /\ toolEnabled' = FALSE
  /\ drawArmed' = FALSE
  /\ phase' = "idle"
  /\ selected' = FALSE
  /\ vertexCount' = 0
  /\ parcelSelection' = 0
  /\ hasSiteBoundary' = FALSE
  /\ UNCHANGED blocks

ArmDraw ==
  /\ toolEnabled
  /\ ~drawArmed
  /\ drawArmed' = TRUE
  /\ UNCHANGED <<toolEnabled, phase, selected, blocks, vertexCount, parcelSelection, hasSiteBoundary>>

DisarmDraw ==
  /\ drawArmed
  /\ drawArmed' = FALSE
  /\ IF phase \in Drawing
     THEN /\ phase' = "idle"
          /\ vertexCount' = 0
     ELSE UNCHANGED <<phase, vertexCount>>
  /\ UNCHANGED <<toolEnabled, selected, blocks, parcelSelection, hasSiteBoundary>>

SelectParcel ==
  /\ toolEnabled
  /\ ~drawArmed
  /\ parcelSelection < MaxParcels
  /\ parcelSelection' = parcelSelection + 1
  /\ hasSiteBoundary' = TRUE
  /\ UNCHANGED <<toolEnabled, drawArmed, phase, selected, blocks, vertexCount>>

ClearParcels ==
  /\ parcelSelection > 0
  /\ parcelSelection' = 0
  /\ hasSiteBoundary' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, phase, selected, blocks, vertexCount>>

PressGround ==
  /\ toolEnabled
  /\ drawArmed
  /\ phase = "idle"
  /\ phase' = "drawing"
  /\ vertexCount' = 1
  /\ selected' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, blocks, parcelSelection, hasSiteBoundary>>

PressGroundDeselect ==
  /\ toolEnabled
  /\ ~drawArmed
  /\ phase = "selected"
  /\ phase' = "idle"
  /\ selected' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, blocks, vertexCount, parcelSelection, hasSiteBoundary>>

ReleaseCommit ==
  /\ phase = "drawing"
  /\ drawArmed
  /\ blocks < MaxBlocks
  /\ blocks' = blocks + 1
  /\ phase' = "selected"
  /\ selected' = TRUE
  /\ vertexCount' = 0
  /\ UNCHANGED <<toolEnabled, drawArmed, parcelSelection, hasSiteBoundary>>

ReleaseToPreview ==
  /\ phase = "drawing"
  /\ drawArmed
  /\ phase' = "drawingPreview"
  /\ UNCHANGED <<toolEnabled, drawArmed, selected, blocks, vertexCount, parcelSelection, hasSiteBoundary>>

AddVertex ==
  /\ phase = "drawingPreview"
  /\ drawArmed
  /\ vertexCount < MaxVertices
  /\ vertexCount' = vertexCount + 1
  /\ UNCHANGED <<toolEnabled, drawArmed, phase, selected, blocks, parcelSelection, hasSiteBoundary>>

FinishDraw ==
  /\ phase = "drawingPreview"
  /\ drawArmed
  /\ vertexCount >= 2
  /\ blocks < MaxBlocks
  /\ blocks' = blocks + 1
  /\ phase' = "selected"
  /\ selected' = TRUE
  /\ vertexCount' = 0
  /\ UNCHANGED <<toolEnabled, drawArmed, parcelSelection, hasSiteBoundary>>

Cancel ==
  /\ toolEnabled
  /\ phase \in Drawing
  /\ phase' = "idle"
  /\ vertexCount' = 0
  /\ UNCHANGED <<toolEnabled, drawArmed, selected, blocks, parcelSelection, hasSiteBoundary>>

Leave3D ==
  /\ phase \in Drawing \cup {"draggingHeight"}
  /\ phase' = IF selected THEN "selected" ELSE "idle"
  /\ vertexCount' = 0
  /\ UNCHANGED <<toolEnabled, drawArmed, selected, blocks, parcelSelection, hasSiteBoundary>>

SelectBlock ==
  /\ toolEnabled
  /\ phase \in {"idle", "selected"}
  /\ blocks > 0
  /\ phase' = "selected"
  /\ selected' = TRUE
  /\ UNCHANGED <<toolEnabled, drawArmed, blocks, vertexCount, parcelSelection, hasSiteBoundary>>

StartHeightDrag ==
  /\ phase = "selected"
  /\ phase' = "draggingHeight"
  /\ UNCHANGED <<toolEnabled, drawArmed, selected, blocks, vertexCount, parcelSelection, hasSiteBoundary>>

EndHeightDrag ==
  /\ phase = "draggingHeight"
  /\ phase' = "selected"
  /\ UNCHANGED <<toolEnabled, drawArmed, selected, blocks, vertexCount, parcelSelection, hasSiteBoundary>>

DeleteSelected ==
  /\ phase = "selected"
  /\ blocks > 0
  /\ blocks' = blocks - 1
  /\ phase' = "idle"
  /\ selected' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, vertexCount, parcelSelection, hasSiteBoundary>>

Next ==
  \/ EnableTool \/ DisableTool
  \/ ArmDraw \/ DisarmDraw
  \/ SelectParcel \/ ClearParcels
  \/ PressGround \/ PressGroundDeselect
  \/ ReleaseCommit \/ ReleaseToPreview
  \/ AddVertex \/ FinishDraw
  \/ Cancel \/ Leave3D
  \/ SelectBlock \/ StartHeightDrag \/ EndHeightDrag \/ DeleteSelected

Spec == Init /\ [][Next]_vars

OrbitLocked == (drawArmed /\ phase \in Drawing) \/ phase = "draggingHeight"

DraftOnlyWhileDrawing == vertexCount > 0 <=> phase \in Drawing
DrawingNeedsTool == phase \in Drawing \cup {"draggingHeight"} => toolEnabled
DrawingNeedsArmed == phase \in Drawing => drawArmed
SelectionConsistent == phase \in {"selected", "draggingHeight"} => selected
NoSelectionWhileDrawing == phase \in Drawing => ~selected
OffMeansIdle == ~toolEnabled => (phase = "idle" /\ vertexCount = 0 /\ ~drawArmed)
SiteBoundaryConsistent == hasSiteBoundary <=> parcelSelection > 0
MassingOffClearsDraw == ~toolEnabled => ~drawArmed
ParcelSelectNeedsMassing == parcelSelection > 0 => toolEnabled
CancelCreatesNothing == [][(phase \in Drawing /\ phase' = "idle") => blocks' = blocks]_vars
PreviewNeedsVertices == phase = "drawingPreview" => vertexCount >= 1

====
