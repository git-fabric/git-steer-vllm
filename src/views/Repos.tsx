import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, api, type Repo, type Branch } from '../lib/api'

export default function Repos() {
  const { data, error, isLoading } = useSWR<Repo[]>('/api/repos', fetcher, {
    refreshInterval: 60_000,
  })

  const [expanded, setExpanded] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)

  async function toggleBranches(owner: string, name: string) {
    const key = `${owner}/${name}`
    if (expanded === key) {
      setExpanded(null)
      return
    }
    setExpanded(key)
    setLoadingBranches(true)
    try {
      const b = await api.branches(owner, name)
      setBranches(b)
    } finally {
      setLoadingBranches(false)
    }
  }

  return (
    <div>
      <h2 className="font-display text-4xl mb-8">REPOS</h2>

      {isLoading && (
        <p className="text-muted font-mono text-sm">Loading repos...</p>
      )}
      {error && (
        <p className="text-accent font-mono text-sm">Failed to load repos</p>
      )}

      {data && (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-rule/30 text-left">
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Repo
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Visibility
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Language
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Updated
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Issues
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {data.map((repo) => {
                const key = `${repo.owner}/${repo.name}`
                const isExpanded = expanded === key
                return (
                  <tr key={key} className="group">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleBranches(repo.owner, repo.name)}
                        className="font-mono text-xs text-accent2 hover:underline"
                      >
                        {key}
                      </button>
                      {isExpanded && (
                        <div className="mt-3 ml-2 border-l-2 border-rule pl-3">
                          {loadingBranches ? (
                            <p className="text-xs text-muted font-mono">
                              Loading branches...
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted">
                                  <th className="pr-4 pb-1 font-mono">
                                    Branch
                                  </th>
                                  <th className="pr-4 pb-1 font-mono">Age</th>
                                  <th className="pr-4 pb-1 font-mono">
                                    Merged
                                  </th>
                                  <th className="pb-1 font-mono">Protected</th>
                                </tr>
                              </thead>
                              <tbody>
                                {branches.map((b) => (
                                  <tr key={b.name}>
                                    <td className="pr-4 py-0.5 font-mono">
                                      {b.name}
                                    </td>
                                    <td className="pr-4 py-0.5 font-mono text-muted">
                                      {b.age}
                                    </td>
                                    <td className="pr-4 py-0.5 font-mono">
                                      {b.merged ? '✓' : '—'}
                                    </td>
                                    <td className="py-0.5 font-mono">
                                      {b.protected ? '🔒' : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {repo.private ? 'private' : 'public'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {repo.language || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {repo.updatedAt}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {repo.openIssues}
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
