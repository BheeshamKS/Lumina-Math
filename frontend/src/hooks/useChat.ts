import { useState, useCallback } from 'react'
import { sendChat } from '../services/api'
import type { Message, SolutionData, BookContext } from '../types'

let _idCounter = 0
const uid = () => `msg_${++_idCounter}_${Date.now()}`

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading]   = useState(false)
  const [lastSolution, setLastSolution] = useState<SolutionData | null>(null)

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages((prev) => [...prev, { ...msg, id: uid(), timestamp: Date.now() }])
  }, [])

  const updateLast = useCallback((patch: Partial<Message>) => {
    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]
      if (last) copy[copy.length - 1] = { ...last, ...patch }
      return copy
    })
  }, [])

  const sendMessage = useCallback(
    async (text: string, bookContext?: BookContext) => {
      if (!text.trim() || loading) return

      addMessage({ role: 'user', type: 'text', content: text })
      setLoading(true)
      addMessage({ role: 'assistant', type: 'loading', content: '' })

      try {
        const result = await sendChat(text, bookContext)
        setLastSolution(result)
        updateLast({ type: 'solution', content: '', data: result })
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string }
        const detail = axiosErr.response?.data?.detail || axiosErr.message || 'Something went wrong.'
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

  const restoreHistory = useCallback((historyMessages: Message[]) => {
    setMessages(historyMessages)
    const lastSol = [...historyMessages].reverse().find((m) => m.type === 'solution')
    setLastSolution(lastSol?.data ?? null)
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
