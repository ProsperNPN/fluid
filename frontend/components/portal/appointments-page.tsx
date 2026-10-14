"use client";
import { useCallback, useState, type FormEvent } from "react";
import { CalendarDays, MapPin, Download } from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import {
  listAppointments,
  scheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
  downloadDonationConfirmation,
} from "@/services/appointments-service";
import { getApiErrorMessage } from "@/lib/api";
import type { Appointment } from "@/types";
import {
  PortalDialog,
  PortalEmpty,
  PortalSkeleton,
  StatusPill,
} from "./portal-ui";
function localDate(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function AppointmentsPage({
  scope,
  history = false,
}: {
  scope: "donor" | "hospital";
  history?: boolean;
}) {
  const [tab, setTab] = useState(history ? "all" : "upcoming");
  const [page, setPage] = useState(1);
  const loader = useCallback(
    () => listAppointments({ scope, page, pageSize: 12, status: tab }),
    [scope, page, tab],
  );
  const q = usePortalQuery(loader);
  const [dialog, setDialog] = useState<{
    item: Appointment;
    action: "schedule" | "cancelled" | "missed" | "completed";
  } | null>(null);
  const [time, setTime] = useState("");
  const [screening, setScreening] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    setBusy(true);
    try {
      const { item, action } = dialog;
      if (action === "schedule")
        await scheduleAppointment(item.id, new Date(time).toISOString());
      else if (action === "cancelled") await cancelAppointment(item.id);
      else await updateAppointmentStatus(item.id, action, undefined, screening);
      toast.success(
        action === "schedule"
          ? scope === "donor"
            ? "Time proposed. Awaiting hospital confirmation."
            : "Appointment confirmed."
          : `Appointment marked ${action}.`,
      );
      setDialog(null);
      await q.refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to update this appointment."));
    } finally {
      setBusy(false);
    }
  }
  function show(
    item: Appointment,
    action: "schedule" | "cancelled" | "missed" | "completed",
  ) {
    setDialog({ item, action });
    setTime(localDate(item.scheduledAt));
    setScreening(false);
  }
  async function receipt(id: string) {
    try {
      await downloadDonationConfirmation(id);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to download the record."));
    }
  }
  return (
    <div className="portal-stack">
      <div className="portal-request-tools">
        {(history
          ? ["all", "completed", "upcoming", "closed"]
          : ["upcoming", "completed", "closed"]
        ).map((t) => (
          <button
            key={t}
            className={`portal-filter ${tab === t ? "is-active" : ""}`}
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
          >
            {t === "closed"
              ? "Cancelled / missed"
              : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {q.loading ? (
        <PortalSkeleton />
      ) : q.error ? (
        <PortalEmpty title="Appointments unavailable" description={q.error} />
      ) : q.data?.items.length ? (
        <div className="portal-request-grid">
          {q.data.items.map((item) => (
            <article className="portal-panel" key={item.id}>
              <div className="portal-dialog-identity">
                <span className="portal-hospital-mark">
                  <CalendarDays size={24} />
                </span>
                <StatusPill status={item.status} />
              </div>
              <h2 className="mt-4 text-sm font-semibold">
                {scope === "donor" ? item.hospitalName : item.donorName}
              </h2>
              <p className="portal-muted mt-2">
                {new Date(item.scheduledAt).toLocaleString()}
              </p>
              <p className="portal-small-note">
                <MapPin size={13} className="inline" /> {item.location}
              </p>
              <p className="portal-small-note">
                <strong>{item.bloodType}</strong> · {item.units} unit(s) ·{" "}
                {item.department || "Donation appointment"}
              </p>
              {item.status === "pending" && (
                <p className="portal-small-note">
                  Awaiting hospital-approved confirmation.
                </p>
              )}
              {["pending", "confirmed"].includes(item.status) && (
                <div className="portal-dialog-actions mt-4">
                  <button
                    className="portal-button portal-button--secondary"
                    onClick={() => show(item, "cancelled")}
                  >
                    Cancel
                  </button>
                  <button
                    className="portal-button"
                    onClick={() => show(item, "schedule")}
                  >
                    {scope === "donor" ? "Propose Time" : "Schedule / Confirm"}
                  </button>
                  {scope === "hospital" && (
                    <>
                      <button
                        className="portal-button portal-button--secondary"
                        onClick={() => show(item, "missed")}
                      >
                        Missed
                      </button>
                      <button
                        className="portal-button"
                        disabled={item.status !== "confirmed"}
                        onClick={() => show(item, "completed")}
                      >
                        Record Completion
                      </button>
                    </>
                  )}
                </div>
              )}
              {item.status === "completed" && scope === "donor" && (
                <button
                  className="portal-text-link"
                  onClick={() => void receipt(item.id)}
                >
                  <Download size={15} />
                  Download Confirmation
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <PortalEmpty
          title="No appointment activity in this view"
          description="After a hospital reviews your donation interest, the appointment appears here for coordination."
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
      {dialog && (
        <PortalDialog
          title={
            dialog.action === "schedule"
              ? "Coordinate an Appointment"
              : `Confirm ${dialog.action}`
          }
          onClose={() => setDialog(null)}
        >
          <form onSubmit={submit} className="portal-stack">
            <p className="portal-muted">
              {dialog.item.hospitalName} · {dialog.item.donorName}
            </p>
            {dialog.action === "schedule" ? (
              <>
                <label className="portal-field">
                  Appointment date & time
                  <input
                    type="datetime-local"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </label>
                <div className="portal-policy-note">
                  {scope === "donor"
                    ? "This proposes a time for hospital approval. It does not confirm the appointment."
                    : "Confirm the agreed appointment time with the donor."}
                </div>
              </>
            ) : dialog.action === "completed" ? (
              <>
                <div className="portal-policy-note">
                  Record an actual completed donation after clinical screening.
                  This updates donation history and request fulfillment.
                  Inventory intake is recorded separately after the facility’s
                  testing and release process.
                </div>
                <label className="portal-toggle-row">
                  <span>
                    Clinical screening and the completed donation have been
                    confirmed.
                  </span>
                  <input
                    type="checkbox"
                    required
                    checked={screening}
                    onChange={(e) => setScreening(e.target.checked)}
                  />
                </label>
              </>
            ) : (
              <p>
                Please confirm this appointment should be marked {dialog.action}
                . The other party will be notified.
              </p>
            )}
            <div className="portal-dialog-actions">
              <button
                type="button"
                className="portal-button portal-button--secondary"
                onClick={() => setDialog(null)}
              >
                Back
              </button>
              <button className="portal-button" type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : dialog.action === "schedule"
                    ? scope === "donor"
                      ? "Propose Time"
                      : "Confirm Appointment"
                    : "Confirm Change"}
              </button>
            </div>
          </form>
        </PortalDialog>
      )}
    </div>
  );
}
