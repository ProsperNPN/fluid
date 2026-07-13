import { Suspense, type ReactNode } from 'react';

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>{children}</Suspense>;
}
