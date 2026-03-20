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

export interface ClusterHealth {
  status: 'healthy' | 'degraded' | 'down'
  version: string
  nodeCount: number
  podCount: number
  namespacesCount: number
  cpuUsage: { used: string; capacity: string; percent: number }
  memoryUsage: { used: string; capacity: string; percent: number }
  components: { name: string; status: string; message: string }[]
}

export interface Node {
  name: string
  status: 'Ready' | 'NotReady' | 'Unknown'
  roles: string[]
  version: string
  os: string
  arch: string
  cpu: { capacity: string; allocatable: string; used: string }
  memory: { capacity: string; allocatable: string; used: string }
  pods: { running: number; capacity: number }
  conditions: { type: string; status: string; message: string }[]
  age: string
  taints: { key: string; effect: string }[]
}

export interface Workload {
  kind: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Job' | 'CronJob'
  name: string
  namespace: string
  replicas: { ready: number; desired: number }
  age: string
  images: string[]
  status: 'healthy' | 'progressing' | 'degraded'
}

export interface Service {
  name: string
  namespace: string
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName'
  clusterIP: string
  externalIP: string
  ports: string[]
  age: string
}

export interface Ingress {
  name: string
  namespace: string
  hosts: string[]
  paths: { host: string; path: string; backend: string }[]
  tls: boolean
  age: string
}

export interface Pod {
  name: string
  namespace: string
  status: string
  ready: string
  restarts: number
  node: string
  age: string
  ip: string
  containers: { name: string; image: string; ready: boolean; restartCount: number; state: string }[]
}

export interface PVC {
  name: string
  namespace: string
  status: string
  volume: string
  capacity: string
  accessModes: string[]
  storageClass: string
  age: string
}

export interface HelmRelease {
  name: string
  namespace: string
  chart: string
  version: string
  appVersion: string
  status: string
  updatedAt: string
}

export interface K8sEvent {
  type: 'Normal' | 'Warning'
  reason: string
  object: string
  namespace: string
  message: string
  count: number
  firstSeen: string
  lastSeen: string
}

// ─── Endpoints ───────────────────────────────────────────

export const api = {
  health: () => request<ClusterHealth>('/api/health'),

  // Nodes
  nodes: () => request<Node[]>('/api/nodes'),
  cordonNode: (name: string) =>
    request<void>(`/api/nodes/${name}/cordon`, { method: 'POST' }),
  uncordonNode: (name: string) =>
    request<void>(`/api/nodes/${name}/uncordon`, { method: 'POST' }),
  drainNode: (name: string) =>
    request<void>(`/api/nodes/${name}/drain`, { method: 'POST' }),

  // Workloads
  workloads: (ns?: string) =>
    request<Workload[]>(`/api/workloads${ns && ns !== 'all' ? `?namespace=${ns}` : ''}`),
  scaleWorkload: (ns: string, kind: string, name: string, replicas: number) =>
    request<void>(`/api/workloads/${ns}/${kind}/${name}/scale`, {
      method: 'POST',
      body: JSON.stringify({ replicas }),
    }),
  restartWorkload: (ns: string, kind: string, name: string) =>
    request<void>(`/api/workloads/${ns}/${kind}/${name}/restart`, { method: 'POST' }),

  // Services & Ingresses
  services: (ns?: string) =>
    request<Service[]>(`/api/services${ns && ns !== 'all' ? `?namespace=${ns}` : ''}`),
  ingresses: (ns?: string) =>
    request<Ingress[]>(`/api/ingresses${ns && ns !== 'all' ? `?namespace=${ns}` : ''}`),

  // Pods
  pods: (ns?: string) =>
    request<Pod[]>(`/api/pods${ns && ns !== 'all' ? `?namespace=${ns}` : ''}`),
  podLogs: (ns: string, name: string, container?: string, tail?: number) =>
    request<{ logs: string }>(
      `/api/pods/${ns}/${name}/logs?${container ? `container=${container}&` : ''}tail=${tail ?? 200}`,
    ),
  deletePod: (ns: string, name: string) =>
    request<void>(`/api/pods/${ns}/${name}`, { method: 'DELETE' }),

  // Storage
  pvcs: (ns?: string) =>
    request<PVC[]>(`/api/storage/pvcs${ns && ns !== 'all' ? `?namespace=${ns}` : ''}`),

  // Helm
  helmReleases: (ns?: string) =>
    request<HelmRelease[]>(`/api/helm/releases${ns && ns !== 'all' ? `?namespace=${ns}` : ''}`),

  // Events
  events: (ns?: string) =>
    request<K8sEvent[]>(`/api/events${ns && ns !== 'all' ? `?namespace=${ns}` : ''}`),

  // Apply manifest
  apply: (manifest: string) =>
    request<{ applied: string[] }>('/api/apply', {
      method: 'POST',
      body: JSON.stringify({ manifest }),
    }),

  // Namespaces
  namespaces: () => request<string[]>('/api/namespaces'),
}

export const fetcher = <T>(path: string) => request<T>(path)
