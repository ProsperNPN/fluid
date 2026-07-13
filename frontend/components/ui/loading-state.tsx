export function LoadingState({ text = 'Loading data...' }: { text?: string }) {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
      {text}
    </div>
  );
}
