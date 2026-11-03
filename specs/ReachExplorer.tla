---- MODULE ReachExplorer ----
EXTENDS Naturals

VARIABLES lens, origin, budget, period, placing

ReachLens == {"people", "reach"}
ReachPeriod == {"weekday_am", "midday", "weekend"}

TypeOK ==
  /\ lens \in ReachLens
  /\ origin \in Nat \cup {-1}
  /\ budget \in 5..30
  /\ period \in ReachPeriod
  /\ placing \in BOOLEAN

Init ==
  /\ lens = "reach"
  /\ origin = -1
  /\ budget = 15
  /\ period = "weekday_am"
  /\ placing = TRUE
  /\ TypeOK

PickOrigin(o) ==
  /\ placing = TRUE
  /\ origin' = o
  /\ placing' = FALSE
  /\ UNCHANGED <<lens, budget, period>>

SetBudget(b) ==
  /\ b \in 5..30
  /\ budget' = b
  /\ UNCHANGED <<lens, origin, period, placing>>

SetPeriod(p) ==
  /\ p \in ReachPeriod
  /\ period' = p
  /\ UNCHANGED <<lens, origin, budget, placing>>

SetLens(l) ==
  /\ l \in ReachLens
  /\ lens' = l
  /\ UNCHANGED <<origin, budget, period, placing>>

BudgetInvariant == budget \in 5..30

OriginPickedInvariant == (origin # -1) => ~placing

Next ==
  \/ \E o \in 0..5000 : PickOrigin(o)
  \/ \E b \in 5..30 : SetBudget(b)
  \/ \E p \in ReachPeriod : SetPeriod(p)
  \/ \E l \in ReachLens : SetLens(l)

Spec == Init /\ [][Next]_<<lens, origin, budget, period, placing>>

THEOREM Spec => []TypeOK
====
