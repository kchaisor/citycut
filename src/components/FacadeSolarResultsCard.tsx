import type { FacadeAssessSummary } from "../lib/facadeSolarTypes";

export function FacadeSolarResultsCard({ summary, pending }: { summary: FacadeAssessSummary | null; pending: boolean }) {
  if (!summary && !pending) return null;
  return (
    <section className="facade-solar-results hud-card" data-facade-solar-results-dock>
      <header className="facade-solar-results-head">
        <span className="facade-solar-results-title">{summary?.ruleLabel ?? "Facade solar"}</span>
        {summary && (
          <span
            className={summary.pass ? "facade-solar-pass" : "facade-solar-fail"}
            data-facade-solar-pass={summary.pass ? "true" : "false"}
          >
            {summary.pass ? "Pass" : "Fail"}
          </span>
        )}
      </header>
      {pending && !summary ? <p className="field-note">Computing facade hours…</p> : null}
      {summary ? (
        <>
          <p className="facade-solar-proxy" data-facade-solar-proxy-note>
            {summary.proxyNote}
          </p>
          <dl className="facade-solar-metrics mono" data-facade-solar-metrics>
            <div>
              <dt>Units (proxy)</dt>
              <dd>{summary.unitCount}</dd>
            </div>
            <div>
              <dt>≥ {summary.thresholdHours} h</dt>
              <dd data-facade-pct-at-threshold>{summary.pctAtThreshold.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>None (0 h)</dt>
              <dd data-facade-pct-none>{summary.pctNone.toFixed(1)}%</dd>
            </div>
          </dl>
          <p className="field-note">{summary.statusNote}</p>
        </>
      ) : null}
    </section>
  );
}
