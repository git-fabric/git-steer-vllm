import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './views/Dashboard'
import Nodes from './views/Nodes'
import Workloads from './views/Workloads'
import Services from './views/Services'
import Pods from './views/Pods'
import Storage from './views/Storage'
import Helm from './views/Helm'
import Events from './views/Events'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="nodes" element={<Nodes />} />
        <Route path="workloads" element={<Workloads />} />
        <Route path="services" element={<Services />} />
        <Route path="pods" element={<Pods />} />
        <Route path="storage" element={<Storage />} />
        <Route path="helm" element={<Helm />} />
        <Route path="events" element={<Events />} />
      </Route>
    </Routes>
  )
}
