"use client";
import { useCallback, useEffect, useState } from "react";
import { Building2, Crosshair, FileCheck2, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { getApiErrorMessage } from "@/lib/api";
import {
  getHospitalProfile,
  updateHospitalProfile,
} from "@/services/profile-service";
import {
  openVerificationDocument,
  getMyVerification,
  submitVerification,
  type VerificationRequest,
} from "@/services/verification-service";
import type { HospitalProfile } from "@/types";

const input =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#C0392B] focus:ring-2 focus:ring-red-100";
const documentTypes = [
  ["registration_certificate", "Hospital registration certificate"],
  ["operating_license", "Operating license"],
  ["blood_bank_license", "Blood bank license"],
  ["administrator_identification", "Administrator identification"],
  ["supporting_document", "Additional supporting document"],
] as const;

export default function HospitalProfilePage() {
  const [profile, setProfile] = useState<HospitalProfile | null>(null),
    [verification, setVerification] = useState<VerificationRequest | null>(
      null,
    );
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [locating, setLocating] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getHospitalProfile();
      setProfile(p);
      setVerification(
        p.memberRole === "hospital_admin" ? await getMyVerification() : null,
      );
    } catch (e) {
      setError(getApiErrorMessage(e, "Unable to load the hospital profile."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const change = <K extends keyof HospitalProfile>(
    key: K,
    value: HospitalProfile[K],
  ) =>
    setProfile((current) => (current ? { ...current, [key]: value } : current));
  const locate = () => {
    if (!navigator.geolocation) {
      toast.error(
        "Location services are unavailable. You can continue with manual entry.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        change("latitude", coords.latitude);
        change("longitude", coords.longitude);
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`,
            { headers: { Accept: "application/json" } },
          );
          if (!response.ok) throw new Error();
          const result = await response.json();
          const address = result.address || {};
          change("address", result.display_name || "");
          change("city", address.city || address.town || address.village || "");
          change("region", address.state || address.region || null);
          change("country", address.country || "");
          change("postalCode", address.postcode || null);
          toast.success(
            "Location found. Review and edit the address before saving.",
          );
        } catch {
          toast.warning(
            "Coordinates were added, but the address could not be retrieved. Please enter it manually.",
          );
        } finally {
          setLocating(false);
        }
      },
      (error) => {
        setLocating(false);
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. You can continue with manual entry."
            : "Your location could not be determined. Please enter it manually.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || saving) return;
    setSaving(true);
    try {
      setProfile(await updateHospitalProfile(profile));
      toast.success("Hospital profile updated.");
    } catch (err) {
      toast.error(
        getApiErrorMessage(err, "Unable to update the hospital profile."),
      );
    } finally {
      setSaving(false);
    }
  };
  const submit = async () => {
    const entries = Object.entries(files)
      .filter((v): v is [string, File] => Boolean(v[1]))
      .map(([type, file]) => ({ type, file }));
    if (!entries.length)
      return toast.error("Select at least one verification document.");
    setSubmitting(true);
    try {
      setVerification(await submitVerification(entries));
      toast.success(
        "Your verification documents have been submitted successfully. Our team will review them and contact you shortly.",
      );
      setFiles({});
    } catch (e) {
      toast.error(
        getApiErrorMessage(e, "Unable to submit verification documents."),
      );
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) return <LoadingState text="Loading hospital profile..." />;
  if (error)
    return (
      <EmptyState
        title="Profile unavailable"
        description={error}
        actionLabel="Try again"
        onAction={() => void load()}
      />
    );
  if (!profile) return null;
  if (profile && profile.memberRole !== "hospital_admin")
    return (
      <section className="portal-panel">
        <h1 className="text-xl font-bold">{profile.hospitalName}</h1>
        <p className="portal-small-note">
          {profile.address}, {profile.city}, {profile.country}
        </p>
        <p className="portal-small-note">
          Verification: {profile.verificationStatus.replaceAll("_", " ")} · Your
          role: {profile.memberRole.replaceAll("_", " ")}
        </p>
        <p className="portal-small-note">
          Hospital administrators manage facility details and verification
          documents.
        </p>
      </section>
    );
  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-6">
        <section
          className={`rounded-2xl border p-4 ${profile.verificationStatus === "verified" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
        >
          <div className="flex gap-3">
            <FileCheck2 className="h-5 w-5" />
            <div>
              <p className="font-semibold capitalize">
                Verification: {profile.verificationStatus.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-sm">
                {verification?.hospital_message ||
                  "Only verified hospitals can publish live blood requests."}
              </p>
              {verification?.submitted_at ? (
                <p className="mt-1 text-xs">
                  Submitted{" "}
                  {new Date(verification.submitted_at).toLocaleString()}
                </p>
              ) : null}
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-[#C0392B]" />
            <div>
              <h2 className="font-semibold">Hospital profile</h2>
              <p className="text-sm text-slate-500">
                Keep official registration and contact details current.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["hospitalName", "Official hospital name"],
                ["registrationNumber", "Registration / license number"],
                ["hospitalType", "Hospital type"],
                ["contactPhone", "Phone"],
                ["officialEmail", "Official email"],
                ["website", "Website"],
                ["emergencyContact", "Emergency contact"],
                ["operatingHours", "Operating hours"],
                ["authorizedRepresentative", "Authorized representative"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm font-medium">
                {label}
                <input
                  className={input}
                  value={(profile[key] as string | null) ?? ""}
                  onChange={(e) =>
                    change(key, (e.target.value || null) as never)
                  }
                />
              </label>
            ))}
            <label className="text-sm font-medium">
              Ownership
              <select
                className={input}
                value={profile.ownershipType || ""}
                onChange={(e) =>
                  change(
                    "ownershipType",
                    (e.target.value ||
                      null) as HospitalProfile["ownershipType"],
                  )
                }
              >
                <option value="">Select</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="nonprofit">Nonprofit</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 p-3 text-sm">
              <input
                type="checkbox"
                checked={profile.hasBloodBank}
                onChange={(e) => change("hasBloodBank", e.target.checked)}
              />
              Blood bank available
            </label>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-semibold">Hospital location</h2>
              <p className="text-sm text-slate-500">
                Location permission is optional; manual entry always remains
                available.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={locating}
              onClick={locate}
            >
              <Crosshair className="mr-2 h-4 w-4" />
              {locating ? "Finding location..." : "Use My Current Location"}
            </Button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">
              Street address
              <input
                className={input}
                value={profile.address}
                onChange={(e) => change("address", e.target.value)}
              />
            </label>
            {(
              [
                ["city", "City"],
                ["region", "Region / state"],
                ["country", "Country"],
                ["postalCode", "Postal code"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm font-medium">
                {label}
                <input
                  className={input}
                  value={(profile[key] as string | null) ?? ""}
                  onChange={(e) =>
                    change(key, (e.target.value || null) as never)
                  }
                />
              </label>
            ))}
            <label className="text-sm font-medium">
              Latitude
              <input
                type="number"
                step="any"
                className={input}
                value={profile.latitude ?? ""}
                onChange={(e) =>
                  change(
                    "latitude",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </label>
            <label className="text-sm font-medium">
              Longitude
              <input
                type="number"
                step="any"
                className={input}
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
        <div className="flex justify-end">
          <Button disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save profile"}
          </Button>
        </div>
      </form>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Upload className="h-5 w-5 text-[#C0392B]" />
          <div>
            <h2 className="font-semibold">Verification documents</h2>
            <p className="text-sm text-slate-500">
              PDF, JPEG or PNG; maximum 10 MB each.
            </p>
          </div>
        </div>
        {verification?.documents.length ? (
          <div className="mt-4 space-y-2">
            {verification.documents.map((doc) => (
              <a
                key={doc.id}
                href="#verification-documents"
                onClick={(event) => {
                  event.preventDefault();
                  void openVerificationDocument(doc).catch((err) =>
                    toast.error(
                      getApiErrorMessage(err, "Unable to open document."),
                    ),
                  );
                }}
                className="block rounded-xl border border-slate-200 p-3 text-sm hover:border-red-200"
              >
                {doc.original_filename} ·{" "}
                {doc.document_type.replaceAll("_", " ")}
              </a>
            ))}
          </div>
        ) : null}
        {verification?.status === "pending" ? (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Your submission is pending review. Duplicate submissions are
            disabled.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {documentTypes.map(([type, label]) => (
                <label key={type} className="text-sm font-medium">
                  {label}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className={`${input} file:mr-3 file:border-0 file:bg-transparent`}
                    onChange={(e) =>
                      setFiles((v) => ({
                        ...v,
                        [type]: e.target.files?.[0] || null,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
              >
                {submitting ? "Submitting..." : "Submit for verification"}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
