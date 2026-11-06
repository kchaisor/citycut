---- MODULE massingTool ----
\* Massing tool state machine (mirrors src/lib/massingToolMachine.ts).
\* Modes: MassingOn (toolEnabled), DrawingArmed (drawArmed), optional site boundary (parcelSelection).
EXTENDS Naturals

CONSTANT MaxBlocks
CONSTANT MaxParcels

VARIABLES
  toolEnabled,
  drawArmed,
  phase,
  selected,
  blocks,
  hasDraft,
  parcelSelection,
  hasSiteBoundary

vars ==
  <<toolEnabled, drawArmed, phase, selected, blocks, hasDraft, parcelSelection, hasSiteBoundary>>

Phases == {"idle", "drawing", "drawingPreview", "selected", "draggingHeight"}
Drawing == {"drawing", "drawingPreview"}

TypeOK ==
  /\ toolEnabled \in BOOLEAN
  /\ drawArmed \in BOOLEAN
  /\ phase \in Phases
  /\ selected \in BOOLEAN
  /\ blocks \in 0..MaxBlocks
  /\ hasDraft \in BOOLEAN
  /\ parcelSelection \in 0..MaxParcels
  /\ hasSiteBoundary \in BOOLEAN

Init ==
  /\ toolEnabled = FALSE
  /\ drawArmed = FALSE
  /\ phase = "idle"
  /\ selected = FALSE
  /\ blocks = 0
  /\ hasDraft = FALSE
  /\ parcelSelection = 0
  /\ hasSiteBoundary = FALSE

EnableTool ==
  /\ ~toolEnabled
  /\ toolEnabled' = TRUE
  /\ UNCHANGED <<drawArmed, phase, selected, blocks, hasDraft, parcelSelection, hasSiteBoundary>>

DisableTool ==
  /\ toolEnabled
  /\ toolEnabled' = FALSE
  /\ drawArmed' = FALSE
  /\ phase' = "idle"
  /\ selected' = FALSE
  /\ hasDraft' = FALSE
  /\ parcelSelection' = 0
  /\ hasSiteBoundary' = FALSE
  /\ UNCHANGED blocks

ArmDraw ==
  /\ toolEnabled
  /\ ~drawArmed
  /\ drawArmed' = TRUE
  /\ UNCHANGED <<toolEnabled, phase, selected, blocks, hasDraft, parcelSelection, hasSiteBoundary>>

DisarmDraw ==
  /\ drawArmed
  /\ drawArmed' = FALSE
  /\ IF phase \in Drawing
     THEN /\ phase' = "idle"
          /\ hasDraft' = FALSE
     ELSE UNCHANGED <<phase, hasDraft>>
  /\ UNCHANGED <<toolEnabled, selected, blocks, parcelSelection, hasSiteBoundary>>

SelectParcel ==
  /\ toolEnabled
  /\ ~drawArmed
  /\ parcelSelection < MaxParcels
  /\ parcelSelection' = parcelSelection + 1
  /\ hasSiteBoundary' = TRUE
  /\ UNCHANGED <<toolEnabled, drawArmed, phase, selected, blocks, hasDraft>>

ClearParcels ==
  /\ parcelSelection > 0
  /\ parcelSelection' = 0
  /\ hasSiteBoundary' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, phase, selected, blocks, hasDraft>>

PressGround ==
  /\ toolEnabled
  /\ drawArmed
  /\ phase = "idle"
  /\ phase' = "drawing"
  /\ hasDraft' = TRUE
  /\ selected' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, blocks, parcelSelection, hasSiteBoundary>>

PressGroundDeselect ==
  /\ toolEnabled
  /\ ~drawArmed
  /\ phase = "selected"
  /\ phase' = "idle"
  /\ selected' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, blocks, hasDraft, parcelSelection, hasSiteBoundary>>

ReleaseCommit ==
  /\ phase = "drawing"
  /\ drawArmed
  /\ blocks < MaxBlocks
  /\ blocks' = blocks + 1
  /\ phase' = "selected"
  /\ selected' = TRUE
  /\ hasDraft' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, parcelSelection, hasSiteBoundary>>

