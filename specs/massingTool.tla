---- MODULE massingTool ----
\* Massing draw/edit tool state machine (mirrors src/lib/massingToolMachine.ts).
\* Draw paths:
\*   press-drag-release: idle -> drawing -(release, long enough)-> selected (committed)
\*   click-click:        idle -> drawing -(release, short)-> drawingPreview
\*                       -(second click, valid)-> selected (committed)
\*   Escape / leave 3D:  drawing|drawingPreview -> idle, no block created
EXTENDS Naturals

CONSTANT MaxBlocks

VARIABLES toolEnabled, phase, selected, blocks, hasDraft

vars == <<toolEnabled, phase, selected, blocks, hasDraft>>

Phases == {"idle", "drawing", "drawingPreview", "selected", "draggingHeight"}
Drawing == {"drawing", "drawingPreview"}

TypeOK ==
  /\ toolEnabled \in BOOLEAN
  /\ phase \in Phases
  /\ selected \in BOOLEAN
  /\ blocks \in 0..MaxBlocks
  /\ hasDraft \in BOOLEAN

Init ==
  /\ toolEnabled = FALSE
  /\ phase = "idle"
  /\ selected = FALSE
  /\ blocks = 0
  /\ hasDraft = FALSE

EnableTool ==
  /\ ~toolEnabled
  /\ toolEnabled' = TRUE
  /\ UNCHANGED <<phase, selected, blocks, hasDraft>>

DisableTool ==
  /\ toolEnabled
  /\ toolEnabled' = FALSE
  /\ phase' = "idle"
  /\ selected' = FALSE
  /\ hasDraft' = FALSE
  /\ UNCHANGED blocks

\* Press on empty ground (from idle) starts a draft.
PressGround ==
  /\ toolEnabled
  /\ phase = "idle"
  /\ phase' = "drawing"
  /\ hasDraft' = TRUE
  /\ selected' = FALSE
  /\ UNCHANGED <<toolEnabled, blocks>>

\* Press on empty ground while a block is selected just deselects.
PressGroundDeselect ==
  /\ toolEnabled
  /\ phase = "selected"
  /\ phase' = "idle"
  /\ selected' = FALSE
  /\ UNCHANGED <<toolEnabled, blocks, hasDraft>>

\* Drag release with a long-enough, in-cut centreline commits.
ReleaseCommit ==
  /\ phase = "drawing"
  /\ blocks < MaxBlocks
  /\ blocks' = blocks + 1
  /\ phase' = "selected"
  /\ selected' = TRUE
  /\ hasDraft' = FALSE
  /\ UNCHANGED toolEnabled

\* Short release (a click) enters the hover preview; start stays anchored.
ReleaseToPreview ==
  /\ phase = "drawing"
  /\ phase' = "drawingPreview"
  /\ UNCHANGED <<toolEnabled, selected, blocks, hasDraft>>

\* Second click with a valid end commits.
SecondClickCommit ==
  /\ phase = "drawingPreview"
  /\ blocks < MaxBlocks
  /\ blocks' = blocks + 1
  /\ phase' = "selected"
  /\ selected' = TRUE
  /\ hasDraft' = FALSE
  /\ UNCHANGED toolEnabled

\* Second click too short / outside cut: stays in preview, nothing committed.
SecondClickRejected ==
  /\ phase = "drawingPreview"
  /\ UNCHANGED vars

Cancel ==
  /\ toolEnabled
  /\ phase \in Drawing
  /\ phase' = "idle"
  /\ hasDraft' = FALSE
  /\ UNCHANGED <<toolEnabled, selected, blocks>>

Leave3D ==
  /\ phase \in Drawing \cup {"draggingHeight"}
  /\ phase' = IF selected THEN "selected" ELSE "idle"
  /\ hasDraft' = FALSE
  /\ UNCHANGED <<toolEnabled, selected, blocks>>

SelectBlock ==
  /\ toolEnabled
  /\ phase \in {"idle", "selected"}
  /\ blocks > 0
  /\ phase' = "selected"
  /\ selected' = TRUE
  /\ UNCHANGED <<toolEnabled, blocks, hasDraft>>

StartHeightDrag ==
  /\ phase = "selected"
  /\ phase' = "draggingHeight"
  /\ UNCHANGED <<toolEnabled, selected, blocks, hasDraft>>

EndHeightDrag ==
  /\ phase = "draggingHeight"
  /\ phase' = "selected"
  /\ UNCHANGED <<toolEnabled, selected, blocks, hasDraft>>

DeleteSelected ==
  /\ phase = "selected"
  /\ blocks > 0
  /\ blocks' = blocks - 1
  /\ phase' = "idle"
  /\ selected' = FALSE
  /\ UNCHANGED <<toolEnabled, hasDraft>>

Next ==
  \/ EnableTool \/ DisableTool
  \/ PressGround \/ PressGroundDeselect
  \/ ReleaseCommit \/ ReleaseToPreview
  \/ SecondClickCommit \/ SecondClickRejected
  \/ Cancel \/ Leave3D
  \/ SelectBlock \/ StartHeightDrag \/ EndHeightDrag \/ DeleteSelected

Spec == Init /\ [][Next]_vars

OrbitLocked == toolEnabled /\ (phase \in Drawing \/ phase = "draggingHeight")

\* Invariants checked by TLC (specs/massingTool.cfg).
DraftOnlyWhileDrawing == hasDraft <=> phase \in Drawing
DrawingNeedsTool == phase \in Drawing \cup {"draggingHeight"} => toolEnabled
SelectionConsistent == phase \in {"selected", "draggingHeight"} => selected
NoSelectionWhileDrawing == phase \in Drawing => ~selected
OffMeansIdle == ~toolEnabled => (phase = "idle" /\ ~hasDraft)

\* Action property: cancel never creates a block.
CancelCreatesNothing == [][(phase \in Drawing /\ phase' = "idle") => blocks' = blocks]_vars

====
