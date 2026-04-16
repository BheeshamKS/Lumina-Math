import { useState, useCallback } from 'react'
import { sendChat } from '../services/api'

let _idCounter = 0
const uid = () => `msg_${++_idCounter}_${Date.now()}`

/**
 * useChat — manages all conversation state.
 *
 * Message shape:
 *   { id, role: 'user'|'assistant', type: 'text'|'solution'|'error'|'loading', content, data, timestamp }
 */
export function useChat() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(false)
  const [lastSolution, setLastSolution] = useState(null)

  const addMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, { ...msg, id: uid(), timestamp: Date.now() }])
  }, [])

  const updateLast = useCallback((patch) => {
    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]
      if (last) copy[copy.length - 1] = { ...last, ...patch }
      return copy
    })
  }, [])

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || loading) return

      addMessage({ role: 'user', type: 'text', content: text })
      setLoading(true)
      addMessage({ role: 'assistant', type: 'loading', content: '' })

      try {
        const result = await sendChat(text)
        setLastSolution(result)
        updateLast({ type: 'solution', content: '', data: result })
      } catch (err) {
        const detail = err.response?.data?.detail || err.message || 'Something went wrong.'
        updateLast({ type: 'error', content: detail })
      } finally {
        setLoading(false)
      }
    },
    [loading, addMessage, updateLast]
  )

  const clearChat = useCallback(() => {
    setMessages([])
    setLastSolution(null)
  }, [])

  /** Restore messages loaded from DB history (session restore). */
  const restoreHistory = useCallback((historyMessages) => {
    setMessages(historyMessages)
    const lastSol = [...historyMessages].reverse().find((m) => m.type === 'solution')
    setLastSolution(lastSol?.data || null)
  }, [])

  return {
    messages,
    loading,
    lastSolution,
    sendMessage,
    clearChat,
    restoreHistory,
  }
}
