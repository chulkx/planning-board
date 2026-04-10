import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { login as apiLogin, setAuthToken, clearAuthToken, getAuthToken } from '@/api/client'

interface AuthUser { id: string; name: string }

interface AuthContextValue {
  user: AuthUser | null
  login: (name: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('auth_user')
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    // Si hay token Y usuario guardados, restaurar sesión
    if (getAuthToken()) return loadStoredUser()
    return null
  })

  const login = useCallback(async (name: string) => {
    const res = await apiLogin(name)
    setAuthToken(res.token)
    localStorage.setItem('auth_user', JSON.stringify(res.user))
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    clearAuthToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
