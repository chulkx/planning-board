import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import ImportScreen from '@/features/import/ImportScreen'
import BacklogScreen from '@/features/backlog/BacklogScreen'
import BoardScreen from '@/features/board/BoardScreen'
import SprintPlanningScreen from '@/features/sprint/SprintPlanningScreen'
import MilestonesScreen from '@/features/milestones/MilestonesScreen'
import SettingsScreen from '@/features/settings/SettingsScreen'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <header className="border-b bg-white px-6 py-3 flex items-center gap-6">
          <span className="font-semibold text-lg text-slate-800">Planning Board</span>
          <nav className="flex gap-5 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }
            >
              Backlog
            </NavLink>
            <NavLink
              to="/board"
              className={({ isActive }) =>
                isActive ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }
            >
              Board
            </NavLink>
            <NavLink
              to="/sprints"
              className={({ isActive }) =>
                isActive ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }
            >
              Sprints
            </NavLink>
            <NavLink
              to="/milestones"
              className={({ isActive }) =>
                isActive ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }
            >
              Milestones
            </NavLink>
            <NavLink
              to="/import"
              className={({ isActive }) =>
                isActive ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }
            >
              Importar
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                isActive ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }
            >
              Configuración
            </NavLink>
          </nav>
        </header>
        <main className="flex-1 p-6 overflow-hidden">
          <Routes>
            <Route path="/" element={<BacklogScreen />} />
            <Route path="/board" element={<BoardScreen />} />
            <Route path="/sprints" element={<SprintPlanningScreen />} />
            <Route path="/milestones" element={<MilestonesScreen />} />
            <Route path="/import" element={<ImportScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
