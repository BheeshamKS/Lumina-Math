import { useState, useCallback, useRef } from 'react'
import {
  fetchSessions,
  createSession,
  deleteSession,
  fetchMessages,
  saveMessage,
} from '../services/api'
import type { Session, Message, SaveSolutionData } from '../types'

export function useSessions(token: string | null) {
  const [sessions, setSessions]       = useState<Session[]>([])
  const [activeSession, setActive]    = useState<Session | null>(null)
  const [loadingSessions, setLoading] = useState(false)

  const saveInProgress  = useRef(false)
  const lastSavedMsgId  = useRef<string | null>(null)

  const loadSessions = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await fetchSessions(token)
      setSessions(data)
    } catch {
      // silently fail — user can retry
    } finally {
      setLoading(false)
    }
  }, [token])

  const startNewSession = useCallback(async (title?: string): Promise<Session | null> => {
    if (!token) return null
    try {
      const session = await createSession(token, title)
      setSessions((prev) => [session, ...prev])
      setActive(session)
      return session
    } catch {
      return null
    }
  }, [token])

  const removeSession = useCallback(async (sessionId: string) => {
    if (!token) return
    try {
      await deleteSession(token, sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSession?.id === sessionId) setActive(null)
    } catch { /* empty */ }
  }, [token, activeSession])

  const loadHistory = useCallback(async (sessionId: string): Promise<Message[]> => {
    if (!token) return []
    try {
      return await fetchMessages(token, sessionId)
    } catch {
      return []
    }
  }, [token])

  const markSaved = useCallback((msgId: string) => {
    if (msgId) lastSavedMsgId.current = msgId
  }, [])

  const autoSave = useCallback(async (
    userText: string,
    assistantContent: string,
    solutionData: SaveSolutionData | null,
    msgId: string,
  ) => {
    if (!token) return
    if (saveInProgress.current) return
    if (msgId && lastSavedMsgId.current === msgId) return

    saveInProgress.current = true
    if (msgId) lastSavedMsgId.current = msgId

    try {
      let session = activeSession
      if (!session) {
        session = await startNewSession(userText.slice(0, 60))
      }
      if (!session) return

      await saveMessage(token, session.id, { role: 'user', content: userText })
      await saveMessage(token, session.id, {
        role: 'assistant',
        content: typeof assistantContent === 'string' ? assistantContent : JSON.stringify(assistantContent),
        solution: solutionData || null,
      })
    } finally {
      saveInProgress.current = false
    }
  }, [token, activeSession, startNewSession])

  return {
    sessions,
    activeSession,
    loadingSessions,
    setActive,
    loadSessions,
    startNewSession,
    removeSession,
    loadHistory,
    autoSave,
    markSaved,
  }
}
