import useSWR from 'swr'
import { fetcher, type AuditEntry } from '../lib/api'

export default function Audit() {
  const { data, error, isLoading } = useSWR<AuditEntry[]>(
    '/api/audit?limit=100',
    fetcher,
    { refreshInterval: 30_000 },
  )

  return (
    <div>
      <h2 className="font-display text-4xl mb-8">AUDIT LOG</h2>

      {isLoading && (
        <p className="text-muted font-mono text-sm">Loading audit log...</p>
      )}
      {error && (
        <p className="text-accent font-mono text-sm">
          Failed to load audit log
        </p>
      )}

      {data && data.length === 0 && (
        <p className="text-muted font-mono text-sm">No audit entries yet.</p>
      )}

      {data && data.length > 0 && (
        <div className="space-y-px">
          {data.map((entry, i) => (
            <div
              key={i}
              className="flex items-start gap-4 px-4 py-3 border-b border-rule/50 hover:bg-rule/10"
            >
              <span className="font-mono text-xs text-muted whitespace-nowrap shrink-0">
                {entry.timestamp}
              </span>
              <span className="font-mono text-xs font-medium text-accent2 shrink-0 w-24">
                {entry.action}
              </span>
              <span className="font-mono text-xs text-muted shrink-0 w-28">
                {entry.actor}
              </span>
              <span className="font-mono text-xs">
                <span className="font-medium">{entry.target}</span>
                {entry.details && (
                  <span className="text-muted"> — {entry.details}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
