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
import type { Message, SaveSolutionData } from './types'

function AuthenticatedApp() {
  const { token, refreshSession, logout } = useAuth()

  useEffect(() => {
    registerAuthCallbacks(refreshSession, logout)
  }, [refreshSession, logout])

  const [formulaPush, setFormulaPush]           = useState('')
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen]           = useState(false)

  const chat     = useChat()
  const sessions = useSessions(token)

  useEffect(() => {
    sessions.loadSessions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSession = useCallback(async (session: { id: string; title?: string }) => {
    setCurrentSessionId(session.id)
    sessions.setActive(session)
    const history = await sessions.loadHistory(session.id)
    const converted: Message[] = (history as unknown as Array<{
      id: string
      role: 'user' | 'assistant'
      content?: string
      created_at: string
      solution?: {
        latex_input: string
        steps?: string[]
        final_answer?: string
      }
    }>).map((m) => ({
      id: m.id,
      role: m.role,
      type: m.solution ? ('solution' as const) : ('text' as const),
      content: m.solution ? m.solution.latex_input : (m.content ?? ''),
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
    const lastAssistant = [...converted].reverse().find((m) => m.role === 'assistant')
    if (lastAssistant) sessions.markSaved(lastAssistant.id)
    chat.restoreHistory(converted)
  }, [sessions, chat])

  const handleNewSession = useCallback(async () => {
    const session = await sessions.startNewSession()
    if (!session) return
    setCurrentSessionId(session.id)
    chat.clearChat()
  }, [chat, sessions])

  useEffect(() => {
    if (sessions.activeSession?.id) {
      setCurrentSessionId(sessions.activeSession.id)
    } else {
      setCurrentSessionId(null)
    }
  }, [sessions.activeSession])

  useEffect(() => {
    const msgs = chat.messages
    if (!token || msgs.length < 2) return
    const last = msgs[msgs.length - 1]
    if (last.role !== 'assistant') return
    if (last.type === 'loading' || last.type === 'error') return

    const userMsg = [...msgs].reverse().find((m) => m.role === 'user')
    if (!userMsg) return

    const solutionData: SaveSolutionData | null = last.type === 'solution' && last.data
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

function Inner() {
  const { token, restored, loginWithTokenData } = useAuth()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return
    window.history.replaceState({}, '', window.location.pathname)
    exchangeOAuthCode(code)
      .then((data) => loginWithTokenData(data))
      .catch((err: unknown) => console.error('[Lumina] OAuth code exchange failed', err))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!restored) return (
    <div style={{
      height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
      fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800,
      letterSpacing: '-0.02em',
    }}>
      Lumina <span style={{ color: 'var(--accent-primary)', marginLeft: '0.3em' }}>Math</span>
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
