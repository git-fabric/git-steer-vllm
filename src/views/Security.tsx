import { useState } from 'react'
import useSWR from 'swr'
import { api, fetcher, type SecurityAlert } from '../lib/api'

const severityColor: Record<string, string> = {
  critical: 'bg-accent text-paper',
  high: 'bg-orange-500 text-paper',
  medium: 'bg-yellow-500 text-ink',
  low: 'bg-rule text-ink',
}

export default function Security() {
  const { data, error, isLoading, mutate } = useSWR<SecurityAlert[]>(
    '/api/security/alerts',
    fetcher,
    { refreshInterval: 30_000 },
  )

  const [scanning, setScanning] = useState(false)
  const [fixing, setFixing] = useState<number | null>(null)

  async function handleScan() {
    setScanning(true)
    try {
      await api.securityScan()
      await mutate()
    } finally {
      setScanning(false)
    }
  }

  async function handleFix(alert: SecurityAlert) {
    setFixing(alert.id)
    try {
      const { prUrl } = await api.fixAlert(alert.owner, alert.repo, alert.id)
      window.open(prUrl, '_blank')
      await mutate()
    } finally {
      setFixing(null)
    }
  }

  async function handleDismiss(alert: SecurityAlert) {
    await api.dismissAlert(alert.owner, alert.repo, alert.id, 'not_applicable')
    await mutate()
  }

  const openAlerts = data?.filter((a) => a.state === 'open') ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-display text-4xl">SECURITY</h2>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="px-4 py-2 bg-ink text-paper rounded font-mono text-sm hover:bg-ink/80 disabled:opacity-50 transition-colors"
        >
          {scanning ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      {isLoading && (
        <p className="text-muted font-mono text-sm">Loading alerts...</p>
      )}
      {error && (
        <p className="text-accent font-mono text-sm">Failed to load alerts</p>
      )}

      {data && openAlerts.length === 0 && (
        <p className="text-muted font-mono text-sm">
          No open security alerts. All clear.
        </p>
      )}

      {openAlerts.length > 0 && (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-rule/30 text-left">
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Repo
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  CVE
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Severity
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Package
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Patch
                </th>
                <th className="px-4 py-3 font-mono text-xs text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {openAlerts.map((alert) => (
                <tr key={`${alert.repo}-${alert.id}`} className="hover:bg-rule/10">
                  <td className="px-4 py-3 font-mono text-xs">
                    {alert.owner}/{alert.repo}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{alert.cve}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-mono ${severityColor[alert.severity]}`}
                    >
                      {alert.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {alert.package}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {alert.patchedVersion || '—'}
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    {alert.patchedVersion && (
                      <button
                        onClick={() => handleFix(alert)}
                        disabled={fixing === alert.id}
                        className="px-2 py-1 bg-accent2 text-paper text-xs rounded font-mono hover:bg-accent2/80 disabled:opacity-50"
                      >
                        {fixing === alert.id ? 'Creating PR...' : 'Fix PR'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDismiss(alert)}
                      className="px-2 py-1 border border-rule text-xs rounded font-mono hover:bg-rule/30"
                    >
                      Dismiss
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
