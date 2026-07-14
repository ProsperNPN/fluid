export function EmptyState({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      {actionLabel && onAction ? <button type="button" onClick={onAction} className="mt-4 rounded-xl bg-[#C0392B] px-4 py-2 text-sm font-medium text-white  hover:bg-red-800">{actionLabel}</button> : null}
    </div>
  );
}
