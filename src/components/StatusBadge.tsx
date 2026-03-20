const variants = {
  healthy: 'bg-emerald-100 text-emerald-800',
  degraded: 'bg-amber-100 text-amber-800',
  down: 'bg-red-100 text-red-800',
  critical: 'bg-red-100 text-red-800',
  high: 'bg-accent/10 text-accent',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-blue-100 text-accent2',
  open: 'bg-accent/10 text-accent',
  fixed: 'bg-emerald-100 text-emerald-800',
  dismissed: 'bg-rule text-muted',
  success: 'bg-emerald-100 text-emerald-800',
  failure: 'bg-red-100 text-red-800',
  in_progress: 'bg-amber-100 text-amber-800',
  warning: 'bg-amber-100 text-amber-800',
  info: 'bg-blue-100 text-accent2',
} as const

type Variant = keyof typeof variants

export default function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase() as Variant
  const cls = variants[key] ?? 'bg-rule text-muted'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono uppercase ${cls}`}>
      {status}
    </span>
  )
}
