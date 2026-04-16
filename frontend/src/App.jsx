import React, { useState, useCallback, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoginPage } from './components/Auth/LoginPage'
import { SessionSidebar } from './components/Sidebar/SessionSidebar'
import { ChatInterface } from './components/Chat/ChatInterface'
import { useChat } from './hooks/useChat'
import { useSessions } from './hooks/useSessions'
import { registerAuthCallbacks, exchangeOAuthCode } from './services/api'
import { Menu } from 'lucide-react'
import './styles/layout.css'
import './styles/chat.css'
import './styles/sidebar.css'
import './styles/auth.css'

// ── Inner app (rendered only when authenticated) ──────────────────────────────
function AuthenticatedApp() {
  const { token, refreshSession, logout } = useAuth()

  useEffect(() => {
    registerAuthCallbacks(refreshSession, logout)
  }, [refreshSession, logout])

  const [formulaPush, setFormulaPush]         = useState('')
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [sidebarOpen, setSidebarOpen]         = useState(false)

  const chat     = useChat()
  const sessions = useSessions(token)

  // Load sessions once on mount.
  // AuthenticatedApp only mounts when token is truthy, so no refresh loop risk.
  useEffect(() => {
    sessions.loadSessions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Select a session from sidebar → load its history into chat
  const handleSelectSession = useCallback(async (session) => {
    setCurrentSessionId(session.id)
    sessions.setActive(session)
    const history = await sessions.loadHistory(session.id)
    const converted = history.map((m) => ({
      id: m.id,
      role: m.role,
      type: m.solution ? 'solution' : 'text',
      content: m.solution ? m.solution.latex_input : m.content,
      data: m.solution
        ? {
            type: 'solution',
            steps: (m.solution.steps || []).map((s, i) => ({
              description: `Step ${i + 1}`,
              expression: s,
            })),
            final_answer: m.solution.final_answer,
          }
        : undefined,
      timestamp: new Date(m.created_at).getTime(),
    }))
    chat.restoreHistory(converted)
  }, [sessions, chat])

  // New session button → create via API, clear chat
  const handleNewSession = useCallback(async () => {
    const session = await sessions.startNewSession()
    if (!session) return
    setCurrentSessionId(session.id)
    chat.clearChat()
  }, [chat, sessions])

  // Auto-save after each completed assistant response
  useEffect(() => {
    const msgs = chat.messages
    if (!token || msgs.length < 2) return
    const last = msgs[msgs.length - 1]
    if (last.role !== 'assistant') return
    if (last.type === 'loading' || last.type === 'error') return

    const userMsg = [...msgs].reverse().find((m) => m.role === 'user')
    if (!userMsg) return

    const solutionData = last.type === 'solution' && last.data
      ? {
          latex_input: userMsg.content,
          steps: (last.data.steps || []).map((s) => s.expression || s.description || ''),
          final_answer: last.data.final_answer || '',
        }
      : null

    sessions.autoSave(
      userMsg.content,
      last.content || last.data?.explanation || '',
      solutionData,
      last.id,
    )
  }, [chat.messages, token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-shell">
      <SessionSidebar
        sessions={sessions.sessions}
        loadingSessions={sessions.loadingSessions}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={sessions.removeSession}
        currentSessionId={currentSessionId}
        onFormulaInsert={setFormulaPush}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="app-main">
        <button
          className="sidebar-hamburger"
          onClick={() => setSidebarOpen(true)}
          title="Open menu"
          aria-label="Open sidebar"
        >
          <Menu size={20} />
        </button>

        <ChatInterface
          messages={chat.messages}
          loading={chat.loading}
          onSendMessage={chat.sendMessage}
          onClearChat={chat.clearChat}
          pushValue={formulaPush}
          onClearPush={() => setFormulaPush('')}
        />
      </main>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
function Inner() {
  const { token, restored, loginWithTokenData } = useAuth()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return
    window.history.replaceState({}, '', window.location.pathname)
    exchangeOAuthCode(code)
      .then((data) => loginWithTokenData(data))
      .catch((err) => console.error('[Lumina] OAuth code exchange failed', err))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!restored) return (
    <div style={{
      height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-solid)', color: 'var(--amber)',
      fontFamily: 'var(--font-display)', fontSize: '1.5rem', letterSpacing: '0.05em',
    }}>
      Lumina <em style={{ fontStyle: 'italic', marginLeft: '0.3em' }}>Math</em>
    </div>
  )
  return token ? <AuthenticatedApp /> : <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  )
}
