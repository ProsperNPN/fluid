"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Plus,
  ScanLine,
  History,
  QrCode,
  ShieldCheck,
  PackageSearch,
  Download,
  Settings2,
  Edit3,
} from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import { getApiErrorMessage } from "@/lib/api";
import {
  inventorySummary,
  unitDetail,
  listUnits,
  receiveUnit,
  receiveInventory,
  editUnit,
  actOnUnit,
  unitHistory,
  unitQr,
  componentPolicies,
  saveComponentPolicy,
  saveStockPolicy,
  bloodTypes,
  components,
  unitStatuses,
  type InventoryUnit,
  type UnitInput,
  type StockGroup,
  type ComponentPolicy,
  type UnitHistory,
  type UnitAction,
} from "@/services/smart-inventory-service";
import {
  listHospitalRequests,
  type HospitalRequest,
} from "@/services/hospital-requests-service";
import {
  PortalDialog,
  PortalPanel,
  PortalSkeleton,
  PortalEmpty,
  StatusPill,
} from "@/components/portal/portal-ui";
import { InventoryScanner } from "@/components/portal/inventory-scanner";
const blank: UnitInput = {
  blood_type: "O+",
  component: "red_cells",
  official_identifier: null,
  product_code: null,
  label_standard: null,
  collected_at: null,
  expires_at: null,
  storage_location: "",
};
function local(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function dateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}
const policyBlank = (component: string): ComponentPolicy => ({
  component,
  version: 0,
  approved: false,
  standard_reference: "",
  max_shelf_life_hours: null,
  temperature_min_c: null,
  temperature_max_c: null,
  storage_requirements: "",
  expiry_warning_hours: 168,
});
export default function InventoryPage() {
  const [blood, setBlood] = useState(""),
    [component, setComponent] = useState(""),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("expiration"),
    [page, setPage] = useState(1);
  const loader = useCallback(async () => {
    const [summary, units] = await Promise.all([
      inventorySummary(),
      listUnits({
        blood_type: blood || undefined,
        component: component || undefined,
        status: status || undefined,
        search: search || undefined,
        sort,
        page,
      }),
    ]);
    return { summary, units };
  }, [blood, component, status, search, sort, page]);
  const q = usePortalQuery(loader);
  const [scan, setScan] = useState(false),
    [dialog, setDialog] = useState<
      | "receive"
      | "edit"
      | "manage"
      | "history"
      | "qr"
      | "threshold"
      | "policy"
      | null
    >(null),
    [selected, setSelected] = useState<InventoryUnit | null>(null),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<UnitInput>(blank),
    [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState(""),
    [authorized, setAuthorized] = useState(false),
    [cold, setCold] = useState(false),
    [official, setOfficial] = useState(false),
    [compatible, setCompatible] = useState(false),
    [recallResolved, setRecallResolved] = useState(false),
    [temperature, setTemperature] = useState(""),
    [action, setAction] = useState("start_testing"),
    [result, setResult] = useState("passed"),
    [requestId, setRequestId] = useState(""),
    [storage, setStorage] = useState("");
  const [history, setHistory] = useState<UnitHistory[]>([]),
    [historyPage, setHistoryPage] = useState(1),
    [detailError, setDetailError] = useState(""),
    [detailLoading, setDetailLoading] = useState(false),
    [qrUrl, setQrUrl] = useState(""),
    [requests, setRequests] = useState<HospitalRequest[]>([]),
    [group, setGroup] = useState<StockGroup | null>(null),
    [policies, setPolicies] = useState<ComponentPolicy[]>([]),
    [policy, setPolicy] = useState<ComponentPolicy>(policyBlank("red_cells"));
  useEffect(() => {
    if (!dialog || !selected || !["history", "qr"].includes(dialog)) return;
    let active = true;
    let url = "";
    setDetailLoading(true);
    setDetailError("");
    void (async () => {
      try {
        if (dialog === "history") {
          const h = await unitHistory(selected.id, historyPage);
          if (active) setHistory(h.items);
        } else {
          url = URL.createObjectURL(await unitQr(selected.id));
          if (active) setQrUrl(url);
        }
      } catch (e) {
        if (active)
          setDetailError(getApiErrorMessage(e, "Unable to load this record."));
      } finally {
        if (active) setDetailLoading(false);
      }
    })();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [dialog, selected, historyPage]);
  useEffect(() => {
    if (dialog !== "manage" || action !== "reserve") return;
    let active = true;
    void (async () => {
      try {
        const first = await listHospitalRequests({ page: 1, status: "active" });
        const others = await Promise.all(
          Array.from({ length: first.totalPages - 1 }, (_, i) =>
            listHospitalRequests({ page: i + 2, status: "active" }),
          ),
        );
        if (active)
          setRequests([...first.items, ...others.flatMap((p) => p.items)]);
      } catch (e) {
        if (active)
          setDetailError(
            getApiErrorMessage(e, "Unable to load blood requests."),
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [dialog, action]);
  async function open(original: InventoryUnit, mode: typeof dialog) {
    let unit: InventoryUnit;
    try {
      unit = await unitDetail(original.id);
    } catch (e) {
      toast.error(
        getApiErrorMessage(e, "Unable to refresh this inventory unit."),
      );
      return;
    }
    setSelected(unit);
    setForm({ ...unit });
    setDialog(mode);
    setReason("");
    setAuthorized(false);
    setCold(false);
    setOfficial(false);
    setCompatible(false);
    setRecallResolved(false);
    setStorage(unit.storage_location);
    setTemperature(unit.temperature_c?.toString() || "");
    setAction(
      unit.status === "quarantined"
        ? "start_testing"
        : unit.status === "testing"
          ? unit.testing_status === "passed"
            ? "clinical_release"
            : "record_testing"
          : unit.status === "reserved"
            ? "unreserve"
            : "quarantine",
    );
    setRequestId("");
    setHistory([]);
    setHistoryPage(1);
    setDetailError("");
    setQrUrl("");
    setQuantity(1);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (dialog === "receive") {
        if (quantity === 1) await receiveUnit(form);
        else await receiveInventory(form, quantity);
      } else if (dialog === "edit" && selected)
        await editUnit(selected.id, {
          ...form,
          expected_version: selected.version,
          reason,
          clinical_authorization: authorized,
        });
      else if (dialog === "manage" && selected) {
        const payload: UnitAction = {
          action,
          expected_version: selected.version,
          reason,
          clinical_authorization: authorized,
          cold_chain_verified: cold,
          official_label_verified: official,
          compatibility_verified: compatible,
          recall_resolved: recallResolved,
          testing_status: action === "record_testing" ? result : undefined,
          request_id: requestId || undefined,
          storage_location: storage || undefined,
          temperature_c: temperature !== "" ? Number(temperature) : undefined,
        };
        await actOnUnit(selected.id, payload);
      } else if (dialog === "threshold" && group) await saveStockPolicy(group);
      else if (dialog === "policy")
        await saveComponentPolicy(policy, authorized);
      toast.success("Inventory change recorded.");
      await q.refresh();
      setDialog(null);
      window.dispatchEvent(new Event("fluid:live-update"));
    } catch (e) {
      toast.error(
        getApiErrorMessage(
          e,
          "Unable to save inventory. Refresh the unit if it changed.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function configure() {
    try {
      const p = await componentPolicies();
      setPolicies(p);
      setPolicy(
        p.find((v) => v.component === "red_cells") || policyBlank("red_cells"),
      );
      setAuthorized(false);
      setDialog("policy");
    } catch (e) {
      toast.error(
        getApiErrorMessage(e, "Unable to load clinical configuration."),
      );
    }
  }
  const summary = q.data?.summary;
  return (
    <div className="portal-stack">
      <PortalPanel title="Smart blood inventory">
        <p className="portal-muted">
          Every physical unit has its own history. Only tested, clinically
          released, unexpired stock counts as available.
        </p>
        <div className="portal-dialog-actions mt-4">
          <button
            className="portal-button"
            onClick={() => {
              setForm(blank);
              setQuantity(1);
              setDialog("receive");
            }}
          >
            <Plus size={16} />
            Receive inventory
          </button>
          <button
            className="portal-button portal-button--secondary"
            onClick={() => setScan(true)}
          >
            <ScanLine size={16} />
            Scan QR
          </button>
          <button
            className="portal-button portal-button--secondary"
            onClick={() => void configure()}
          >
            <Settings2 size={16} />
            Component policies
          </button>
        </div>
      </PortalPanel>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Available", summary?.available],
          ["Reserved", summary?.reserved],
          [
            "Low / critical groups",
            summary ? summary.low_groups + summary.critical_groups : undefined,
          ],
          ["Expiring soon", summary?.expiring_soon],
        ].map(([label, value]) => (
          <div key={label} className="portal-panel">
            <p className="text-2xl font-bold">{value ?? "?"}</p>
            <p className="portal-small-note">{label}</p>
          </div>
        ))}
      </div>
      {summary && summary.quarantined > 0 && (
        <p className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm">
          {summary.quarantined} unit(s) are quarantined. Legacy stock retains
          its recorded quantity but requires identifier reconciliation, testing
          and authorized clinical release.
        </p>
      )}
      <PortalPanel title="Stock by blood group & component">
        {summary?.groups.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summary.groups.map((g) => (
              <div
                key={g.blood_type + g.component}
                className="rounded-xl border p-3"
              >
                <div className="flex justify-between gap-2">
                  <strong>{g.blood_type}</strong>
                  <StatusPill status={g.level} />
                </div>
                <p className="text-sm mt-2">
                  {g.component.replaceAll("_", " ")}
                </p>
                <p className="portal-small-note">
                  {g.available} available · {g.reserved} reserved
                </p>
                <p className="portal-small-note">
                  Minimum {g.minimum} · Critical at {g.critical}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    className="portal-text-link"
                    onClick={() => {
                      setGroup({ ...g });
                      setDialog("threshold");
                    }}
                  >
                    Set thresholds
                  </button>
                  {g.shortage > 0 && (
                    <Link
                      className="portal-text-link"
                      href={`/hospital/requests?create=1&blood_type=${encodeURIComponent(g.blood_type)}&component=${g.component}&units=${g.shortage}`}
                    >
                      Request shortage
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="portal-muted">
            Receive inventory to start monitoring component stock.
          </p>
        )}
      </PortalPanel>
      <PortalPanel title="Available-stock changes · last 30 days">
        <div
          className="flex h-28 items-end gap-1"
          role="img"
          aria-label="Daily net change in clinically available stock"
        >
          {summary?.trend.map((day) => (
            <div
              key={day.date}
              className="flex-1 rounded-t bg-[#C0392B] min-w-0"
              title={`${day.date}: ${day.available_change > 0 ? "+" : ""}${day.available_change}, ${day.movements} movements`}
              style={{
                height: `${Math.max(3, (Math.abs(day.available_change) / Math.max(1, ...summary.trend.map((d) => Math.abs(d.available_change)))) * 100)}%`,
                opacity: day.available_change < 0 ? 0.45 : 1,
              }}
            />
          ))}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer">
            View daily movement totals
          </summary>
          <div className="max-h-48 overflow-auto mt-2">
            {summary?.trend.map((d) => (
              <p key={d.date}>
                {d.date}: {d.available_change > 0 ? "+" : ""}
                {d.available_change} available · {d.movements} movements
              </p>
            ))}
          </div>
        </details>
      </PortalPanel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="portal-field">
          Search identifiers / storage
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="portal-field">
          Blood group
          <select
            value={blood}
            onChange={(e) => {
              setBlood(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All groups</option>
            {bloodTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="portal-field">
          Component
          <select
            value={component}
            onChange={(e) => {
              setComponent(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All components</option>
            {components.map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="portal-field">
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {unitStatuses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="portal-field">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {["expiration", "newest", "blood_type", "storage"].map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      {q.loading ? (
        <PortalSkeleton />
      ) : q.error ? (
        <PortalEmpty title="Inventory unavailable" description={q.error} />
      ) : q.data?.units.items.length ? (
        <div className="portal-request-grid">
          {q.data.units.items.map((unit) => (
            <article className="portal-panel" key={unit.id}>
              <div className="flex justify-between items-center gap-2">
                <span className="portal-blood-badge">{unit.blood_type}</span>
                <StatusPill status={unit.status} />
              </div>
              <h2 className="font-semibold mt-3">
                {unit.component.replaceAll("_", " ")}
              </h2>
              <p className="portal-small-note break-all">
                {unit.internal_identifier}
              </p>
              <p className="portal-small-note">
                Official:{" "}
                {unit.official_identifier || "Requires reconciliation"} ·{" "}
                {unit.product_code || "No product code"}
              </p>
              <p className="portal-small-note">
                Testing: {unit.testing_status.replaceAll("_", " ")}
              </p>
              <p className="portal-small-note">
                {unit.storage_location} · Quantity 1
              </p>
              <p className="portal-small-note">
                Expires:{" "}
                {unit.expires_at
                  ? new Date(unit.expires_at).toLocaleString()
                  : "Unknown; allocation blocked"}
              </p>
              {unit.recall_active && (
                <p className="text-sm text-red-700 font-semibold mt-2">
                  Active recall
                </p>
              )}
              {unit.status === "available" && !unit.clinically_available && (
                <p className="text-sm text-red-700">
                  Allocation blocked: release requirements require review.
                </p>
              )}
              <div className="portal-dialog-actions mt-3">
                <button
                  className="portal-button"
                  onClick={() => open(unit, "manage")}
                >
                  <PackageSearch size={15} />
                  Manage
                </button>
                <button
                  className="portal-button portal-button--secondary"
                  onClick={() => open(unit, "edit")}
                >
                  <Edit3 size={15} />
                  Edit
                </button>
                <button
                  className="portal-text-link"
                  onClick={() => open(unit, "qr")}
                >
                  <QrCode size={15} />
                  QR
                </button>
                <button
                  className="portal-text-link"
                  onClick={() => open(unit, "history")}
                >
                  <History size={15} />
                  History
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <PortalEmpty
          title="No units in this view"
          description="Receive physical inventory or adjust the filters. New units enter quarantine."
        />
      )}
      {q.data && q.data.units.total_pages > 1 && (
        <div className="portal-pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            {page} / {q.data.units.total_pages} · {q.data.units.total} units
          </span>
          <button
            disabled={page >= q.data.units.total_pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
      {scan && (
        <InventoryScanner
          onClose={() => setScan(false)}
          onFound={(unit) => {
            setScan(false);
            open(unit, "manage");
          }}
        />
      )}
      {dialog && (
        <PortalDialog
          title={
            {
              receive: "Receive physical inventory",
              edit: "Edit quarantined unit",
              manage: "Verified stock movement",
              history: "Immutable unit history",
              qr: "Internal tracking QR",
              threshold: "Stock thresholds",
              policy: "Component storage & release policy",
            }[dialog]
          }
          onClose={() => setDialog(null)}
        >
          <form onSubmit={save} className="portal-stack">
            {selected &&
              !["receive", "policy", "threshold"].includes(dialog) && (
                <p className="text-sm break-all">
                  {selected.internal_identifier} · {selected.blood_type} ·{" "}
                  {selected.component.replaceAll("_", " ")}
                </p>
              )}
            {["receive", "edit"].includes(dialog) && (
              <>
                <div className="portal-form-grid">
                  <label className="portal-field">
                    Blood group
                    <select
                      value={form.blood_type}
                      onChange={(e) =>
                        setForm({ ...form, blood_type: e.target.value })
                      }
                    >
                      {bloodTypes.map((t) => (
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
                      {components.map((c) => (
                        <option key={c} value={c}>
                          {c.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  {dialog === "receive" && (
                    <label className="portal-field">
                      Physical quantity
                      <input
                        type="number"
                        required
                        min={1}
                        max={100}
                        value={quantity}
                        onChange={(e) => {
                          setQuantity(Number(e.target.value));
                          if (Number(e.target.value) > 1)
                            setForm({
                              ...form,
                              official_identifier: null,
                              product_code: null,
                              label_standard: null,
                            });
                        }}
                      />
                    </label>
                  )}
                  <label className="portal-field">
                    Label standard
                    <select
                      disabled={quantity > 1}
                      value={form.label_standard || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          label_standard: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Pending reconciliation</option>
                      <option value="ISBT128">ISBT 128 (official label)</option>
                      <option value="other">Other official standard</option>
                    </select>
                  </label>
                  <label className="portal-field">
                    Official donation / unit identifier
                    <input
                      disabled={quantity > 1}
                      maxLength={80}
                      value={form.official_identifier || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          official_identifier: e.target.value || null,
                        })
                      }
                    />
                  </label>
                  <label className="portal-field">
                    Official product code (includes division)
                    <input
                      disabled={quantity > 1}
                      maxLength={40}
                      value={form.product_code || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          product_code: e.target.value || null,
                        })
                      }
                    />
                  </label>
                  <label className="portal-field">
                    Collected at (your time zone)
                    <input
                      type="datetime-local"
                      value={local(form.collected_at)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          collected_at: dateTime(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="portal-field">
                    Expires at (your time zone)
                    <input
                      type="datetime-local"
                      required={quantity > 1}
                      value={local(form.expires_at)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          expires_at: dateTime(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="portal-field">
                    Storage location
                    <input
                      required
                      minLength={2}
                      maxLength={160}
                      value={form.storage_location}
                      onChange={(e) =>
                        setForm({ ...form, storage_location: e.target.value })
                      }
                    />
                  </label>
                </div>
                <p className="portal-policy-note">
                  New or edited units are quarantined. Official identifiers must
                  be verified individually before clinical release. Bulk intake
                  retains one internal record per physical unit and requires
                  later label reconciliation.
                </p>
              </>
            )}
            {dialog === "manage" && (
              <>
                <label className="portal-field">
                  Movement / status change
                  <select
                    value={action}
                    onChange={(e) => {
                      setAction(e.target.value);
                      setAuthorized(false);
                      setCompatible(false);
                    }}
                  >
                    {[
                      "start_testing",
                      "record_testing",
                      "clinical_release",
                      "reserve",
                      "unreserve",
                      "use",
                      "quarantine",
                      "recall",
                      "discard",
                      "move",
                    ].map((a) => (
                      <option key={a} value={a}>
                        {a.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                {action === "record_testing" && (
                  <label className="portal-field">
                    Verified testing status
                    <select
                      value={result}
                      onChange={(e) => setResult(e.target.value)}
                    >
                      <option value="passed">Passed required testing</option>
                      <option value="failed">Failed testing</option>
                    </select>
                  </label>
                )}
                {action === "reserve" && (
                  <label className="portal-field">
                    Hospital blood request
                    <select
                      required
                      value={requestId}
                      onChange={(e) => setRequestId(e.target.value)}
                    >
                      <option value="">Select active request</option>
                      {requests.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.bloodType} · {r.component.replaceAll("_", " ")} ·{" "}
                          {r.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {action === "move" && (
                  <label className="portal-field">
                    Destination storage
                    <input
                      required
                      maxLength={160}
                      value={storage}
                      onChange={(e) => setStorage(e.target.value)}
                    />
                  </label>
                )}
                {["move", "clinical_release"].includes(action) && (
                  <>
                    <label className="portal-field">
                      Verified storage temperature °C
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value)}
                      />
                    </label>
                    <label className="portal-toggle-row">
                      <span>
                        Cold-chain and storage conditions were verified.
                      </span>
                      <input
                        type="checkbox"
                        required
                        checked={cold}
                        onChange={(e) => setCold(e.target.checked)}
                      />
                    </label>
                  </>
                )}
                {action === "clinical_release" && (
                  <>
                    <label className="portal-toggle-row">
                      <span>Official donation/product label verified.</span>
                      <input
                        type="checkbox"
                        required
                        checked={official}
                        onChange={(e) => setOfficial(e.target.checked)}
                      />
                    </label>
                    {selected?.recall_active && (
                      <label className="portal-toggle-row">
                        <span>The recall was reviewed and resolved.</span>
                        <input
                          type="checkbox"
                          required
                          checked={recallResolved}
                          onChange={(e) => setRecallResolved(e.target.checked)}
                        />
                      </label>
                    )}
                  </>
                )}
                {["reserve", "use"].includes(action) && (
                  <label className="portal-toggle-row">
                    <span>
                      Required compatibility review and clinical checks were
                      confirmed.
                    </span>
                    <input
                      type="checkbox"
                      required
                      checked={compatible}
                      onChange={(e) => setCompatible(e.target.checked)}
                    />
                  </label>
                )}
                <p className="portal-policy-note">
                  Inventory changes require a verified physical movement or
                  authorized status decision. Issuing stock does not
                  automatically fulfill a request. An out-of-range storage move
                  quarantines stock for review.
                </p>
              </>
            )}
            {dialog === "threshold" && group && (
              <>
                <p>
                  {group.blood_type} · {group.component.replaceAll("_", " ")}
                </p>
                <label className="portal-field">
                  Minimum available units
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    required
                    value={group.minimum}
                    onChange={(e) =>
                      setGroup({ ...group, minimum: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="portal-field">
                  Critical at or below
                  <input
                    type="number"
                    min={0}
                    max={group.minimum}
                    required
                    value={group.critical}
                    onChange={(e) =>
                      setGroup({ ...group, critical: Number(e.target.value) })
                    }
                  />
                </label>
              </>
            )}
            {dialog === "policy" && (
              <>
                <p className="portal-policy-note">
                  A blood bank manager or hospital administrator must apply the
                  facility’s professionally reviewed SOP for this component and
                  processing method. FLUID supplies no default clinical
                  shelf-life or temperature limits.
                </p>
                <label className="portal-field">
                  Component
                  <select
                    value={policy.component}
                    onChange={(e) => {
                      setPolicy(
                        policies.find((p) => p.component === e.target.value) ||
                          policyBlank(e.target.value),
                      );
                      setAuthorized(false);
                    }}
                  >
                    {components.map((c) => (
                      <option key={c} value={c}>
                        {c.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="portal-field">
                  Approved clinical standard / SOP reference
                  <input
                    maxLength={500}
                    required
                    value={policy.standard_reference}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        standard_reference: e.target.value,
                      })
                    }
                  />
                </label>
                <div className="portal-form-grid">
                  {[
                    ["max_shelf_life_hours", "Maximum shelf life (hours)"],
                    ["temperature_min_c", "Minimum temperature °C"],
                    ["temperature_max_c", "Maximum temperature °C"],
                    ["expiry_warning_hours", "Expiry warning (hours)"],
                  ].map(([key, label]) => (
                    <label key={key} className="portal-field">
                      {label}
                      <input
                        required
                        type="number"
                        step={key.includes("temperature") ? "0.1" : "1"}
                        value={
                          (policy[key as keyof ComponentPolicy] as number) ?? ""
                        }
                        onChange={(e) =>
                          setPolicy({
                            ...policy,
                            [key]:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <label className="portal-field">
                  Storage and processing requirements
                  <textarea
                    required
                    maxLength={1000}
                    value={policy.storage_requirements}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        storage_requirements: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="portal-toggle-row">
                  <span>
                    This component policy has been professionally reviewed and
                    approved.
                  </span>
                  <input
                    type="checkbox"
                    checked={policy.approved}
                    onChange={(e) =>
                      setPolicy({ ...policy, approved: e.target.checked })
                    }
                  />
                </label>
              </>
            )}
            {(dialog === "edit" || dialog === "manage") && (
              <label className="portal-field">
                Reason (no donor or patient medical details)
                <textarea
                  required
                  minLength={5}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            {(dialog === "policy" ||
              dialog === "edit" ||
              (dialog === "manage" &&
                [
                  "clinical_release",
                  "record_testing",
                  "use",
                  "recall",
                  "discard",
                ].includes(action))) && (
              <label className="portal-toggle-row">
                <span>
                  I am authorized for this clinical inventory decision.
                </span>
                <input
                  type="checkbox"
                  required
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                />
              </label>
            )}
            {detailLoading && <p role="status">Loading record…</p>}
            {detailError && (
              <p role="alert" className="text-red-700">
                {detailError}
              </p>
            )}
            {dialog === "qr" && qrUrl && (
              <>
                <Image
                  unoptimized
                  src={qrUrl}
                  width={224}
                  height={224}
                  alt="Internal blood inventory QR code"
                  className="w-56 h-56 mx-auto"
                />
                <p className="text-sm">
                  Internal lookup only. This QR contains no donor identity or
                  medical details and does not replace the official product
                  label.
                </p>
                <a
                  className="portal-button"
                  href={qrUrl}
                  download={`${selected?.internal_identifier}.svg`}
                >
                  <Download size={16} />
                  Download internal QR
                </a>
              </>
            )}
            {dialog === "history" && (
              <>
                <div className="divide-y">
                  {history.map((h) => (
                    <div key={h.id} className="py-3 text-sm">
                      <strong>{h.action.replaceAll("_", " ")}</strong>
                      <p>
                        {new Date(h.created_at).toLocaleString()} ·{" "}
                        {h.actor_user_id ? "Authorized staff" : "System"}
                      </p>
                      <p className="mt-1">{h.details.reason}</p>
                      {h.details.before?.status && (
                        <p>
                          {h.details.before.status} → {h.details.after?.status}
                        </p>
                      )}
                      {h.details.after?.storage_location && (
                        <p>Storage: {h.details.after.storage_location}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="portal-dialog-actions">
                  <button
                    type="button"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>Page {historyPage}</span>
                  <button
                    type="button"
                    disabled={history.length < 50}
                    onClick={() => setHistoryPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
            {!["history", "qr"].includes(dialog) && (
              <button className="portal-button" disabled={busy}>
                <ShieldCheck size={16} />
                {busy ? "Saving…" : "Confirm inventory change"}
              </button>
            )}
          </form>
        </PortalDialog>
      )}
    </div>
  );
}
