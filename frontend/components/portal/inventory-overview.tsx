import { Droplet } from "lucide-react";
import type { InventoryItem } from "@/services/inventory-service";
const types = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
export function InventoryOverview({ items }: { items: InventoryItem[] }) {
  return (
    <>
      <div className="portal-inventory-grid">
        {types.map((type) => {
          const rows = items.filter((i) => i.bloodType === type);
          const usable = rows.filter(
            (i) => i.alertLevel !== "expired" && i.alertLevel !== "unknown",
          );
          const units = usable.reduce(
            (sum, i) => sum + Math.max(0, i.unitsAvailable - i.unitsReserved),
            0,
          );
          const thresholds = new Map<string, number>();
          usable.forEach((i) =>
            thresholds.set(
              i.component,
              Math.max(thresholds.get(i.component) || 0, i.minimumThreshold),
            ),
          );
          const threshold = Array.from(thresholds.values()).reduce(
            (sum, n) => sum + n,
            0,
          );
          const level = !rows.length
            ? "unknown"
            : units === 0
              ? "critical"
              : units <= threshold
                ? "low"
                : "normal";
          return (
            <div key={type} className={`portal-stock portal-stock--${level}`}>
              <span>
                <Droplet size={22} fill="currentColor" />
              </span>
              <strong>{type}</strong>
              <small>{rows.length ? `${units} units` : "Not recorded"}</small>
              <div
                role="meter"
                aria-label={`${type} stock relative to configured threshold`}
                aria-valuemin={0}
                aria-valuemax={Math.max(threshold * 2, units, 1)}
                aria-valuenow={units}
              >
                <i
                  style={{
                    width: rows.length
                      ? `${Math.min(100, (units / Math.max(threshold * 2, units, 1)) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="portal-stock-legend">
        <span>
          <i className="is-green" />
          Above threshold
        </span>
        <span>
          <i className="is-amber" />
          At/below threshold
        </span>
        <span>
          <i className="is-red" />
          No available stock
        </span>
      </div>
      <p className="portal-small-note">
        Totals combine components for display. Open Inventory for
        component-specific stock; only clinically released, tested, unexpired
        units are included.
      </p>
    </>
  );
}
