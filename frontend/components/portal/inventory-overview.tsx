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
          const threshold = usable.reduce(
            (sum, i) => sum + i.minimumThreshold,
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
        Components are shown per batch in Inventory. Expired batches are
        excluded from usable totals.
      </p>
    </>
  );
}
