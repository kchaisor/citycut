# Feature: Solar Study

## What it does

Solar Study is one of the three analyses in the Analysis bar, beside Wind Rose and Viewshed Walk. It is off when a site is cut, and you turn it on and off from the bar. It shows where the sun is for a chosen date and time, casts live shadows on the 3D site, and draws the 3D sun dome. A Direct Sun Hours study colours the ground, roofs and walls by how many hours of direct sun each spot gets on the chosen day, with a Ladybug-style blue-to-yellow scale and a legend.

## What it looks like

Screens this touches: the 3D model (Perspective and Isometric), the Analysis bar at the bottom of the viewport, the Solar Study card in the right-hand column (since 23 Nov 2026), and the Drawing site plan (Direct Sun Hours colouring and legend only).

Sketch or screenshot:

Kelvin's reference shots from 19 Nov 2026: 40 Cleeland St, Dandenong, Perspective, Solar Study on, 3D Sun Dome on, Shadows on, 21 Jun 15:56. Shadows are almost invisible, trees are still green, and the time slider stops at sunrise and sunset.

### Kelvin's preferences (19 Nov 2026)

1. In Perspective and Isometric 3D, Solar Study shadows are clearly dark and legible on the ground and on buildings. Today they are too faint in the Primary studio view.
2. The Solar Study time slider runs from 6am to 8pm. The sunrise and sunset markers stay. Hours outside daylight are night, with no sun.
3. While Solar Study is on, the whole 3D scene is greyscale: trees, roads, terrain and buildings, with no green trees. Colour comes back when Solar Study is turned off or another analysis is picked. (Updated 21 Nov 2026: the Analysis bar being visible is not enough; only the Solar Study toggle greys the scene.) The exceptions that stay in colour are the Direct Sun Hours colouring (when it is on), the sun dome, the sun, and the on-screen controls.
4. A "Sun hours" pill sits next to "Shadows" and "Sun dome", in the same pill style, and starts off. It shows or hides the Direct Sun Hours colouring on the site, together with its legend. (Since 23 Nov 2026 these pills are on the Solar Study card, not in the Analysis bar; see item 7.)
5. Follow-up, 19 Nov 2026: after first accepting the earlier shadow darkness, Kelvin asked to try a version with clearly darker cast shadows: a strong, readable dark grey, not washed-out pale shadows and not a crushed-black or night-like scene.

### Kelvin's preferences (21 Nov 2026)

These replace the earlier idea that Solar Study is the default and is implied by "Site Analysis is open".

