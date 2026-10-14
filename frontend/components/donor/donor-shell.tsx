"use client";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
export function DonorShell({ children }: { children: ReactNode }) {
  return <PortalShell role="donor">{children}</PortalShell>;
}
