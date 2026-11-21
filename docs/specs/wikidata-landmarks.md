# Feature: Wikidata landmark facts

## What it does

When a cut contains notable buildings, CityCut shows their name, year built, architect, style, heritage status, cited height and a Wikipedia link. The details appear in the building popover and as labels, and Wikidata is listed as a source in Model details.

## What it looks like

Screens this touches:

- **Building popover:** a "Landmark" block under the height row, shown only when the building has a Wikidata match.
- **Model details sources list:** a "Wikidata" row with its status and match count (for example "Wikidata: 14 landmarks matched").
- **3D and Drawing views:** an optional "Landmark labels" toggle on the Buildings panel.

Sketch or screenshot:

<!-- drop a sketch or screenshot here -->

### How it works

1. **Bake (scheduled job).** Add a job to the building enrichment workflow (`building-enrichment-weekly.yml`), using the same pattern as `build-trees`. It queries query.wikidata.org with SPARQL for items in the Greater Melbourne bounding box (later Greater Sydney) that have coordinates (P625) and are buildings or structures. It collects:
   - height (P2048), floors above ground (P1101)
   - inception (P571) or opening date (P1619)
   - architect (P84), architectural style (P149), heritage designation (P1435)
   - English label and English Wikipedia sitelink
2. **Match to footprints.** First match on an OpenStreetMap `wikidata` tag carried through Overture sources, where present. Otherwise test whether the Wikidata point falls inside a footprint (`pointInPolygon` already exists). Points that fall inside several footprints or none are dropped and logged; nothing is guessed.
3. **Publish.** Write the results to a small `wikidata-landmarks.json` (or PMTiles if it gets large) with a manifest recording the query date and item count. Publish it as a release asset and have the Pages build copy it in, like trees.
4. **Runtime.** Load the baked file and clip it to the cut. Outside the baked area, try a live bounding-box query (`wikibase:box`) with an 8-second timeout. If that fails, show "Wikidata: not available for this area" and never invent data.
5. **Heights.** Wikidata height is shown as "cited" only. It does not override LiDAR or OSM heights. Where both exist and differ by more than 10%, flag it in the existing height-outlier review script.
6. **Attribution.** Wikidata is CC0. Credit "Wikidata" in the sources list anyway, matching house style.

### PR 2 notes (21 Nov 2026)

- Railway stations (Q55488) are fetched too, so stations like Flinders Street come through (Kelvin's go, 20 Nov 2026). They come from a second, separate query over the whole area. On 21 Nov a single query covering both classes made the busiest CBD cell hit Wikidata's rate limit (HTTP 429), so the building query stays exactly as in PR 1. The live fallback runs the same two queries for the cut. A second run on 21 Nov showed the CBD cell sits at Wikidata's 60-second limit even with the PR 1 query: Wikidata cut the answer off mid-stream (unreadable JSON). The bake now treats a cut-off answer like a timeout and splits the cell into quarters, and waits 60 s after any split so the next query stays inside Wikidata's query-time allowance instead of getting HTTP 429.
- Matching is by point in footprint only for now. Overture does not carry the OpenStreetMap `wikidata` tag through to CityCut's buildings, so the tag match in step 2 is not used yet.
- Several Wikidata items can sit on one building (Eureka Tower and Eureka Skydeck, for example). PR 2 keeps them all; PR 3 decides which one the popover shows.
- Of the 23 towers in `landmark-heights.json`, 18 have a Wikidata item and 5 do not (Prima Pearl, 405 Bourke Street, 35 Spring Street, Ernst & Young Plaza, HWT Tower). Crown Towers' Wikidata point is about 135 m from the tower, so it will not match its footprint. A test pins all of this.
- The sources list is visually hidden in the current Model details; the Wikidata row shows in its count ("Ready · N/M sources") and to screen readers until the list is shown again.

## How we'll know it works

Observable checks (tick these on the real desktop view, not implementation details):

- [ ] Cutting Southbank shows Eureka Tower and Australia 108 with their names, cited heights and Wikipedia links in the popover.
- [ ] Model details lists Wikidata with a match count, and shows a clear note when the source fails.
- [ ] A suburban cut with no landmarks shows "0 landmarks", not an error.
- [ ] Turning the labels toggle on and off changes 3D and Drawing, and exports match what is shown.
- [ ] The existing `landmark-heights.json` towers that have a Wikidata item (18 of 23) are found, and the 5 without one and Crown Towers' off-tower point are listed, checked by a new test.
- [ ] typecheck, test, build and verify:ui all pass, with desktop screenshots attached.

## Out of scope

- Using Wikidata heights to drive the model.
- Heritage compliance. The Victorian Heritage Database and the NSW State Heritage Register are the authoritative sources and are a separate feature.
- Photos from Wikimedia Commons.

## Estimated runs

- PR 1: bake script and test (pipeline only).
- PR 2: runtime loader, matching, sources-list entry.
- PR 3: popover block and label toggle (UI, with screenshots).
