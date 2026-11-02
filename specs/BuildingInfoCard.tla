---- MODULE BuildingInfoCard ----
EXTENDS Naturals

CONSTANTS Buildings

VARIABLES hover, pinned

Null == 0
BuildingsSet == Buildings

TypeOK ==
  /\ hover \in BuildingsSet \union {Null}
  /\ pinned \in BuildingsSet \union {Null}

Init ==
  /\ hover = Null
  /\ pinned = Null

HoverBuilding(id) ==
  /\ id \in BuildingsSet
  /\ hover' = id
  /\ pinned' = pinned

Unhover ==
  /\ hover' = Null
  /\ pinned' = pinned

ClickBuilding(id) ==
  /\ id \in BuildingsSet
  /\ hover' = id
  /\ pinned' = id

ClearPin ==
  /\ hover' = Null
  /\ pinned' = Null

Next ==
  \/ \E id \in BuildingsSet : HoverBuilding(id)
  \/ Unhover
  \/ \E id \in BuildingsSet : ClickBuilding(id)
  \/ ClearPin

Spec == Init /\ [][Next]_<<hover, pinned>>

CardVisible == pinned # Null

PinnedIsValid == pinned = Null \/ pinned \in BuildingsSet

HoverIsValid == hover = Null \/ hover \in BuildingsSet

====
