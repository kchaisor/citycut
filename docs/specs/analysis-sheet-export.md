# Feature: Export every variation of a study as A3 sheets

## What it does

The Solar Study card and the Wind Rose card on the right each get an **Export** button. One click exports a set of A3 sheets, one per variation of that study, as a zip. For Solar it exports the sun hours at the winter solstice (21 Jun), the equinox (22 Sep) and the summer solstice (22 Dec). For Wind it exports each season. Every sheet uses one A3 template, the same layout as today's A3 wind sheet. Nothing has to be saved in Views first (Kelvin, 28 Nov 2026).

## What it looks like

Screens this touches:

- **Solar Study card (right):** an Export button at the foot of the card. It opens a small menu with High quality, Transparent background and "Export 3 sheets".
- **Wind Rose card (right):** the same button and menu, with "Export 5 sheets".
- **A3 sheet:** the existing A3 wind sheet layout (map left; right column with site name, title, key figures, legend, north arrow, scale bar and source notes) becomes a shared template:
  - **Solar sheet:**
    - **Map:** the view as it is on screen, with sun hours on.
    - **Title:** "Winter solstice · 21 Jun".
    - **Key figures:** the window (Whole day or 9am–3pm) and the sun altitude at noon.
    - **Legend:** the Direct Sun Hours scale.
    - **Notes:** the source.
  - **Wind sheet:** exactly as today, but for each season in turn.
- **Views panel:** keeps saving and restoring camera views. Its own PNG export stays for now (see Open questions).

Sketch or screenshot:

<!-- drop a sketch or screenshot here -->

### How it works

1. The export keeps the camera and the on-screen choices (Plan or 3D, Wind speed or Comfort, Whole day or 9am–3pm, Colour only selected) and steps through the variations:
   - Solar: 21 Jun, 22 Sep and 22 Dec.
   - Wind: Annual, Summer, Autumn, Winter and Spring, all day.
2. For each variation it waits for the study to finish calculating before it captures, as the Views export does today. Sun hours and Comfort can each take a while on a slow machine. The button shows progress ("2 of 3") and can be cancelled.
3. Each capture is composed into the A3 template, at 150 dpi, or 300 dpi with High quality. Transparent background leaves the page unfilled.
4. One sheet downloads as a PNG; several download as a zip named after the site and study. The screen is put back as it was afterwards.
5. If a variation fails (no wind records for a season, for example), its sheet is skipped and the card says which one. Nothing is invented.

## How we'll know it works

Observable checks (tick these on the real desktop view, not implementation details):

- [ ] With Solar Study and Sun hours on, Export on the Solar Study card downloads a zip of 3 A3 PNGs: winter solstice, equinox and summer solstice. Each sheet has its own sun hours colours, title and legend, and the screen is unchanged afterwards.
- [ ] With Wind Rose on in Plan, Export on the Wind Rose card downloads 5 A3 PNGs, one per season, each matching that season on screen.
- [ ] High quality gives 4961 × 3508 px sheets, and Transparent background gives sheets with no page fill. Each works on its own.
- [ ] Cancelling stops after the current sheet and puts the screen back.
- [ ] The solar and wind sheets share one layout: same margins, type sizes, north arrow and scale bar.
- [ ] typecheck, test, build and verify:ui pass, with desktop screenshots of one solar and one wind sheet.

## Open questions for Kelvin

1. **Wind variations:** 5 seasons, all day? Or seasons × Morning / Afternoon (15 sheets)? Or the 3 design winds (NE, S, W)?
2. **Wind map:** export only the map on screen (Wind speed or Comfort), or both for every season? Comfort is slow to compute.
3. **Solar view:** export the view on screen (3D or Plan) for each date? Or always Plan for the sun hours map plus one 3D view?
4. **Views panel:** keep its PNG export, or remove it now that the cards export?

## Out of scope

- PDF or `.ai` sheets. PNG only for now.
- Viewshed Walk and Walk Ripple exports.
- Shadow-only studies (9am / 12pm / 3pm shadow diagrams) for now. They could be a later Solar variation set.

## Estimated runs

- PR 1: the shared A3 template, plus Solar export on the Solar Study card (about 4–5 runs).
- PR 2: Wind export on the Wind Rose card, using the template (about 2–3 runs).
