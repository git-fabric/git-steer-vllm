import useSWR from 'swr'
import { api, fetcher, type Node } from '../lib/api'

export default function Nodes() {
  const { data, error, isLoading, mutate } = useSWR<Node[]>('/api/nodes', fetcher, {
    refreshInterval: 15_000,
  })

  async function handleCordon(name: string) {
    await api.cordonNode(name)
    await mutate()
  }

  async function handleUncordon(name: string) {
    await api.uncordonNode(name)
    await mutate()
  }

  if (isLoading) return <p className="font-mono text-muted animate-pulse">loading...</p>
  if (error) return <p className="font-mono text-accent text-sm">{error.message}</p>

  return (
    <div>
      <h2 className="font-display text-4xl mb-8">NODES</h2>

      <div className="space-y-4">
        {data?.map((node) => {
          const isReady = node.status === 'Ready'
          const isSchedulable = !node.taints.some((t) => t.key === 'node.kubernetes.io/unschedulable')
          return (
            <div key={node.name} className="border border-rule rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${isReady ? 'bg-emerald-500' : 'bg-accent'}`} />
                  <span className="font-mono font-bold">{node.name}</span>
                  <span className="font-mono text-xs text-muted">{node.roles.join(', ')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{node.version}</span>
                  {isSchedulable ? (
                    <button
                      onClick={() => handleCordon(node.name)}
                      className="px-2 py-1 text-xs font-mono border border-rule rounded hover:bg-rule/30"
                    >
                      cordon
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUncordon(node.name)}
                      className="px-2 py-1 text-xs font-mono bg-accent2 text-paper rounded hover:bg-accent2/80"
                    >
                      uncordon
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-xs font-mono">
                <div>
                  <p className="text-muted uppercase mb-1">CPU</p>
                  <p>{node.cpu.used} / {node.cpu.capacity}</p>
                </div>
                <div>
                  <p className="text-muted uppercase mb-1">Memory</p>
                  <p>{node.memory.used} / {node.memory.capacity}</p>
                </div>
                <div>
                  <p className="text-muted uppercase mb-1">Pods</p>
                  <p>{node.pods.running} / {node.pods.capacity}</p>
                </div>
              </div>

              <div className="mt-3 flex gap-4 text-xs font-mono text-muted">
                <span>{node.os} / {node.arch}</span>
                <span>age: {node.age}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
