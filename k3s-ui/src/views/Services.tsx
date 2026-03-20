import useSWR from 'swr'
import { fetcher, type Service, type Ingress } from '../lib/api'
import { useStore } from '../stores/app'

export default function Services() {
  const ns = useStore((s) => s.selectedNamespace)
  const q = ns !== 'all' ? `?namespace=${ns}` : ''

  const { data: svcs, isLoading: loadingSvcs } = useSWR<Service[]>(`/api/services${q}`, fetcher, { refreshInterval: 30_000 })
  const { data: ings, isLoading: loadingIngs } = useSWR<Ingress[]>(`/api/ingresses${q}`, fetcher, { refreshInterval: 30_000 })

  const loading = loadingSvcs || loadingIngs

  return (
    <div className="space-y-8">
      <h2 className="font-display text-4xl">SERVICES</h2>

      {loading && <p className="font-mono text-muted animate-pulse text-sm">loading...</p>}

      {/* Services table */}
      {svcs && svcs.length > 0 && (
        <div>
          <h3 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">Services</h3>
          <div className="border border-rule rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-rule/30 text-left">
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Name</th>
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Namespace</th>
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Type</th>
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Cluster IP</th>
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Ports</th>
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {svcs.map((s) => (
                  <tr key={`${s.namespace}/${s.name}`} className="hover:bg-rule/10">
                    <td className="px-4 py-3 font-mono text-xs">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{s.namespace}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.type}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{s.clusterIP}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.ports.join(', ')}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{s.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ingresses table */}
      {ings && ings.length > 0 && (
        <div>
          <h3 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">Ingresses</h3>
          <div className="border border-rule rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-rule/30 text-left">
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Name</th>
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Namespace</th>
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Hosts</th>
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">TLS</th>
                  <th className="px-4 py-3 font-mono text-xs text-muted uppercase">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {ings.map((ig) => (
                  <tr key={`${ig.namespace}/${ig.name}`} className="hover:bg-rule/10">
                    <td className="px-4 py-3 font-mono text-xs">{ig.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{ig.namespace}</td>
                    <td className="px-4 py-3 font-mono text-xs">{ig.hosts.join(', ')}</td>
                    <td className="px-4 py-3 font-mono text-xs">{ig.tls ? '🔒' : '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{ig.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