ReleaseToPreview ==
  /\ phase = "drawing"
  /\ drawArmed
  /\ phase' = "drawingPreview"
  /\ UNCHANGED <<toolEnabled, drawArmed, selected, blocks, hasDraft, parcelSelection, hasSiteBoundary>>

SecondClickCommit ==
  /\ phase = "drawingPreview"
  /\ drawArmed
  /\ blocks < MaxBlocks
  /\ blocks' = blocks + 1
  /\ phase' = "selected"
  /\ selected' = TRUE
  /\ hasDraft' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, parcelSelection, hasSiteBoundary>>

SecondClickRejected ==
  /\ phase = "drawingPreview"
  /\ drawArmed
  /\ UNCHANGED vars

Cancel ==
  /\ toolEnabled
  /\ phase \in Drawing
  /\ phase' = "idle"
  /\ hasDraft' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, selected, blocks, parcelSelection, hasSiteBoundary>>

Leave3D ==
  /\ phase \in Drawing \cup {"draggingHeight"}
  /\ phase' = IF selected THEN "selected" ELSE "idle"
  /\ hasDraft' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, selected, blocks, parcelSelection, hasSiteBoundary>>

SelectBlock ==
  /\ toolEnabled
  /\ phase \in {"idle", "selected"}
  /\ blocks > 0
  /\ phase' = "selected"
  /\ selected' = TRUE
  /\ UNCHANGED <<toolEnabled, drawArmed, blocks, hasDraft, parcelSelection, hasSiteBoundary>>

StartHeightDrag ==
  /\ phase = "selected"
  /\ phase' = "draggingHeight"
  /\ UNCHANGED <<toolEnabled, drawArmed, selected, blocks, hasDraft, parcelSelection, hasSiteBoundary>>

EndHeightDrag ==
  /\ phase = "draggingHeight"
  /\ phase' = "selected"
  /\ UNCHANGED <<toolEnabled, drawArmed, selected, blocks, hasDraft, parcelSelection, hasSiteBoundary>>

DeleteSelected ==
  /\ phase = "selected"
  /\ blocks > 0
  /\ blocks' = blocks - 1
  /\ phase' = "idle"
  /\ selected' = FALSE
  /\ UNCHANGED <<toolEnabled, drawArmed, hasDraft, parcelSelection, hasSiteBoundary>>

Next ==
  \/ EnableTool \/ DisableTool
  \/ ArmDraw \/ DisarmDraw
  \/ SelectParcel \/ ClearParcels
  \/ PressGround \/ PressGroundDeselect
  \/ ReleaseCommit \/ ReleaseToPreview
  \/ SecondClickCommit \/ SecondClickRejected
  \/ Cancel \/ Leave3D
  \/ SelectBlock \/ StartHeightDrag \/ EndHeightDrag \/ DeleteSelected

Spec == Init /\ [][Next]_vars

OrbitLocked == (drawArmed /\ phase \in Drawing) \/ phase = "draggingHeight"

DraftOnlyWhileDrawing == hasDraft <=> phase \in Drawing
DrawingNeedsTool == phase \in Drawing \cup {"draggingHeight"} => toolEnabled
DrawingNeedsArmed == phase \in Drawing => drawArmed
SelectionConsistent == phase \in {"selected", "draggingHeight"} => selected
NoSelectionWhileDrawing == phase \in Drawing => ~selected
OffMeansIdle == ~toolEnabled => (phase = "idle" /\ ~hasDraft /\ ~drawArmed)
SiteBoundaryConsistent == hasSiteBoundary <=> parcelSelection > 0
MassingOffClearsDraw == ~toolEnabled => ~drawArmed
ParcelSelectNeedsMassing == parcelSelection > 0 => toolEnabled
CancelCreatesNothing == [][(phase \in Drawing /\ phase' = "idle") => blocks' = blocks]_vars

====
