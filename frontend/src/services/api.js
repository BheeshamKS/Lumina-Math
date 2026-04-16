import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// ── Token refresh plumbing ────────────────────────────────────────
// AuthContext sets this after mount so the interceptor can call refreshSession.
let _refreshFn = null
let _logoutFn  = null
let _refreshPromise = null   // deduplicate concurrent refresh calls

export function registerAuthCallbacks(refreshFn, logoutFn) {
  _refreshFn = refreshFn
  _logoutFn  = logoutFn
}

// ── 401 interceptor — auto-refresh then retry ─────────────────────
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry && _refreshFn) {
      original._retry = true
      try {
        // Deduplicate: if a refresh is already in flight, wait for it
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

function authHeaders(token) {
  if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
    console.warn('[Lumina] authHeaders called with invalid token:', typeof token, String(token).slice(0, 20))
  }
  return { headers: { Authorization: `Bearer ${token}` } }
}

// ── Auth ──────────────────────────────────────────────────────────

export async function loginUser(email, password) {
  const { data } = await api.post('/auth/login', { email, password })
  return data
}

export async function signupUser(email, password) {
  const { data } = await api.post('/auth/signup', { email, password })
  return data
}

export async function googleOAuthUrl() {
  const { data } = await api.post('/auth/google')
  return data
}

export async function refreshToken(refresh_token) {
  const { data } = await api.post('/auth/refresh', { refresh_token })
  return data
}

export async function exchangeOAuthCode(code) {
  const { data } = await api.get(`/auth/callback?code=${encodeURIComponent(code)}`)
  return data
}

// ── Sessions ──────────────────────────────────────────────────────

export async function fetchSessions(token) {
  const { data } = await api.get('/sessions', authHeaders(token))
  return data
}

export async function createSession(token, title) {
  const { data } = await api.post('/sessions', { title }, authHeaders(token))
  return data
}

export async function deleteSession(token, sessionId) {
  await api.delete(`/sessions/${sessionId}`, authHeaders(token))
}

// ── Messages ──────────────────────────────────────────────────────

export async function fetchMessages(token, sessionId) {
  const { data } = await api.get(`/sessions/${sessionId}/messages`, authHeaders(token))
  return data
}

export async function saveMessage(token, sessionId, payload) {
  const { data } = await api.post(`/sessions/${sessionId}/messages`, payload, authHeaders(token))
  return data
}

// ── Math endpoints ────────────────────────────────────────────────

export async function sendChat(message) {
  const { data } = await api.post('/chat', { message })
  return data
}

export async function solveExpression(expression) {
  const { data } = await api.post('/solve', { expression })
  return data
}
