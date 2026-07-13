"use client";

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { DataTable } from '@/components/ui/table';
import { getApiErrorMessage } from '@/lib/api';
import { getDashboardSummary, type DashboardMetric, type DashboardSummary } from '@/services/dashboard-service';
import { getAdminPortalData, type PendingHospitalItem, type PlatformActivityItem } from '@/services/portal-service';

const adminNav = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin', label: 'Verifications' },
  { href: '/admin', label: 'Monitoring' },
  { href: '/admin', label: 'Activity' }
];

export default function AdminPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [overviewMetrics, setOverviewMetrics] = useState<DashboardMetric[]>([]);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [pendingHospitals, setPendingHospitals] = useState<PendingHospitalItem[]>([]);
  const [platformActivity, setPlatformActivity] = useState<PlatformActivityItem[]>([]);
  const [isLoadingPortalData, setIsLoadingPortalData] = useState(true);
  const [portalDataError, setPortalDataError] = useState<string | null>(null);

  useEffect(() => {
    const loadOverview = async () => {
      setIsLoadingOverview(true);
      setOverviewError(null);

      try {
        const data = await getDashboardSummary('admin');
        setSummary(data);
        setOverviewMetrics(data.metrics);
      } catch (error) {
        setOverviewError(getApiErrorMessage(error, 'Unable to load dashboard summary right now.'));
      } finally {
        setIsLoadingOverview(false);
      }
    };

    void loadOverview();
  }, []);

  useEffect(() => {
    const loadPortalData = async () => {
      setIsLoadingPortalData(true);
      setPortalDataError(null);

      try {
        const data = await getAdminPortalData();
        setPendingHospitals(data.pendingHospitals);
        setPlatformActivity(data.platformActivity);
      } catch (error) {
        setPortalDataError(getApiErrorMessage(error, 'Unable to load admin activity right now.'));
      } finally {
        setIsLoadingPortalData(false);
      }
    };

    void loadPortalData();
  }, []);

  return (
    <DashboardLayout title="Admin Dashboard" subtitle="Platform Administration" currentPath="/admin" sidebarItems={adminNav} requiredRole="admin">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoadingOverview ? (
          <div className="sm:col-span-2 xl:col-span-4">
            <LoadingState text="Loading dashboard summary..." />
          </div>
        ) : overviewError ? (
          <div className="sm:col-span-2 xl:col-span-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{overviewError}</div>
        ) : overviewMetrics.length === 0 ? (
          <div className="sm:col-span-2 xl:col-span-4">
            <EmptyState title="No summary available" description="Summary metrics will appear once dashboard data is available." />
          </div>
        ) : (
          overviewMetrics.map((item) => (
            <Card key={item.label}>
              <CardTitle>{item.label}</CardTitle>
              <CardValue>{item.value}</CardValue>
            </Card>
          ))
        )}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Pending Hospital Verifications</h2>
          {isLoadingPortalData ? (
            <LoadingState text="Loading pending verifications..." />
          ) : portalDataError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{portalDataError}</div>
          ) : pendingHospitals.length === 0 ? (
            <EmptyState title="No pending hospitals" description="New hospital verification requests will appear here." />
          ) : (
            <DataTable
              columns={[
                { key: 'name', header: 'Hospital' },
                { key: 'city', header: 'City' },
                { key: 'submitted', header: 'Submitted' }
              ]}
              rows={pendingHospitals}
            />
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Blood Request Monitoring</h2>
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Open urgent requests: <Badge tone="danger">{summary?.urgent_requests ?? 0}</Badge>
            </p>
            <p>
              Requests fulfilled today: <Badge tone="success">{summary?.filled_requests ?? 0}</Badge>
            </p>
            <p>
              Total open requests: <Badge tone="info">{summary?.open_requests ?? 0}</Badge>
            </p>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Platform Activity</h2>
          {isLoadingPortalData ? (
            <LoadingState text="Loading platform activity..." />
          ) : portalDataError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{portalDataError}</div>
          ) : platformActivity.length === 0 ? (
            <EmptyState title="No activity available" description="Recent platform events will appear here." />
          ) : (
            <DataTable
              columns={[
                { key: 'event', header: 'Event' },
                { key: 'actor', header: 'Actor' },
                { key: 'time', header: 'Time' }
              ]}
              rows={platformActivity}
            />
          )}
        </Card>
      </section>
    </DashboardLayout>
  );
}
