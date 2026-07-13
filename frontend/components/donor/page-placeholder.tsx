import type { LucideIcon } from 'lucide-react';

export function DonorPagePlaceholder({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-[#C0392B]"><Icon className="h-6 w-6" /></span>
      <h2 className="mt-4 text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
    </section>
  );
}
