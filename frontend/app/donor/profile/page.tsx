"use client";

import { useCallback, useEffect, useState } from "react";
import { Crosshair, MapPin, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { getApiErrorMessage } from "@/lib/api";
import {
  getDonorProfile,
  updateDonorProfile,
} from "@/services/profile-service";
import type { DonorProfile } from "@/types";

const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
const fieldClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none  focus:border-[#C0392B] focus:ring-2 focus:ring-red-100";

export default function ProfilePage() {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await getDonorProfile());
    } catch (loadError) {
      setError(
        getApiErrorMessage(loadError, "Unable to load your donor profile."),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const change = <K extends keyof DonorProfile>(
    key: K,
    value: DonorProfile[K],
  ) =>
    setProfile((current) => (current ? { ...current, [key]: value } : current));

  const locate = () => {
    if (!navigator.geolocation) {
      toast.error(
        "Location services are unavailable. Enter your location manually.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        change("latitude", coords.latitude);
        change("longitude", coords.longitude);
        toast.success(
          "Coordinates added. Confirm the city and address before saving.",
        );
        setLocating(false);
      },
      (locationError) => {
        toast.error(
          locationError.code === 1
            ? "Location permission was denied. Enter your location manually."
            : "Unable to determine your location. Enter it manually.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || saving) return;
    setSaving(true);
    try {
      setProfile(await updateDonorProfile(profile));
      toast.success("Your donor profile has been updated.");
    } catch (saveError) {
      toast.error(
        getApiErrorMessage(saveError, "Unable to save your profile right now."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState text="Loading your donor profile..." />;
  if (error)
    return (
      <EmptyState
        title="We could not load your profile"
        description={error}
        actionLabel="Try again"
        onAction={() => void load()}
      />
    );
  if (!profile)
    return (
      <EmptyState
        title="No donor profile found"
        description="Sign out and back in, then try again."
      />
    );

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            Profile completion
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Complete your profile to receive accurate blood-request matches.
          </p>
          <div className="mt-3 h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#C0392B]"
              style={{ width: `${profile.profileCompletion}%` }}
            />
          </div>
        </div>
        <span className="text-2xl font-semibold text-[#C0392B]">
          {profile.profileCompletion}%
        </span>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-xl bg-red-50 p-2 text-[#C0392B]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Personal and blood profile
            </h2>
            <p className="text-sm text-slate-500">
              Reported information supports referrals. Hospital screening and
              blood-type confirmation are still required.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Full name
            <input
              required
              className={fieldClass}
              value={profile.fullName}
              onChange={(e) => change("fullName", e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email
            <input
              disabled
              className={`${fieldClass} bg-slate-50 text-slate-500`}
              value={profile.email}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Phone
            <input
              className={fieldClass}
              value={profile.phone ?? ""}
              onChange={(e) => change("phone", e.target.value || null)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Blood type (reported)
            <select
              className={fieldClass}
              required
              value={profile.bloodTypeKnown ? profile.bloodType : ""}
              onChange={(e) => {
                change(
                  "bloodType",
                  e.target.value as DonorProfile["bloodType"],
                );
                change("bloodTypeKnown", true);
              }}
            >
              <option value="" disabled>
                Select your reported blood type
              </option>
              {bloodTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Date of birth
            <input
              type="date"
              className={fieldClass}
              value={profile.dateOfBirth ?? ""}
              onChange={(e) => change("dateOfBirth", e.target.value || null)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Last donation date
            <input
              type="date"
              className={fieldClass}
              value={profile.lastDonationDate ?? ""}
              onChange={(e) =>
                change("lastDonationDate", e.target.value || null)
              }
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Gender (optional)
            <input
              className={fieldClass}
              value={profile.gender ?? ""}
              onChange={(e) => change("gender", e.target.value || null)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Emergency contact
            <input
              className={fieldClass}
              value={profile.emergencyContact ?? ""}
              onChange={(e) =>
                change("emergencyContact", e.target.value || null)
              }
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Preferred radius (km)
            <input
              type="number"
              min="1"
              max="500"
              className={fieldClass}
              value={profile.preferredRadiusKm}
              onChange={(e) =>
                change("preferredRadiusKm", Number(e.target.value))
              }
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-red-50 p-2 text-[#C0392B]">
              <MapPin className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Donation location
              </h2>
              <p className="text-sm text-slate-500">
                Manual location entry is always available.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={locating}
            onClick={locate}
          >
            <Crosshair className="mr-2 h-4 w-4" />
            {locating ? "Locating..." : "Use my current location"}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Address
            <input
              className={fieldClass}
              value={profile.address ?? ""}
              onChange={(e) => change("address", e.target.value || null)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            City
            <input
              required
              className={fieldClass}
              value={profile.city}
              onChange={(e) => change("city", e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            State / region
            <input
              className={fieldClass}
              value={profile.region ?? ""}
              onChange={(e) => change("region", e.target.value || null)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Country
            <input
              required
              className={fieldClass}
              value={profile.country}
              onChange={(e) => change("country", e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Latitude
            <input
              type="number"
              step="any"
              className={fieldClass}
              value={profile.latitude ?? ""}
              onChange={(e) =>
                change(
                  "latitude",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Longitude
            <input
              type="number"
              step="any"
              className={fieldClass}
              value={profile.longitude ?? ""}
              onChange={(e) =>
                change(
                  "longitude",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-950">
          Availability & notifications
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["isAvailable", "Available to donate"],
            ["notifyUrgentRequests", "Urgent request alerts"],
            ["notifyAppointments", "Appointment updates"],
            ["notifyEligibility", "Eligibility reminders"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700"
            >
              <span>{label}</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#C0392B]"
                checked={Boolean(profile[key as keyof DonorProfile])}
                onChange={(e) =>
                  change(key as keyof DonorProfile, e.target.checked as never)
                }
              />
            </label>
          ))}
        </div>
      </section>
      <div className="sticky bottom-20 lg:bottom-4 flex justify-end">
        <Button disabled={saving} type="submit" className="shadow-lg">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
