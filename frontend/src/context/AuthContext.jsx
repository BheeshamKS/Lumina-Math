/**
 * AuthContext — access_token lives in React state (never written to storage).
 * refresh_token lives in sessionStorage so login survives page refresh
 * but is cleared when the browser tab/session closes.
 *
 * Token lifecycle:
 *  1. Login/signup → store refresh_token in sessionStorage
 *  2. On app mount, if refresh_token exists → call /auth/refresh → restore session
 *  3. On 401 (caught by axios interceptor in api.js) → call refreshSession() → retry
 *  4. Logout → clear everything
 */

import React, {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react'
import { loginUser, signupUser, googleOAuthUrl, refreshToken as apiRefresh } from '../services/api'

const AuthContext = createContext(null)

const REFRESH_KEY = 'lumina_refresh'
const USER_KEY    = 'lumina_user'

export function AuthProvider({ children }) {
  const [token,   setToken]   = useState(null)
  const [user,    setUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  // Track whether initial restore has finished so the app doesn't flash login
  const [restored, setRestored] = useState(false)

  const clearError = useCallback(() => setError(null), [])

  // ── Persist helpers ─────────────────────────────────────────────
  const _setSession = useCallback((accessToken, refreshToken, userInfo) => {
    setToken(accessToken)
    setUser(userInfo)
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
    if (userInfo)     localStorage.setItem(USER_KEY, JSON.stringify(userInfo))
  }, [])

  const _clearSession = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  }, [])

  // ── Restore session on mount ────────────────────────────────────
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
      .catch((err) => {
        // Refresh token expired — clear and show login
        console.warn('[Lumina] Session restore failed:', err?.response?.data?.detail || err.message)
        if (!cancelled) _clearSession()
      })
      .finally(() => { if (!cancelled) setRestored(true) })

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Expose refreshSession so api.js interceptor can call it ────
  const refreshSession = useCallback(async () => {
    const stored = localStorage.getItem(REFRESH_KEY)
    if (!stored) throw new Error('No refresh token')
    const data = await apiRefresh(stored)
    // Guard: if logout ran while the refresh was in-flight, don't restore
    if (!localStorage.getItem(REFRESH_KEY)) throw new Error('Session cleared during refresh')
    _setSession(data.access_token, data.refresh_token, { user_id: data.user_id, email: data.email })
    return data.access_token
  }, [_setSession])

  // ── Login ────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    setLoading(true); setError(null)
    try {
      const data = await loginUser(email, password)
      _setSession(data.access_token, data.refresh_token, { user_id: data.user_id, email: data.email })
      return true
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed.')
      return false
    } finally {
      setLoading(false)
    }
  }, [_setSession])

  // ── Signup ───────────────────────────────────────────────────────
  const signup = useCallback(async (email, password) => {
    setLoading(true); setError(null)
    try {
      const data = await signupUser(email, password)
      if (data.access_token) {
        _setSession(data.access_token, data.refresh_token, { user_id: data.user_id, email: data.email })
      }
      return data
    } catch (err) {
      const detail = err.response?.data?.detail || 'Signup failed.'
      if (err.response?.status === 202) return { needsConfirmation: true, detail }
      setError(detail)
      return null
    } finally {
      setLoading(false)
    }
  }, [_setSession])

  // ── Google OAuth ─────────────────────────────────────────────────
  const googleLogin = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { url } = await googleOAuthUrl()
      window.location.href = url
    } catch (err) {
      setError(err.response?.data?.detail || 'Google login failed.')
      setLoading(false)
    }
  }, [])

  // ── loginWithTokenData — used by OAuth callback exchange ────────
  const loginWithTokenData = useCallback((data) => {
    _setSession(data.access_token, data.refresh_token, { user_id: data.user_id, email: data.email })
  }, [_setSession])

  // ── Logout ───────────────────────────────────────────────────────
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

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
