import axios, { type InternalAxiosRequestConfig } from 'axios'
import type { TokenData, Session, Message, SolutionData, SaveSolutionData } from '../types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// ── Token refresh plumbing ────────────────────────────────────────
let _refreshFn: (() => Promise<string>) | null = null
let _logoutFn: (() => void) | null = null
let _refreshPromise: Promise<string> | null = null

export function registerAuthCallbacks(
  refreshFn: () => Promise<string>,
  logoutFn: () => void,
) {
  _refreshFn = refreshFn
  _logoutFn  = logoutFn
}

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

// ── 401 interceptor — auto-refresh then retry ─────────────────────
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original: RetryConfig = err.config
    if (err.response?.status === 401 && !original._retry && _refreshFn) {
      original._retry = true
      try {
        if (!_refreshPromise) {
          _refreshPromise = _refreshFn().finally(() => { _refreshPromise = null })
        }
        const newToken = await _refreshPromise
        original.headers['Authorization'] = `Bearer ${newToken}`
        return api(original)
      } catch {
        _logoutFn?.()
        return Promise.reject(err)
      }
    }
    return Promise.reject(err)
  }
)

function authHeaders(token: string) {
  if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
    console.warn('[Lumina] authHeaders called with invalid token:', typeof token, String(token).slice(0, 20))
  }
  return { headers: { Authorization: `Bearer ${token}` } }
}

// ── Auth ──────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string): Promise<TokenData> {
  const { data } = await api.post<TokenData>('/auth/login', { email, password })
  return data
}

export async function signupUser(email: string, password: string): Promise<TokenData & { needsConfirmation?: boolean; detail?: string }> {
  const { data } = await api.post<TokenData & { needsConfirmation?: boolean; detail?: string }>('/auth/signup', { email, password })
  return data
}

export async function googleOAuthUrl(): Promise<{ url: string }> {
  const { data } = await api.post<{ url: string }>('/auth/google')
  return data
}

export async function refreshToken(refresh_token: string): Promise<TokenData> {
  const { data } = await api.post<TokenData>('/auth/refresh', { refresh_token })
  return data
}

export async function exchangeOAuthCode(code: string): Promise<TokenData> {
  const { data } = await api.get<TokenData>(`/auth/callback?code=${encodeURIComponent(code)}`)
  return data
}

// ── Sessions ──────────────────────────────────────────────────────

export async function fetchSessions(token: string): Promise<Session[]> {
  const { data } = await api.get<Session[]>('/sessions', authHeaders(token))
  return data
}

export async function createSession(token: string, title?: string): Promise<Session> {
  const { data } = await api.post<Session>('/sessions', { title }, authHeaders(token))
  return data
}

export async function deleteSession(token: string, sessionId: string): Promise<void> {
  await api.delete(`/sessions/${sessionId}`, authHeaders(token))
}

// ── Messages ──────────────────────────────────────────────────────

export async function fetchMessages(token: string, sessionId: string): Promise<Message[]> {
  const { data } = await api.get<Message[]>(`/sessions/${sessionId}/messages`, authHeaders(token))
  return data
}

export interface SaveMessagePayload {
  role: 'user' | 'assistant'
  content: string
  solution?: SaveSolutionData | null
}

export async function saveMessage(token: string, sessionId: string, payload: SaveMessagePayload): Promise<Message> {
  const { data } = await api.post<Message>(`/sessions/${sessionId}/messages`, payload, authHeaders(token))
  return data
}

// ── Math endpoints ────────────────────────────────────────────────

export async function sendChat(message: string): Promise<SolutionData> {
  const { data } = await api.post<SolutionData>('/chat', { message })
  return data
}

export async function solveExpression(expression: string): Promise<SolutionData> {
  const { data } = await api.post<SolutionData>('/solve', { expression })
  return data
}
