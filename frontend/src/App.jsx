import React, { useState, useCallback, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoginPage } from './components/Auth/LoginPage'
import { SessionSidebar } from './components/Sidebar/SessionSidebar'
import { ChatInterface } from './components/Chat/ChatInterface'
import { Calculator } from './components/Calculator/Calculator'
import { useChat } from './hooks/useChat'
import { useSessions } from './hooks/useSessions'
import { registerAuthCallbacks, exchangeOAuthCode } from './services/api'
import { Calculator as CalcIcon, X, Menu } from 'lucide-react'
import './styles/layout.css'
import './styles/chat.css'
import './styles/calculator.css'
import './styles/sidebar.css'
import './styles/auth.css'

// ── Inner app (rendered only when authenticated) ──────────────────────────────
function AuthenticatedApp() {
  const { token, refreshSession, logout } = useAuth()

  // Wire axios 401 interceptor to our auth context
  useEffect(() => {
    registerAuthCallbacks(refreshSession, logout)
  }, [refreshSession, logout])
  const [calcOpen, setCalcOpen]         = useState(false)
  const [calcPush, setCalcPush]         = useState('')
  const [formulaPush, setFormulaPush]   = useState('')
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [sidebarOpen, setSidebarOpen]   = useState(false)

  const chat = useChat()
  const sessions = useSessions(token)

  // When a session is selected from sidebar: load its history into chat
  const handleSelectSession = useCallback(async (session) => {
    setCurrentSessionId(session.id)
    sessions.setActive(session)
    const history = await sessions.loadHistory(session.id)
    // Convert DB messages → chat message format
    const converted = history.map((m) => ({
      id: m.id,
      role: m.role,
      type: m.solution ? 'solution' : 'text',
      content: m.solution ? m.solution.latex_input : m.content,
      data: m.solution ? {
        type: 'solution',
        explanation: m.content,
        steps: (m.solution.steps || []).map((s, i) => ({ description: `Step ${i + 1}`, expression: s })),
        final_answer: m.solution.final_answer,
      } : undefined,
      timestamp: new Date(m.created_at).getTime(),
    }))
    chat.restoreHistory(converted)
  }, [sessions, chat])

  const handleNewSession = useCallback((session) => {
    setCurrentSessionId(session.id)
    sessions.setActive(session)
    chat.clearChat()
  }, [chat, sessions])

  // Auto-save after each assistant message renders
  useEffect(() => {
    const msgs = chat.messages
    if (!token || msgs.length < 2) return
    const last = msgs[msgs.length - 1]
    if (last.role !== 'assistant' || last.type === 'loading') return

    // Find the user message just before it
    const userMsg = [...msgs].reverse().find((m) => m.role === 'user')
    if (!userMsg) return

    const solutionData = last.type === 'solution' && last.data ? {
      latex_input: userMsg.content,
      steps: (last.data.steps || []).map((s) => s.expression || s.description || ''),
      final_answer: last.data.final_answer || '',
    } : null

    sessions.autoSave(userMsg.content, last.content || last.data?.explanation || '', solutionData)
  }, [chat.messages]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePushToChat    = useCallback((result) => setCalcPush(result), [])
  const handleFormulaInsert = useCallback((text) => setFormulaPush(text), [])

  return (
    <div className="app-shell">
      {/* Session sidebar */}
      <SessionSidebar
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        currentSessionId={currentSessionId}
        onFormulaInsert={handleFormulaInsert}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main chat area */}
      <main className="app-main">
        {/* Hamburger — mobile only */}
        <button
          className="sidebar-hamburger"
          onClick={() => setSidebarOpen(true)}
          title="Open menu"
          aria-label="Open sidebar"
        ><Menu size={20} /></button>
        <ChatInterface
          messages={chat.messages}
          loading={chat.loading}
          lastSolution={chat.lastSolution}
          onSendMessage={chat.sendMessage}
          onSendFollowup={chat.askFollowup}
          onImageUpload={chat.sendImage}
          onSelectClarification={chat.selectClarification}
          onClearChat={chat.clearChat}
          pushFromCalc={calcPush || formulaPush}
          onClearCalcPush={() => { setCalcPush(''); setFormulaPush('') }}
        />
      </main>

      {/* Calculator FAB */}
      <button
        className={`calc-fab ${calcOpen ? 'active' : ''}`}
        onClick={() => setCalcOpen((v) => !v)}
        title={calcOpen ? 'Close Calculator' : 'Open Calculator'}
      >
        {calcOpen ? <X size={20} /> : <CalcIcon size={20} />}
      </button>

      {calcOpen && (
        <div className="calc-panel">
          <Calculator onPushToChat={handlePushToChat} />
        </div>
      )}
    </div>
  )
}

// ── Root — AuthProvider wraps everything ──────────────────────────────────────
function Inner() {
  const { token, restored, loginWithTokenData } = useAuth()

  // Exchange ?code= param from Google OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return
    // Remove code from URL immediately to prevent double-exchange
    window.history.replaceState({}, '', window.location.pathname)
    exchangeOAuthCode(code)
      .then((data) => loginWithTokenData(data))
      .catch((err) => console.error('[Lumina] OAuth code exchange failed', err))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!restored) return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-solid)', color:'var(--amber)', fontFamily:'var(--font-display)', fontSize:'1.5rem', letterSpacing:'0.05em' }}>
      Lumina <em style={{ fontStyle:'italic', marginLeft:'0.3em' }}>Math</em>
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
