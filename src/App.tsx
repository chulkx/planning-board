import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

const queryClient = new QueryClient()
import ImportScreen from '@/features/import/ImportScreen'
import BacklogScreen from '@/features/backlog/BacklogScreen'
import BoardScreen from '@/features/board/BoardScreen'
import SprintPlanningScreen from '@/features/sprint/SprintPlanningScreen'
import MilestonesScreen from '@/features/milestones/MilestonesScreen'
import SettingsScreen from '@/features/settings/SettingsScreen'

export default function App() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  function toggleTheme() {
    document.documentElement.classList.add('theme-transitioning')
    setDark(d => !d)
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 300)
  }

  return (
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <header className="border-b bg-background px-6 py-3 flex items-center gap-6">
          <span className="font-semibold text-lg text-foreground">Planning Board</span>
          <nav className="flex gap-5 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }
            >
              Backlog
            </NavLink>
            <NavLink
              to="/board"
              className={({ isActive }) =>
                isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }
            >
              Board
            </NavLink>
            <NavLink
              to="/sprints"
              className={({ isActive }) =>
                isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }
            >
              Sprints
            </NavLink>
            <NavLink
              to="/milestones"
              className={({ isActive }) =>
                isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }
            >
              Milestones
            </NavLink>
            <NavLink
              to="/import"
              className={({ isActive }) =>
                isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }
            >
              Importar
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }
            >
              Configuración
            </NavLink>
          </nav>
          <button
            onClick={toggleTheme}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-transparent hover:border-border"
            aria-label="Toggle dark mode"
          >
            {dark ? 'Light' : 'Dark'}
          </button>
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
      <Toaster theme={dark ? 'dark' : 'light'} position="bottom-right" richColors />
    </BrowserRouter>
    </QueryClientProvider>
  )
}
