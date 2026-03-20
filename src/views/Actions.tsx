import { useState } from 'react'
import useSWR from 'swr'
import { api, fetcher, type WorkflowRun } from '../lib/api'

const conclusionColor: Record<string, string> = {
  success: 'text-green-600',
  failure: 'text-accent',
  cancelled: 'text-muted',
  in_progress: 'text-accent2',
}

export default function Actions() {
  const { data, error, isLoading, mutate } = useSWR<WorkflowRun[]>(
    '/api/actions/runs',
    fetcher,
    { refreshInterval: 15_000 },
  )

  const [triggering, setTriggering] = useState(false)

  async function triggerHeartbeat() {
    setTriggering(true)
    try {
      await api.triggerWorkflow('ry-ops', 'git-steer', 'heartbeat.yml', 'main')
      await mutate()
    } finally {
      setTriggering(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-display text-4xl">ACTIONS</h2>
        <button
          onClick={triggerHeartbeat}
          disabled={triggering}
          className="px-4 py-2 bg-ink text-paper rounded font-mono text-sm hover:bg-ink/80 disabled:opacity-50 transition-colors"
        >
          {triggering ? 'Triggering...' : 'Trigger Heartbeat'}
        </button>
      </div>

      {isLoading && (
        <p className="text-muted font-mono text-sm">Loading runs...</p>
      )}
      {error && (
        <p className="text-accent font-mono text-sm">Failed to load runs</p>
      )}

      {data && (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-rule/30 text-left">
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Run
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Repo
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Status
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Conclusion
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Triggered
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {data.map((run) => (
                <tr key={run.id} className="hover:bg-rule/10">
                  <td className="px-4 py-3 font-mono text-xs">
                    #{run.id}{' '}
                    <span className="text-muted">{run.name}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{run.repo}</td>
                  <td className="px-4 py-3 font-mono text-xs">{run.status}</td>
                  <td
                    className={`px-4 py-3 font-mono text-xs font-medium ${conclusionColor[run.conclusion] ?? 'text-muted'}`}
                  >
                    {run.conclusion || '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {run.triggeredAt}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {run.duration}
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
