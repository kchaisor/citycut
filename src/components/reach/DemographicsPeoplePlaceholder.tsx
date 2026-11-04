import type { DemographicsExplorerLens } from "../../lib/reach/constants";

export function DemographicsPeoplePlaceholder({
  lens,
  onLens,
}: {
  lens: DemographicsExplorerLens;
  onLens: (lens: DemographicsExplorerLens) => void;
}) {
  return (
    <div className="reach-people-placeholder" data-reach-people-shell="true">
      <div className="reach-panel-head">
        <div>
          <h2 className="reach-panel-title">People in the cut</h2>
          <p className="reach-panel-sub">ABS SA1 demographics ship in the sibling People explorer PR.</p>
        </div>
        <div className="reach-lens-toggle" role="group" aria-label="Demographics lens">
          <button
            type="button"
            className={lens === "people" ? "reach-lens-btn is-active" : "reach-lens-btn"}
            aria-pressed={lens === "people"}
            onClick={() => onLens("people")}
          >
            People
          </button>
          <button
            type="button"
            className={lens === "reach" ? "reach-lens-btn is-active" : "reach-lens-btn"}
            aria-pressed={lens === "reach"}
            onClick={() => onLens("reach")}
          >
            Reach
          </button>
        </div>
      </div>
      <p className="reach-status">Switch to Reach for the isochrone map, or merge the People branch for census shading.</p>
    </div>
  );
}
