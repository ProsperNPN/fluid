"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bell, MapPin, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import {
  getDonorProfile,
  updateDonorProfile,
} from "@/services/profile-service";
import { getApiErrorMessage } from "@/lib/api";
import type { DonorProfile } from "@/types";
import {
  PortalEmpty,
  PortalPanel,
  PortalSkeleton,
} from "@/components/portal/portal-ui";

export default function AvailabilityPage() {
  const loader = useCallback(() => getDonorProfile(), []);
  const query = usePortalQuery(loader, 60000);
  const [form, setForm] = useState<DonorProfile | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.data && !form) setForm(query.data);
  }, [query.data, form]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      setForm(await updateDonorProfile(form));
      await query.refresh();
      toast.success("Availability and notification preferences saved.");
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to save preferences."));
    } finally {
      setBusy(false);
    }
  }
  if (query.loading) return <PortalSkeleton />;
  if (!form)
    return (
      <PortalEmpty
        title="Availability unavailable"
        description={query.error || "Complete your profile first."}
        href="/donor/profile"
        action="Open Profile"
      />
    );
  return (
    <form className="portal-stack" onSubmit={save}>
      <PortalPanel title="Your availability">
        <p className="portal-muted">
          Be visible for relevant referrals when you’re ready. Availability does
          not replace hospital screening.
        </p>
        <label className="portal-toggle-row">
          <span>
            <ShieldCheck size={20} />
            <strong>Available for donation opportunities</strong>
          </span>
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) =>
              setForm({ ...form, isAvailable: e.target.checked })
            }
          />
        </label>
        <label className="portal-field">
          <span>
            <MapPin size={17} />
            Preferred donation radius (km)
          </span>
          <select
            value={form.preferredRadiusKm}
            onChange={(e) =>
              setForm({ ...form, preferredRadiusKm: Number(e.target.value) })
            }
          >
            {[5, 10, 25, 50, 100].map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        </label>
        <p className="portal-small-note">
          Nearby matching uses saved GPS or manually entered coordinates. Set
          them in Profile &amp; Settings.
        </p>
      </PortalPanel>
      <PortalPanel title="Matching consent">
        <label className="portal-toggle-row">
          <span>Allow location-based matching and hospital invitations</span>
          <input
            type="checkbox"
            checked={form.matchingOptIn}
            onChange={(e) =>
              setForm({ ...form, matchingOptIn: e.target.checked })
            }
          />
        </label>
        <p className="portal-small-note">
          Hospitals see your blood group, approximate area and calculated
          distance, never your exact coordinates. Availability and matching
          consent are separate. Turn this off to stop new referrals.
        </p>
      </PortalPanel>
      <PortalPanel title="Notification preferences">
        <div className="portal-preferences">
          {(
            [
              ["notifyUrgentRequests", "Urgent request alerts"],
              ["notifyEmailAlerts", "Email emergency alerts"],
              [
                "notifySmsAlerts",
                "SMS emergency alerts (uses your saved phone number)",
              ],
              ["notifyAppointments", "Appointment updates"],
              ["notifyEligibility", "Eligibility reminders"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="portal-toggle-row">
              <span>
                <Bell size={18} />
                {label}
              </span>
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              />
            </label>
          ))}
        </div>
      </PortalPanel>
      <button className="portal-button" type="submit" disabled={busy}>
        <Save size={16} />
        {busy ? "Saving…" : "Save Preferences"}
      </button>
    </form>
  );
}
