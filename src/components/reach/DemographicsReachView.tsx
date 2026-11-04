import { useReachExplorer } from "../../lib/reach/useReachExplorer";
import type { DemographicsExplorerLens } from "../../lib/reach/constants";
import { DemographicsPeoplePlaceholder } from "./DemographicsPeoplePlaceholder";
import { ReachMapExplorer } from "./ReachMapExplorer";
import { ReachPanel } from "./ReachPanel";

export function DemographicsReachView({
  lens,
  onLens,
  defaultLat,
  defaultLng,
}: {
  lens: DemographicsExplorerLens;
  onLens: (lens: DemographicsExplorerLens) => void;
  defaultLat: number;
  defaultLng: number;
}) {
  const reach = useReachExplorer(defaultLat, defaultLng);

  if (lens === "people") {
    return (
      <div className="reach-explorer-layout is-people-only">
        <DemographicsPeoplePlaceholder lens={lens} onLens={onLens} />
      </div>
    );
  }

  return (
    <div className="reach-explorer-layout" data-reach-active="true">
      <div className="reach-explorer-map">
        {reach.dataset && reach.times ? (
          <ReachMapExplorer
            dataset={reach.dataset}
            times={reach.times}
            budgetMin={reach.state.budgetMin}
            onBudget={(value) => reach.dispatch({ type: "set_budget", budgetMin: value })}
            period={reach.state.period}
            onPeriod={(period) => reach.dispatch({ type: "set_period", period })}
            originCellIndex={reach.state.originCellIndex}
            onPickCell={(cellIndex) => reach.dispatch({ type: "set_origin", cellIndex })}
            placingOrigin={reach.state.placingOrigin}
          />
        ) : (
          <p className="reach-status">{reach.error ?? "Loading reach tiles…"}</p>
        )}
      </div>
      <aside className="reach-explorer-panel hud-card">
        <ReachPanel
          lens={lens}
          onLens={onLens}
          budgetMin={reach.state.budgetMin}
          stats={reach.stats}
          series={reach.series}
          manifest={reach.dataset?.manifest ?? null}
          loading={reach.status === "loading"}
          error={reach.error}
        />
      </aside>
    </div>
  );
}
