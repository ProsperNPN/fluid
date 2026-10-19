"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
import { inventorySummary } from "@/services/smart-inventory-service";
import { getHospitalProfile } from "@/services/profile-service";
import { saveLocation } from "@/services/location-service";
import { LocationSelector } from "@/components/location/location-selector";
import { getApiErrorMessage, getApiValidationIssues } from "@/lib/api";
import {
  PortalDialog,
  PortalEmpty,
  PortalSkeleton,
  StatusPill,
} from "@/components/portal/portal-ui";
import type { BloodType, HospitalProfile } from "@/types";
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
function iso(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
type FieldErrors = Partial<Record<keyof HospitalRequestInput, string>>;
function validate(form: HospitalRequestInput, publishing: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (!["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].includes(form.bloodType)) errors.bloodType = "Choose a blood type.";
  if (!["red_cells", "whole_blood", "plasma", "platelets"].includes(form.component)) errors.component = "Choose a blood component.";
  if (!Number.isInteger(form.units) || form.units < 1 || form.units > 100) errors.units = "Enter a whole number from 1 to 100.";
  if (!["routine", "urgent", "critical"].includes(form.urgency)) errors.urgency = "Choose an urgency.";
  const required = form.requiredBy ? Date.parse(form.requiredBy) : NaN;
  const expires = form.expiresAt ? Date.parse(form.expiresAt) : NaN;
  if ((publishing || form.requiredBy) && (!Number.isFinite(required) || (publishing && required <= Date.now()))) errors.requiredBy = "Choose a future required-by date and time.";
  if ((publishing || form.expiresAt) && (!Number.isFinite(expires) || (publishing && expires <= Date.now()))) errors.expiresAt = "Choose a future expiration date and time.";
  if (Number.isFinite(required) && Number.isFinite(expires) && expires > required) errors.expiresAt = "Expiration must be on or before the required-by time.";
  if (form.location.trim().length < 2) errors.location = "Confirm the hospital address using the location selector.";
  if (publishing && (form.latitude === null || form.longitude === null || !Number.isFinite(form.latitude) || !Number.isFinite(form.longitude) || Math.abs(form.latitude) > 90 || Math.abs(form.longitude) > 180)) errors.location = "Confirm the hospital location using GPS, address search or the map.";
  return errors;
}
function facilityDefaults(hospital: HospitalProfile | null) {
  return { location: hospital?.address || hospital?.city || "", latitude: hospital?.latitude ?? null, longitude: hospital?.longitude ?? null, contactPerson: hospital?.authorizedRepresentative ?? null };
}
function requestError(error: unknown, fallback: string) {
  return getApiValidationIssues(error).map((issue) => issue.message).join(" ") || getApiErrorMessage(error, fallback);
}
export default function RequestsPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState(initial);
  const [hospital, setHospital] = useState<HospitalProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [selectLocation, setSelectLocation] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const submitting = useRef(false);
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
  const stockLoader = useCallback(
    () => (open ? inventorySummary() : Promise.resolve(null)),
    [open],
  );
  const stock = usePortalQuery(stockLoader);
  const relevantStock = stock.data?.groups.find(
    (g) => g.blood_type === form.bloodType && g.component === form.component,
  );
  useEffect(() => {
    const prefill = new URLSearchParams(window.location.search);
    setForm((f) => ({ ...f,
      bloodType: ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].includes(prefill.get("blood_type") || "") ? prefill.get("blood_type") as BloodType : f.bloodType,
      component: ["whole_blood", "red_cells", "plasma", "platelets"].includes(prefill.get("component") || "") ? prefill.get("component")! : f.component,
      units: Math.min(100, Math.max(1, Math.trunc(Number(prefill.get("units"))) || 1)),
    }));
    if (prefill.get("create")) setOpen(true);
  }, []);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setProfileLoading(true);
    setProfileError("");
    void getHospitalProfile().then((p) => {
      if (!alive) return;
      setHospital(p);
      setForm((f) => {
        const defaults = facilityDefaults(p);
        if (!edit) return { ...f, ...defaults, contactPerson: f.contactPerson || defaults.contactPerson };
        return f.latitude === null && f.longitude === null
          ? { ...f, latitude: defaults.latitude, longitude: defaults.longitude, location: f.location || defaults.location }
          : f;
      });
    }).catch((error) => {
      if (alive) setProfileError(requestError(error, "Unable to load your saved hospital location. Retry or select the facility below."));
    }).finally(() => { if (alive) setProfileLoading(false); });
    return () => { alive = false; };
  }, [open, edit]);
  function fieldState(field: keyof HospitalRequestInput) {
    return { id: `request-${field}`, "aria-invalid": !!errors[field], "aria-describedby": errors[field] ? `request-${field}-error` : undefined };
  }
  function fieldError(field: keyof HospitalRequestInput) {
    return errors[field] ? <span id={`request-${field}-error`} className="text-sm text-red-700" role="alert">{errors[field]}</span> : null;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (profileLoading || selectLocation) {
      setFormError(profileLoading ? "Wait for the saved hospital location to load." : "Confirm the facility location or close the location selector before saving.");
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent = submitter instanceof HTMLButtonElement ? submitter.value : null;
    const publishing = intent === "publish" || (!edit && intent !== "draft");
    const active = publishing || (!!edit && form.status === "published");
    const validation = validate(form, active);
    setErrors(validation);
    setFormError("");
    if (Object.keys(validation).length) {
      setFormError("Review the highlighted fields before saving.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (edit) {
        await updateHospitalRequest(edit, { ...form, status: "draft" });
        if (publishing) await publishHospitalRequest(edit);
      }
      else
        await createHospitalRequest({
          ...form,
          status: publishing ? "published" : "draft",
        });
      const message = publishing ? "Blood request published successfully." : edit ? "Request updated." : "Draft saved.";
      toast.success(message);
      setSuccess(message);
      setOpen(false);
      setEdit(null);
      setTab("all"); setPage(1); setSearch("");
      await q.refresh();
    } catch (e) {
      const fields: Record<string, keyof HospitalRequestInput> = { blood_type: "bloodType", component: "component", units: "units", urgency: "urgency", required_by: "requiredBy", expires_at: "expiresAt", location: "location", latitude: "location", longitude: "location" };
      const next: FieldErrors = {};
      for (const issue of getApiValidationIssues(e)) { const field = issue.field && fields[issue.field]; if (field) next[field] = issue.message; }
      setErrors(next);
      const message = requestError(e, "Unable to save request. Please try again.");
      setFormError(message);
      toast.error(message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function mutate(event: FormEvent) {
    event.preventDefault();
    if (!action || submitting.current) return;
    submitting.current = true;
    setActionError("");
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
      const message = action.type === "publish" ? "Blood request published successfully." : "Request updated and audited.";
      toast.success(message);
      setSuccess(message);
      if (action.type === "publish") { setTab("all"); setPage(1); setSearch(""); }
      setAction(null);
      await q.refresh();
    } catch (e) {
      const message = requestError(e, "Unable to update request.");
      setActionError(message);
      toast.error(message);
    } finally {
      submitting.current = false;
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
      status: item.status === "draft" ? "draft" : "published",
    });
    setErrors({}); setFormError(""); setSelectLocation(false);
    setProfileLoading(true);
    setOpen(true);
  }
  return (
    <div className="portal-stack">
      {success && <p role="status" className="portal-policy-note">{success}</p>}
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
            setForm({ ...initial, ...facilityDefaults(hospital) });
            setErrors({}); setFormError(""); setSelectLocation(false); setSuccess("");
            setEdit(null);
            setProfileLoading(true);
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
                      Edit Request
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
                    <button
                      className="portal-button portal-button--secondary"
                      onClick={() => editDraft(item)}
                    >
                      Edit Request
                    </button>
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
          title={edit ? "Edit Blood Request" : "Create a Blood Request"}
          onClose={() => { if (!submitting.current) setOpen(false); }}
        >
          <form onSubmit={submit} noValidate className="portal-stack" aria-busy={busy}>
            {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
            <fieldset disabled={busy} className="portal-stack min-w-0">
            <p className="portal-policy-note">
              {stock.error ? (
                "Current stock is unavailable. Verify stock before reviewing replenishment."
              ) : !stock.data ? (
                "Loading current clinically released stock…"
              ) : (
                <>
                  Current {form.bloodType} {form.component.replaceAll("_", " ")}{" "}
                  stock: {relevantStock?.available ?? 0} clinically released
                  unreserved unit(s). Review and approve this request before
                  publishing.
                </>
              )}
            </p>
            <div className="portal-form-grid">
              <label className="portal-field">
                Blood type
                <select
                  {...fieldState("bloodType")}
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
                {fieldError("bloodType")}
              </label>
              <label className="portal-field">
                Component
                <select
                  {...fieldState("component")}
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
                {fieldError("component")}
              </label>
              <label className="portal-field">
                Units needed
                <input
                  {...fieldState("units")}
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={form.units}
                  onChange={(e) =>
                    setForm({ ...form, units: Number(e.target.value) })
                  }
                />
                {fieldError("units")}
              </label>
              <label className="portal-field">
                Urgency
                <select
                  {...fieldState("urgency")}
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
                {fieldError("urgency")}
              </label>
              {(["requiredBy", "expiresAt"] as const).map((key) => (
                <label key={key} className="portal-field">
                  {key === "requiredBy" ? "Required by" : "Request expires"}
                  <input
                    {...fieldState(key)}
                    type="datetime-local"
                    required={form.status === "published"}
                    value={local(form[key])}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [key]: iso(e.target.value),
                      })
                    }
                  />
                  {fieldError(key)}
                </label>
              ))}
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
            <p className="portal-small-note">Choose future times. The request expires on or before the required-by time, when donor responses should stop.</p>
            <section aria-label="Hospital request location" className="portal-policy-note">
              <p><strong>Hospital location</strong></p>
              <p>{profileLoading ? "Loading saved hospital location…" : form.latitude !== null && form.longitude !== null ? form.location || "Confirmed facility pin" : "No facility pin saved. Use GPS or select the hospital on the map."}</p>
              {profileError && <p role="alert" className="text-sm text-red-700">{profileError}</p>}
              {fieldError("location")}
              {profileError && <button type="button" className="portal-text-link" disabled={profileLoading} onClick={async () => {
                setProfileLoading(true);
                try { const p = await getHospitalProfile(); setHospital(p); setForm((f) => ({ ...f, ...facilityDefaults(p) })); setProfileError(""); }
                catch (error) { setProfileError(requestError(error, "Unable to load the saved hospital location.")); }
                finally { setProfileLoading(false); }
              }}>Retry saved location</button>}
              <button type="button" className="portal-button portal-button--secondary mt-2" disabled={profileLoading} onClick={() => setSelectLocation((value) => !value)}>
                <MapPin size={16} />{selectLocation ? "Close location selector" : form.latitude !== null && form.longitude !== null ? "Review or change facility location" : "Set hospital location"}
              </button>
            </section>
            {selectLocation && <LocationSelector
              label="Confirm hospital facility location"
              showCoordinateFields={false}
              value={{ ...hospital, latitude: form.latitude, longitude: form.longitude, address: form.location }}
              onConfirm={async (selection) => {
                const saved = await saveLocation(selection);
                setForm((f) => ({ ...f, location: saved.address || selection.address, latitude: saved.latitude, longitude: saved.longitude }));
                setErrors((old) => ({ ...old, location: undefined }));
                setProfileError("");
                setSelectLocation(false);
                setHospital(await getHospitalProfile());
                setFormError(saved.confirmed_at ? "" : "Facility location saved. Hospital verification must be completed before publishing from this location.");
              }}
            />}
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
            {selectLocation && <p className="portal-small-note">Confirm the facility location or close the selector before saving.</p>}
            <div className="portal-dialog-actions">
              {!edit && <button className="portal-button" type="submit" name="intent" value="publish" disabled={busy || profileLoading || selectLocation}>
                {busy ? "Saving…" : "Publish Request"}
              </button>}
              <button className="portal-button portal-button--secondary" type="submit" name="intent" value="draft" disabled={busy || profileLoading || selectLocation}>
                {busy ? "Saving…" : edit ? "Save Changes" : "Save Draft"}
              </button>
              {edit && form.status === "draft" && <button className="portal-button" type="submit" name="intent" value="publish" disabled={busy || profileLoading || selectLocation}>
                {busy ? "Saving…" : "Save & Publish"}
              </button>}
            </div>
            </fieldset>
          </form>
        </PortalDialog>
      )}
      {action && (
        <PortalDialog
          title={`Confirm request ${action.type}`}
          onClose={() => { if (!submitting.current) { setAction(null); setActionError(""); } }}
        >
          <form className="portal-stack" onSubmit={mutate}>
            {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
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
