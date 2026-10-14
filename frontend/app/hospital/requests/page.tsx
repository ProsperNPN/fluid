"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, Search, Users, MapPin } from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import {
  listHospitalRequests,
  createHospitalRequest,
  updateHospitalRequest,
  publishHospitalRequest,
  cancelHospitalRequest,
  transitionHospitalRequest,
  type HospitalRequest,
  type HospitalRequestInput,
} from "@/services/hospital-requests-service";
import { getHospitalProfile } from "@/services/profile-service";
import { getApiErrorMessage } from "@/lib/api";
import {
  PortalDialog,
  PortalEmpty,
  PortalSkeleton,
  StatusPill,
} from "@/components/portal/portal-ui";
import type { BloodType } from "@/types";
const initial: HospitalRequestInput = {
  bloodType: "O+",
  component: "red_cells",
  units: 1,
  urgency: "routine",
  patientCategory: null,
  requiredBy: null,
  expiresAt: null,
  location: "",
  latitude: null,
  longitude: null,
  department: null,
  contactPerson: null,
  notes: null,
  appointmentAvailable: true,
  visibility: "matched",
  status: "draft",
};
function local(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export default function RequestsPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState(initial);
  const [publishing, setPublishing] = useState(false);
  const [action, setAction] = useState<{
    item: HospitalRequest;
    type: "publish" | "cancel" | "prioritize" | "fulfill" | "close";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [units, setUnits] = useState(1);
  const [urgency, setUrgency] = useState("urgent");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const loader = useCallback(
    () =>
      listHospitalRequests({ page, status: tab, search: search || undefined }),
    [page, tab, search],
  );
  const q = usePortalQuery(loader);
  useEffect(() => {
    void getHospitalProfile()
      .then((p) =>
        setForm((f) => ({
          ...f,
          location: p.address,
          latitude: p.latitude,
          longitude: p.longitude,
          contactPerson: p.authorizedRepresentative,
        })),
      )
      .catch(() => undefined);
    if (new URLSearchParams(window.location.search).get("create"))
      setOpen(true);
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (edit) await updateHospitalRequest(edit, { ...form, status: "draft" });
      else
        await createHospitalRequest({
          ...form,
          status: publishing ? "published" : "draft",
        });
      toast.success(
        edit
          ? "Draft updated."
          : publishing
            ? "Request published. Relevant donors notified."
            : "Draft saved.",
      );
      setOpen(false);
      setEdit(null);
      await q.refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to save request."));
    } finally {
      setBusy(false);
    }
  }
  async function mutate(event: FormEvent) {
    event.preventDefault();
    if (!action) return;
    setBusy(true);
    try {
      if (action.type === "publish")
        await publishHospitalRequest(action.item.id);
      else if (action.type === "cancel")
        await cancelHospitalRequest(action.item.id);
      else
        await transitionHospitalRequest(action.item.id, {
          action: action.type,
          urgency,
          confirmed_units: units,
          reason,
          record_confirmed: confirmed,
        });
      toast.success("Request updated and audited.");
      setAction(null);
      await q.refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to update request."));
    } finally {
      setBusy(false);
    }
  }
  function editDraft(item: HospitalRequest) {
    setEdit(item.id);
    setForm({
      ...initial,
      bloodType: item.bloodType,
      component: item.component,
      units: item.units,
      urgency: item.urgency,
      requiredBy: item.requiredBy,
      expiresAt: item.expiresAt,
      location: item.location,
      latitude: item.latitude,
      longitude: item.longitude,
      department: item.department,
      contactPerson: item.contactPerson,
      notes: item.notes,
    });
    setPublishing(false);
    setOpen(true);
  }
  return (
    <div className="portal-stack">
      <div className="portal-request-tools">
        <label className="portal-search">
          <Search size={17} />
          <input
            aria-label="Search requests"
            placeholder="Search hospital requests"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <button
          className="portal-button"
          onClick={() => {
            setEdit(null);
            setPublishing(false);
            setOpen(true);
          }}
        >
          <Plus size={16} />
          Create Request
        </button>
      </div>
      <div className="portal-request-tools">
        {[
          "all",
          "draft",
          "published",
          "partially_fulfilled",
          "fulfilled",
          "expired",
          "cancelled",
        ].map((t) => (
          <button
            className={`portal-filter ${tab === t ? "is-active" : ""}`}
            aria-pressed={tab === t}
            key={t}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
          >
            {t.replaceAll("_", " ")}
          </button>
        ))}
      </div>
      {q.loading ? (
        <PortalSkeleton />
      ) : q.error ? (
        <PortalEmpty title="Requests unavailable" description={q.error} />
      ) : q.data?.items.length ? (
        <div className="portal-request-grid">
          {q.data.items.map((item) => (
            <article key={item.id} className="portal-panel">
              <div className="portal-dialog-identity">
                <span className="portal-blood-badge">{item.bloodType}</span>
                <div>
                  <h2 className="text-sm font-semibold">
                    {item.component.replaceAll("_", " ")}
                  </h2>
                  <p className="portal-small-note mt-1">
                    Request {item.id.slice(0, 8)}
                  </p>
                </div>
                <StatusPill status={item.status} />
              </div>
              <div className="portal-dialog-facts mt-4">
                <span>
                  <small>Received / needed</small>
                  <strong>
                    {item.unitsFulfilled} / {item.units}
                  </strong>
                </span>
                <span>
                  <small>Responses</small>
                  <strong>{item.donorResponseCount}</strong>
                </span>
                <span>
                  <small>Urgency</small>
                  <StatusPill status={item.urgency} />
                </span>
              </div>
              <p className="portal-small-note">
                <MapPin size={13} className="inline" /> {item.location}
                <br />
                Required:{" "}
                {item.requiredBy
                  ? new Date(item.requiredBy).toLocaleString()
                  : "Not set"}
                <br />
                Expires:{" "}
                {item.expiresAt
                  ? new Date(item.expiresAt).toLocaleString()
                  : "Not set"}
              </p>
              <div className="portal-dialog-actions mt-4">
                {item.status === "draft" ? (
                  <>
                    <button
                      className="portal-button portal-button--secondary"
                      onClick={() => editDraft(item)}
                    >
                      Edit Draft
                    </button>
                    <button
                      className="portal-button"
                      onClick={() => setAction({ item, type: "publish" })}
                    >
                      Publish
                    </button>
                  </>
                ) : ["published", "partially_fulfilled"].includes(
                    item.status,
                  ) ? (
                  <>
                    <Link
                      className="portal-button portal-button--secondary"
                      href="/hospital/donors"
                    >
                      <Users size={14} />
                      Donors
                    </Link>
                    <button
                      className="portal-button portal-button--secondary"
                      onClick={() => {
                        setAction({ item, type: "prioritize" });
                        setReason("");
                      }}
                    >
                      Prioritize
                    </button>
                    <button
                      className="portal-button"
                      onClick={() => {
                        setAction({ item, type: "fulfill" });
                        setReason("");
                        setConfirmed(false);
                        setUnits(1);
                      }}
                    >
                      Record Receipt
                    </button>
                  </>
                ) : null}
                {!["fulfilled", "cancelled", "expired"].includes(
                  item.status,
                ) && (
                  <button
                    className="portal-text-link"
                    onClick={() => setAction({ item, type: "cancel" })}
                  >
                    Close Request
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <PortalEmpty
          title="No requests in this view"
          description="Create a draft and review its dates, component, and units before publishing."
        />
      )}
      {q.data && q.data.totalPages > 1 && (
        <div className="portal-pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            {page} / {q.data.totalPages}
          </span>
          <button
            disabled={page >= q.data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
      {open && (
        <PortalDialog
          title={edit ? "Edit Request Draft" : "Create a Blood Request"}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="portal-stack">
            <div className="portal-form-grid">
              <label className="portal-field">
                Blood type
                <select
                  value={form.bloodType}
                  onChange={(e) =>
                    setForm({ ...form, bloodType: e.target.value as BloodType })
                  }
                >
                  {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map(
                    (t) => (
                      <option key={t}>{t}</option>
                    ),
                  )}
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
                Units needed
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={form.units}
                  onChange={(e) =>
                    setForm({ ...form, units: Number(e.target.value) })
                  }
                />
              </label>
              <label className="portal-field">
                Urgency
                <select
                  value={form.urgency}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      urgency: e.target.value as HospitalRequest["urgency"],
                    })
                  }
                >
                  {["routine", "urgent", "critical"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              {(["requiredBy", "expiresAt"] as const).map((key) => (
                <label key={key} className="portal-field">
                  {key === "requiredBy" ? "Required by" : "Request expires"}
                  <input
                    type="datetime-local"
                    required={publishing}
                    value={local(form[key])}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [key]: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                </label>
              ))}
              <label className="portal-field">
                Location
                <input
                  required
                  minLength={2}
                  maxLength={255}
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                />
              </label>
              <label className="portal-field">
                Department
                <input
                  maxLength={120}
                  value={form.department || ""}
                  onChange={(e) =>
                    setForm({ ...form, department: e.target.value || null })
                  }
                />
              </label>
              <label className="portal-field">
                Latitude
                <input
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={form.latitude ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      latitude: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label className="portal-field">
                Longitude
                <input
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={form.longitude ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      longitude: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label className="portal-field">
                Contact person
                <input
                  maxLength={160}
                  value={form.contactPerson || ""}
                  onChange={(e) =>
                    setForm({ ...form, contactPerson: e.target.value || null })
                  }
                />
              </label>
            </div>
            <label className="portal-field">
              Public coordination notes
              <textarea
                rows={3}
                maxLength={2000}
                value={form.notes || ""}
                onChange={(e) =>
                  setForm({ ...form, notes: e.target.value || null })
                }
              />
            </label>
            <p className="portal-small-note">
              Do not include patient names or sensitive medical records.
              Matching uses the request’s component and coordinates; clinical
              clearance remains with the hospital.
            </p>
            {!edit && (
              <label className="portal-toggle-row">
                <span>Publish after saving and notify appropriate donors</span>
                <input
                  type="checkbox"
                  checked={publishing}
                  onChange={(e) => setPublishing(e.target.checked)}
                />
              </label>
            )}
            <button className="portal-button" type="submit" disabled={busy}>
              {busy
                ? "Saving…"
                : publishing
                  ? "Confirm & Publish"
                  : "Save Draft"}
            </button>
          </form>
        </PortalDialog>
      )}
      {action && (
        <PortalDialog
          title={`Confirm request ${action.type}`}
          onClose={() => setAction(null)}
        >
          <form className="portal-stack" onSubmit={mutate}>
            <p>
              {action.item.bloodType} ·{" "}
              {action.item.component.replaceAll("_", " ")} ·{" "}
              {action.item.units - action.item.unitsFulfilled} units remaining
            </p>
            {action.type === "prioritize" && (
              <label className="portal-field">
                Urgency
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                >
                  {["routine", "urgent", "critical"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            )}
            {action.type === "fulfill" && (
              <>
                <label className="portal-field">
                  Actual units received
                  <input
                    required
                    type="number"
                    min={1}
                    max={action.item.units - action.item.unitsFulfilled}
                    value={units}
                    onChange={(e) => setUnits(Number(e.target.value))}
                  />
                </label>
                <label className="portal-toggle-row">
                  <span>
                    The units were actually received and this is a verified
                    operational record.
                  </span>
                  <input
                    type="checkbox"
                    required
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                </label>
              </>
            )}
            {["prioritize", "fulfill", "close"].includes(action.type) && (
              <label className="portal-field">
                Reason
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <div className="portal-policy-note">
              {action.type === "publish"
                ? "Publishing notifies available, appropriate referral candidates. Verify request dates and coordinates first."
                : action.type === "cancel"
                  ? "Closing stops new responses and scheduling for this request. Review any existing appointments with the donors."
                  : "This change is audited. A manual receipt updates request fulfillment without inventing donation history or inventory intake."}
            </div>
            <button className="portal-button" type="submit" disabled={busy}>
              {busy ? "Updating…" : "Confirm Change"}
            </button>
          </form>
        </PortalDialog>
      )}
    </div>
  );
}
