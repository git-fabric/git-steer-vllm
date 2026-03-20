import { useEffect } from 'react'
import useSWR from 'swr'
import { api, fetcher, type Alert } from '../lib/api'
import { useStore } from '../stores/app'

const severityStyle: Record<string, string> = {
  critical: 'border-l-accent bg-accent/5',
  warning: 'border-l-yellow-500 bg-yellow-500/5',
  info: 'border-l-accent2 bg-accent2/5',
}

export default function Alerts() {
  const { data, error, isLoading, mutate } = useSWR<Alert[]>(
    '/api/alerts',
    fetcher,
    { refreshInterval: 15_000 },
  )

  const setAlertCount = useStore((s) => s.setAlertCount)

  useEffect(() => {
    if (data) {
      setAlertCount(data.filter((a) => !a.dismissed).length)
    }
  }, [data, setAlertCount])

  async function dismiss(id: string) {
    await api.dismissOpsAlert(id)
    await mutate()
  }

  const active = data?.filter((a) => !a.dismissed) ?? []
  const dismissed = data?.filter((a) => a.dismissed) ?? []

  return (
    <div>
      <h2 className="font-display text-4xl mb-8">ALERTS</h2>

      {isLoading && (
        <p className="text-muted font-mono text-sm">Loading alerts...</p>
      )}
      {error && (
        <p className="text-accent font-mono text-sm">Failed to load alerts</p>
      )}

      {active.length === 0 && !isLoading && (
        <p className="text-muted font-mono text-sm">No active alerts.</p>
      )}

      {active.length > 0 && (
        <div className="space-y-3 mb-10">
          {active.map((alert) => (
            <div
              key={alert.id}
              className={`border-l-4 rounded-r-lg p-4 flex items-start justify-between ${severityStyle[alert.severity]}`}
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs uppercase text-muted">
                    {alert.type}
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {alert.timestamp}
                  </span>
                </div>
                <p className="text-sm">{alert.message}</p>
              </div>
              <button
                onClick={() => dismiss(alert.id)}
                className="shrink-0 ml-4 px-2 py-1 border border-rule text-xs rounded font-mono hover:bg-rule/30"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {dismissed.length > 0 && (
        <details className="mt-6">
          <summary className="font-mono text-xs text-muted cursor-pointer hover:text-ink">
            {dismissed.length} dismissed alert
            {dismissed.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-3 space-y-2 opacity-50">
            {dismissed.map((alert) => (
              <div
                key={alert.id}
                className="border-l-4 border-l-rule rounded-r-lg p-3"
              >
                <span className="font-mono text-xs text-muted">
                  {alert.type} — {alert.message}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
