---- MODULE massingTool ----
EXTENDS Naturals

VARIABLES toolEnabled, phase, selectedId, drawing, draggingHeight

Phases == {"idle", "drawing", "selected", "draggingHeight"}

TypeOK ==
  /\ toolEnabled \in BOOLEAN
  /\ phase \in Phases
  /\ selectedId \in ({"none"} \union STRING)
  /\ drawing \in BOOLEAN
  /\ draggingHeight \in BOOLEAN

Init ==
  /\ toolEnabled = FALSE
  /\ phase = "idle"
  /\ selectedId = "none"
  /\ drawing = FALSE
  /\ draggingHeight = FALSE

EnableTool ==
  /\ toolEnabled' = TRUE
  /\ UNCHANGED <<phase, selectedId, drawing, draggingHeight>>

DisableTool ==
  /\ toolEnabled' = FALSE
  /\ phase' = "idle"
  /\ selectedId' = "none"
  /\ drawing' = FALSE
  /\ draggingHeight' = FALSE

StartDraw ==
  /\ toolEnabled
  /\ phase' = "drawing"
  /\ drawing' = TRUE
  /\ draggingHeight' = FALSE
  /\ selectedId' = "none"
  /\ UNCHANGED toolEnabled

CancelDraw ==
  /\ phase = "drawing"
  /\ phase' = "idle"
  /\ drawing' = FALSE
  /\ UNCHANGED <<toolEnabled, selectedId, draggingHeight>>

SelectBlock ==
  /\ toolEnabled
  /\ phase' = "selected"
  /\ drawing' = FALSE
  /\ draggingHeight' = FALSE
  /\ selectedId' # "none"
  /\ UNCHANGED toolEnabled

StartHeightDrag ==
  /\ phase = "selected"
  /\ phase' = "draggingHeight"
  /\ draggingHeight' = TRUE
  /\ UNCHANGED <<toolEnabled, selectedId, drawing>>

Leave3DWhileDrawing ==
  /\ phase = "drawing"
  /\ phase' = "idle"
  /\ drawing' = FALSE
  /\ UNCHANGED <<toolEnabled, selectedId, draggingHeight>>

Next ==
  \/ EnableTool
  \/ DisableTool
  \/ StartDraw
  \/ CancelDraw
  \/ SelectBlock
  \/ StartHeightDrag
  \/ Leave3DWhileDrawing

Spec == Init /\ [][Next]_<<toolEnabled, phase, selectedId, drawing, draggingHeight>>

OrbitLocked ==
  toolEnabled /\ (drawing \/ draggingHeight)

====
