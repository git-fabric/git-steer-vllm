import useSWR from 'swr'
import { fetcher, type ClusterHealth } from '../lib/api'

function Bar({ label, percent, sub }: { label: string; percent: number; sub: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-mono">{label}</span>
        <span className="font-mono text-muted">{sub}</span>
      </div>
      <div className="h-2 bg-rule rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            percent > 85 ? 'bg-accent' : percent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data, error, isLoading } = useSWR<ClusterHealth>('/api/health', fetcher, {
    refreshInterval: 15_000,
  })

  if (isLoading) return <p className="font-mono text-muted animate-pulse">loading...</p>
  if (error) return <p className="font-mono text-accent text-sm">{error.message}</p>
  if (!data) return null

  const statusColor =
    data.status === 'healthy' ? 'bg-emerald-500' : data.status === 'degraded' ? 'bg-amber-500' : 'bg-accent'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-4xl">DASHBOARD</h2>
        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded text-xs font-mono text-paper ${statusColor}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-paper/60" />
          {data.status}
        </span>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'NODES', value: data.nodeCount },
          { label: 'PODS', value: data.podCount },
          { label: 'NAMESPACES', value: data.namespacesCount },
          { label: 'VERSION', value: data.version },
        ].map((c) => (
          <div key={c.label} className="border border-rule rounded-lg p-4">
            <p className="font-mono text-xs text-muted uppercase tracking-wider">{c.label}</p>
            <p className="font-mono text-2xl font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Resource usage */}
      <div className="border border-rule rounded-lg p-5 space-y-4">
        <h3 className="font-mono text-xs text-muted uppercase tracking-wider">CLUSTER RESOURCES</h3>
        <Bar
          label="CPU"
          percent={data.cpuUsage.percent}
          sub={`${data.cpuUsage.used} / ${data.cpuUsage.capacity}`}
        />
        <Bar
          label="Memory"
          percent={data.memoryUsage.percent}
          sub={`${data.memoryUsage.used} / ${data.memoryUsage.capacity}`}
        />
      </div>

      {/* Components */}
      <div className="border border-rule rounded-lg p-5">
        <h3 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">COMPONENTS</h3>
        <div className="space-y-2">
          {data.components.map((c) => (
            <div key={c.name} className="flex items-center gap-3 text-sm">
              <span className={`w-2 h-2 rounded-full ${c.status === 'Healthy' ? 'bg-emerald-500' : 'bg-accent'}`} />
              <span className="font-mono font-medium">{c.name}</span>
              <span className="text-muted text-xs">{c.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
