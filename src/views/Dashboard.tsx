import useSWR from 'swr'
import { fetcher, type HealthStatus } from '../lib/api'

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'healthy'
      ? 'bg-green-600'
      : status === 'degraded'
        ? 'bg-yellow-500'
        : 'bg-accent'
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono text-paper ${color}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-paper/60" />
      {status}
    </span>
  )
}

function Card({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-rule rounded-lg p-5">
      <h3 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  )
}

export default function Dashboard() {
  const { data, error, isLoading } = useSWR<HealthStatus>(
    '/api/health',
    fetcher,
    { refreshInterval: 15_000 },
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-display text-4xl">DASHBOARD</h2>
        {data && <StatusBadge status={data.status} />}
      </div>

      {isLoading && (
        <p className="text-muted font-mono text-sm">Loading health data...</p>
      )}
      {error && (
        <p className="text-accent font-mono text-sm">
          Failed to load health data — is the API running?
        </p>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {/* Rate Limits */}
          <Card title="REST Rate Limit">
            <div className="flex items-end gap-2">
              <span className="text-3xl font-mono font-bold">
                {data.rateLimit.rest.remaining}
              </span>
              <span className="text-muted text-sm mb-1">
                / {data.rateLimit.rest.limit}
              </span>
            </div>
            <div className="mt-2 h-2 bg-rule rounded-full overflow-hidden">
              <div
                className="h-full bg-ink rounded-full transition-all"
                style={{
                  width: `${(data.rateLimit.rest.remaining / data.rateLimit.rest.limit) * 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted mt-2 font-mono">
              Resets {data.rateLimit.rest.reset}
            </p>
          </Card>

          <Card title="GraphQL Rate Limit">
            <div className="flex items-end gap-2">
              <span className="text-3xl font-mono font-bold">
                {data.rateLimit.graphql.remaining}
              </span>
              <span className="text-muted text-sm mb-1">
                / {data.rateLimit.graphql.limit}
              </span>
            </div>
            <div className="mt-2 h-2 bg-rule rounded-full overflow-hidden">
              <div
                className="h-full bg-accent2 rounded-full transition-all"
                style={{
                  width: `${(data.rateLimit.graphql.remaining / data.rateLimit.graphql.limit) * 100}%`,
                }}
              />
            </div>
          </Card>

          {/* Heartbeat */}
          <Card title="Heartbeat">
            <div className="flex items-center gap-3">
              <span
                className={`text-2xl ${data.heartbeat.conclusion === 'success' ? 'text-green-600' : 'text-accent'}`}
              >
                {data.heartbeat.conclusion === 'success' ? '●' : '▲'}
              </span>
              <div>
                <p className="font-mono text-sm font-medium">
                  {data.heartbeat.conclusion}
                </p>
                <p className="text-xs text-muted">
                  Last run: {data.heartbeat.lastRun}
                </p>
              </div>
            </div>
            {data.heartbeat.consecutiveFailures > 0 && (
              <p className="mt-3 text-xs text-accent font-mono">
                {data.heartbeat.consecutiveFailures} consecutive failure
                {data.heartbeat.consecutiveFailures > 1 ? 's' : ''}
              </p>
            )}
          </Card>

          {/* State Sync */}
          <Card title="State Sync">
            <p className="font-mono text-sm">
              Last sync:{' '}
              <span className="font-bold">{data.stateSync.lastSync}</span>
            </p>
            {data.stateSync.dirty && (
              <p className="mt-2 text-xs text-accent font-mono">
                ⚠ Unsaved state changes
              </p>
            )}
          </Card>

          {/* Uptime */}
          <Card title="Uptime">
            <span className="text-3xl font-mono font-bold">
              {Math.floor(data.uptime / 3600)}h{' '}
              {Math.floor((data.uptime % 3600) / 60)}m
            </span>
          </Card>
        </div>
      )}
    </div>
  )
}
