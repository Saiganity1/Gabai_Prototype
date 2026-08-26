export function StatusDot({ risk }: { risk: string }) {
  const c = risk === 'low' ? 'bg-green-500' : risk === 'medium' ? 'bg-amber-400' : 'bg-red-500'
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${c} shrink-0`} />
}
