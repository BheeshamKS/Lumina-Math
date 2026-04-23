import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Send, RotateCcw, Plus, X, BookOpen, Upload } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import type { MathfieldElement } from 'mathlive'
import type { Message, IndexedBook, BookContext, BookChunk } from '../../types'
import { listBooks, indexBook, searchBook, type BookSearchResult } from '../../plugins/BookPlugin'

interface ChatInputProps {
  onSend: (text: string, bookContext?: BookContext) => void
  loading: boolean
  onClear: () => void
  messages: Message[]
  pushValue: string
  onClearPush: () => void
}

export function ChatInput({ onSend, loading, onClear, messages, pushValue, onClearPush }: ChatInputProps) {
  const mfRef     = useRef<MathfieldElement | null>(null)
  const barRef    = useRef<HTMLDivElement | null>(null)
  const menuRef   = useRef<HTMLDivElement | null>(null)
  const submitRef = useRef<(() => void) | null>(null)

  const [hasMath, setHasMath]       = useState(false)
  const [textValue, setTextValue]   = useState('')
  const [menuOpen, setMenuOpen]     = useState(false)
  const [books, setBooks]           = useState<IndexedBook[]>([])
  const [activeBook, setActiveBook] = useState<IndexedBook | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [uploadForm, setUploadForm] = useState<{ title: string; author: string }>({ title: '', author: '' })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [bookSearchError, setBookSearchError] = useState<string | null>(null)

  // Load books from IndexedDB on mount
  useEffect(() => {
    listBooks().then(setBooks).catch(() => {})
  }, [])

  // Listen for book-deleted event from PluginPanel to clear the active chip
  useEffect(() => {
    const handler = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail
      setActiveBook((prev) => (prev?.id === id ? null : prev))
      setBooks((prev) => prev.filter((b) => b.id !== id))
    }
    window.addEventListener('lumina:book-deleted', handler)
    return () => window.removeEventListener('lumina:book-deleted', handler)
  }, [])

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // MathLive setup
  useEffect(() => {
    const mf = mfRef.current
    if (!mf) return

    mf.style.setProperty('--hue', '72')
    mf.style.setProperty('--keyboard-zindex', '9999')
    mf.style.setProperty('--caret-color', 'var(--accent-primary)')
    mf.style.setProperty('--selection-background-color', 'var(--accent-primary-glow)')
    mf.style.background = 'transparent'
    mf.style.setProperty('--_field-background', 'transparent')
    mf.menuItems = []

    if (!document.getElementById('lumina-kb-theme')) {
      const styleEl = document.createElement('style')
      styleEl.id = 'lumina-kb-theme'
      const root = getComputedStyle(document.documentElement)
      const get = (v: string) => root.getPropertyValue(v).trim()
      styleEl.textContent = `
        .ML__keyboard {
          --keyboard-background: ${get('--bg-primary')};
          --keyboard-border: ${get('--border-subtle')};
          --keyboard-toolbar-background: ${get('--bg-surface')};
          --keyboard-toolbar-text: ${get('--text-muted')};
          --keyboard-toolbar-text-active: ${get('--accent-primary')};
          --keyboard-toolbar-background-hover: ${get('--accent-primary-dim')};
          --keyboard-toolbar-background-selected: ${get('--accent-secondary-dim')};
          --keyboard-accent-color: ${get('--accent-primary')};
          --keycap-background: ${get('--bg-elevated')};
          --keycap-background-hover: ${get('--card-raised')};
          --keycap-background-active: ${get('--accent-primary-dim')};
          --keycap-background-pressed: ${get('--accent-primary-glow')};
          --keycap-border: ${get('--border-subtle')};
          --keycap-border-bottom: ${get('--border-medium')};
          --keycap-text: ${get('--text-primary')};
          --keycap-text-active: ${get('--bg-primary')};
          --keycap-text-hover: ${get('--text-primary')};
          --keycap-shift-text: ${get('--accent-primary')};
          --keycap-secondary-background: ${get('--bg-surface')};
          --keycap-secondary-background-hover: ${get('--bg-elevated')};
          --keycap-secondary-text: ${get('--text-muted')};
          --keycap-secondary-border: ${get('--border-subtle')};
          --keycap-secondary-border-bottom: ${get('--border-medium')};
          --keycap-primary-background: ${get('--accent-primary')};
          --keycap-primary-background-hover: ${get('--accent-primary-bright')};
          --keycap-primary-text: ${get('--bg-primary')};
          --variant-panel-background: ${get('--bg-surface')};
          --variant-keycap-text: ${get('--text-primary')};
          --variant-keycap-text-active: ${get('--bg-primary')};
          --variant-keycap-background-active: ${get('--accent-primary')};
          --box-placeholder-color: ${get('--accent-primary')};
          border-top: 1px solid ${get('--border-subtle')} !important;
          box-shadow: 0 -8px 32px rgba(0,0,0,0.6) !important;
        }
        .ML__keyboard .MLK__toolbar .tab {
          color: ${get('--text-muted')} !important;
          font-family: 'Inter', sans-serif !important;
          font-size: 0.76rem !important;
          font-weight: 600 !important;
          letter-spacing: 0.05em !important;
        }
        .ML__keyboard .MLK__toolbar .tab.is-selected {
          color: ${get('--accent-primary')} !important;
          border-bottom: 2px solid ${get('--accent-primary')} !important;
        }
        .ML__keyboard .MLK__toolbar {
          background: ${get('--bg-surface')} !important;
          border-bottom: 1px solid ${get('--border-subtle')} !important;
          overflow-x: auto !important;
          overflow-y: visible !important;
          scrollbar-width: none !important;
        }
        .ML__keyboard .MLK__toolbar::-webkit-scrollbar { display: none !important; }
      `
      document.head.appendChild(styleEl)
    }

    const vk = window.mathVirtualKeyboard
    if (vk) {
      vk.container = document.body
      const existingKb = document.querySelector('.ML__keyboard')
      if (existingKb && existingKb.parentElement !== document.body) {
        document.body.appendChild(existingKb)
      }
      vk.layouts = [
        'numeric', 'symbols',
        {
          label: 'f(x)', tooltip: 'Functions & Calculus',
          rows: [
            [
              { label: 'sin',    latex: '\\sin(#?)' },
              { label: 'cos',    latex: '\\cos(#?)' },
              { label: 'tan',    latex: '\\tan(#?)' },
              { label: 'cot',    latex: '\\cot(#?)' },
              { label: 'sec',    latex: '\\sec(#?)' },
              { label: 'csc',    latex: '\\csc(#?)' },
            ],
            [
              { label: 'arcsin', latex: '\\arcsin(#?)', class: 'small' },
              { label: 'arccos', latex: '\\arccos(#?)', class: 'small' },
              { label: 'arctan', latex: '\\arctan(#?)', class: 'small' },
              { label: 'ln',     latex: '\\ln(#?)' },
              { label: 'log',    latex: '\\log(#?)' },
              { label: 'log₁₀', latex: '\\log_{10}(#?)', class: 'small' },
            ],
            [
              { label: '∫',     latex: '\\int_{#?}^{#?}#?\\,d#?' },
              { label: '∂/∂x',  latex: '\\frac{\\partial #?}{\\partial #?}', class: 'small' },
              { label: 'd/dx',  latex: '\\frac{d}{dx}#?', class: 'small' },
              { label: 'lim',   latex: '\\lim_{#?\\to #?}#?' },
              { label: 'Σ',     latex: '\\sum_{#?}^{#?}#?' },
              { label: 'Π',     latex: '\\prod_{#?}^{#?}#?' },
            ],
            [
              { label: 'eˣ',    latex: 'e^{#?}' },
              { label: '√',     latex: '\\sqrt{#?}' },
              { label: 'ⁿ√',    latex: '\\sqrt[#?]{#?}' },
              { label: '|x|',   latex: '\\left|#?\\right|' },
              { label: '⌊x⌋',   latex: '\\lfloor #?\\rfloor' },
              { label: '⌈x⌉',   latex: '\\lceil #?\\rceil' },
            ],
          ],
        },
        'greek',
        {
          label: '[ ]', tooltip: 'Matrices & Vectors',
          rows: [
            [
              { label: '2×2',   latex: '\\begin{pmatrix}#? & #?\\\\#? & #?\\end{pmatrix}', class: 'small' },
              { label: '3×3',   latex: '\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}', class: 'small' },
              { label: '2×1',   latex: '\\begin{pmatrix}#?\\\\#?\\end{pmatrix}', class: 'small' },
              { label: '1×2',   latex: '\\begin{pmatrix}#?&#?\\end{pmatrix}', class: 'small' },
              { label: '[2×2]', latex: '\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}', class: 'small' },
              { label: '|2×2|', latex: '\\begin{vmatrix}#?&#?\\\\#?&#?\\end{vmatrix}', class: 'small' },
            ],
            [
              { label: 'Aᵀ',   latex: '#?^{\\intercal}' },
              { label: 'A⁻¹',  latex: '#?^{-1}' },
              { label: 'A⁻ᵀ',  latex: '#?^{-\\intercal}', class: 'small' },
              { label: 'det',   latex: '\\det(#?)' },
              { label: 'tr',    latex: '\\operatorname{tr}(#?)' },
              { label: '‖A‖',   latex: '\\left\\|#?\\right\\|' },
            ],
            [
              { label: '·',     latex: '\\cdot' },
              { label: '×',     latex: '\\times' },
              { label: '⊗',     latex: '\\otimes' },
              { label: '⊕',     latex: '\\oplus' },
              { label: '→',     latex: '\\vec{#?}' },
              { label: 'â',     latex: '\\hat{#?}' },
            ],
          ],
        },
      ]
    }

    if (mf.shadowRoot) {
      const shadowStyle = document.createElement('style')
      shadowStyle.textContent = `
        .ML__virtual-keyboard-toggle { display: none !important; }
        .ML__menu-toggle              { display: none !important; }
        [part="virtual-keyboard-toggle"] { display: none !important; }
        [part="menu-toggle"]             { display: none !important; }
        .ML__fieldcontainer { border: none !important; }
        .ML__fieldcontainer__field { width: 100% !important; white-space: pre-wrap !important; }
        .ML__content, .ML__mathlive { white-space: pre-wrap !important; overflow-wrap: break-word !important; }
      `
      mf.shadowRoot.appendChild(shadowStyle)
    }

    const isMobile = window.matchMedia('(max-width: 640px)').matches
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mf.mathVirtualKeyboardPolicy = (isMobile ? 'onfocus' : 'manual') as any

    const handleInput = () => setHasMath(!!mf.getValue('latex').trim())
    const handleKeydown = (e: Event) => {
      const ke = e as KeyboardEvent
      if (ke.key === 'Enter' && !ke.shiftKey) {
        ke.preventDefault()
        ke.stopPropagation()
        submitRef.current?.()
      }
    }

    mf.addEventListener('input', handleInput)
    mf.addEventListener('keydown', handleKeydown)
    return () => {
      mf.removeEventListener('input', handleInput)
      mf.removeEventListener('keydown', handleKeydown)
    }
  }, [])

  useEffect(() => {
    const mf = mfRef.current
    if (mf) mf.readOnly = loading
  }, [loading])

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const vk = window.mathVirtualKeyboard
      if (!vk?.visible) return
      if (barRef.current?.contains(e.target as Node)) return
      const kbEl = document.querySelector('.ML__keyboard')
      if (kbEl?.contains(e.target as Node)) return
      vk.hide()
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  useEffect(() => {
    if (!pushValue) return
    const mf = mfRef.current
    if (mf) {
      mf.executeCommand(['insert', pushValue])
      setHasMath(!!mf.getValue('latex').trim())
      mf.focus()
    }
    onClearPush?.()
  }, [pushValue]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useCallback(() => {
    const mf = mfRef.current
    if (!mf || loading) return
    const latexVal = mf.getValue('latex').trim()
    const mathText = latexVal ? `$$\n${latexVal}\n$$` : ''
    const userText = textValue.trim()
    if (!mathText && !userText) return

    const combined = [mathText, userText].filter(Boolean).join('\n\n')

    let bookContext: BookContext | undefined
    if (activeBook) {
      const result: BookSearchResult = searchBook(activeBook, combined)
      if (result.notFound) {
        setBookSearchError(result.notFound)
        return
      }
      if (result.chunks.length > 0) bookContext = { chunks: result.chunks }
    }

    setBookSearchError(null)
    onSend(combined, bookContext)
    mf.setValue('')
    setHasMath(false)
    setTextValue('')
    mf.focus()
  }, [loading, onSend, textValue, activeBook])

  useEffect(() => { submitRef.current = submit }, [submit])

  const toggleKeyboard = () => {
    const vk = window.mathVirtualKeyboard
    if (!vk) return
    if (vk.visible) { vk.hide() } else { mfRef.current?.focus(); vk.show() }
  }

  // Dropzone for PDF upload within the + menu
  const { getInputProps, open: openFilePicker } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    noClick: true,
    onDrop: (accepted) => {
      if (accepted[0]) {
        setUploadFile(accepted[0])
        setUploadForm({ title: accepted[0].name.replace(/\.pdf$/i, ''), author: '' })
      }
    },
  })

  const handleUploadSubmit = async () => {
    if (!uploadFile || !uploadForm.title) return
    setUploading(true)
    try {
      const book = await indexBook(uploadFile, uploadForm.title, uploadForm.author)
      setBooks((prev) => [...prev, book])
      setUploadFile(null)
      setUploadForm({ title: '', author: '' })
      setMenuOpen(false)
      setActiveBook(book)
      // Notify PluginPanel (if open) to refresh its book list
      window.dispatchEvent(new CustomEvent('lumina:books-updated'))
    } catch {
      // Keep form open so user can retry
    } finally {
      setUploading(false)
    }
  }

  const canSend = !loading && (hasMath || !!textValue.trim())
  const isEmpty = !messages?.length

  return (
    <div className="math-input-bar" ref={barRef}>
      {bookSearchError && (
        <div className="math-book-search-error" role="alert">
          {bookSearchError}
        </div>
      )}
      {/* Unified pill container — the visual boundary for the entire row */}
      <div className="math-input-row">

        {/* + action menu */}
        <div className="math-action-menu-wrap" ref={menuRef}>
          <button
            className={`math-action-btn${menuOpen ? ' active' : ''}`}
            onClick={() => setMenuOpen((o) => !o)}
            title="Actions"
            type="button"
          >
            <Plus size={15} />
          </button>

          {menuOpen && (
            <div className="math-action-menu">
              <button
                className="math-action-item"
                onClick={() => { toggleKeyboard(); setMenuOpen(false) }}
                type="button"
              >
                <span className="math-action-item-icon">⌨</span>
                <span>Virtual keyboard</span>
              </button>

              <div className="math-action-divider" />
              <p className="math-action-section-label">Books</p>

              {books.map((book) => (
                <button
                  key={book.id}
                  className={`math-action-item${activeBook?.id === book.id ? ' selected' : ''}`}
                  onClick={() => { setActiveBook(activeBook?.id === book.id ? null : book); setMenuOpen(false) }}
                  type="button"
                >
                  <BookOpen size={14} />
                  <span className="math-action-book-title">{book.title}</span>
                </button>
              ))}

              {uploadFile ? (
                <div className="math-action-upload-form">
                  <input
                    className="math-action-input"
                    placeholder="Book title"
                    value={uploadForm.title}
                    onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
                  />
                  <input
                    className="math-action-input"
                    placeholder="Author (optional)"
                    value={uploadForm.author}
                    onChange={(e) => setUploadForm((f) => ({ ...f, author: e.target.value }))}
                  />
                  <button
                    className="math-action-upload-submit"
                    onClick={handleUploadSubmit}
                    disabled={uploading || !uploadForm.title}
                    type="button"
                  >
                    {uploading ? 'Indexing…' : 'Index book'}
                  </button>
                </div>
              ) : (
                <button className="math-action-item" onClick={openFilePicker} type="button">
                  <Upload size={14} />
                  <span>Upload book (PDF)</span>
                  <input {...getInputProps()} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Active book chip — between + and the field */}
        {activeBook && (
          <div className="math-book-chip">
            <BookOpen size={11} />
            <span className="math-book-chip-title">{activeBook.title}</span>
            <button
              className="math-book-chip-dismiss"
              onClick={() => setActiveBook(null)}
              title="Remove active book"
              type="button"
            >
              <X size={10} />
            </button>
          </div>
        )}

        {/* Math field — flex: 2 */}
        <math-field
          ref={mfRef}
          className="math-field-el"
          placeholder="Enter an equation…"
          aria-label="Math input"
        />

        {/* Visual separator between math and text inputs */}
        <div className="math-field-sep" aria-hidden="true" />

        {/* Instructions textarea — flex: 1 */}
        <textarea
          className="math-input-textarea"
          placeholder="Add instructions or leave blank"
          value={textValue}
          onChange={(e) => {
            setTextValue(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submitRef.current?.()
            }
          }}
          rows={1}
          disabled={loading}
        />

        {/* Solve */}
        <button
          className={`math-input-send${canSend ? ' ready' : ''}`}
          onClick={submit}
          disabled={!canSend}
          title="Solve"
        >
          <Send size={16} />
          <span>Solve</span>
        </button>

        {/* Clear */}
        {!isEmpty && (
          <button
            className="math-input-icon-btn danger"
            onClick={onClear}
            title="Clear worksheet"
            disabled={loading}
          >
            <RotateCcw size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
