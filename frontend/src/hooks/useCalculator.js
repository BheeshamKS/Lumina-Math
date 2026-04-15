import { useState, useCallback } from 'react'
import { solveExpression } from '../services/api'

const MAX_HISTORY = 20

/**
 * useCalculator — scientific calculator state + SymPy backend evaluation.
 *
 * Supports:
 *   - Basic ops: + - * / ^ ( )
 *   - Functions: sin, cos, tan, log, sqrt, abs
 *   - Constants: π, e
 *   - Pushes result string to chat input via onPushToChat callback
 */
export function useCalculator(onPushToChat) {
  const [display, setDisplay] = useState('0')
  const [expression, setExpression] = useState('')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [justEvaled, setJustEvaled] = useState(false)

  const append = useCallback(
    (value) => {
      setError(null)
      if (justEvaled && /[\d(π]/.test(value)) {
        // Start fresh after evaluation if user types a number
        setExpression(value === 'π' ? 'pi' : value)
        setDisplay(value)
        setJustEvaled(false)
        return
      }
      setJustEvaled(false)

      const raw = value === 'π' ? 'pi' : value === '×' ? '*' : value === '÷' ? '/' : value
      setExpression((prev) => (prev === '0' && /\d/.test(raw) ? raw : prev + raw))
      setDisplay((prev) => (prev === '0' && /\d/.test(value) ? value : prev + value))
    },
    [justEvaled]
  )

  const clear = useCallback(() => {
    setDisplay('0')
    setExpression('')
    setError(null)
    setJustEvaled(false)
  }, [])

  const backspace = useCallback(() => {
    setDisplay((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)))
    setExpression((prev) => (prev.length <= 1 ? '' : prev.slice(0, -1)))
  }, [])

  const evaluate = useCallback(async () => {
    const expr = expression.trim()
    if (!expr) return
    setLoading(true)
    setError(null)
    try {
      const result = await solveExpression(expr)
      const answer = result.result || result.solutions?.[0] || '?'
      const entry = { expression: display, result: answer }
      setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY))
      setDisplay(answer)
      setExpression(answer)
      setJustEvaled(true)
    } catch (err) {
      const detail = err.response?.data?.detail || 'Error'
      setError(detail)
      setDisplay('Error')
    } finally {
      setLoading(false)
    }
  }, [expression, display])

  const pushToChat = useCallback(() => {
    if (display && display !== '0' && display !== 'Error') {
      // Wrap in $$ so MessageRenderer renders it as display math in the chat
      onPushToChat?.(`$$${display}$$`)
    }
  }, [display, onPushToChat])

  const pullFromChat = useCallback((text) => {
    if (!text) return
    setDisplay(text)
    setExpression(text)
    setJustEvaled(false)
  }, [])

  return {
    display,
    expression,
    history,
    loading,
    error,
    append,
    clear,
    backspace,
    evaluate,
    pushToChat,
    pullFromChat,
  }
}
