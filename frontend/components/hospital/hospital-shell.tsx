"use client";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
export function HospitalShell({ children }: { children: ReactNode }) {
  return <PortalShell role="hospital">{children}</PortalShell>;
}
