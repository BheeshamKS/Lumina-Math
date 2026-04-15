import { useState, useCallback, useRef } from 'react'
import { sendChat, sendFollowup, extractImage } from '../services/api'

let _idCounter = 0
const uid = () => `msg_${++_idCounter}_${Date.now()}`

/**
 * useChat — manages all conversation state.
 *
 * Message shape:
 *   { id, role: 'user'|'assistant', type: 'text'|'solution'|'clarification'|'followup'|'error', content, data, timestamp }
 */
export function useChat() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastSolution, setLastSolution] = useState(null)
  const abortRef = useRef(null)

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

  /**
   * Send a plain text message through the full pipeline.
   */
  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || loading) return

      addMessage({ role: 'user', type: 'text', content: text })
      setLoading(true)
      addMessage({ role: 'assistant', type: 'loading', content: '' })

      try {
        const result = await sendChat(text)

        if (result.type === 'clarification') {
          updateLast({ type: 'clarification', content: result.question, data: result })
        } else {
          // solution
          setLastSolution(result)
          updateLast({ type: 'solution', content: result.explanation, data: result })
        }
      } catch (err) {
        const detail = err.response?.data?.detail || err.message || 'Something went wrong.'
        updateLast({ type: 'error', content: detail })
      } finally {
        setLoading(false)
      }
    },
    [loading, addMessage, updateLast]
  )

  /**
   * User picks one of the clarification options.
   */
  const selectClarification = useCallback(
    (option) => {
      sendMessage(option)
    },
    [sendMessage]
  )

  /**
   * Ask a follow-up question about the last solution.
   */
  const askFollowup = useCallback(
    async (text) => {
      if (!text.trim() || loading) return

      addMessage({ role: 'user', type: 'text', content: text })
      setLoading(true)
      addMessage({ role: 'assistant', type: 'loading', content: '' })

      try {
        const context = lastSolution || {}
        const result = await sendFollowup(text, context)
        updateLast({ type: 'followup', content: result.message })
      } catch (err) {
        const detail = err.response?.data?.detail || err.message || 'Something went wrong.'
        updateLast({ type: 'error', content: detail })
      } finally {
        setLoading(false)
      }
    },
    [loading, lastSolution, addMessage, updateLast]
  )

  /**
   * Upload an image → extract LaTeX → send to chat pipeline.
   */
  const sendImage = useCallback(
    async (file) => {
      if (loading) return

      addMessage({
        role: 'user',
        type: 'image',
        content: URL.createObjectURL(file),
        filename: file.name,
      })
      setLoading(true)
      addMessage({ role: 'assistant', type: 'loading', content: 'Extracting math from image…' })

      try {
        const { extracted } = await extractImage(file)
        updateLast({ type: 'text', content: `Extracted: \`${extracted}\`\nSolving…` })
        // Now solve it
        const result = await sendChat(extracted)
        if (result.type === 'clarification') {
          addMessage({ role: 'assistant', type: 'clarification', content: result.question, data: result })
        } else {
          setLastSolution(result)
          addMessage({ role: 'assistant', type: 'solution', content: result.explanation, data: result })
        }
        // Remove the intermediate "Solving…" message
        setMessages((prev) => prev.filter((m) => m.content !== `Extracted: \`${extracted}\`\nSolving…`))
      } catch (err) {
        const detail = err.response?.data?.detail || err.message || 'Could not process image.'
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
    selectClarification,
    askFollowup,
    sendImage,
    clearChat,
    restoreHistory,
  }
}
