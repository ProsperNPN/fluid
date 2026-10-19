"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Clock3, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import {
  getAppointmentPolicy,
  saveAppointmentPolicy,
  getAppointmentPreferences,
  saveAppointmentPreferences,
  type AppointmentPolicy,
} from "@/services/appointments-service";
import { PortalPanel } from "./portal-ui";

export function AppointmentAvailability({ hospital }: { hospital: boolean }) {
  const [form, setForm] = useState<AppointmentPolicy | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void (hospital ? getAppointmentPolicy() : getAppointmentPreferences())
      .then((value) => {
        if (active)
          setForm({
            enabled: true,
            slot_minutes: 30,
            capacity: 1,
            reminder_hours: [24, 2],
            preparation_instructions: "",
            ...value,
          });
      })
      .catch((e) => {
        if (active)
          setError(getApiErrorMessage(e, "Unable to load availability."));
      });
    return () => {
      active = false;
    };
  }, [hospital]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      if (hospital) await saveAppointmentPolicy(form);
      else
        await saveAppointmentPreferences({
          timezone: form.timezone,
          hours: form.hours,
        });
      toast.success("Appointment availability saved.");
      setError("");
      window.dispatchEvent(new Event("fluid:live-update"));
    } catch (e) {
      setError(getApiErrorMessage(e, "Unable to save availability."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <PortalPanel
      title={
        hospital
          ? "Operating hours & appointment capacity"
          : "Preferred appointment times"
      }
    >
      {error && (
        <p role="alert" className="text-red-700 mb-3">
          {error}
        </p>
      )}
      {!form ? (
        <p role="status">
          {error ? "Reload this page to retry." : "Loading availability…"}
        </p>
      ) : (
        <form onSubmit={save} className="portal-stack">
          <p className="portal-muted">
            {hospital
              ? "Configure slots before proposing appointments. Existing bookings must fit any changes to hours, duration, or capacity. Hospital administrators can save these settings."
              : "Preferred times help rank available slots. You can still select other times. Leave the list empty if you have no preference."}
          </p>
          <label className="portal-field">
            Time zone (IANA)
            <input
              required
              list="appointment-timezones"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </label>
          <datalist id="appointment-timezones">
            {[
              "Africa/Accra",
              "Africa/Lagos",
              "Africa/Nairobi",
              "Africa/Johannesburg",
              "Europe/London",
              "America/New_York",
              "UTC",
            ].map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          {hospital && (
            <>
              <label className="portal-toggle-row">
                <span>Accept appointment bookings</span>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.checked })
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="portal-field">
                  Slot duration
                  <select
                    value={form.slot_minutes}
                    onChange={(e) =>
                      setForm({ ...form, slot_minutes: Number(e.target.value) })
                    }
                  >
                    {[15, 30, 45, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>
                        {m} minutes
                      </option>
                    ))}
                  </select>
                </label>
                <label className="portal-field">
                  Donors per slot
                  <input
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={form.capacity}
                    onChange={(e) =>
                      setForm({ ...form, capacity: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
            </>
          )}
          {form.hours.map((hours, index) => (
            <div
              className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
              key={index}
            >
              <label className="portal-field">
                Day
                <select
                  value={hours.weekday}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hours: form.hours.map((h, i) =>
                        i === index
                          ? { ...h, weekday: Number(e.target.value) }
                          : h,
                      ),
                    })
                  }
                >
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ].map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="portal-field">
                From
                <input
                  type="time"
                  required
                  value={hours.start}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hours: form.hours.map((h, i) =>
                        i === index ? { ...h, start: e.target.value } : h,
                      ),
                    })
                  }
                />
              </label>
              <label className="portal-field">
                Until
                <input
                  type="time"
                  required
                  value={hours.end}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hours: form.hours.map((h, i) =>
                        i === index ? { ...h, end: e.target.value } : h,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                aria-label={`Remove hours ${index + 1}`}
                className="p-2 mb-1"
                onClick={() =>
                  setForm({
                    ...form,
                    hours: form.hours.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={form.hours.length >= 21}
            className="portal-button portal-button--secondary"
            onClick={() =>
              setForm({
                ...form,
                hours: [
                  ...form.hours,
                  { weekday: 0, start: "08:00", end: "17:00" },
                ],
              })
            }
          >
            <Plus size={16} />
            Add time window
          </button>
          {hospital && (
            <>
              <fieldset>
                <legend className="font-medium text-sm mb-2">
                  In-app reminders before the visit
                </legend>
                <div className="flex gap-5 flex-wrap">
                  {[1, 2, 24, 48].map((h) => (
                    <label key={h} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.reminder_hours.includes(h)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            reminder_hours: e.target.checked
                              ? [...form.reminder_hours, h]
                              : form.reminder_hours.filter((v) => v !== h),
                          })
                        }
                      />
                      {h} hours
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="portal-field">
                Hospital-approved preparation instructions
                <textarea
                  maxLength={2000}
                  rows={4}
                  value={form.preparation_instructions}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      preparation_instructions: e.target.value,
                    })
                  }
                />
              </label>
            </>
          )}
          <button className="portal-button" disabled={busy}>
            <Clock3 size={16} />
            {busy ? "Saving…" : "Save availability"}
          </button>
        </form>
      )}
    </PortalPanel>
  );
}
