import { useEffect } from 'react'
import useSWR from 'swr'
import { fetcher, type K8sEvent } from '../lib/api'
import { useStore } from '../stores/app'

export default function Events() {
  const ns = useStore((s) => s.selectedNamespace)
  const setWarningCount = useStore((s) => s.setWarningEventCount)

  const { data, error, isLoading } = useSWR<K8sEvent[]>(
    `/api/events${ns !== 'all' ? `?namespace=${ns}` : ''}`,
    fetcher,
    { refreshInterval: 10_000 },
  )

  useEffect(() => {
    if (data) {
      setWarningCount(data.filter((e) => e.type === 'Warning').length)
    }
  }, [data, setWarningCount])

  if (isLoading) return <p className="font-mono text-muted animate-pulse">loading...</p>
  if (error) return <p className="font-mono text-accent text-sm">{error.message}</p>

  const warnings = data?.filter((e) => e.type === 'Warning') ?? []
  const normal = data?.filter((e) => e.type === 'Normal') ?? []

  return (
    <div>
      <h2 className="font-display text-4xl mb-8">EVENTS</h2>

      {warnings.length > 0 && (
        <div className="mb-6">
          <h3 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
            Warnings ({warnings.length})
          </h3>
          <div className="space-y-2">
            {warnings.map((ev, i) => (
              <div
                key={i}
                className="border-l-4 border-l-accent bg-accent/5 rounded-r-lg p-3 flex items-start gap-4"
              >
                <div className="shrink-0 text-right">
                  <p className="font-mono text-xs text-muted">{ev.lastSeen}</p>
                  {ev.count > 1 && (
                    <p className="font-mono text-xs text-accent">x{ev.count}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-xs">
                    <span className="font-bold">{ev.reason}</span>
                    <span className="text-muted"> — {ev.object}</span>
                    {ev.namespace && (
                      <span className="text-muted"> ({ev.namespace})</span>
                    )}
                  </p>
                  <p className="text-xs text-muted mt-0.5">{ev.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {normal.length > 0 && (
        <div>
          <h3 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
            Normal ({normal.length})
          </h3>
          <div className="space-y-px">
            {normal.map((ev, i) => (
              <div
                key={i}
                className="flex items-start gap-4 px-4 py-2 border-b border-rule/50 hover:bg-rule/10"
              >
                <span className="font-mono text-xs text-muted whitespace-nowrap shrink-0">
                  {ev.lastSeen}
                </span>
                <span className="font-mono text-xs font-medium text-accent2 shrink-0 w-28">
                  {ev.reason}
                </span>
                <span className="font-mono text-xs">
                  <span className="text-muted">{ev.object}</span>
                  {ev.namespace && <span className="text-muted"> ({ev.namespace})</span>}
                  <span className="text-muted"> — {ev.message}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.length === 0 && (
        <p className="font-mono text-muted text-sm">No events.</p>
      )}
    </div>
  )
}
