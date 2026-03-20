import useSWR from 'swr'
import { fetcher, type PVC } from '../lib/api'
import { useStore } from '../stores/app'

const statusColor: Record<string, string> = {
  Bound: 'bg-emerald-500',
  Pending: 'bg-amber-500',
  Lost: 'bg-accent',
}

export default function Storage() {
  const ns = useStore((s) => s.selectedNamespace)
  const { data, error, isLoading } = useSWR<PVC[]>(
    `/api/storage/pvcs${ns !== 'all' ? `?namespace=${ns}` : ''}`,
    fetcher,
    { refreshInterval: 30_000 },
  )

  if (isLoading) return <p className="font-mono text-muted animate-pulse">loading...</p>
  if (error) return <p className="font-mono text-accent text-sm">{error.message}</p>

  return (
    <div>
      <h2 className="font-display text-4xl mb-8">STORAGE</h2>

      {data && data.length === 0 && (
        <p className="font-mono text-muted text-sm">No PVCs found.</p>
      )}

      {data && data.length > 0 && (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-rule/30 text-left">
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">PVC</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Namespace</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Status</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Capacity</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Access</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Storage Class</th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {data.map((pvc) => (
                <tr key={`${pvc.namespace}/${pvc.name}`} className="hover:bg-rule/10">
                  <td className="px-4 py-3 font-mono text-xs">{pvc.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{pvc.namespace}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-mono`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusColor[pvc.status] ?? 'bg-muted'}`} />
                      {pvc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{pvc.capacity}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{pvc.accessModes.join(', ')}</td>
                  <td className="px-4 py-3 font-mono text-xs">{pvc.storageClass}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{pvc.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
