---- MODULE LoadingHandoff ----
EXTENDS Naturals

VARIABLES phase, progress, webglReady, sceneReady, blankFrame

Phases == {"idle", "processing", "transition", "settled"}

TypeOK ==
  /\ phase \in Phases
  /\ progress \in 0..100
  /\ webglReady \in BOOLEAN
  /\ sceneReady \in BOOLEAN
  /\ blankFrame \in BOOLEAN

Init ==
  /\ phase = "idle"
  /\ progress = 0
  /\ webglReady = FALSE
  /\ sceneReady = FALSE
  /\ blankFrame = FALSE

ProcessingStart ==
  /\ phase' = "processing"
  /\ progress' = 0
  /\ webglReady' = FALSE
  /\ sceneReady' = FALSE
  /\ blankFrame' = FALSE

Progress(p) ==
  /\ p \in 0..100
  /\ progress' = IF progress >= p THEN progress ELSE p
  /\ IF progress' = 100 /\ webglReady /\ sceneReady
        THEN /\ phase' = "transition"
             /\ blankFrame' = FALSE
        ELSE /\ UNCHANGED <<phase, blankFrame>>
  /\ UNCHANGED <<webglReady, sceneReady>>

SceneReady ==
  /\ sceneReady' = TRUE
  /\ IF progress = 100 /\ webglReady
        THEN /\ phase' = "transition"
             /\ blankFrame' = FALSE
        ELSE /\ UNCHANGED <<phase, blankFrame>>
  /\ UNCHANGED <<progress, webglReady>>

WebglReady ==
  /\ webglReady' = TRUE
  /\ IF progress = 100 /\ sceneReady
        THEN /\ phase' = "transition"
             /\ blankFrame' = FALSE
        ELSE /\ UNCHANGED <<phase, blankFrame>>
  /\ UNCHANGED <<progress, sceneReady>>

TransitionStart ==
  /\ IF progress = 100 /\ webglReady /\ sceneReady
        THEN /\ phase' = "transition"
             /\ blankFrame' = FALSE
             /\ UNCHANGED <<progress, webglReady, sceneReady>>
        ELSE /\ phase' = phase
             /\ blankFrame' = TRUE
             /\ UNCHANGED <<progress, webglReady, sceneReady>>

TransitionDone ==
  /\ phase' = "settled"
  /\ progress' = 100
  /\ webglReady' = TRUE
  /\ sceneReady' = TRUE
  /\ blankFrame' = FALSE

Next ==
  \/ ProcessingStart
  \/ \E p \in 0..100 : Progress(p)
  \/ WebglReady
  \/ SceneReady
  \/ TransitionStart
  \/ TransitionDone

Spec == Init /\ [][Next]_<<phase, progress, webglReady, sceneReady, blankFrame>>

NoTransitionBeforeReady ==
  (phase = "transition") => (progress = 100 /\ webglReady /\ sceneReady)

NoBlankWhenReady ==
  (progress = 100 /\ webglReady /\ sceneReady) => ~blankFrame

====
