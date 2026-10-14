"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Droplet,
  Heart,
  HeartHandshake,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import {
  getDonorProfile,
  updateDonorAvailability,
} from "@/services/profile-service";
import { listCompatibleRequests } from "@/services/compatible-requests-service";
import { listAppointments } from "@/services/appointments-service";
import { getWorkspaceOverview } from "@/services/workspace-service";
import { getApiErrorMessage } from "@/lib/api";
import {
  PortalEmpty,
  PortalPanel,
  PortalSkeleton,
  RequestCard,
} from "@/components/portal/portal-ui";

export default function DonorOverview() {
  const loader = useCallback(async () => {
    const [profile, requests, appointments, stats] = await Promise.all([
      getDonorProfile(),
      listCompatibleRequests({ pageSize: 3 }),
      listAppointments({ scope: "donor", page: 1, pageSize: 10 }),
      getWorkspaceOverview(),
    ]);
    return {
      profile,
      requests: requests.items,
      appointments: appointments.items,
      stats,
    };
  }, []);
  const query = usePortalQuery(loader);
  const [busy, setBusy] = useState(false);
  if (query.loading) return <PortalSkeleton />;
  if (!query.data)
    return (
      <PortalEmpty
        title="Your dashboard could not load"
        description={query.error || "Please refresh and try again."}
      />
    );
  const { profile, requests, appointments, stats } = query.data;
  const next = appointments
    .filter((a) => ["pending", "confirmed"].includes(a.status))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  async function availability() {
    setBusy(true);
    try {
      await updateDonorAvailability(!profile.isAvailable);
      await query.refresh();
      toast.success("Donation availability updated.");
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to update availability."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="portal-stack">
      {query.error && (
        <div role="alert" className="portal-error">
          {query.error}
        </div>
      )}
      <section className="portal-welcome">
        <div>
          <p>Welcome back,</p>
          <h1>
            {profile.fullName.split(" ")[0] || "Donor"}{" "}
            <span aria-hidden="true">👋</span>
          </h1>
          <p>Your next connection could make a difference.</p>
        </div>
        <div className="portal-welcome__facts">
          <div>
            <span className="portal-blood-badge">
              {profile.bloodTypeKnown ? profile.bloodType : "—"}
            </span>
            <span>
              <small>Blood type</small>
              <strong>
                {profile.bloodTypeKnown ? profile.bloodType : "Not recorded"}
              </strong>
              <em>
                {profile.bloodTypeVerified
                  ? "Hospital verified"
                  : "Self-reported · screening required"}
              </em>
            </span>
          </div>
          <div>
            <CalendarDays size={27} />
            <span>
              <small>Next referral date</small>
              <strong>
                {profile.nextEligibleDate &&
                new Date(profile.nextEligibleDate) > new Date()
                  ? new Date(profile.nextEligibleDate).toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric", year: "numeric" },
                    )
                  : profile.isEligible
                    ? "Ready for screening"
                    : "After profile review"}
              </strong>
              <em>Subject to clinical screening</em>
            </span>
          </div>
        </div>
      </section>
      <section className="portal-donor-banner">
        <span className="portal-banner-heart">
          <Heart fill="currentColor" size={36} />
        </span>
        <div>
          <h2>Make a Difference Today</h2>
          <p>
            {Number(stats.compatible_requests) > 0
              ? `${stats.compatible_requests} compatible request${Number(stats.compatible_requests) === 1 ? "" : "s"} within your donation radius.`
              : "Stay ready for a connection that matters."}
          </p>
        </div>
        <Link href="/donor/requests">
          View Requests <ArrowRight size={16} />
        </Link>
        <Droplet
          className="portal-banner-drop"
          size={115}
          fill="currentColor"
          aria-hidden="true"
        />
      </section>
      {!profile.policyApproved && (
        <div className="portal-policy-note">
          <ShieldCheck size={16} />
          <span>
            Matching will open after the local donor-selection policy is
            approved. Keep your profile and availability current.
          </span>
        </div>
      )}
      <PortalPanel
        title="Recent Blood Requests"
        action={
          <Link className="portal-text-link" href="/donor/requests">
            View All
          </Link>
        }
        className="portal-panel--plain"
      >
        {requests.length ? (
          <div className="portal-request-grid">
            {requests.map((item) => (
              <RequestCard
                key={item.id}
                item={item}
                onDetails={() =>
                  window.location.assign(`/donor/requests?request=${item.id}`)
                }
              />
            ))}
          </div>
        ) : (
          <PortalEmpty
            title="No compatible requests right now"
            description="Add your blood type, date of birth, and location, then set your availability to discover appropriate referrals."
            href="/donor/profile"
            action="Complete your profile"
          />
        )}
      </PortalPanel>
      <section className="portal-stats">
        <div className="portal-stat">
          <span>
            <Droplet size={22} />
            Completed donations
          </span>
          <strong>{stats.completed_donations}</strong>
          <small>{stats.donation_units} recorded unit(s)</small>
          <Link href="/donor/history">
            View your history <ArrowRight size={13} />
          </Link>
        </div>
        <div className="portal-stat">
          <span>
            <CalendarDays size={22} />
            Upcoming appointment
          </span>
          <strong className="portal-stat__text">
            {next
              ? new Date(next.scheduledAt).toLocaleDateString()
              : "None scheduled"}
          </strong>
          <small>
            {next?.hospitalName || "Hospital-approved times appear here"}
          </small>
          <Link href="/donor/appointments">
            Manage appointments <ArrowRight size={13} />
          </Link>
        </div>
        <div className="portal-stat">
          <span>
            <ShieldCheck size={22} />
            Availability status
          </span>
          <button
            role="switch"
            aria-checked={profile.isAvailable}
            disabled={busy}
            className="portal-availability"
            onClick={() => void availability()}
          >
            <i className={profile.isAvailable ? "is-on" : ""} />
            {profile.isAvailable ? "Available" : "Unavailable"}
          </button>
          <small>Let hospitals know when you’re ready.</small>
          <Link href="/donor/availability">
            Manage preferences <ArrowRight size={13} />
          </Link>
        </div>
        <div className="portal-stat">
          <span>
            <HeartHandshake size={22} />
            Community contribution
          </span>
          <strong>{stats.hospitals_supported}</strong>
          <small>Hospital(s) supported by recorded donations</small>
          <Link href="/donor/resources">
            Donation resources <ArrowRight size={13} />
          </Link>
        </div>
      </section>
      <div className="portal-profile-strip">
        <span>
          <MapPin size={16} />
          {profile.city || "Set your city"} · {profile.preferredRadiusKm} km
          radius
        </span>
        <span>Profile {profile.profileCompletion}% complete</span>
        <Link href="/donor/profile">
          Update profile <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