6. **Nothing is on at a new cut.** Solar Study, Wind Rose, Viewshed Walk, the 3D Sun Dome, Shadows, Sun hours and the 9–3pm Plan Fan all start off. Wind does not come back on just because it was on in an earlier visit.
7. **The Analysis bar is always there, and it is always one row** at the bottom of the 3D and Drawing views (not Satellite). (Rewritten 23 Nov 2026, Kelvin's GO at 11:45 AM AEDT on the round-3 analysis-card mocks; it used to require the full two-row Solar Study layout in the bar.) The bar holds the "Analysis" header, the Solar Study / Wind Rose / Viewshed Walk toggles, and the High / Fast quality switch at the right, and nothing else. There is no Analysis icon in the left tool rail; Display, Import and Export stay. Everything that used to sit in the bar's solar rows now lives on the **Solar Study card** in the right-hand column, which shows only while Solar Study is on: the ALT / AZ / DAYLIGHT readout, Shadows / Sun hours / Sun dome (and 9–3pm Plan Fan on the Drawing site plan), the three date presets, play, sunrise, the time slider, sunset, the time badge, the Sun dome size slider (item 22) and, when Sun hours is on, the Direct Sun Hours legend. When Solar Study is off the bar shows no muted solar controls. Wind Rose and Viewshed Walk have cards of their own (`docs/specs/wind-streaks.md`, `docs/specs/viewshed-card.md`).
8. **The three analyses are independent on/off toggles.** (Rewritten 23 Nov 2026, Kelvin's go at 9:40 AM AEDT; it used to say that clicking another analysis switches to it.) Clicking Solar Study, Wind Rose or Viewshed Walk turns that one on or off and leaves the other two as they are. All three can be on together, and all three can be off. The bar stays one row either way (updated 23 Nov 2026, 11:45 AM AEDT: it no longer adds a row per analysis). Each analysis that is on gets a card in the right-hand column, 328 px wide. When two or three are on, every card keeps its 48 px header, only the one turned on last starts open, and clicking a folded header opens it and folds the one that was open. Site Intelligence folds to its header while any analysis card is open. The wind ground-flow and the wind arrows only run while Wind Rose is on. See `docs/specs/wind-streaks.md`.
9. **The 3D Sun Dome belongs to Solar Study.** The dome, and its chip, only take effect while Solar Study is on. Turning Solar Study off hides the dome even if its chip was left on; turning Wind Rose or Viewshed Walk on beside it does not (updated 23 Nov 2026). The chip is labelled **Sun dome** on the Solar Study card (the card already says Solar Study), and it also shows in Drawing, with Shadows, Sun hours and the 9–3pm Plan Fan.
10. **Date buttons name the solstices:** "21 Jun · Winter solstice", "22 Sep · Equinox" and "22 Dec · Summer solstice". On the Solar Study card they are three compact two-line pills reading "21 Jun / Winter", "22 Sep / Equinox" and "22 Dec / Summer" (the full names are still what a screen reader hears), and the selected one is ink with white text (23 Nov 2026).
11. **Walk Ripple is removed** from the product.


### Kelvin's preferences (22 Nov 2026, Direct Sun Hours resolution)

Approved by Kelvin on 22 Nov 2026 (t81u): "Ok let's try this."

12. **The High / Fast switch also sets Direct Sun Hours resolution.** There is no second control; the same switch in the Analysis bar covers both. Because it is global it stays in the bar and does not move to the Solar Study card (confirmed 23 Nov 2026).
13. **Fast** is the current study: a 3 m grid and 15-minute time steps on ground, roofs and walls.
14. **High** is a 1 m grid and 5-minute time steps on ground, roofs and walls, limited to the cut and the buildings already in the sun-hours model.
15. **Big cuts ease the High grid.** If a cut is too big for a 1 m grid (more than about 250,000 ground cells, the size of a 0.5 km cut at 1 m), the grid eases to 1.5 m and then 2 m. The 5-minute step stays. A 0.5 km cut stays at 1 m; a 1 km cut runs at 2 m. Walls coarsen first if they would blow the wall budget, as they already do in Fast.
16. **The legend says what was used.** The legend footnote states the actual grid and time step of the result on screen, and says when the grid was eased from 1 m for the cut size.
17. **The wait is visible.** While the study is calculating, the legend in the Solar Study card (or the standalone sun-hours card) shows the same dark rounded loading pill as the landing-page "Processing site data & 3D geometry…" bar: yellow pulse dot, bold white "Calculating sun hours…", a slim yellow track, and a yellow mono readout (Kelvin, 1:43 PM and 2:17 PM AEDT, 23 Nov 2026). It sits in the legend, not as a floating pill over the 3D view, so it does not cover the model or collide with the top bar. If the worker reports how far it has got, the track fills and the readout is a percent; if not, the track is an indeterminate shimmer and the readout is GROUND or ROOFS. The grid and step being worked on stay as a short footnote under the pill. The pill hides when the study is done. Reduced motion stops the shimmer and uses a static yellow fill, or just the percent when the fraction is known. The previous result stays on screen until the new one is ready; before the first result, the legend shows only its title, the pill and the footnote. The study runs off the main thread, and a new date, model or quality cancels the old run.
18. **High / Fast still also sets 3D render quality** (ambient occlusion and SMAA), unchanged.
19. Results cannot be more accurate than the building heights and the terrain grid they sit on.
20. **High roofs and walls coarsen under a cap so building surfaces finish in a reasonable time.** In High, if roofs would need more than about 24,000 samples, the roof cell doubles from the High grid (up to 12 m) until they fit; walls do the same above about 52,000 samples. Every building keeps at least one roof sample. On dense or large cuts this makes High roof and wall cells coarser than the ground grid, and they can be coarser than Fast's. Fast is unchanged, and so are the High ground grid and the 5-minute step. (Added 22 Nov 2026, afternoon.)
21. **High ground now targets a 0.25 m grid.** Kelvin's yes, 22 Nov 2026 ("Yes, do both"). This replaces the High ground grid sizes in 14–16. High starts the ground at 0.25 m and eases up a ladder (0.25, 0.5, 1, 1.5, then 2 m) until the ground is at or under about 250,000 cells; the budget itself is unchanged. That keeps 0.25 m for cuts up to about 125 m a side and 0.5 m up to about 250 m; a 0.5 km cut still runs at 1 m and a 1 km cut at 2 m, because 0.25 m there would be 4 million and 16 million cells. The legend footnote shows the actual spacing used and says "Eased from 0.25 m grid" whenever the cut did not get 0.25 m. Roofs and walls still start no finer than 1 m, under the same caps as 20. Fast and the 5-minute step are unchanged.

### 3D Sun Dome look (Designbot review, 21 Nov 2026)

22. **Size and place.** The dome sits on the centre of the site cut. Its **auto** radius is 0.6 × the cut's half-diagonal, kept between 120 m and 350 m: a 1 km square gets 350 m, a 400 m square about 170 m, a 200 m square 120 m. (Rewritten 23 Nov 2026, Kelvin's GO at 11:45 AM AEDT; it used to say there is no radius slider.) A **Sun dome size** slider on the Solar Study card changes the radius: from 0.5 × the auto radius up to **2× the cut edge** (twice the half-diagonal of the cut), so the dome can expand well past the crop boundary (Kelvin, 1:35 PM AEDT, 23 Nov 2026; it used to stop at the cut edge). It starts on the auto size, which is marked with a tick on the track, and it snaps back to auto next to the tick. The radius is read out in metres and the 3D dome updates as the slider moves. Dragging the slider does not re-fit the camera. The slider is muted, with a short note, while the Sun dome is off, and it only shows in 3D. Rozelle A3 (about 1470 × 1040 m) is about 175–1800 m with 350 m as the default; a 0.5 km square is about 106–707 m with 212 m as the default. The right end of the slider is labelled **2× cut**, and the note under it also shows the maximum in metres. This is a new setting: it does not use the old `?heliodon=` radius factor, which is left as it was for the Drawing diagram. The chosen size is kept while the model is open and is not saved. When the wind arrows are on, their fans follow this radius (see `docs/specs/wind-streaks.md`, preference 14).
23. **Camera.** When the dome turns on, the camera eases (250 ms) so the dome itself (its radius and height, not the whole cut) fits in the part of the view that is not covered by the on-screen panels, with 16 px to spare. Reduced motion jumps straight there. Any drag stops the ease. Changing the Sun dome size does not start this ease (23 Nov 2026).
24. **Lines and labels stay the same size on screen** at every zoom. Lines are fixed-pixel and labels are a constant screen size.
25. **Three line styles only.** The selected date's sun path is solid 2 px `--ink`. The other key dates are 1 px `--ink-3`: 21 Jun dashed 6/4, 22 Dec dotted 2/3, the equinox dashed 2/4. Hour lines are 0.75 px `--ink` at 35%. When the selected date is a key date, it is drawn once, in the selected style.
26. **Hour labels** are only on the selected date's path, and only 09h, 12h and 15h, in Geist Mono 11/600 with tabular figures, 6 px outside the path, with a 2 px background-coloured halo.
27. **Date labels** read "21 Jun" and "22 Dec" (and the selected date, day first), in Geist 11/500 `--ink-2` with a halo, at the sunset end of their path. The equinox has no label on the dome.
28. **Horizon ring** is 1 px `--ink` at 25%, with 4 px ticks every 10°, and labels every 30° in 10/700 plus N / E / S / W in 20/700 caps (twice the bearing numbers; Kelvin, 22 Nov 2026).
29. **The sun is the only accent:** a 14 px `--accent` dot (was 10 px, about 1.4×) with a 1 px `--ink` edge and a 1 px `--ink` dashed 4/3 line from the sun to the dome centre, not a vertical drop to the ground. No yellow lines and no rayed sun icon. (Kelvin, 22 Nov 2026.)
30. **No inline dome key.** The 21 Jun / 22 Dec / Equinox / Hours / Sun legend that sat beside the dome chip is removed and is not moved elsewhere, including onto the Solar Study card. The High / Fast quality switch stays at the right of the one-row Analysis bar. (Kelvin, 22 Nov 2026; updated 23 Nov 2026.)
31. The dome still belongs to Solar Study (item 9): it is hidden whenever Solar Study is off, whatever else is on.

### Kelvin's preferences (22 Nov 2026, 11:55 PM AEDT)

These replace item 3. Solar Study no longer greys the 3D scene. (Items 12–21 are Direct Sun Hours resolution; items 22–31 are the 3D sun-dome look.)

32. **Clicking Solar Study turns Shadows and the 3D Sun Dome on together**, every time it is turned on, including when Wind Rose or Viewshed Walk is already on. You can still turn either one off while Solar Study stays on; clicking Solar Study off and on again turns both back on. Sun hours is left as you set it. A new cut still starts with everything off (item 6): only the click turns them on.
33. **Solar Study no longer changes the 3D massing colours.** Turning it on or off leaves the View Style as it is. The black-and-white look is now a View Style option, "B&W", in the left drawer next to Primary / Use / Source / Card. It is one choice out of the five and works with or without an analysis on. In B&W the same things stay in colour as before: the Direct Sun Hours colouring (when it is on), the sun dome, the sun, and the on-screen controls. A new cut still opens in Primary, in colour. The Drawing View Style is unchanged (Use / Source / Uniform).
34. **The Section Knife is removed** from the left drawer and the live UI, to be reworked later. Its "Tools" section, the 3D cutting plane, the section panel and the plan markers no longer appear. The implementation is kept in the repo so it can be restored.

### Designbot polish (Kelvin's yes, 23 Nov 2026, 12:55 AM AEDT)

35. **In B&W the Scene Layers swatches go grey too.** While the 3D View Style is B&W, every swatch in the 3D Scene Layers list shows the grey that layer has in the 3D scene (trees stay a mid-grey; water is the flat light grey from item 36). The real colours are kept: picking a colour still changes the real colour, nothing grey is saved, and leaving B&W brings the real swatches back. One line of helper text, "Colours off in B&W", sits directly under the View Style segment while B&W is selected and goes away for any other View Style. Drawing swatches and the Drawing View Style are unchanged.
36. **In B&W, 3D water is a flat light grey, `#D6D6D2`, with no shading.** It does not pick up light, shade or shadows. Trees keep their mid-grey and are not retinted. Leaving B&W brings back the real water colour and its normal shading.
37. **The View Style segment is 32 high, with Geist 11 / 500 labels and 8 px of padding on each side of every segment**, still on one row in the same 222 px track. All five full labels do not fit at that size, so "Source" is shortened to **Src** (screen readers still hear "Source"); B&W keeps its name. The Analysis bar and its yellow selected states are not changed.
38. **The Scene Layers header stays on one row**, in 3D and in Drawing: "SCENE LAYERS" on the left, the live "14 visible" count next to it in the quiet ink colour, and a quiet text **Reset** on the right (it still resets the colours, and is still announced as "Reset colours").


### Analysis cards (Kelvin's GO, 23 Nov 2026, 11:45 AM AEDT)

Kelvin said GO on the round-3 mocks (`mock-solar-1440.png`, `mock-wind-1440.png`, `mock-viewshed-1440.png`, `mock-all-1440.png`) at 11:45 AM AEDT, 23 Nov 2026. At 11:48 AM he added that the wind-streak fans should follow the sun dome radius without the arrows growing; that is recorded in `docs/specs/wind-streaks.md`.

39. **The Solar Study card.** Items 4, 7 to 10, 22 and 30 above describe it. It sits in the right-hand column under Site Intelligence, 328 px wide (the column was 304), in the same card style as the Wind Rose card: a 48 px header reading "Solar Study" with the live date and time, a left-aligned label column for ALT / AZ / Daylight, equal-width single-line buttons, and the time badge on the left under the slider.
40. **Sun hours left on.** If Sun hours is left on and Solar Study is then turned off, the colouring stays (as before) and its legend shows as a small card of its own until Solar Study is on again. While the Solar Study card is up, the legend is only ever inside it.

## How we'll know it works

Open 40 Cleeland St, Dandenong (`?lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1`), turn Solar Study on in the Analysis bar, pick 21 Jun · Winter on the Solar Study card around 15:00, Perspective, Shadows on.

- [ ] In the Perspective view with Shadows on, in Primary and in B&W, shadows on the ground and on buildings are a strong, readable dark grey, with detail still visible in the shade and sunlit roofs and walls staying light, without the scene going muddy or black.
- [ ] Turning Solar Study on or off keeps the current View Style colours: trees stay green in Primary, and Use / Source / Card look the same as before the click.
- [ ] Choosing B&W in the left drawer's View Style greys the 3D scene (trees, roads, terrain and buildings), with Solar Study on or off. Choosing Primary (or Use / Source / Card) brings the colour back, including while Solar Study is on.
- [ ] With B&W selected at Southbank (`?lat=-37.8216&lon=144.9645&km=0.5`), every 3D Scene Layers swatch is grey (Trees a mid-grey, Water `#D6D6D2`), and "Colours off in B&W" shows on one line directly under the View Style segment. Choosing Primary, Use, Src or Card removes the line and brings the real swatch colours back, including a colour picked while in B&W.
- [ ] In B&W the river is one flat `#D6D6D2` grey with no light or shadow variation across it, and trees are a darker mid-grey; back in Primary the water is blue and shaded again.
- [ ] The View Style segment is 32 high with 11 / 500 labels and 8 px padding each side, reads Primary / Use / Src / Card / B&W on one row in the 222 px track, and nothing wraps or clips.
- [ ] The Scene Layers header is one row in 3D and in Drawing: SCENE LAYERS, "14 visible", then a quiet text Reset at the right, with no wrap or clipping at the 222 px inner width. Reset still restores the default colours.
- [ ] With Shadows and the Sun dome off, clicking Solar Study turns both on; so does turning it on while Wind Rose or Viewshed Walk is on. Sun hours does not change.
- [ ] The left drawer has no Section Knife and no "Tools" section, and nothing of the Section Knife shows in 3D or in Drawing.
- [ ] When the model first opens, the 3D scene is in colour, not grey, and the Analysis bar is one row: an "Analysis" header, Solar Study / Wind Rose / Viewshed Walk all off, and the High / Fast quality switch at the right. It has no ALT / AZ / DAYLIGHT readout, no Shadows / Sun hours / Sun dome, no date presets and no time slider, and there is no analysis card on the right.
- [ ] A new cut has no wind streaks, no sun dome, no shadows, no Sun hours and no Plan Fan, even after a visit that left wind on.
- [ ] The left tool rail has no Analysis icon.
- [ ] Clicking Solar Study opens the Solar Study card on the right (328 px wide) with the readout, Shadows / Sun hours / Sun dome, the three date pills, the time slider and the Sun dome size slider, and folds Site Intelligence to its header. Clicking it again removes the card and unfolds Site Intelligence. The bar stays one row throughout.
- [ ] With Solar Study and the Sun dome on, clicking Wind Rose keeps Solar Study, the shadows and the dome, opens the Wind Rose card, folds the Solar Study card to its header, and starts the wind ground-flow and the wind arrows. Clicking the Solar Study header opens it again and folds Wind Rose. Turning Wind Rose off stops the wind and leaves Solar Study on. Turning both off leaves the one-row bar and no cards.
- [ ] In Drawing with Solar Study on, the Solar Study card shows Sun dome with Shadows, Sun hours and 9–3pm Plan Fan, each on one line.
- [ ] The date pills read "21 Jun / Winter", "22 Sep / Equinox" and "22 Dec / Summer", and the selected one is ink with white text.
- [ ] There is no Walk Ripple anywhere.
- [ ] On a 1 km cut the 3D Sun Dome starts 350 m across the radius and centred on the cut; turning it on eases the camera so the dome clears the panels.
- [ ] At Southbank 0.5 km the Sun dome size slider reads 212 m with a tick at that point, runs from 106 m to 707 m (2× the cut edge), and the dome grows and shrinks as it is dragged — including past the crop — while the camera stays where it is. With the Sun dome chip off, the slider is muted and a note says to turn the dome on.
- [ ] Zooming in and out keeps the dome lines and labels the same size on screen.
- [ ] With 22 Dec picked, its path is the only solid line; 21 Jun is dashed, the equinox is finely dashed, and the hour lines are faint. Only 09h, 12h and 15h are labelled, and only on 22 Dec. The paths are labelled "21 Jun" and "22 Dec" at their sunset ends.
- [ ] The only yellow on the dome is the sun dot, which is 14 px with an ink edge, and a dashed ink line runs from the sun to the dome centre. N / E / S / W are twice the size of the other bearing labels.
- [ ] There is no dome key in the Analysis bar or on the Solar Study card. High / Fast stays at the right of the bar, and the bar is one row at 1440×900 and 1280×800.
- [ ] The time slider runs 06 to 20, with the sunrise and sunset times still shown; dragging before sunrise or after sunset shows a night scene with no sun.
- [ ] The Sun hours pill on the Solar Study card is off when Solar Study is first turned on, and turning it on colours the site and shows the Direct Sun Hours legend inside the Solar Study card, not in a card of its own.
- [ ] In 3D with Sun hours on, the ground colour and the gaps under buildings line up with the 3D building footprints, at Dandenong and at Pyrmont (`?lat=-33.86627&lon=151.18389&km=1.5`). Before the fix, the ground colour on terrain was flipped north–south.
- [ ] Every roof is fully coloured, with no bare white patches on large roofs. Before the fix, the roof colour sat just under the roof, so large roofs showed through.
- [ ] With Sun hours on, the legend footnote reads "3 m grid · 15 min steps" on Fast and "1 m grid · 5 min steps" on High for a 0.5 km cut; on a 1 km cut, High reads "2 m grid · 5 min steps". Both say the grid was eased from 0.25 m for this cut size (updated 22 Nov 2026, see 21). Switching High / Fast shows the landing-style loading pill in the Direct Sun Hours legend ("Calculating sun hours…", yellow track, percent or GROUND/ROOFS) until the new result is ready, the pill hides when the result is ready, the page stays responsive, and 3D ambient occlusion and SMAA still follow the switch.

## Out of scope

- No new solar standards or changes to the Victorian shadow-standard hours.
- No change to wind analysis.
- No merge without Kelvin's go.

## Estimated runs

- 2–3
