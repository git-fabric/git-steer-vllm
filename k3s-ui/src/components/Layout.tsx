import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../stores/app'

const nav = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/nodes', label: 'Nodes', icon: '⬡' },
  { to: '/workloads', label: 'Workloads', icon: '▦' },
  { to: '/services', label: 'Services', icon: '◎' },
  { to: '/pods', label: 'Pods', icon: '⬢' },
  { to: '/storage', label: 'Storage', icon: '▤' },
  { to: '/helm', label: 'Helm', icon: '⎈' },
  { to: '/events', label: 'Events', icon: '☰' },
]

export default function Layout() {
  const eventCount = useStore((s) => s.warningEventCount)

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-rule bg-paper flex flex-col">
        <div className="px-5 py-6 border-b border-rule">
          <h1 className="font-display text-3xl tracking-wide text-ink">K3S</h1>
          <p className="text-xs font-mono text-muted mt-1">ops dashboard</p>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {nav.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-ink text-paper'
                    : 'text-muted hover:text-ink hover:bg-rule/40'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
              {label === 'Events' && eventCount > 0 && (
                <span className="ml-auto bg-accent text-paper text-xs font-mono px-1.5 py-0.5 rounded-full">
                  {eventCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-rule text-xs font-mono text-muted">
          fabric-forge
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
