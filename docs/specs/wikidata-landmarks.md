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

## How we'll know it works

Observable checks (tick these on the real desktop view, not implementation details):

- [ ] Cutting Southbank shows Eureka Tower and Australia 108 with their names, cited heights and Wikipedia links in the popover.
- [ ] Model details lists Wikidata with a match count, and shows a clear note when the source fails.
- [ ] A suburban cut with no landmarks shows "0 landmarks", not an error.
- [ ] Turning the labels toggle on and off changes 3D and Drawing, and exports match what is shown.
- [ ] The existing `landmark-heights.json` towers all match their Wikidata items, checked by a new test.
- [ ] typecheck, test, build and verify:ui all pass, with desktop screenshots attached.

## Out of scope

- Using Wikidata heights to drive the model.
- Heritage compliance. The Victorian Heritage Database and the NSW State Heritage Register are the authoritative sources and are a separate feature.
- Photos from Wikimedia Commons.

## Estimated runs

- PR 1: bake script and test (pipeline only).
- PR 2: runtime loader, matching, sources-list entry.
- PR 3: popover block and label toggle (UI, with screenshots).
