"use client";
import { useCallback, useState, type FormEvent } from "react";
import { History, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import {
  listInventory,
  createInventory,
  adjustInventory,
  getInventoryTransactions,
  setInventoryThreshold,
  type InventoryItem,
  type InventoryTransaction,
} from "@/services/inventory-service";
import { InventoryOverview } from "@/components/portal/inventory-overview";
import {
  PortalDialog,
  PortalEmpty,
  PortalPanel,
  PortalSkeleton,
  StatusPill,
} from "@/components/portal/portal-ui";
import { getApiErrorMessage } from "@/lib/api";
import type { BloodType } from "@/types";
const types: BloodType[] = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
export default function InventoryPage() {
  const [alerts, setAlerts] = useState(false);
  const loader = useCallback(() => listInventory(alerts), [alerts]);
  const q = usePortalQuery(loader);
  const [add, setAdd] = useState(false);
  const [form, setForm] = useState({
    bloodType: "O+" as BloodType,
    component: "red_cells",
    units: 0,
    collection: "",
    expiration: "",
    storage: "",
    threshold: 5,
  });
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [action, setAction] = useState<
    | "add"
    | "remove"
    | "reserve"
    | "release"
    | "use"
    | "expire"
    | "donation_intake"
    | "threshold"
  >("add");
  const [units, setUnits] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [transactions, setTransactions] = useState<
    InventoryTransaction[] | null
  >(null);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await createInventory({
        bloodType: form.bloodType,
        component: form.component,
        unitsAvailable: form.units,
        collectionDate: form.collection || null,
        expirationDate: form.expiration || null,
        storageLocation: form.storage,
        minimumThreshold: form.threshold,
      });
      toast.success("Inventory batch recorded.");
      setAdd(false);
      await q.refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to create inventory."));
    } finally {
      setBusy(false);
    }
  }
  async function adjust(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      if (action === "threshold")
        await setInventoryThreshold(selected.id, units);
      else await adjustInventory(selected.id, action, units, reason);
      toast.success("Inventory change saved with an audit record.");
      setSelected(null);
      await q.refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to adjust inventory."));
    } finally {
      setBusy(false);
    }
  }
  async function audit(item: InventoryItem) {
    try {
      setTransactions(await getInventoryTransactions(item.id));
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to load transactions."));
    }
  }
  return (
    <div className="portal-stack">
      <PortalPanel title="Blood Inventory Overview">
        <InventoryOverview items={q.data || []} />
      </PortalPanel>
      <div className="portal-request-tools">
        <label className="portal-toggle-row border-0 py-0">
          <span>Show alert batches only</span>
          <input
            type="checkbox"
            checked={alerts}
            onChange={(e) => setAlerts(e.target.checked)}
          />
        </label>
        <button className="portal-button ml-auto" onClick={() => setAdd(true)}>
          <Plus size={16} />
          Add Batch
        </button>
      </div>
      {q.loading ? (
        <PortalSkeleton />
      ) : q.error ? (
        <PortalEmpty title="Inventory unavailable" description={q.error} />
      ) : q.data?.length ? (
        <div className="portal-request-grid">
          {q.data.map((item) => (
            <article className="portal-panel" key={item.id}>
              <div className="portal-dialog-identity">
                <span className="portal-blood-badge">{item.bloodType}</span>
                <div>
                  <h2 className="text-sm font-semibold">
                    {item.component.replaceAll("_", " ")}
                  </h2>
                  <p className="portal-small-note mt-1">
                    {item.storageLocation}
                  </p>
                </div>
                <StatusPill status={item.alertLevel} />
              </div>
              <div className="portal-dialog-facts mt-4">
                <span>
                  <small>Available / total</small>
                  <strong>
                    {item.unitsAvailable - item.unitsReserved} /{" "}
                    {item.unitsAvailable}
                  </strong>
                </span>
                <span>
                  <small>Reserved</small>
                  <strong>{item.unitsReserved}</strong>
                </span>
                <span>
                  <small>Threshold</small>
                  <strong>{item.minimumThreshold}</strong>
                </span>
              </div>
              <p className="portal-small-note">
                Collected: {item.collectionDate || "Not recorded"}
                <br />
                Expires: {item.expirationDate || "Not recorded"}
              </p>
              <div className="portal-dialog-actions mt-3">
                <button
                  className="portal-button portal-button--secondary"
                  onClick={() => void audit(item)}
                >
                  <History size={14} />
                  History
                </button>
                <button
                  className="portal-button"
                  onClick={() => {
                    setSelected(item);
                    setAction("add");
                    setUnits(1);
                    setReason("");
                  }}
                >
                  <SlidersHorizontal size={14} />
                  Manage
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <PortalEmpty
          title="No inventory batches in this view"
          description="Record a batch with its component, collection date, expiration, and stock threshold to start monitoring."
        />
      )}
      {add && (
        <PortalDialog
          title="Record an Inventory Batch"
          onClose={() => setAdd(false)}
        >
          <form className="portal-stack" onSubmit={create}>
            <div className="portal-form-grid">
              <label className="portal-field">
                Blood type
                <select
                  value={form.bloodType}
                  onChange={(e) =>
                    setForm({ ...form, bloodType: e.target.value as BloodType })
                  }
                >
                  {types.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="portal-field">
                Component
                <select
                  value={form.component}
                  onChange={(e) =>
                    setForm({ ...form, component: e.target.value })
                  }
                >
                  {["red_cells", "whole_blood", "plasma", "platelets"].map(
                    (t) => (
                      <option key={t} value={t}>
                        {t.replaceAll("_", " ")}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="portal-field">
                Recorded units
                <input
                  type="number"
                  required
                  min={0}
                  max={10000}
                  value={form.units}
                  onChange={(e) =>
                    setForm({ ...form, units: Number(e.target.value) })
                  }
                />
              </label>
              <label className="portal-field">
                Low-stock threshold
                <input
                  type="number"
                  required
                  min={0}
                  max={1000}
                  value={form.threshold}
                  onChange={(e) =>
                    setForm({ ...form, threshold: Number(e.target.value) })
                  }
                />
              </label>
              <label className="portal-field">
                Collection date
                <input
                  type="date"
                  value={form.collection}
                  onChange={(e) =>
                    setForm({ ...form, collection: e.target.value })
                  }
                />
              </label>
              <label className="portal-field">
                Expiration date
                <input
                  type="date"
                  required
                  value={form.expiration}
                  onChange={(e) =>
                    setForm({ ...form, expiration: e.target.value })
                  }
                />
              </label>
              <label className="portal-field">
                Storage location
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={form.storage}
                  onChange={(e) =>
                    setForm({ ...form, storage: e.target.value })
                  }
                />
              </label>
            </div>
            <p className="portal-small-note">
              Record only facility-approved stock. Expiration is determined by
              the component’s validated processing and storage requirements.
            </p>
            <button className="portal-button" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Record Batch"}
            </button>
          </form>
        </PortalDialog>
      )}
      {selected && (
        <PortalDialog
          title="Manage Inventory"
          onClose={() => setSelected(null)}
        >
          <form className="portal-stack" onSubmit={adjust}>
            <p>
              {selected.bloodType} · {selected.component.replaceAll("_", " ")} ·{" "}
              {selected.storageLocation}
            </p>
            <label className="portal-field">
              Action
              <select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value as typeof action);
                  setUnits(
                    e.target.value === "threshold"
                      ? selected.minimumThreshold
                      : 1,
                  );
                }}
              >
                {[
                  "add",
                  "remove",
                  "reserve",
                  "release",
                  "use",
                  "expire",
                  "donation_intake",
                  "threshold",
                ].map((a) => (
                  <option key={a} value={a}>
                    {a.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="portal-field">
              {action === "threshold" ? "New low-stock threshold" : "Units"}
              <input
                type="number"
                min={action === "threshold" ? 0 : 1}
                max={action === "threshold" ? 1000 : 10000}
                required
                value={units}
                onChange={(e) => setUnits(Number(e.target.value))}
              />
            </label>
            {action !== "threshold" && (
              <label className="portal-field">
                Reason
                <textarea
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <div className="portal-policy-note">
              Changes are recorded with your account and time. Reservations
              cannot exceed stock; use/removal cannot consume reserved units.
              Expired batches cannot be reserved or used.
            </div>
            <button className="portal-button" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Confirm Inventory Change"}
            </button>
          </form>
        </PortalDialog>
      )}
      {transactions && (
        <PortalDialog
          title="Inventory Transaction History"
          onClose={() => setTransactions(null)}
        >
          <div className="portal-stack">
            {transactions.length ? (
              transactions.map((t) => (
                <article className="portal-panel" key={t.id}>
                  <strong className="text-sm">
                    {t.action.replaceAll("_", " ")}
                  </strong>
                  <p className="portal-small-note">
                    {new Date(t.created_at).toLocaleString()}
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-600">
                    {JSON.stringify(t.details, null, 2)}
                  </pre>
                </article>
              ))
            ) : (
              <p>No transactions recorded.</p>
            )}
          </div>
        </PortalDialog>
      )}
    </div>
  );
}
