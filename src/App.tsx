import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './views/Dashboard'
import Security from './views/Security'
import Repos from './views/Repos'
import Actions from './views/Actions'
import Audit from './views/Audit'
import Alerts from './views/Alerts'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="security" element={<Security />} />
        <Route path="repos" element={<Repos />} />
        <Route path="actions" element={<Actions />} />
        <Route path="audit" element={<Audit />} />
        <Route path="alerts" element={<Alerts />} />
      </Route>
    </Routes>
  )
}
