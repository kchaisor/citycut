---- MODULE demographicsExplorer ----
EXTENDS Naturals

PinIds == {"a", "b"}
Modes == {"single", "compare"}

VARIABLES radiusM, panelMode, pinA, pinB

TypeOK ==
  /\ radiusM \in 200..1200
  /\ panelMode \in Modes
  /\ pinA \in BOOLEAN
  /\ pinB \in BOOLEAN

Init ==
  /\ radiusM = 400
  /\ panelMode = "compare"
  /\ pinA = TRUE
  /\ pinB = TRUE

ActiveCount ==
  (IF pinA THEN 1 ELSE 0) + (IF pinB THEN 1 ELSE 0)

Invariant ==
  /\ ActiveCount <= 2
  /\ panelMode = "compare" => ActiveCount = 2
  /\ panelMode = "single" => ActiveCount >= 1

SetRadius(r) ==
  /\ r \in 200..1200
  /\ radiusM' = r
  /\ UNCHANGED <<panelMode, pinA, pinB>>

SetMode(m) ==
  /\ m \in Modes
  /\ panelMode' = m
  /\ m = "compare" => pinB' = TRUE
  /\ UNCHANGED <<radiusM, pinA>>
  /\ IF m = "compare" THEN pinB' = TRUE ELSE pinB' = pinB

MovePin(id) ==
  /\ id \in PinIds
  /\ IF id = "a" THEN pinA' = TRUE ELSE pinB' = TRUE
  /\ UNCHANGED <<radiusM, panelMode>>
  /\ IF id = "a" THEN UNCHANGED pinB ELSE UNCHANGED pinA

Next ==
  \/ \E r \in 200..1200 : SetRadius(r)
  \/ \E m \in Modes : SetMode(m)
  \/ \E id \in PinIds : MovePin(id)

Spec == Init /\ [][Next]_<<radiusM, panelMode, pinA, pinB>>

====
