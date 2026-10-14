"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Mail, MapPin, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import {
  listHospitalDonorResponses,
  decideHospitalDonorResponse,
  listPotentialDonors,
  inviteDonor,
  recordVerifiedBloodType,
  type HospitalDonorResponse,
} from "@/services/hospital-donors-service";
import { listHospitalRequests } from "@/services/hospital-requests-service";
import { openConversation } from "@/services/messages-service";
import { getApiErrorMessage } from "@/lib/api";
import {
  PortalDialog,
  PortalEmpty,
  PortalPanel,
  PortalSkeleton,
  StatusPill,
} from "@/components/portal/portal-ui";
export default function DonorsPage() {
  const router = useRouter();
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    item: HospitalDonorResponse;
    action: "accept" | "reject" | "verify";
  } | null>(null);
  const [blood, setBlood] = useState("O+");
  const [confirmed, setConfirmed] = useState(false);
  const loader = useCallback(async () => {
    const [responses, requests] = await Promise.all([
      listHospitalDonorResponses(),
      listHospitalRequests({ page: 1 }),
    ]);
    return {
      responses: responses.items,
      requests: requests.items.filter((r) =>
        ["published", "partially_fulfilled"].includes(r.status),
      ),
    };
  }, []);
  const q = usePortalQuery(loader);
  const potentialLoader = useCallback(
    () => (requestId ? listPotentialDonors(requestId) : Promise.resolve([])),
    [requestId],
  );
  const potential = usePortalQuery(potentialLoader);
  useEffect(() => {
    if (!requestId && q.data?.requests.length)
      setRequestId(q.data.requests[0].id);
  }, [q.data, requestId]);
  async function decide(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    setBusy(dialog.item.id);
    try {
      if (dialog.action === "verify")
        await recordVerifiedBloodType(dialog.item.id, blood);
      else await decideHospitalDonorResponse(dialog.item.id, dialog.action);
      toast.success(
        dialog.action === "verify"
          ? "Hospital-verified blood type recorded."
          : dialog.action === "accept"
            ? "Response accepted. Coordinate a pending appointment."
            : "Response declined.",
      );
      setDialog(null);
      await Promise.all([q.refresh(), potential.refresh()]);
    } catch (e) {
      toast.error(
        getApiErrorMessage(e, "Unable to update this donor response."),
      );
    } finally {
      setBusy(null);
    }
  }
  async function message(item: HospitalDonorResponse) {
    if (!item.requestId || !item.donorUserId) return;
    setBusy(item.id);
    try {
      const id = await openConversation(item.requestId, item.donorUserId);
      router.push("/hospital/messages?conversation=" + id);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to open communication."));
    } finally {
      setBusy(null);
    }
  }
  async function invite(id: string) {
    setBusy(id);
    try {
      await inviteDonor(requestId, id);
      toast.success("Donor invitation sent.");
      await Promise.all([q.refresh(), potential.refresh()]);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to invite donor."));
    } finally {
      setBusy(null);
    }
  }
  if (q.loading) return <PortalSkeleton />;
  return (
    <div className="portal-stack">
      <div className="portal-policy-note">
        <ShieldCheck size={17} />
        Matches are referral candidates based on reported blood type, component
        compatibility, availability, and distance. Hospital screening and
        laboratory confirmation remain required.
      </div>
      <PortalPanel title="Donor Responses">
        {q.error ? (
          <PortalEmpty title="Responses unavailable" description={q.error} />
        ) : q.data?.responses.length ? (
          <div className="portal-donor-list">
            {q.data.responses.map((item) => (
              <article key={item.id} className="portal-panel">
                <div className="portal-dialog-identity">
                  <span className="portal-avatar">{item.donor[0]}</span>
                  <div>
                    <h3 className="text-sm font-semibold">{item.donor}</h3>
                    <p className="portal-small-note mt-1">
                      <MapPin size={12} className="inline" />
                      {item.approximateLocation ||
                        "Location unavailable"} ·{" "}
                      {item.distanceKm !== null
                        ? `${item.distanceKm} km`
                        : "Distance unavailable"}
                    </p>
                  </div>
                  <StatusPill status={item.responseStatus || item.response} />
                </div>
                <p className="portal-small-note">
                  <strong>{item.bloodType}</strong> · {item.eligibilityStatus} ·{" "}
                  {item.availability}
                </p>
                <div className="portal-dialog-actions mt-4">
                  {item.responseStatus === "pending" && (
                    <>
                      <button
                        className="portal-button portal-button--secondary"
                        disabled={busy === item.id}
                        onClick={() => setDialog({ item, action: "reject" })}
                      >
                        Decline
                      </button>
                      <button
                        className="portal-button"
                        disabled={busy === item.id}
                        onClick={() => setDialog({ item, action: "accept" })}
                      >
                        Accept Response
                      </button>
                    </>
                  )}
                  {[
                    "invited",
                    "pending",
                    "accepted",
                    "scheduled",
                    "completed",
                  ].includes(item.responseStatus || "") && (
                    <>
                      <button
                        className="portal-button portal-button--secondary"
                        disabled={!!busy}
                        onClick={() => void message(item)}
                      >
                        <Mail size={14} />
                        Message
                      </button>
                      {item.responseStatus !== "invited" && (
                        <button
                          className="portal-button portal-button--secondary"
                          onClick={() => {
                            setDialog({ item, action: "verify" });
                            setBlood(item.bloodType);
                            setConfirmed(false);
                          }}
                        >
                          Record Verified Blood Type
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <PortalEmpty
            title="No donor responses yet"
            description="Invite eligible referral candidates below, or wait for a donor to express interest in a published request."
          />
        )}
      </PortalPanel>
      <PortalPanel title="Available Nearby Donors">
        <label className="portal-field">
          Published request
          <select
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
          >
            <option value="">Select a blood request</option>
            {q.data?.requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.bloodType} · {r.component.replaceAll("_", " ")} ·{" "}
                {r.location} · {r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        {potential.loading ? (
          <PortalSkeleton />
        ) : potential.error ? (
          <PortalEmpty
            title="Matches unavailable"
            description={potential.error}
          />
        ) : potential.data?.length ? (
          <div className="portal-donor-list mt-4">
            {potential.data.map((item) => (
              <article key={item.donor_user_id} className="portal-panel">
                <div className="portal-dialog-identity">
                  <span className="portal-avatar">{item.donor[0]}</span>
                  <div>
                    <h3 className="text-sm font-semibold">{item.donor}</h3>
                    <p className="portal-small-note mt-1">
                      {item.blood_type} · {item.approximate_location} ·{" "}
                      {item.distance_km !== null
                        ? `${item.distance_km} km`
                        : "Unknown distance"}
                    </p>
                  </div>
                </div>
                <p className="portal-small-note">{item.eligibility_status}</p>
                <button
                  className="portal-button mt-4"
                  disabled={!!busy || !!item.response_status}
                  onClick={() => void invite(item.donor_user_id)}
                >
                  <UserPlus size={15} />
                  {item.response_status ? item.response_status : "Invite Donor"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <PortalEmpty
            title="No referral candidates in this view"
            description="Choose an active request. Matching requires available donors with coordinates, a completed blood profile, and an approved local donor-selection policy."
          />
        )}
      </PortalPanel>
      {dialog && (
        <PortalDialog
          title={
            dialog.action === "verify"
              ? "Record Hospital-Verified Blood Type"
              : `Confirm ${dialog.action} response`
          }
          onClose={() => setDialog(null)}
        >
          <form className="portal-stack" onSubmit={decide}>
            <p>
              {dialog.item.donor} · {dialog.item.bloodType}
            </p>
            {dialog.action === "verify" ? (
              <>
                <label className="portal-field">
                  Confirmed blood type
                  <select
                    value={blood}
                    onChange={(e) => setBlood(e.target.value)}
                  >
                    {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map(
                      (t) => (
                        <option key={t}>{t}</option>
                      ),
                    )}
                  </select>
                </label>
                <label className="portal-toggle-row">
                  <span>
                    The hospital’s validated laboratory process confirmed this
                    blood type.
                  </span>
                  <input
                    type="checkbox"
                    required
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                </label>
              </>
            ) : (
              <p className="portal-muted">
                {dialog.action === "accept"
                  ? "The donor will receive an update, and a pending appointment will be created. Medical screening still applies."
                  : "The donor will be notified that this response was declined."}
              </p>
            )}
            <button className="portal-button" type="submit" disabled={!!busy}>
              {busy ? "Saving…" : "Confirm"}
            </button>
          </form>
        </PortalDialog>
      )}
    </div>
  );
}
