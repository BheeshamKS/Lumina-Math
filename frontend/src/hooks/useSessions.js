/**
 * useSessions — manages session list + auto-save of messages/solutions.
 * All API calls inject the JWT via the Authorization header set in api.js.
 */

import { useState, useCallback, useRef } from 'react'
import {
  fetchSessions,
  createSession,
  deleteSession,
  fetchMessages,
  saveMessage,
} from '../services/api'

export function useSessions(token) {
  const [sessions, setSessions]       = useState([])
  const [activeSession, setActive]    = useState(null)
  const [loadingSessions, setLoading] = useState(false)

  const saveInProgress  = useRef(false)
  const lastSavedMsgId  = useRef(null)

  const loadSessions = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await fetchSessions(token)
      setSessions(data)
    } catch (_) {
      // silently fail — user can retry
    } finally {
      setLoading(false)
    }
  }, [token])

  const startNewSession = useCallback(async (title) => {
    if (!token) return null
    try {
      const session = await createSession(token, title)
      setSessions((prev) => [session, ...prev])
      setActive(session)
      return session
    } catch (_) {
      return null
    }
  }, [token])

  const removeSession = useCallback(async (sessionId) => {
    if (!token) return
    try {
      await deleteSession(token, sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSession?.id === sessionId) setActive(null)
    } catch (_) {}
  }, [token, activeSession])

  const loadHistory = useCallback(async (sessionId) => {
    if (!token) return []
    try {
      return await fetchMessages(token, sessionId)
    } catch (_) {
      return []
    }
  }, [token])

  /** Pre-populate the save tracker so restored messages don't re-save. */
  const markSaved = useCallback((msgId) => {
    if (msgId) lastSavedMsgId.current = msgId
  }, [])

  /**
   * Auto-save a message pair (user + assistant) to the current session.
   * If no active session exists, one is created automatically.
   * solutionData is optional — only passed for assistant solution messages.
   * msgId is used as a dedup key so the same message is never saved twice.
   */
  const autoSave = useCallback(async (userText, assistantContent, solutionData, msgId) => {
    if (!token) return
    if (saveInProgress.current) return
    if (msgId && lastSavedMsgId.current === msgId) return  // already saved this message

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
