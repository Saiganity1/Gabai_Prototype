export function StatusDot({ risk }: { risk: string }) {
  const c = risk === 'low' ? 'bg-emerald-500 ring-emerald-500/30' : risk === 'medium' ? 'bg-amber-400 ring-amber-400/30' : 'bg-rose-500 ring-rose-500/30'
  return <span className={`inline-block w-2 h-2 rounded-full ${c} ring-4 shrink-0`} />
}

