import React, {
  useState, useRef, useEffect, useCallback,
} from 'react'
import {
  Send, MessageSquare, RotateCcw, X, Plus, FunctionSquare, Image, Camera,
} from 'lucide-react'
import { MessageRenderer } from '../MathRenderer/MathRenderer'
import { MathKeyboard } from './MathKeyboard'

/* ══════════════════════════════════════════════════════════════════
   insertAtCursor
   Insert `snippet` at the textarea's current selection, then
   position the cursor:
     - inside the first `{}` if the snippet has one
     - after the inserted text otherwise
   ══════════════════════════════════════════════════════════════════ */
function insertAtCursor(el, prev, snippet) {
  const start = el.selectionStart ?? prev.length
  const end   = el.selectionEnd   ?? prev.length
  const insert = `$${snippet}$`
  const next   = prev.slice(0, start) + insert + prev.slice(end)

  // Where to place caret after insert
  const braceIdx = insert.indexOf('{}')
  const caret = braceIdx !== -1
    ? start + braceIdx + 1           // inside the first {}
    : start + insert.length          // after the closing $

  return { next, caret }
}

/* ══════════════════════════════════════════════════════════════════
   ActionMenu
   ══════════════════════════════════════════════════════════════════ */
function ActionMenu({ onFile, onCamera, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  return (
    <div className="chat-action-menu" ref={ref}>
      <button className="chat-action-item" onClick={() => { onFile(); onClose() }}>
        <Image size={14} /> Upload image
      </button>
      <button className="chat-action-item" onClick={() => { onCamera(); onClose() }}>
        <Camera size={14} /> Take photo
      </button>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   ChatInput
   ══════════════════════════════════════════════════════════════════ */
export function ChatInput({
  onSend, onFollowup, onImageUpload,
  loading, lastSolution,
  pushFromCalc, onClearCalcPush,
  onClear, messages,
}) {
  const [text, setText]           = useState('')
  const [mode, setMode]           = useState('solve')
  const [imgPreview, setImg]      = useState(null)
  const [pendingFile, setPending] = useState(null)
  const [kbOpen, setKbOpen]       = useState(false)
  const [menuOpen, setMenuOpen]   = useState(false)
  const [inputFocused, setInputFocused] = useState(false)

  const fileRef     = useRef(null)
  const cameraRef   = useRef(null)
  const textareaRef = useRef(null)

  /* ── Auto-expand textarea (container handles max-height) ── */
  useEffect(() => {
    const el = textareaRef.current; if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  /* ── Reset mode when solution clears ── */
  useEffect(() => { if (!lastSolution) setMode('solve') }, [lastSolution])

  /* ── Push from sidebar formula or calculator result ── */
  useEffect(() => {
    if (!pushFromCalc) return
    // Strip outer $/$$ if already wrapped, then re-wrap consistently
    const raw = pushFromCalc.replace(/^\$\$?([\s\S]*?)\$?\$$/, '$1').trim()
    if (!raw) { onClearCalcPush?.(); return }
    const snippet = `$${raw}$ `
    setText(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + snippet)
    onClearCalcPush?.()
  }, [pushFromCalc]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── File handling ── */
  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    setPending(file); setImg(URL.createObjectURL(file))
  }, [])

  /* ── Keyboard insert — goes directly into textarea at cursor ── */
  const handleKeyInsert = useCallback((snippet) => {
    const el = textareaRef.current
    if (!el) return
    const { next, caret } = insertAtCursor(el, text, snippet)
    setText(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }, [text])

  /* ── Submit ── */
  const submit = useCallback(() => {
    if (loading) return
    if (pendingFile) {
      onImageUpload(pendingFile)
      setPending(null); setImg(null); setText('')
      return
    }
    const combined = text.trim()
    if (!combined) return
    if (mode === 'ask' && lastSolution) onFollowup(combined)
    else onSend(combined)
    setText('')
  }, [loading, pendingFile, text, mode, lastSolution, onSend, onFollowup, onImageUpload])

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const canSend = !loading && (pendingFile || text.trim())
  const isEmpty = messages?.length === 0
  const hasMath = text.includes('$') || text.includes('\\')

  return (
    <div className="math-input-bar">
      {/* Mode toggle */}
      {lastSolution && (
        <div className="math-input-mode">
          <button className={`mode-pill ${mode === 'solve' ? 'active' : ''}`} onClick={() => setMode('solve')}>
            New Problem
          </button>
          <button className={`mode-pill ${mode === 'ask' ? 'active' : ''}`} onClick={() => setMode('ask')}>
            <MessageSquare size={12} /> Ask Follow-up
          </button>
        </div>
      )}

      {/* Image preview */}
      {imgPreview && (
        <div className="math-input-preview">
          <img src={imgPreview} alt="preview" />
          <button className="preview-remove" onClick={() => { setImg(null); setPending(null) }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Virtual keyboard */}
      {kbOpen && <MathKeyboard onInsert={handleKeyInsert} />}

      {/* Hidden file inputs */}
      <input ref={fileRef}   type="file" accept="image/*"                className="sr-only"
        onChange={e => handleFile(e.target.files?.[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only"
        onChange={e => handleFile(e.target.files?.[0])} />

      {/* Input row */}
      <div className="math-input-row">
        {/* Attach menu */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            className={`math-input-icon-btn ${menuOpen ? 'active' : ''}`}
            title="Attach"
            onClick={() => setMenuOpen(v => !v)}
            disabled={loading}
          ><Plus size={16} /></button>
          {menuOpen && (
            <ActionMenu
              onFile={() => fileRef.current?.click()}
              onCamera={() => cameraRef.current?.click()}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>

        {/* Math keyboard toggle */}
        <button
          className={`math-input-icon-btn ${kbOpen ? 'active' : ''}`}
          title={kbOpen ? 'Close keyboard' : 'Math keyboard'}
          onClick={() => setKbOpen(v => !v)}
          disabled={loading}
        ><FunctionSquare size={16} /></button>

        {/* ── Unified input box ── */}
        <div
          className={`math-input-unified${inputFocused ? ' focused' : ''}`}
          onFocus={() => setInputFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setInputFocused(false)
          }}
        >
          {/* Live rendered preview — shows when text contains math */}
          {hasMath && text.trim() && (
            <div className="math-live-preview">
              <MessageRenderer>{text}</MessageRenderer>
            </div>
          )}

          {/* The single editable textarea */}
          <textarea
            ref={textareaRef}
            className="math-input-field"
            placeholder={
              mode === 'ask'
                ? 'Ask a follow-up question…'
                : 'Type a problem — use ⌨ to insert math symbols, or type $LaTeX$ directly…'
            }
            value={text}
            rows={1}
            disabled={loading}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>

        {/* Send */}
        <button
          className={`math-input-send ${canSend ? 'ready' : ''}`}
          onClick={submit}
          disabled={!canSend}
          title={mode === 'ask' ? 'Ask' : 'Solve'}
        >
          {mode === 'ask' ? <MessageSquare size={16} /> : <Send size={16} />}
          <span>{mode === 'ask' ? 'Ask' : 'Solve'}</span>
        </button>

        {/* Clear worksheet */}
        {!isEmpty && (
          <button
            className="math-input-icon-btn danger"
            onClick={onClear}
            title="Clear worksheet"
            disabled={loading}
          ><RotateCcw size={16} /></button>
        )}
      </div>
    </div>
  )
}
