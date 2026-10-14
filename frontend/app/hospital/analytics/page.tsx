"use client";
import { AnalyticsChart } from "@/components/portal/analytics-chart";
import { PortalPanel } from "@/components/portal/portal-ui";
export default function AnalyticsPage() {
  return (
    <PortalPanel title="Hospital activity & inventory movement">
      <AnalyticsChart full />
    </PortalPanel>
  );
}
