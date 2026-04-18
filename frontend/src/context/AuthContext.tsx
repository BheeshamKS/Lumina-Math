import React, {
  createContext, useContext, useState, useCallback, useEffect,
  type ReactNode,
} from 'react'
import { loginUser, signupUser, googleOAuthUrl, refreshToken as apiRefresh } from '../services/api'
import type { User, TokenData } from '../types'

interface SignupResult {
  access_token?: string
  refresh_token?: string
  user_id?: string
  email?: string
  needsConfirmation?: boolean
  detail?: string
}

interface AuthContextValue {
  token: string | null
  user: User | null
  loading: boolean
  error: string | null
  restored: boolean
  login: (email: string, password: string) => Promise<boolean>
  signup: (email: string, password: string) => Promise<SignupResult | null>
  googleLogin: () => Promise<void>
  logout: () => void
  clearError: () => void
  refreshSession: () => Promise<string>
  loginWithTokenData: (data: TokenData) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const REFRESH_KEY = 'lumina_refresh'
const USER_KEY    = 'lumina_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,   setToken]   = useState<string | null>(null)
  const [user,    setUser]    = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as User | null } catch { return null }
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [restored, setRestored] = useState(false)

  const clearError = useCallback(() => setError(null), [])

  const _setSession = useCallback((accessToken: string, refreshTokenVal: string | undefined, userInfo: User) => {
    setToken(accessToken)
    setUser(userInfo)
    if (refreshTokenVal) localStorage.setItem(REFRESH_KEY, refreshTokenVal)
    if (userInfo)        localStorage.setItem(USER_KEY, JSON.stringify(userInfo))
  }, [])

  const _clearSession = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  }, [])

  useEffect(() => {
    let cancelled = false
    const stored = localStorage.getItem(REFRESH_KEY)
    if (!stored) { setRestored(true); return }

    apiRefresh(stored)
      .then((data) => {
        if (cancelled) return
        if (!data.access_token) {
          console.warn('[Lumina] Refresh returned no access_token — clearing session')
          _clearSession()
          return
        }
        _setSession(data.access_token, data.refresh_token, { user_id: data.user_id, email: data.email })
      })
      .catch((err: { response?: { data?: { detail?: string } }; message?: string }) => {
        console.warn('[Lumina] Session restore failed:', err?.response?.data?.detail || err.message)
        if (!cancelled) _clearSession()
      })
      .finally(() => { if (!cancelled) setRestored(true) })

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSession = useCallback(async (): Promise<string> => {
    const stored = localStorage.getItem(REFRESH_KEY)
    if (!stored) throw new Error('No refresh token')
    const data = await apiRefresh(stored)
    if (!localStorage.getItem(REFRESH_KEY)) throw new Error('Session cleared during refresh')
    _setSession(data.access_token, data.refresh_token, { user_id: data.user_id, email: data.email })
    return data.access_token
  }, [_setSession])

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true); setError(null)
    try {
      const data = await loginUser(email, password)
      _setSession(data.access_token, data.refresh_token, { user_id: data.user_id, email: data.email })
      return true
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setError(axiosErr.response?.data?.detail || 'Login failed.')
      return false
    } finally {
      setLoading(false)
    }
  }, [_setSession])

  const signup = useCallback(async (email: string, password: string): Promise<SignupResult | null> => {
    setLoading(true); setError(null)
    try {
      const data = await signupUser(email, password)
      if (data.access_token) {
        _setSession(data.access_token, data.refresh_token, { user_id: data.user_id!, email: data.email! })
      }
      return data
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } }
      const detail = axiosErr.response?.data?.detail || 'Signup failed.'
      if (axiosErr.response?.status === 202) return { needsConfirmation: true, detail }
      setError(detail)
      return null
    } finally {
      setLoading(false)
    }
  }, [_setSession])

  const googleLogin = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { url } = await googleOAuthUrl()
      window.location.href = url
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setError(axiosErr.response?.data?.detail || 'Google login failed.')
      setLoading(false)
    }
  }, [])

  const loginWithTokenData = useCallback((data: TokenData) => {
    _setSession(data.access_token, data.refresh_token, { user_id: data.user_id, email: data.email })
  }, [_setSession])

  const logout = useCallback(() => { _clearSession() }, [_clearSession])

  return (
    <AuthContext.Provider value={{
      token, user, loading, error, restored,
      login, signup, googleLogin, logout, clearError, refreshSession, loginWithTokenData,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
