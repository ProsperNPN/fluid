"use client";
import { useCallback } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Droplet,
  Hospital,
  MapPin,
  Plus,
  Users,
  PackageSearch,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { usePortalQuery } from "@/hooks/use-portal-query";
import { getHospitalProfile } from "@/services/profile-service";
import { getWorkspaceOverview } from "@/services/workspace-service";
import { listHospitalRequests } from "@/services/hospital-requests-service";
import { listHospitalDonorResponses } from "@/services/hospital-donors-service";
import { listInventory } from "@/services/inventory-service";
import {
  PortalEmpty,
  PortalPanel,
  PortalSkeleton,
  StatusPill,
} from "@/components/portal/portal-ui";
import { InventoryOverview } from "@/components/portal/inventory-overview";
import { AnalyticsChart } from "@/components/portal/analytics-chart";
export default function HospitalOverview() {
  const loader = useCallback(async () => {
    const [profile, stats, requests, responses, inventory] = await Promise.all([
      getHospitalProfile(),
      getWorkspaceOverview(),
      listHospitalRequests({ page: 1 }),
      listHospitalDonorResponses(),
      listInventory(),
    ]);
    return {
      profile,
      stats,
      requests: requests.items,
      responses: responses.items,
      inventory,
    };
  }, []);
  const q = usePortalQuery(loader);
  if (q.loading) return <PortalSkeleton />;
  if (!q.data)
    return (
      <PortalEmpty
        title="Hospital overview unavailable"
        description={q.error || "Try refreshing this workspace."}
      />
    );
  const { profile, stats, requests, responses, inventory } = q.data;
  return (
    <div className="portal-stack">
      <Link className="portal-button portal-button--secondary" href="/hospital/emergencies">Open live emergency coordination ?</Link>
      {q.error && (
        <div className="portal-error" role="alert">
          {q.error}
        </div>
      )}
      <section className="portal-hospital-identity">
        <span className="portal-hospital-mark">
          <Hospital size={32} />
        </span>
        <div>
          <h1>{profile.hospitalName}</h1>
          <p>
            <MapPin size={13} />
            {profile.city}, {profile.region || profile.country}
          </p>
        </div>
        <span className="portal-verification">
          <ShieldCheck size={13} />
          Verified
        </span>
        <Link className="portal-button" href="/hospital/requests?create=1">
          <Plus size={16} />
          New Request
        </Link>
      </section>
      <section className="portal-stats">
        {[
          {
            label: "Active requests",
            value: stats.active_requests,
            Icon: Droplet,
            href: "/hospital/requests",
            note: "Published and partially fulfilled",
          },
          {
            label: "Pending donors",
            value: stats.pending_responses,
            Icon: Users,
            href: "/hospital/donors",
            note: "Awaiting your team’s review",
          },
          {
            label: "Appointments",
            value: stats.upcoming_appointments,
            Icon: CalendarDays,
            href: "/hospital/appointments",
            note: "Pending and confirmed",
          },
          {
            label: "Blood inventory",
            value: stats.stock_units,
            Icon: PackageSearch,
            href: "/hospital/inventory",
            note: `${stats.inventory_alerts} batch alert(s)`,
          },
        ].map(({ label, value, Icon, href, note }) => (
          <Link className="portal-stat" href={href} key={label}>
            <span>
              <Icon size={25} />
              {label}
            </span>
            <strong>{value}</strong>
            <small>{note}</small>
            <em>
              View details <ArrowRight size={12} />
            </em>
          </Link>
        ))}
      </section>
      <div className="portal-hospital-grid">
        <PortalPanel
          title="Blood Inventory Overview"
          action={
            <Link className="portal-text-link" href="/hospital/inventory">
              View Details
            </Link>
          }
        >
          <InventoryOverview items={inventory} />
        </PortalPanel>
        <PortalPanel
          title="Recent Blood Requests"
          action={
            <Link className="portal-text-link" href="/hospital/requests">
              View All
            </Link>
          }
        >
          {requests.length ? (
            <div className="portal-recent-list">
              {requests.slice(0, 4).map((r) => (
                <Link key={r.id} href={`/hospital/requests?request=${r.id}`}>
                  <span className="portal-blood-badge">{r.bloodType}</span>
                  <div>
                    <strong>
                      {Math.max(0, r.units - r.unitsFulfilled)} unit(s)
                      remaining
                    </strong>
                    <small>
                      {r.component.replaceAll("_", " ")} ·{" "}
                      {r.department || "Blood request"}
                    </small>
                  </div>
                  <StatusPill status={r.urgency} />
                </Link>
              ))}
            </div>
          ) : (
            <PortalEmpty
              title="No requests yet"
              description="Create your first blood request to begin donor coordination."
              href="/hospital/requests?create=1"
              action="Create request"
            />
          )}
        </PortalPanel>
        <PortalPanel
          title="Donor Matches"
          action={
            <Link className="portal-text-link" href="/hospital/donors">
              View All
            </Link>
          }
        >
          {responses.length ? (
            <div className="portal-recent-list">
              {responses.slice(0, 4).map((r) => (
                <Link key={r.id} href="/hospital/donors">
                  <span className="portal-avatar">{r.donor[0]}</span>
                  <div>
                    <strong>{r.donor}</strong>
                    <small>
                      {r.approximateLocation || "Location not recorded"}
                      {r.distanceKm !== null ? ` · ${r.distanceKm} km` : ""}
                    </small>
                  </div>
                  <StatusPill status={r.responseStatus || r.response} />
                </Link>
              ))}
            </div>
          ) : (
            <PortalEmpty
              title="No donor responses yet"
              description="Publish a request, then invite available compatible donors."
              href="/hospital/donors"
              action="Explore matches"
            />
          )}
        </PortalPanel>
        <PortalPanel title="Request Analytics">
          <AnalyticsChart />
        </PortalPanel>
      </div>
    </div>
  );
}
