"use client";
import { useCallback, useState } from "react";
import { Download } from "lucide-react";
import { usePortalQuery } from "@/hooks/use-portal-query";
import { getWorkspaceAnalytics } from "@/services/workspace-service";
import { PortalEmpty, PortalSkeleton } from "./portal-ui";
export function AnalyticsChart({ full = false }: { full?: boolean }) {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<
    "requests" | "donations" | "stockChange"
  >("requests");
  const [hover, setHover] = useState<number | null>(null);
  const loader = useCallback(() => getWorkspaceAnalytics(days), [days]);
  const query = usePortalQuery(loader, 30000);
  const data = query.data || [];
  const max = Math.max(1, ...data.map((d) => Math.abs(d[metric])));
  const totals = data.reduce(
    (r, d) => ({
      requests: r.requests + d.requests,
      donations: r.donations + d.donations,
      stock: r.stock + d.stockChange,
    }),
    { requests: 0, donations: 0, stock: 0 },
  );
  function download() {
    const csv = [
      "Date,Requests,Fulfilled,Pending,Cancelled,Donations,Stock change",
      ...data.map((d) =>
        [
          d.date,
          d.requests,
          d.fulfilled,
          d.pending,
          d.cancelled,
          d.donations,
          d.stockChange,
        ].join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `fluid-analytics-${days}-days.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div>
      <div className="portal-chart-toolbar">
        <label>
          Period
          <select
            aria-label="Analytics period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        {full && (
          <>
            <label>
              Measure
              <select
                aria-label="Analytics measure"
                value={metric}
                onChange={(e) => setMetric(e.target.value as typeof metric)}
              >
                <option value="requests">Requests</option>
                <option value="donations">Recorded donations</option>
                <option value="stockChange">Stock changes</option>
              </select>
            </label>
            <button
              className="portal-button portal-button--secondary"
              onClick={download}
              disabled={!data.length}
            >
              <Download size={15} />
              Export CSV
            </button>
          </>
        )}
      </div>
      {query.loading ? (
        <PortalSkeleton />
      ) : query.error ? (
        <PortalEmpty title="Analytics unavailable" description={query.error} />
      ) : !data.some((d) => d.requests || d.donations || d.stockChange) ? (
        <PortalEmpty
          title="No activity in this period"
          description="Request, donation, and stock records will appear as your team uses the workspace."
        />
      ) : (
        <>
          <div
            className="portal-chart"
            role="group"
            aria-label={`${metric === "requests" ? "Requests created, with current outcomes" : metric === "donations" ? "Completed donations" : "Stock changes"} over the last ${days} days`}
          >
            <div className="portal-chart-axis">
              <span>{max}</span>
              <span>{Math.round(max / 2)}</span>
              <span>0</span>
            </div>
            <div className="portal-chart-bars">
              {data.map((d, index) => (
                <button
                  key={d.date}
                  className={hover === index ? "is-hovered" : ""}
                  aria-label={`${d.date}: ${d[metric]} ${metric}`}
                  onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  style={{
                    height: `${Math.max(2, (Math.abs(d[metric]) / max) * 100)}%`,
                  }}
                >
                  {metric === "requests" ? (
                    <>
                      <i
                        style={{
                          height: `${d.requests ? (d.fulfilled / d.requests) * 100 : 0}%`,
                        }}
                      />
                      <i
                        style={{
                          height: `${d.requests ? (d.pending / d.requests) * 100 : 0}%`,
                        }}
                      />
                      <i
                        style={{
                          height: `${d.requests ? (d.cancelled / d.requests) * 100 : 0}%`,
                        }}
                      />
                    </>
                  ) : (
                    <i />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="portal-chart-dates">
            <span>{data[0]?.date}</span>
            <span>{data[data.length - 1]?.date}</span>
          </div>
          <p className="portal-chart-tooltip" role="status">
            {hover !== null
              ? `${data[hover].date}: ${data[hover][metric]} ${metric === "stockChange" ? "net stock change" : metric}`
              : "Focus or hover a bar for daily details."}
          </p>
          {metric === "requests" && (
            <div className="portal-chart-legend">
              <span>Fulfilled</span>
              <span>Pending</span>
              <span>Cancelled</span>
            </div>
          )}
          {full && (
            <div className="portal-stats">
              <div className="portal-stat">
                <span>Requests created</span>
                <strong>{totals.requests}</strong>
              </div>
              <div className="portal-stat">
                <span>Recorded donations</span>
                <strong>{totals.donations}</strong>
              </div>
              <div className="portal-stat">
                <span>Net stock change</span>
                <strong>{totals.stock}</strong>
              </div>
            </div>
          )}
        </>
      )}
      {data.length > 0 && (
        <details className="portal-chart-table">
          <summary>View accessible data table</summary>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Requests</th>
                  <th>Fulfilled</th>
                  <th>Pending</th>
                  <th>Cancelled</th>
                  <th>Donations</th>
                  <th>Stock change</th>
                </tr>
              </thead>
              <tbody>
                {data.map((day) => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td>{day.requests}</td>
                    <td>{day.fulfilled}</td>
                    <td>{day.pending}</td>
                    <td>{day.cancelled}</td>
                    <td>{day.donations}</td>
                    <td>{day.stockChange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="portal-small-note">
        Based on your hospital’s recorded activity. Request bars reflect current
        outcomes of requests created during this period.
      </p>
      {full && (
        <div className="portal-policy-note">
          Predictive inventory intelligence · Coming soon. Current charts
          describe recorded activity.
        </div>
      )}
    </div>
  );
}
