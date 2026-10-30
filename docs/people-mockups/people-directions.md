# CityCut · People tab: 4 interactive directions (mock-ups only)

These are mock-ups only. PR #174 and the repo were not touched. Every figure comes from ABS Census 2021 in the PR's `/tmp/people/public/census/` files: `index.json` plus SA2 files 206041503 (Melbourne CBD - East), 206041119 (East Melbourne) and their SA1 geometry. Rendered at 1440×900. Sources are in /workspace/pp/ (d1–d4.html, rebuild with build.py + shot.js).

## 1 · Living City (`people-direction-1.png`)
- **Pitch:** the model *is* the chart. SA1s extrude by the metric you pick, and residents appear as dots on their block.
- **Interactions:** an age-band scrubber morphs block heights (25–34 shown, 36% vs 16% Greater Melb.). Click a block for an in-model callout (SA1 20604150321: 617 people, 49% aged 25–34, $1,382/wk). Toggle travel-to-work modes and the dots re-route. Press ▶ and non-WFH dots walk to work (WFH 41%, walk/cycle 21%, PT 20%, car 11%).
- **Why it beats competitors:** Archistar, Giraffe, PlaceMaker and .id stop at flat choropleths. This puts people inside the 3D massing, so it is CityCut's signature move.
- **Effort:** L (three.js extrusion + tweening + instanced dot animation).
- **Data:** all of it is in the existing files. Dot positions inside an SA1 are illustrative, and street routing would need the roads layer CityCut already has.

## 2 · Meet your neighbours (`people-direction-2.png`)
- **Pitch:** "If CBD East were 100 people…" A swipeable card deck builds a 100-person grid as you go.
- **Interactions:** swipe or arrow keys move through cards (age bands, household, tenure, car, commute). "↑ Show on model" lights up the matching SA1s. A "Guess before you flip" quiz asks things like WFH share (real figure 41%, vs 33% Greater Melb.) and keeps a streak.
- **Why it beats competitors:** it's fun, easy to share, and works as a client-pitch story where .id gives you tables. It also turns ratios into people.
- **Effort:** S–M.
- **Data:** all of it is in the existing files. Card facts other than age are SA2-wide; the page says so. Names and avatars, if added, are illustrative.

## 3 · Site vs Site (`people-direction-3.png`)
- **Pitch:** a split-screen duel of two cuts on the same questions and the same scale.
- **Interactions:** mirrored age pyramid, where hovering a row highlights both models. Tug-of-war bars show rent 70/53, no car 66/19, PT 20/6. A "biggest gap" headline is auto-picked (over-65s 22% vs 6%). There's a "Higher or lower?" mini-game, a draggable divider, and you can drop in a 3rd site.
- **Why it beats competitors:** feasibility work is always comparative, and competitors make you open two tabs.
- **Effort:** M (needs two cuts loaded at once).
- **Data:** all of it is in the existing files (any two SA2s).

## 4 · People lens (`people-direction-4.png`)
- **Pitch:** click-to-query instead of panel charts. Drag a lens over the plan or model and everything under it is summed live.
- **Interactions:** drag the lens, change its radius (100/200/400 m or a 5-minute walk), and switch the colour-by. Dots are drawn at 1 dot ≈ 10 people. Pin lenses to compare them (live lens 1,379 people vs Pin A 465). A drag-trail sparkline shows how the count changes as you move.
- **Why it beats competitors:** you ask the question about a custom catchment, not an ABS boundary. That's what developers actually ask, and nobody else does it.
- **Effort:** M.
- **Data:** all of it is in the existing files. SA1s are counted by centroid; area-weighting would be more accurate. Medians can't be summed, so the lens shows shares.

## Recommendation
Build **4 (Lens) on top of 1 (Living City)** as the core of the People tab. The lens is the everyday query tool. The extruding blocks and walking dots are the wow moment and make CityCut stand apart. Do **2 (Neighbours deck)** first as the quick win (S–M). It covers "fun" cheaply, and its "Show on model" hook already plugs into 1. Keep **3 (Compare)** for a later Compare mode across the whole app, not just People.
