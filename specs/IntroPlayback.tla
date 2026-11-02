---- MODULE IntroPlayback ----
EXTENDS Naturals

CONSTANTS Cuts

VARIABLES playedCut, activeCut, introRunning

Null == 0

TypeOK ==
  /\ playedCut \in Cuts \union {Null}
  /\ activeCut \in Cuts
  /\ introRunning \in BOOLEAN

Init ==
  /\ playedCut = Null
  /\ activeCut \in Cuts
  /\ introRunning = FALSE

NewModel(c) ==
  /\ c \in Cuts
  /\ activeCut' = c
  /\ playedCut' = playedCut
  /\ introRunning' = FALSE

ViewSwitch ==
  /\ UNCHANGED <<playedCut, activeCut, introRunning>>

Rerender ==
  /\ UNCHANGED <<playedCut, activeCut, introRunning>>

IntroStart ==
  /\ playedCut # activeCut
  /\ introRunning' = TRUE
  /\ playedCut' = playedCut
  /\ activeCut' = activeCut

IntroFinish ==
  /\ introRunning' = FALSE
  /\ playedCut' = activeCut
  /\ activeCut' = activeCut

Next ==
  \/ \E c \in Cuts : NewModel(c)
  \/ ViewSwitch
  \/ Rerender
  \/ IntroStart
  \/ IntroFinish

Spec == Init /\ [][Next]_<<playedCut, activeCut, introRunning>>

NoReplaySameCut == ~(introRunning /\ playedCut = activeCut)

====
