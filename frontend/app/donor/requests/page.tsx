"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, MapPin, CalendarDays, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import {
  listCompatibleRequests,
  listDonorInvitations,
  respondToRequest,
  type CompatibleRequest,
} from "@/services/compatible-requests-service";
import { openConversation } from "@/services/messages-service";
import { getApiErrorMessage } from "@/lib/api";
import {
  PortalDialog,
  PortalEmpty,
  PortalSkeleton,
  RequestCard,
  StatusPill,
} from "@/components/portal/portal-ui";
export default function RequestsPage() {
  const router = useRouter();
  const openedRequest = useRef<string | null>(null);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [urgency, setUrgency] = useState("all");
  const [page, setPage] = useState(1);
  const [invitationPage, setInvitationPage] = useState(1);
  const [nearby, setNearby] = useState(false);
  const [selected, setSelected] = useState<CompatibleRequest | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setQueryText(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const loader = useCallback(
    () =>
      listCompatibleRequests({
        search: queryText,
        urgency,
        page,
        pageSize: 12,
      }),
    [queryText, urgency, page],
  );
  const query = usePortalQuery(loader);
  const invitationLoader = useCallback(
    () => listDonorInvitations(invitationPage),
    [invitationPage],
  );
  const invitations = usePortalQuery(invitationLoader);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("request");
    if (id && id !== openedRequest.current && query.data && invitations.data) {
      const item =
        invitations.data.items.find((r) => r.id === id) ||
        query.data.items.find((r) => r.id === id);
      openedRequest.current = id;
      if (item) setSelected(item);
      else
        void listCompatibleRequests({ requestId: id })
          .then((result) => {
            if (result.items[0]) setSelected(result.items[0]);
            else
              toast.info(
                "This request is no longer available within your current matching criteria.",
              );
          })
          .catch((e) =>
            toast.error(getApiErrorMessage(e, "Unable to open this request.")),
          );
    }
  }, [query.data, invitations.data]);
  const items = [...(query.data?.items || [])];
  if (nearby)
    items.sort(
      (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
    );
  async function respond(status: "accepted" | "declined" | "saved") {
    if (!selected) return;
    setBusy(true);
    try {
      const item = await respondToRequest(selected.id, status);
      setSelected(item);
      await Promise.all([query.refresh(), invitations.refresh()]);
      toast.success(
        status === "accepted"
          ? "Interest sent. The hospital will review and coordinate an appointment."
          : status === "saved"
            ? "Request saved."
            : "Response updated.",
      );
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to respond."));
    } finally {
      setBusy(false);
    }
  }
  async function message() {
    if (!selected) return;
    setBusy(true);
    try {
      const id = await openConversation(selected.id);
      router.push("/donor/messages?conversation=" + id);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to open a conversation."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="portal-stack">
      <section className="portal-panel p-5">
        <h1 className="text-xl font-bold">Hospital Invitations</h1>
        <p className="portal-small-note mt-2">
          Accepting expresses interest for hospital review; it does not confirm
          medical eligibility. You can decline an invitation even if your
          availability changes.
        </p>
        {invitations.loading ? (
          <PortalSkeleton />
        ) : invitations.error ? (
          <PortalEmpty
            title="Invitations unavailable"
            description={invitations.error}
          />
        ) : invitations.data?.items.length ? (
          <div className="portal-request-grid mt-4">
            {invitations.data.items.map((item) => (
              <RequestCard
                key={item.id}
                item={item}
                onDetails={() => setSelected(item)}
              />
            ))}
          </div>
        ) : (
          <p className="portal-small-note mt-3">No hospital invitations yet.</p>
        )}
        {invitations.data && invitations.data.totalPages > 1 && (
          <div className="portal-pagination">
            <button
              disabled={invitationPage === 1}
              onClick={() => setInvitationPage(invitationPage - 1)}
            >
              Previous invitations
            </button>
            <span>
              {invitationPage} / {invitations.data.totalPages}
            </span>
            <button
              disabled={invitationPage >= invitations.data.totalPages}
              onClick={() => setInvitationPage(invitationPage + 1)}
            >
              More invitations
            </button>
          </div>
        )}
      </section>
      <Link className="portal-btn portal-btn--secondary" href="/donor/location">
        Map, radius & location settings ?
      </Link>
      <div className="portal-request-tools">
        <label className="portal-search">
          <Search size={17} />
          <input
            aria-label="Search hospital or location"
            placeholder="Search hospital or location"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          aria-label="Filter request urgency"
          value={urgency}
          onChange={(e) => {
            setUrgency(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All urgency</option>
          <option value="routine">Routine</option>
          <option value="urgent">Urgent</option>
          <option value="critical">Critical</option>
        </select>
        <button
          className={nearby ? "portal-filter is-active" : "portal-filter"}
          aria-pressed={nearby}
          onClick={() => setNearby(!nearby)}
        >
          <MapPin size={15} />
          Nearest first
        </button>
      </div>
      {query.loading ? (
        <PortalSkeleton />
      ) : query.error ? (
        <PortalEmpty title="Requests unavailable" description={query.error} />
      ) : items.length ? (
        <div className="portal-request-grid">
          {items.map((item) => (
            <RequestCard
              key={item.id}
              item={item}
              onDetails={() => setSelected(item)}
            />
          ))}
        </div>
      ) : (
        <PortalEmpty
          title="No compatible requests right now"
          description="Keep your reported blood type, date of birth, coordinates, and availability current. Matching also requires an approved local referral policy."
          href="/donor/profile"
          action="Update your profile"
        />
      )}
      {query.data && query.data.totalPages > 1 && (
        <div className="portal-pagination">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {query.data.totalPages}
          </span>
          <button
            disabled={page === query.data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
      {selected && (
        <PortalDialog
          title="Blood Request Details"
          onClose={() => setSelected(null)}
        >
          <div className="portal-stack">
            <div className="portal-dialog-identity">
              <h3>{selected.hospitalName}</h3>
              <StatusPill status={selected.urgency} />
            </div>
            <p className="portal-muted">
              <MapPin size={15} />
              {selected.location} ·{" "}
              {selected.distanceKm !== null
                ? `${selected.distanceKm} km`
                : "Distance unavailable"}
            </p>
            <div className="portal-dialog-facts">
              <span>
                <small>Blood / component</small>
                <strong>
                  {selected.bloodType} ·{" "}
                  {selected.component.replaceAll("_", " ")}
                </strong>
              </span>
              <span>
                <small>Units needed</small>
                <strong>{selected.units}</strong>
              </span>
              <span>
                <small>Required by</small>
                <strong>
                  {selected.requiredBy
                    ? new Date(selected.requiredBy).toLocaleString()
                    : "Contact hospital"}
                </strong>
              </span>
            </div>
            {selected.hospitalLatitude !== null &&
              selected.hospitalLongitude !== null && (
                <a
                  className="portal-text-link"
                  href={`https://www.openstreetmap.org/?mlat=${selected.hospitalLatitude}&mlon=${selected.hospitalLongitude}#map=15/${selected.hospitalLatitude}/${selected.hospitalLongitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View hospital location on OpenStreetMap
                </a>
              )}
            {!selected.canAccept && (
              <p className="portal-policy-note">
                This referral needs rechecking or is no longer active. You
                cannot accept it in its current state.
              </p>
            )}
            {selected.notes && <p>{selected.notes}</p>}
            <div className="portal-policy-note">
              <CalendarDays size={18} />
              Expressing interest does not confirm an appointment or medical
              eligibility. The hospital reviews your response and clinical
              screening is required.
            </div>
            {selected.responseStatus && (
              <p>
                Your response: <StatusPill status={selected.responseStatus} />
              </p>
            )}
            <div className="portal-dialog-actions">
              <button
                className="portal-button portal-button--secondary"
                disabled={
                  busy ||
                  selected.responseStatus === "invited" ||
                  !selected.canAccept
                }
                onClick={() => void respond("saved")}
              >
                Save
              </button>
              <button
                className="portal-button portal-button--secondary"
                disabled={
                  busy ||
                  [
                    "pending",
                    "accepted",
                    "scheduled",
                    "completed",
                    "declined",
                    "rejected",
                    "cancelled",
                    "expired",
                  ].includes(selected.responseStatus || "")
                }
                onClick={() => void respond("declined")}
              >
                Decline
              </button>
              <button
                className="portal-button"
                disabled={
                  busy ||
                  !selected.canAccept ||
                  [
                    "pending",
                    "accepted",
                    "scheduled",
                    "completed",
                    "declined",
                    "rejected",
                    "cancelled",
                    "expired",
                  ].includes(selected.responseStatus || "")
                }
                onClick={() => void respond("accepted")}
              >
                {busy
                  ? "Updating..."
                  : selected.responseStatus === "invited"
                    ? "Accept Invitation"
                    : "I'm Interested"}
              </button>
            </div>
            {[
              "invited",
              "pending",
              "accepted",
              "scheduled",
              "completed",
            ].includes(selected.responseStatus || "") && (
              <button
                className="portal-text-link"
                disabled={busy}
                onClick={() => void message()}
              >
                <MessageCircle size={16} />
                Message the Hospital
              </button>
            )}
          </div>
        </PortalDialog>
      )}
    </div>
  );
}
