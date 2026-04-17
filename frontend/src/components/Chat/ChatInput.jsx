/**
 * ChatInput — isolated math input component.
 *
 * Input layer: MathLive <math-field> web component.
 * To revert to a plain <textarea>, swap only the SWAP POINT block below —
 * the rest of this component and all parent components stay unchanged.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Send, RotateCcw, Keyboard } from 'lucide-react'

// ── LaTeX → backend-friendly text ────────────────────────────────────────────
// The backend now handles all latex preprocessing directly in math_engine.py
// so we can preserve the beautiful KaTeX syntax in the chat history.

export function ChatInput({ onSend, loading, onClear, messages, pushValue, onClearPush }) {
  const mfRef    = useRef(null)   // <math-field> DOM element
  const barRef   = useRef(null)   // .math-input-bar — keyboard container anchor
  const submitRef = useRef(null)  // always holds the latest submit() so keydown is fresh
  const [hasMath, setHasMath] = useState(false)
  const [textValue, setTextValue] = useState('')

  // ── Wire MathLive once after element mounts ───────────────────────────────
  useEffect(() => {
    const mf = mfRef.current
    if (!mf) return

    // ── Dark-theme CSS custom properties on the math-field itself ──
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
      const get = (v) => root.getPropertyValue(v).trim()
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
        .ML__keyboard .MLK__toolbar::-webkit-scrollbar {
          display: none !important;
        }
      `
      document.head.appendChild(styleEl)
    }

    // ── Keyboard layouts: numeric + symbols + functions + greek + matrices ──
    // window.mathVirtualKeyboard is the singleton controller; 'default' expands
    // to ['numeric','symbols','alphabetic','greek'] — we replace it with a
    // curated set that adds calculus/trig and matrix tabs.
    const vk = window.mathVirtualKeyboard
    if (vk) {
      // ── Reset container to body — required after HMR or if previously overridden ──
      // The singleton persists across Vite hot-reloads. If a previous session set
      // vk.container to something other than body, the keyboard renders there and
      // body > .ML__keyboard { position: fixed } never applies — making it invisible.
      vk.container = document.body
      // If the keyboard panel was already built and ended up in the wrong container,
      // move it back to body so it renders at the correct fixed position.
      const existingKb = document.querySelector('.ML__keyboard')
      if (existingKb && existingKb.parentElement !== document.body) {
        document.body.appendChild(existingKb)
      }

      vk.layouts = [
        'numeric',
        'symbols',
        {
          label: 'f(x)',
          tooltip: 'Functions & Calculus',
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
              { label: 'log₁₀',  latex: '\\log_{10}(#?)', class: 'small' },
            ],
            [
              { label: '∫',      latex: '\\int_{#?}^{#?}#?\\,d#?' },
              { label: '∂/∂x',   latex: '\\frac{\\partial #?}{\\partial #?}', class: 'small' },
              { label: 'd/dx',   latex: '\\frac{d}{dx}#?', class: 'small' },
              { label: 'lim',    latex: '\\lim_{#?\\to #?}#?' },
              { label: 'Σ',      latex: '\\sum_{#?}^{#?}#?' },
              { label: 'Π',      latex: '\\prod_{#?}^{#?}#?' },
            ],
            [
              { label: 'eˣ',     latex: 'e^{#?}' },
              { label: '√',      latex: '\\sqrt{#?}' },
              { label: 'ⁿ√',     latex: '\\sqrt[#?]{#?}' },
              { label: '|x|',    latex: '\\left|#?\\right|' },
              { label: '⌊x⌋',    latex: '\\lfloor #?\\rfloor' },
              { label: '⌈x⌉',    latex: '\\lceil #?\\rceil' },
            ],
          ],
        },
        'greek',
        {
          label: '[ ]',
          tooltip: 'Matrices & Vectors',
          rows: [
            [
              { label: '2×2',    latex: '\\begin{pmatrix}#? & #?\\\\#? & #?\\end{pmatrix}', class: 'small' },
              { label: '3×3',    latex: '\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}', class: 'small' },
              { label: '2×1',    latex: '\\begin{pmatrix}#?\\\\#?\\end{pmatrix}', class: 'small' },
              { label: '1×2',    latex: '\\begin{pmatrix}#?&#?\\end{pmatrix}', class: 'small' },
              { label: '[2×2]',  latex: '\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}', class: 'small' },
              { label: '|2×2|',  latex: '\\begin{vmatrix}#?&#?\\\\#?&#?\\end{vmatrix}', class: 'small' },
            ],
            [
              { label: 'Aᵀ',    latex: '#?^{\\intercal}' },
              { label: 'A⁻¹',   latex: '#?^{-1}' },
              { label: 'A⁻ᵀ',   latex: '#?^{-\\intercal}', class: 'small' },
              { label: 'det',    latex: '\\det(#?)' },
              { label: 'tr',     latex: '\\operatorname{tr}(#?)' },
              { label: '‖A‖',    latex: '\\left\\|#?\\right\\|' },
            ],
            [
              { label: '·',      latex: '\\cdot' },
              { label: '×',      latex: '\\times' },
              { label: '⊗',      latex: '\\otimes' },
              { label: '⊕',      latex: '\\oplus' },
              { label: '→',      latex: '\\vec{#?}' },
              { label: 'â',      latex: '\\hat{#?}' },
            ],
          ],
        },
      ]
    }

    // ── Hide MathLive's built-in keyboard toggle + internal separator ──
    // We render our own toggle button outside the field, so suppress all
    // internal chrome inside the shadow DOM.
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

    // ── Virtual keyboard: none on desktop, native on mobile ──
    const isMobile = window.matchMedia('(max-width: 640px)').matches
    mf.mathVirtualKeyboardPolicy = isMobile ? 'onfocus' : 'manual'

    const handleInput = () => setHasMath(!!mf.getValue('latex').trim())

    const handleKeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        submitRef.current?.()
      }
    }

    mf.addEventListener('input', handleInput)
    mf.addEventListener('keydown', handleKeydown)
    return () => {
      mf.removeEventListener('input', handleInput)
      mf.removeEventListener('keydown', handleKeydown)
    }
  }, []) // runs once — submitRef.current keeps submit fresh

  // ── Disable field while loading ───────────────────────────────────────────
  useEffect(() => {
    const mf = mfRef.current
    if (mf) mf.readOnly = loading
  }, [loading])

  // ── Close keyboard on click outside ─────────────────────────────────────
  useEffect(() => {
    const handleOutsideClick = (e) => {
      const vk = window.mathVirtualKeyboard
      if (!vk?.visible) return
      // Allow clicks inside the input bar or the keyboard panel itself
      if (barRef.current?.contains(e.target)) return
      const kbEl = document.querySelector('.ML__keyboard')
      if (kbEl?.contains(e.target)) return
      vk.hide()
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, []) // barRef is stable, no deps needed

  // ── Accept formula inserts from the sidebar ───────────────────────────────
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

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = useCallback(() => {
    const mf = mfRef.current
    if (!mf || loading) return
    const latex = mf.getValue('latex').trim()
    const mathText = latex ? `$$\n${latex}\n$$` : ''
    const userText = textValue.trim()
    
    if (!mathText && !userText) return
    
    // Combine them intelligently
    const combined = [mathText, userText].filter(Boolean).join('\n\n')
    
    onSend(combined)
    mf.setValue('')
    setHasMath(false)
    setTextValue('')
    mf.focus()
  }, [loading, onSend, textValue])

  // Keep submitRef current so the keydown closure always calls the latest version
  useEffect(() => { submitRef.current = submit }, [submit])

  const toggleKeyboard = () => {
    const vk = window.mathVirtualKeyboard
    if (!vk) return
    if (vk.visible) {
      vk.hide()
    } else {
      mfRef.current?.focus()  // give MathLive an active field before showing
      vk.show()
    }
  }

  const canSend = !loading && (hasMath || !!textValue.trim())
  const isEmpty = !messages?.length

  return (
    <div className="math-input-bar" ref={barRef}>
      <div className="math-input-row">

        {/* ── Keyboard toggle — flex sibling to the left of the input box ── */}
        <button
          className="math-keyboard-toggle"
          onClick={toggleKeyboard}
          title="Toggle keyboard"
          type="button"
        >
          <Keyboard size={15} />
        </button>

        {/* ── SWAP POINT: MathLive math-field ───────────────────────────────
            To revert to plain <textarea>, replace this wrapper+math-field
            block with the textarea from the previous commit. onSend() API
            is unchanged: it always receives a plain text string.
        ─────────────────────────────────────────────────────────────────── */}
        <div className="math-field-wrapper">
          <math-field
            ref={mfRef}
            className="math-field-el"
            placeholder="Enter an equation (e.g. 2x + 4 = 8)"
            aria-label="Math input"
          />
          <textarea
            className="math-input-textarea"
            placeholder="Add instructions (e.g. 'How do I solve this?', or leave blank)"
            value={textValue}
            onChange={(e) => {
              setTextValue(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = (e.target.scrollHeight) + 'px'
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
        </div>

        {/* ── Solve button ── */}
        <button
          className={`math-input-send${canSend ? ' ready' : ''}`}
          onClick={submit}
          disabled={!canSend}
          title="Solve"
        >
          <Send size={16} />
          <span>Solve</span>
        </button>

        {/* ── Clear worksheet ── */}
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
