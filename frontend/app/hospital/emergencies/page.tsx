"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiClient, getApiErrorMessage } from "@/lib/api";
import { usePortalQuery } from "@/hooks/use-portal-query";
import {
  PortalPanel,
  PortalSkeleton,
  PortalEmpty,
} from "@/components/portal/portal-ui";

interface Emergency {
  id: string;
  blood_type: string;
  component: string;
  units: number;
  urgency: string;
  status: string;
  deadline: string;
  location: string;
  radius_km: number;
  notified: number;
  responded: number;
  accepted: number;
  declined: number;
  suggested_radius_km: number | null;
  escalation_wait_seconds: number;
  policy_approved: boolean;
  deliveries: { channel: string; status: string; count: number }[];
  responses: {
    id: string;
    donor: string;
    status: string;
    distance_km: number | null;
    updated_at: string;
  }[];
}
export default function EmergencyCoordination() {
  const loader = useCallback(
    async () =>
      (await apiClient.get<{ items: Emergency[] }>("/api/v1/emergencies")).data,
    [],
  );
  const query = usePortalQuery(loader);
  const [busy, setBusy] = useState(false);
  async function escalate(id: string) {
    setBusy(true);
    try {
      await apiClient.post(`/api/v1/emergencies/${id}/escalate`);
      await query.refresh();
      toast.success(
        "Radius expanded. Only newly matched, consenting donors will be alerted.",
      );
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to expand emergency alerts."));
    } finally {
      setBusy(false);
    }
  }
  if (query.loading) return <PortalSkeleton />;
  return (
    <div className="portal-stack">
      <PortalPanel title="Emergency coordination">
        <p className="portal-muted">
          Track outreach and availability in real time. A response is a referral
          for clinical screening, not a confirmed donation.
        </p>
        <Link
          className="portal-button mt-4 inline-flex"
          href="/hospital/requests"
        >
          Create or manage blood requests
        </Link>
      </PortalPanel>
      {query.error && (
        <p role="alert" className="text-red-700">
          {query.error}
        </p>
      )}
      {!query.data?.items.length && (
        <PortalEmpty
          title="No emergency requests"
          description="Published urgent and critical requests appear here."
        />
      )}
      {query.data?.items.map((item) => (
        <PortalPanel
          key={item.id}
          title={`${item.blood_type} · ${item.component.replaceAll("_", " ")} · ${item.units} units`}
        >
          <div className="flex flex-wrap justify-between gap-3">
            <p className="font-semibold text-[#C0392B]">
              {item.urgency} · {item.status.replaceAll("_", " ")}
            </p>
            <span className="text-sm">Alert radius: {item.radius_km} km</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {item.location} · Deadline{" "}
            {new Date(item.deadline).toLocaleString()}
          </p>
          {!item.policy_approved && (
            <p role="status" className="mt-3 text-sm text-amber-800">
              Referral alerts remain disabled until the clinical matching policy
              is approved.
            </p>
          )}
          <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Notified in app", item.notified],
              ["Responded", item.responded],
              ["Available / in review", item.accepted],
              ["Declined", item.declined],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-slate-600">{label}</p>
              </div>
            ))}
          </div>
          {item.suggested_radius_km && (
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-sm">
                Fewer than five availability responses. Consider expanding to{" "}
                {item.suggested_radius_km} km while respecting each donor&apos;s
                chosen radius.
              </p>
              <button
                className="portal-button mt-3"
                disabled={
                  busy ||
                  !item.policy_approved ||
                  item.escalation_wait_seconds > 0
                }
                onClick={() => void escalate(item.id)}
              >
                Expand to {item.suggested_radius_km} km
                {item.escalation_wait_seconds > 0
                  ? ` (wait ${item.escalation_wait_seconds}s)`
                  : ""}
              </button>
            </div>
          )}
          {item.deliveries.length > 0 && (
            <p className="my-3 text-xs text-slate-600">
              External delivery:{" "}
              {item.deliveries
                .map((d) => `${d.channel}: ${d.count} ${d.status}`)
                .join(" · ")}
              . Accepted does not mean delivered.
            </p>
          )}
          <div className="mt-4 divide-y">
            {item.responses.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
              >
                <span className="font-medium">
                  {r.donor} ·{" "}
                  {r.distance_km === null
                    ? "Distance unavailable"
                    : `approximately ${r.distance_km} km`}
                </span>
                <span>
                  {r.status} · {new Date(r.updated_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <Link
            className="mt-3 inline-block text-sm font-semibold text-[#C0392B]"
            href={`/hospital/donors?request=${item.id}`}
          >
            Review responses and coordinate appointments →
          </Link>
        </PortalPanel>
      ))}
    </div>
  );
}
