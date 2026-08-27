export function RiskBadge({ risk }: { risk: string }) {
  if (risk === 'low') return <span className="text-green-600 dark:text-green-400 text-xs font-semibold">🟢 Safe</span>
  if (risk === 'medium') return <span className="text-amber-600 dark:text-amber-400 text-xs font-semibold">🟡 Moderate</span>
  return <span className="text-red-600 dark:text-red-400 text-xs font-semibold">🔴 High Risk</span>
}
