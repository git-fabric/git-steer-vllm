import { useState } from 'react'
import useSWR from 'swr'
import { api, fetcher, type Workload } from '../lib/api'
import { useStore } from '../stores/app'

const statusColor: Record<string, string> = {
  healthy: 'bg-emerald-500',
  progressing: 'bg-amber-500',
  degraded: 'bg-accent',
}

export default function Workloads() {
  const ns = useStore((s) => s.selectedNamespace)
  const { data, error, isLoading, mutate } = useSWR<Workload[]>(
    `/api/workloads${ns !== 'all' ? `?namespace=${ns}` : ''}`,
    fetcher,
    { refreshInterval: 15_000 },
  )
  const [acting, setActing] = useState<string | null>(null)

  async function handleRestart(w: Workload) {
    setActing(`${w.namespace}/${w.name}`)
    try {
      await api.restartWorkload(w.namespace, w.kind, w.name)
      await mutate()
    } finally {
      setActing(null)
    }
  }

  if (isLoading) return <p className="font-mono text-muted animate-pulse">loading...</p>
  if (error) return <p className="font-mono text-accent text-sm">{error.message}</p>

  return (
    <div>
      <h2 className="font-display text-4xl mb-8">WORKLOADS</h2>

      {data && data.length === 0 && (
        <p className="font-mono text-muted text-sm">No workloads found.</p>
      )}

      {data && data.length > 0 && (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-rule/30 text-left">
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Kind</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Name</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Namespace</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Ready</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Age</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {data.map((w) => {
                const key = `${w.namespace}/${w.kind}/${w.name}`
                return (
                  <tr key={key} className="hover:bg-rule/10">
                    <td className="px-4 py-3 font-mono text-xs">{w.kind}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusColor[w.status]}`} />
                        <span className="font-mono text-xs">{w.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{w.namespace}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {w.replicas.ready}/{w.replicas.desired}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{w.age}</td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        onClick={() => handleRestart(w)}
                        disabled={acting === `${w.namespace}/${w.name}`}
                        className="px-2 py-1 text-xs font-mono border border-rule rounded hover:bg-rule/30 disabled:opacity-50"
                      >
                        restart
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
