const BASE = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json()
}

// ─── Types ───────────────────────────────────────────────

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down'
  rateLimit: { rest: { remaining: number; limit: number; reset: string }; graphql: { remaining: number; limit: number } }
  heartbeat: { lastRun: string; conclusion: string; consecutiveFailures: number }
  stateSync: { lastSync: string; dirty: boolean }
  uptime: number
}

export interface SecurityAlert {
  id: number
  repo: string
  owner: string
  cve: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  package: string
  patchedVersion: string
  state: 'open' | 'dismissed' | 'fixed'
  createdAt: string
}

export interface Repo {
  owner: string
  name: string
  private: boolean
  language: string
  updatedAt: string
  openIssues: number
  defaultBranch: string
}

export interface Branch {
  name: string
  lastCommit: string
  age: string
  merged: boolean
  protected: boolean
}

export interface WorkflowRun {
  id: number
  name: string
  status: string
  conclusion: string
  triggeredAt: string
  duration: string
  repo: string
}

export interface AuditEntry {
  timestamp: string
  action: string
  actor: string
  target: string
  details: string
}

export interface Alert {
  id: string
  type: 'heartbeat' | 'rate_limit' | 'state_sync' | 'security'
  message: string
  severity: 'critical' | 'warning' | 'info'
  timestamp: string
  dismissed: boolean
}

// ─── Endpoints ───────────────────────────────────────────

export const api = {
  health: () => request<HealthStatus>('/api/health'),

  // Security
  securityAlerts: () => request<SecurityAlert[]>('/api/security/alerts'),
  dismissAlert: (owner: string, repo: string, alertNumber: number, reason: string) =>
    request<void>('/api/security/dismiss', {
      method: 'POST',
      body: JSON.stringify({ owner, repo, alertNumber, reason }),
    }),
  fixAlert: (owner: string, repo: string, alertNumber: number) =>
    request<{ prUrl: string }>('/api/security/fix', {
      method: 'POST',
      body: JSON.stringify({ owner, repo, alertNumber }),
    }),
  securityScan: () =>
    request<{ started: boolean }>('/api/security/scan', { method: 'POST' }),

  // Repos
  repos: () => request<Repo[]>('/api/repos'),
  branches: (owner: string, repo: string) =>
    request<Branch[]>(`/api/repos/${owner}/${repo}/branches`),

  // Actions
  workflowRuns: () => request<WorkflowRun[]>('/api/actions/runs'),
  triggerWorkflow: (owner: string, repo: string, workflowId: string, ref: string) =>
    request<void>('/api/actions/trigger', {
      method: 'POST',
      body: JSON.stringify({ owner, repo, workflowId, ref }),
    }),

  // Audit
  auditLog: (limit?: number) =>
    request<AuditEntry[]>(`/api/audit${limit ? `?limit=${limit}` : ''}`),

  // Alerts
  alerts: () => request<Alert[]>('/api/alerts'),
  dismissOpsAlert: (id: string) =>
    request<void>(`/api/alerts/${id}/dismiss`, { method: 'POST' }),
}

// SWR fetcher
export const fetcher = <T>(path: string) => request<T>(path)
