import { useState } from 'react'
import useSWR from 'swr'
import { api, fetcher, type Pod } from '../lib/api'
import { useStore } from '../stores/app'

const statusColor: Record<string, string> = {
  Running: 'bg-emerald-500',
  Pending: 'bg-amber-500',
  Succeeded: 'bg-accent2',
  Failed: 'bg-accent',
  Unknown: 'bg-muted',
}

export default function Pods() {
  const ns = useStore((s) => s.selectedNamespace)
  const { data, error, isLoading, mutate } = useSWR<Pod[]>(
    `/api/pods${ns !== 'all' ? `?namespace=${ns}` : ''}`,
    fetcher,
    { refreshInterval: 10_000 },
  )
  const [logsFor, setLogsFor] = useState<{ ns: string; name: string } | null>(null)
  const [logText, setLogText] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)

  async function viewLogs(pod: Pod) {
    setLogsFor({ ns: pod.namespace, name: pod.name })
    setLoadingLogs(true)
    try {
      const { logs } = await api.podLogs(pod.namespace, pod.name, undefined, 200)
      setLogText(logs)
    } catch (e) {
      setLogText(e instanceof Error ? e.message : 'Failed to fetch logs')
    } finally {
      setLoadingLogs(false)
    }
  }

  async function handleDelete(pod: Pod) {
    await api.deletePod(pod.namespace, pod.name)
    await mutate()
  }

  if (isLoading) return <p className="font-mono text-muted animate-pulse">loading...</p>
  if (error) return <p className="font-mono text-accent text-sm">{error.message}</p>

  return (
    <div>
      <h2 className="font-display text-4xl mb-8">PODS</h2>

      {/* Log viewer */}
      {logsFor && (
        <div className="mb-6 border border-rule rounded-lg">
          <div className="flex items-center justify-between px-4 py-2 border-b border-rule bg-rule/20">
            <span className="font-mono text-xs">
              logs: {logsFor.ns}/{logsFor.name}
            </span>
            <button
              onClick={() => setLogsFor(null)}
              className="text-xs font-mono text-muted hover:text-ink"
            >
              close
            </button>
          </div>
          <pre className="p-4 text-xs font-mono overflow-auto max-h-64 bg-ink text-paper">
            {loadingLogs ? 'loading...' : logText}
          </pre>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-rule/30 text-left">
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Pod</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Namespace</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Status</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Ready</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Restarts</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Node</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Age</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {data.map((pod) => (
                <tr key={`${pod.namespace}/${pod.name}`} className="hover:bg-rule/10">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusColor[pod.status] ?? 'bg-muted'}`} />
                      <span className="font-mono text-xs">{pod.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{pod.namespace}</td>
                  <td className="px-4 py-3 font-mono text-xs">{pod.status}</td>
                  <td className="px-4 py-3 font-mono text-xs">{pod.ready}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <span className={pod.restarts > 5 ? 'text-accent font-bold' : ''}>
                      {pod.restarts}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{pod.node}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{pod.age}</td>
                  <td className="px-4 py-3 space-x-2">
                    <button
                      onClick={() => viewLogs(pod)}
                      className="px-2 py-1 text-xs font-mono border border-rule rounded hover:bg-rule/30"
                    >
                      logs
                    </button>
                    <button
                      onClick={() => handleDelete(pod)}
                      className="px-2 py-1 text-xs font-mono text-accent border border-accent/30 rounded hover:bg-accent/10"
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
