import type { ReactNode } from 'react';
import { DonorShell } from '@/components/donor/donor-shell';

export default function DonorLayout({ children }: { children: ReactNode }) {
  return <DonorShell>{children}</DonorShell>;
}
