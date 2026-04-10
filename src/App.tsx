import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import LoginScreen from '@/features/auth/LoginScreen'
import ImportScreen from '@/features/import/ImportScreen'
import BacklogScreen from '@/features/backlog/BacklogScreen'
import BoardScreen from '@/features/board/BoardScreen'
import SprintPlanningScreen from '@/features/sprint/SprintPlanningScreen'
import MilestonesScreen from '@/features/milestones/MilestonesScreen'
import SettingsScreen from '@/features/settings/SettingsScreen'
import AnalyticsScreen from '@/features/analytics/AnalyticsScreen'

const queryClient = new QueryClient()

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
      <AuthProvider>
        <BrowserRouter>
          <AppShell dark={dark} toggleTheme={toggleTheme} />
          <Toaster theme={dark ? 'dark' : 'light'} position="bottom-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

function AppShell({ dark, toggleTheme }: { dark: boolean; toggleTheme: () => void }) {
  const { user, logout } = useAuth()

  if (!user) return <LoginScreen />

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background px-6 py-3 flex items-center gap-6">
        <span className="font-semibold text-lg text-foreground">Planning Board</span>
        <nav className="flex gap-5 text-sm">
          <NavLink to="/" end className={({ isActive }) =>
            isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
          }>Backlog</NavLink>
          <NavLink to="/board" className={({ isActive }) =>
            isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
          }>Board</NavLink>
          <NavLink to="/sprints" className={({ isActive }) =>
            isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
          }>Sprints</NavLink>
          <NavLink to="/milestones" className={({ isActive }) =>
            isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
          }>Milestones</NavLink>
          <NavLink to="/analytics" className={({ isActive }) =>
            isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
          }>Analítica</NavLink>
          <NavLink to="/import" className={({ isActive }) =>
            isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
          }>Importar</NavLink>
          <NavLink to="/settings" className={({ isActive }) =>
            isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
          }>Configuración</NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {user.name}
          </span>
          <button
            onClick={logout}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-transparent hover:border-border"
          >
            Salir
          </button>
          <button
            onClick={toggleTheme}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-transparent hover:border-border"
            aria-label="Toggle dark mode"
          >
            {dark ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-hidden">
        <Routes>
          <Route path="/" element={<BacklogScreen />} />
          <Route path="/board" element={<BoardScreen />} />
          <Route path="/sprints" element={<SprintPlanningScreen />} />
          <Route path="/milestones" element={<MilestonesScreen />} />
          <Route path="/analytics" element={<AnalyticsScreen />} />
          <Route path="/import" element={<ImportScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      </main>
    </div>
  )
}
