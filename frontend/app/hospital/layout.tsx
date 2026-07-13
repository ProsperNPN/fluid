import type { ReactNode } from 'react';
import { HospitalShell } from '@/components/hospital/hospital-shell';

export default function HospitalLayout({ children }: { children: ReactNode }) {
  return <HospitalShell>{children}</HospitalShell>;
}
