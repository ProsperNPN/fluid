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
  const [requestPage, setRequestPage] = useState(1);
  const [responsePage, setResponsePage] = useState(1);
  const [radius, setRadius] = useState(10);
  const [matchStatus, setMatchStatus] = useState("all");
  const [matchBlood, setMatchBlood] = useState("");
  const [matchPage, setMatchPage] = useState(1);
  const [detail, setDetail] = useState<
    import("@/services/hospital-donors-service").PotentialDonor | null
  >(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    item: HospitalDonorResponse;
    action: "accept" | "reject" | "verify";
  } | null>(null);
  const [blood, setBlood] = useState("O+");
  const [confirmed, setConfirmed] = useState(false);
  const loader = useCallback(async () => {
    const [responses, requests] = await Promise.all([
      listHospitalDonorResponses(responsePage),
      listHospitalRequests({ page: requestPage, status: "active" }),
    ]);
    return {
      responses: responses.items,
      responsePages: responses.totalPages,
      requestPages: requests.totalPages,
      requests: requests.items.filter((r) =>
        ["published", "partially_fulfilled"].includes(r.status),
      ),
    };
  }, [requestPage, responsePage]);
  const q = usePortalQuery(loader);
  const potentialLoader = useCallback(
    () =>
      requestId
        ? listPotentialDonors(
            requestId,
            radius,
            matchStatus,
            matchBlood,
            matchPage,
          )
        : Promise.resolve(null),
    [requestId, radius, matchStatus, matchBlood, matchPage],
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
      await inviteDonor(requestId, id, radius);
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
      <div className="portal-page-title">
        <div>
          <h1>Donor Matches</h1>
          <p>
            Find potential donors, explain each referral and coordinate hospital
            screening.
          </p>
        </div>
      </div>
      <div className="portal-policy-note">
        <ShieldCheck size={17} />
        Matches are referral candidates based on reported blood type, component
        compatibility, availability, and distance. Hospital screening and
        laboratory confirmation remain required.
      </div>
      <PortalPanel title="Intelligent Donor Matches">
        <p className="portal-small-note">
          Start within 10 km. Expand only when needed; donor-selected travel
          radii and consent always apply. Priorities rank outreach, never
          medical eligibility.
        </p>
        <label className="portal-field">
          Published request
          <select
            value={requestId}
            onChange={(e) => {
              setRequestId(e.target.value);
              setRadius(10);
              setMatchPage(1);
            }}
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
        {q.data && q.data.requestPages > 1 && (
          <div className="portal-pagination">
            <button
              disabled={requestPage === 1}
              onClick={() => {
                setRequestPage(requestPage - 1);
                setRequestId("");
                setRadius(10);
              }}
            >
              Previous requests
            </button>
            <span>
              Requests {requestPage} / {q.data.requestPages}
            </span>
            <button
              disabled={requestPage >= q.data.requestPages}
              onClick={() => {
                setRequestPage(requestPage + 1);
                setRequestId("");
                setRadius(10);
              }}
            >
              More requests
            </button>
          </div>
        )}
        <div className="portal-request-tools mt-4">
          <label className="portal-field">
            Search radius
            <select
              value={radius}
              onChange={(e) => {
                setRadius(Number(e.target.value));
                setMatchPage(1);
              }}
            >
              {[10, 25, 50, 100].map((km) => (
                <option key={km} value={km}>
                  {km} km
                </option>
              ))}
            </select>
          </label>
          <label className="portal-field">
            Invitation status
            <select
              value={matchStatus}
              onChange={(e) => {
                setMatchStatus(e.target.value);
                setMatchPage(1);
              }}
            >
              {[
                "all",
                "new",
                "invited",
                "pending",
                "accepted",
                "scheduled",
                "declined",
                "rejected",
                "saved",
              ].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="portal-field">
            Blood group
            <select
              value={matchBlood}
              onChange={(e) => {
                setMatchBlood(e.target.value);
                setMatchPage(1);
              }}
            >
              <option value="">All compatible groups</option>
              {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <button
            className="portal-button portal-button--secondary"
            onClick={() => void potential.refresh()}
          >
            Recalculate matches
          </button>
        </div>
        {potential.data && (
          <div className="portal-policy-note mt-4">
            <div>
              <p>{potential.data.notice}</p>
              <p>
                Evaluated{" "}
                {new Date(potential.data.evaluated_at).toLocaleTimeString()} ·{" "}
                {potential.data.total} candidates in this filter
              </p>
              {potential.data.suggested_radius_km && (
                <button
                  className="portal-button mt-3"
                  onClick={() => {
                    setRadius(potential.data!.suggested_radius_km!);
                    setMatchPage(1);
                  }}
                >
                  Expand to {potential.data.suggested_radius_km} km
                </button>
              )}
              <p className="portal-small-note mt-2">
                {potential.data.expansion
                  .map(
                    (s) =>
                      `${s.radius_km} km: ${s.new_candidates} not yet contacted`,
                  )
                  .join(" · ")}
              </p>
            </div>
          </div>
        )}
        {potential.loading ? (
          <PortalSkeleton />
        ) : potential.error ? (
          <PortalEmpty
            title="Matches unavailable"
            description={potential.error}
          />
        ) : potential.data?.items.length ? (
          <div className="portal-donor-list mt-4">
            {potential.data.items.map((item) => (
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
                <p className="portal-small-note">
                  {item.compatibility} · {item.availability}
                </p>
                <p className="portal-small-note mt-2">
                  <strong>{item.priority}</strong> · Outreach score{" "}
                  {item.priority_score}
                </p>
                <ul className="portal-small-note mt-2">
                  {item.explanation.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
                <p className="portal-small-note mt-2">
                  {item.eligibility_status}
                </p>
                <button
                  className="portal-button portal-button--secondary mt-3 mr-2"
                  onClick={() => setDetail(item)}
                >
                  View permitted details
                </button>
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
        {potential.data && potential.data.total_pages > 1 && (
          <div className="portal-pagination">
            <button
              disabled={matchPage === 1}
              onClick={() => setMatchPage(matchPage - 1)}
            >
              Previous
            </button>
            <span>
              Page {matchPage} of {potential.data.total_pages}
            </span>
            <button
              disabled={matchPage >= potential.data.total_pages}
              onClick={() => setMatchPage(matchPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </PortalPanel>
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
                  Request {item.requestId?.slice(0, 8)}
                </p>
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
        {q.data && q.data.responsePages > 1 && (
          <div className="portal-pagination">
            <button
              disabled={responsePage === 1}
              onClick={() => setResponsePage(responsePage - 1)}
            >
              Previous responses
            </button>
            <span>
              {responsePage} / {q.data.responsePages}
            </span>
            <button
              disabled={responsePage >= q.data.responsePages}
              onClick={() => setResponsePage(responsePage + 1)}
            >
              More responses
            </button>
          </div>
        )}
      </PortalPanel>
      {detail && (
        <PortalDialog
          title="Permitted donor details"
          onClose={() => setDetail(null)}
        >
          <div className="portal-stack">
            <h3>
              {detail.donor} · {detail.blood_type}
            </h3>
            <p>
              {detail.approximate_location} · approximately {detail.distance_km}{" "}
              km · {detail.availability}
            </p>
            <p>
              {detail.priority} · {detail.compatibility}
            </p>
            <strong>Screening checks still required</strong>
            <ul>
              {detail.screening_flags.map((flag) => (
                <li key={flag}>• {flag}</li>
              ))}
            </ul>
            <p className="portal-small-note">
              Exact coordinates, contact details and sensitive screening data
              are not disclosed.
            </p>
            <StatusPill status={detail.response_status || "not invited"} />
          </div>
        </PortalDialog>
      )}
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
