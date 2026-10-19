"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CalendarDays,
  MapPin,
  Download,
  Clock3,
  Plus,
  List,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import {
  listAppointments,
  scheduleAppointment,
  updateAppointmentStatus,
  downloadDonationConfirmation,
  getAppointmentSlots,
  createAppointment,
  getAppointmentHistory,
  downloadAppointmentCalendar,
  type AvailableSlot,
} from "@/services/appointments-service";
import {
  listHospitalDonorResponses,
  type HospitalDonorResponse,
} from "@/services/hospital-donors-service";
import { getApiErrorMessage } from "@/lib/api";
import type { Appointment } from "@/types";
import {
  PortalDialog,
  PortalEmpty,
  PortalSkeleton,
  StatusPill,
  PortalPanel,
} from "./portal-ui";
import { AppointmentAvailability } from "./appointment-availability";
function dayString(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function displayTime(value: string, zone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(value));
}
type Action =
  | "schedule"
  | "confirmed"
  | "cancelled"
  | "no_show"
  | "checked_in"
  | "completed"
  | "history"
  | "create";
export function AppointmentsPage({
  scope,
  history = false,
}: {
  scope: "donor" | "hospital";
  history?: boolean;
}) {
  const hospital = scope === "hospital";
  const [tab, setTab] = useState(history ? "all" : "upcoming"),
    [page, setPage] = useState(1),
    [view, setView] = useState("list"),
    [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(""),
    [dateFilter, setDateFilter] = useState(""),
    [requestFilter, setRequestFilter] = useState("");
  const [week, setWeek] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return dayString(d);
  });
  const loader = useCallback(() => {
    const from = dateFilter || (view === "calendar" ? week : "");
    const start = from ? new Date(from + "T00:00:00") : null;
    const end = start ? new Date(start.getTime()) : null;
    if (end) end.setDate(end.getDate() + (dateFilter ? 1 : 7));
    return listAppointments({
      scope,
      page,
      pageSize: view === "calendar" ? 100 : 12,
      status: tab,
      search: search || undefined,
      requestId: requestFilter || undefined,
      fromDate: start?.toISOString(),
      toDate: end?.toISOString(),
    });
  }, [scope, page, tab, search, requestFilter, dateFilter, view, week]);
  const q = usePortalQuery(loader);
  const [dialog, setDialog] = useState<{
      item: Appointment | null;
      action: Action;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [screening, setScreening] = useState(false),
    [procedure, setProcedure] = useState(false),
    [units, setUnits] = useState(1),
    [instructions, setInstructions] = useState("");
  const [startDate, setStartDate] = useState(dayString(new Date())),
    [slot, setSlot] = useState(""),
    [slots, setSlots] = useState<AvailableSlot[]>([]),
    [slotZone, setSlotZone] = useState(""),
    [slotError, setSlotError] = useState(""),
    [slotLoading, setSlotLoading] = useState(false);
  const [eligible, setEligible] = useState<HospitalDonorResponse[]>([]),
    [selection, setSelection] = useState("");
  const [events, setEvents] = useState<
    Awaited<ReturnType<typeof getAppointmentHistory>>["items"]
  >([]);
  const selected = eligible.find((r) => r.id === selection);
  useEffect(() => {
    if (!dialog) return;
    let active = true;
    if (dialog.action === "create")
      void listHospitalDonorResponses(1)
        .then(async (first) => {
          const pages = await Promise.all(
            Array.from({ length: first.totalPages - 1 }, (_, i) =>
              listHospitalDonorResponses(i + 2),
            ),
          );
          if (active)
            setEligible(
              [...first.items, ...pages.flatMap((p) => p.items)].filter((r) =>
                ["pending", "accepted", "scheduled"].includes(
                  r.responseStatus || "",
                ),
              ),
            );
        })
        .catch((e) => {
          if (active)
            setSlotError(
              getApiErrorMessage(e, "Unable to load donor referrals."),
            );
        });
    if (dialog.action === "history" && dialog.item)
      void getAppointmentHistory(dialog.item.id)
        .then((r) => {
          if (active) setEvents(r.items);
        })
        .catch((e) => {
          if (active)
            setSlotError(getApiErrorMessage(e, "Unable to load history."));
        });
    return () => {
      active = false;
    };
  }, [dialog]);
  useEffect(() => {
    if (
      !dialog ||
      !["schedule", "create"].includes(dialog.action) ||
      (!dialog.item && !selected)
    )
      return;
    let active = true;
    setSlotLoading(true);
    setSlotError("");
    setSlot("");
    void getAppointmentSlots({
      appointmentId: dialog.item?.id,
      requestId: selected?.requestId || undefined,
      donorUserId: selected?.donorUserId || undefined,
      startDate,
    })
      .then((result) => {
        if (active) {
          setSlots(result.items);
          setSlotZone(result.timezone);
          if (!result.items.length)
            setSlotError(result.notice || "No available slots in this week.");
        }
      })
      .catch((e) => {
        if (active) {
          setSlots([]);
          setSlotError(
            getApiErrorMessage(e, "Unable to load available slots."),
          );
        }
      })
      .finally(() => {
        if (active) setSlotLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dialog, selected, startDate]);
  function show(item: Appointment | null, action: Action) {
    setDialog({ item, action });
    setReason("");
    setScreening(false);
    setProcedure(false);
    setUnits(1);
    setInstructions(item?.preparationInstructions || "");
    setStartDate(dayString(new Date()));
    setSlot("");
    setSlots([]);
    setSlotError("");
    setEvents([]);
    setEligible([]);
    setSelection("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    setBusy(true);
    try {
      const { item, action } = dialog;
      if (action === "create") {
        if (!selected?.requestId || !selected.donorUserId || !slot) return;
        await createAppointment({
          blood_request_id: selected.requestId,
          donor_user_id: selected.donorUserId,
          scheduled_at: slot,
          preparation_instructions: instructions || undefined,
        });
      } else if (item && action === "schedule")
        await scheduleAppointment(
          item.id,
          slot,
          item.version,
          hospital ? instructions || undefined : undefined,
        );
      else if (item && action !== "history")
        await updateAppointmentStatus(
          item.id,
          action as Appointment["status"],
          undefined,
          screening,
          {
            expected_version: item.version,
            procedure_confirmed: procedure,
            actual_units: action === "completed" ? units : undefined,
            reason: reason || undefined,
          },
        );
      toast.success(
        ["create", "schedule"].includes(action)
          ? "Time proposed. The other party must confirm."
          : "Appointment updated.",
      );
      setDialog(null);
      await q.refresh();
      window.dispatchEvent(new Event("fluid:live-update"));
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to update this appointment."));
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string, calendar = false) {
    try {
      if (calendar) await downloadAppointmentCalendar(id);
      else await downloadDonationConfirmation(id);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to download this record."));
    }
  }
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week + "T00:00:00");
    d.setDate(d.getDate() + i);
    return d;
  });
  function moveWeek(direction: number) {
    const d = new Date(week + "T00:00:00");
    d.setDate(d.getDate() + direction * 7);
    setWeek(dayString(d));
    setPage(1);
    setDateFilter("");
  }
  function card(item: Appointment) {
    const live = ["pending", "confirmed", "checked_in"].includes(item.status);
    return (
      <article className="portal-panel" key={item.id}>
        <div className="flex items-center justify-between gap-2">
          <CalendarDays className="text-[#C0392B]" size={22} />
          <StatusPill status={item.status} />
        </div>
        <h2 className="mt-4 font-semibold">
          {hospital ? item.donorName : item.hospitalName}
        </h2>
        <p className="portal-muted mt-2">
          {item.isScheduled
            ? displayTime(item.scheduledAt)
            : "Awaiting a time proposal"}
        </p>
        {item.isScheduled && (
          <p className="portal-small-note">
            Hospital time: {displayTime(item.scheduledAt, item.timezone)} (
            {item.timezone})
          </p>
        )}
        <p className="portal-small-note">
          <MapPin className="inline" size={14} /> {item.location}
        </p>
        <p className="portal-small-note">
          <strong>{item.bloodType}</strong> ·{" "}
          {item.component.replaceAll("_", " ")}
        </p>
        <a
          className="portal-text-link"
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.hospitalLatitude != null && item.hospitalLongitude != null ? `${item.hospitalLatitude},${item.hospitalLongitude}` : `${item.hospitalName}, ${item.location}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          View location & directions
        </a>
        {item.preparationInstructions && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm whitespace-pre-wrap">
            <strong>Preparation instructions</strong>
            <p className="mt-1">{item.preparationInstructions}</p>
          </div>
        )}
        {item.status === "pending" && (
          <p className="portal-small-note">
            {item.isScheduled
              ? `Awaiting ${item.proposedBy === "hospital" ? "donor" : "hospital"} confirmation.`
              : "Select an available slot to propose a visit."}
          </p>
        )}
        {item.cancellationReason && (
          <p className="portal-small-note">Reason: {item.cancellationReason}</p>
        )}
        <div className="portal-dialog-actions mt-4">
          {live && item.status !== "checked_in" && (
            <>
              <button
                className="portal-button portal-button--secondary"
                onClick={() => show(item, "schedule")}
              >
                {item.isScheduled
                  ? "Request rescheduling"
                  : "Propose appointment"}
              </button>
              <button
                className="portal-button portal-button--secondary"
                onClick={() => show(item, "cancelled")}
              >
                {hospital ? "Cancel" : "Decline / Cancel"}
              </button>
            </>
          )}
          {item.status === "pending" &&
            item.isScheduled &&
            ((hospital && item.proposedBy === "donor") ||
              (!hospital && item.proposedBy === "hospital")) && (
              <button
                className="portal-button"
                onClick={() => show(item, "confirmed")}
              >
                Confirm appointment
              </button>
            )}
          {hospital && item.status === "confirmed" && (
            <>
              <button
                className="portal-button"
                onClick={() => show(item, "checked_in")}
              >
                Check in
              </button>
              <button
                className="portal-button portal-button--secondary"
                onClick={() => show(item, "no_show")}
              >
                Record no-show
              </button>
            </>
          )}
          {hospital && item.status === "checked_in" && (
            <>
              <button
                className="portal-button"
                onClick={() => show(item, "completed")}
              >
                Record donation outcome
              </button>
              <button
                className="portal-button portal-button--secondary"
                onClick={() => show(item, "cancelled")}
              >
                Procedure not completed
              </button>
            </>
          )}
          {["confirmed", "checked_in"].includes(item.status) && (
            <button
              className="portal-text-link"
              onClick={() => void download(item.id, true)}
            >
              <Download size={15} />
              Add to calendar
            </button>
          )}
          {item.status === "completed" && (
            <button
              className="portal-text-link"
              onClick={() => void download(item.id)}
            >
              <Download size={15} />
              Donation confirmation
            </button>
          )}
          <button
            className="portal-text-link"
            onClick={() => show(item, "history")}
          >
            View history
          </button>
        </div>
      </article>
    );
  }
  return (
    <div className="portal-stack">
      <PortalPanel title={history ? "Donation history" : "Appointments"}>
        <p className="portal-muted">
          Times use your device time zone. Hospital time is shown separately. A
          confirmed visit still requires clinical screening.
        </p>
        <div className="portal-dialog-actions mt-3">
          {hospital && (
            <button
              className="portal-button"
              onClick={() => show(null, "create")}
            >
              <Plus size={16} />
              Propose appointment
            </button>
          )}
          <button
            className="portal-button portal-button--secondary"
            aria-expanded={settings}
            onClick={() => setSettings(!settings)}
          >
            <Clock3 size={16} />
            {hospital ? "Hours & capacity" : "Preferred times"}
          </button>
          {hospital && (
            <button
              className="portal-button portal-button--secondary"
              onClick={() => {
                setView(view === "list" ? "calendar" : "list");
                setPage(1);
              }}
            >
              {view === "list" ? (
                <CalendarDays size={16} />
              ) : (
                <List size={16} />
              )}{" "}
              {view === "list" ? "Calendar view" : "List view"}
            </button>
          )}
        </div>
      </PortalPanel>
      {settings && <AppointmentAvailability hospital={hospital} />}
      <div className="portal-request-tools">
        {[
          "upcoming",
          "pending",
          "confirmed",
          "checked_in",
          "completed",
          "closed",
          "all",
        ].map((t) => (
          <button
            key={t}
            className={`portal-filter ${tab === t ? "is-active" : ""}`}
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
          >
            {t === "closed" ? "Cancelled / No-show" : t.replaceAll("_", " ")}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="portal-field">
          {hospital ? "Find donor" : "Find hospital"}
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
          Date (your time zone)
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="portal-field">
          Blood request ID
          <input
            value={requestFilter}
            onChange={(e) => {
              setRequestFilter(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {view === "calendar" && (
        <>
          <div className="flex justify-between items-center">
            <button
              className="portal-button portal-button--secondary"
              aria-label="Previous week"
              onClick={() => moveWeek(-1)}
            >
              <ChevronLeft size={17} />
            </button>
            <strong>
              Week of {new Date(week + "T00:00:00").toLocaleDateString()}
            </strong>
            <button
              className="portal-button portal-button--secondary"
              aria-label="Next week"
              onClick={() => moveWeek(1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {days.map((d) => (
              <button
                key={dayString(d)}
                className="rounded-xl border bg-white p-3 text-left"
                onClick={() => setDateFilter(dayString(d))}
              >
                <strong className="block text-sm">
                  {d.toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                  })}
                </strong>
                {q.data?.items
                  .filter(
                    (a) =>
                      a.isScheduled &&
                      dayString(new Date(a.scheduledAt)) === dayString(d),
                  )
                  .map((a) => (
                    <span
                      key={a.id}
                      className="mt-2 block rounded bg-red-50 p-1 text-xs text-red-800"
                    >
                      {new Date(a.scheduledAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {a.donorName}
                    </span>
                  ))}
              </button>
            ))}
          </div>
          <p className="portal-small-note">
            Calendar entries reflect the current page. Select a day to focus its
            appointments; clear the date to return to the full week.
          </p>
        </>
      )}
      {q.loading ? (
        <PortalSkeleton />
      ) : q.error ? (
        <PortalEmpty title="Appointments unavailable" description={q.error} />
      ) : q.data?.items.length ? (
        <div className="portal-request-grid">{q.data.items.map(card)}</div>
      ) : (
        <PortalEmpty
          title="No appointments in this view"
          description="Appointments appear after a donor expresses availability and the hospital coordinates a visit."
        />
      )}
      {q.data && q.data.totalPages > 1 && (
        <div className="portal-pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} / {q.data.totalPages} · {q.data.total} appointments
          </span>
          <button
            disabled={page >= q.data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
      {dialog && (
        <PortalDialog
          title={
            dialog.action === "create"
              ? "Propose an appointment"
              : dialog.action === "schedule"
                ? "Select an available time"
                : dialog.action === "history"
                  ? "Appointment history"
                  : `Confirm ${dialog.action.replaceAll("_", " ")}`
          }
          onClose={() => setDialog(null)}
        >
          <form onSubmit={submit} className="portal-stack">
            {dialog.item && (
              <p className="portal-muted">
                {dialog.item.hospitalName} · {dialog.item.donorName}
              </p>
            )}
            {dialog.action === "create" && (
              <label className="portal-field">
                Donor referral
                <select
                  required
                  value={selection}
                  onChange={(e) => setSelection(e.target.value)}
                >
                  <option value="">Choose an accepted invitation</option>
                  {eligible.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.donor} · {r.bloodType} · {r.requestId?.slice(0, 8)} ·{" "}
                      {r.responseStatus}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {["create", "schedule"].includes(dialog.action) && (
              <>
                <label className="portal-field">
                  Search week starting
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label className="portal-field">
                  Available slot {slotZone && `(${slotZone})`}
                  <select
                    required
                    disabled={slotLoading || !slots.length}
                    value={slot}
                    onChange={(e) => setSlot(e.target.value)}
                  >
                    <option value="">
                      {slotLoading
                        ? "Loading available times…"
                        : "Choose a slot"}
                    </option>
                    {slots.map((s) => (
                      <option key={s.scheduled_at} value={s.scheduled_at}>
                        {displayTime(s.scheduled_at, slotZone || undefined)} ·{" "}
                        {s.available_capacity} places
                        {s.preferred ? " · Preferred time" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {hospital && (
                  <label className="portal-field">
                    Preparation instructions
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                    />
                  </label>
                )}
                <p className="portal-policy-note">
                  This reserves the slot as a pending proposal. The other party
                  must confirm. Urgent requests are limited by their deadlines;
                  clinical screening remains required.
                </p>
              </>
            )}
            {dialog.action === "completed" && (
              <>
                <p className="portal-policy-note">
                  Record the actual procedure only. This updates verified
                  donation history and request fulfillment. Collected blood is
                  not automatically added to usable inventory.
                </p>
                <label className="portal-toggle-row">
                  <span>Required clinical checks were completed.</span>
                  <input
                    type="checkbox"
                    required
                    checked={screening}
                    onChange={(e) => setScreening(e.target.checked)}
                  />
                </label>
                <label className="portal-toggle-row">
                  <span>The donation procedure was actually completed.</span>
                  <input
                    type="checkbox"
                    required
                    checked={procedure}
                    onChange={(e) => setProcedure(e.target.checked)}
                  />
                </label>
                <label className="portal-field">
                  Actual collected units
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={units}
                    onChange={(e) => setUnits(Number(e.target.value))}
                  />
                </label>
              </>
            )}
            {dialog.action === "cancelled" && (
              <label className="portal-field">
                Reason (optional; avoid sensitive medical details)
                <textarea
                  rows={3}
                  maxLength={500}
                  required={dialog.item?.status === "checked_in"}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            {dialog.action === "confirmed" && (
              <p>
                Confirm this proposed time. Availability remains subject to
                hospital screening.
              </p>
            )}
            {dialog.action === "checked_in" && (
              <p>
                Confirm the donor has arrived. Check-in does not record a
                donation.
              </p>
            )}
            {dialog.action === "no_show" && (
              <p>
                Confirm the donor did not attend. A no-show can be recorded
                after the appointment ends and a 15-minute grace period.
              </p>
            )}
            {slotError && (
              <p role="alert" className="text-red-700">
                {slotError}
              </p>
            )}
            {dialog.action === "history" ? (
              <div className="divide-y">
                {events.length ? (
                  events.map((e) => (
                    <div key={e.version} className="py-3 text-sm">
                      <strong>{e.action.replaceAll("_", " ")}</strong>
                      <p>
                        {displayTime(e.created_at)} · {e.details.status}
                      </p>
                      {e.details.reason && <p>{e.details.reason}</p>}
                    </div>
                  ))
                ) : (
                  <p>No recorded changes yet.</p>
                )}
              </div>
            ) : (
              <div className="portal-dialog-actions">
                <button
                  className="portal-button portal-button--secondary"
                  type="button"
                  onClick={() => setDialog(null)}
                >
                  Back
                </button>
                <button
                  className="portal-button"
                  disabled={
                    busy ||
                    (["create", "schedule"].includes(dialog.action) &&
                      (!slot || slotLoading))
                  }
                >
                  {busy
                    ? "Saving…"
                    : ["create", "schedule"].includes(dialog.action)
                      ? "Propose time"
                      : "Confirm change"}
                </button>
              </div>
            )}
          </form>
        </PortalDialog>
      )}
    </div>
  );
}
