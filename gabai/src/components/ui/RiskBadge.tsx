export function RiskBadge({ risk }: { risk: string }) {
  if (risk === 'low') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Safe
      </span>
    )
  }
  if (risk === 'medium') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Moderate Risk
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
      High Risk
    </span>
  )
}

