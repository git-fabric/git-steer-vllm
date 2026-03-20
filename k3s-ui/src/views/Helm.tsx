import useSWR from 'swr'
import { fetcher, type HelmRelease } from '../lib/api'
import { useStore } from '../stores/app'

const statusColor: Record<string, string> = {
  deployed: 'bg-emerald-500 text-paper',
  failed: 'bg-accent text-paper',
  pending: 'bg-amber-500 text-ink',
  superseded: 'bg-rule text-ink',
  uninstalled: 'bg-muted text-paper',
}

export default function Helm() {
  const ns = useStore((s) => s.selectedNamespace)
  const { data, error, isLoading } = useSWR<HelmRelease[]>(
    `/api/helm/releases${ns !== 'all' ? `?namespace=${ns}` : ''}`,
    fetcher,
    { refreshInterval: 30_000 },
  )

  if (isLoading) return <p className="font-mono text-muted animate-pulse">loading...</p>
  if (error) return <p className="font-mono text-accent text-sm">{error.message}</p>

  return (
    <div>
      <h2 className="font-display text-4xl mb-8">HELM</h2>

      {data && data.length === 0 && (
        <p className="font-mono text-muted text-sm">No Helm releases found.</p>
      )}

      {data && data.length > 0 && (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-rule/30 text-left">
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Release</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Namespace</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Chart</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Version</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">App</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Status</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {data.map((r) => (
                <tr key={`${r.namespace}/${r.name}`} className="hover:bg-rule/10">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{r.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{r.namespace}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.chart}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.version}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{r.appVersion}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-mono ${statusColor[r.status] ?? 'bg-rule text-ink'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{r.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
