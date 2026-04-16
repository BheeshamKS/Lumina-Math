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
// MathLive produces LaTeX. The backend's _preprocess_latex handles most of it,
// but \int gets stripped to nothing (it's not in any keyword list).
// We fix the known gap here before sending.
function toBackendText(latex) {
  return latex
    .replace(/\\int\s*/g, 'integrate ')        // \int → integrate
    .replace(/\\lim(?:_?\{[^}]*\})?\s*/g, 'limit of ')  // \lim_{x→0} → limit of
    .replace(/\\partial\s*/g, 'd')             // \partial → d
    .replace(/\\[,;! ]\s*/g, ' ')              // spacing commands
    .replace(/\s+/g, ' ')
    .trim()
}

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
    mf.style.setProperty('--hue', '38')                   // amber-ish accent
    mf.style.setProperty('--keyboard-zindex', '9999')
    mf.style.setProperty('--caret-color', 'var(--amber)')
    mf.style.setProperty('--selection-background-color', 'rgba(196,144,53,0.25)')
    
    // Force transparent background directly
    mf.style.background = 'transparent'
    mf.style.setProperty('--_field-background', 'transparent')
    mf.menuItems = []                                      // suppress built-in menu

    // ── Inject keyboard theme into document.head ──────────────────────────
    // The virtual keyboard is appended directly to <body> — it is NOT inside
    // the React root, so CSS vars set on <math-field> never reach it.
    // Injecting a <style> into <head> scoped to .ML__keyboard fixes this.
    if (!document.getElementById('lumina-kb-theme')) {
      const styleEl = document.createElement('style')
      styleEl.id = 'lumina-kb-theme'
      styleEl.textContent = `
        .ML__keyboard {
          --keyboard-background: #161310;
          --keyboard-border: #302c22;
          --keyboard-toolbar-background: #1e1b14;
          --keyboard-toolbar-text: #A39278;
          --keyboard-toolbar-text-active: #C49035;
          --keyboard-toolbar-background-hover: rgba(196,144,53,0.10);
          --keyboard-toolbar-background-selected: rgba(196,144,53,0.15);
          --keyboard-accent-color: #C49035;
          --keycap-background: #252119;
          --keycap-background-hover: #2d2920;
          --keycap-background-active: rgba(196,144,53,0.22);
          --keycap-background-pressed: rgba(196,144,53,0.28);
          --keycap-border: #302c22;
          --keycap-border-bottom: #3e382a;
          --keycap-text: #EDE5CF;
          --keycap-text-active: #161310;
          --keycap-text-hover: #EDE5CF;
          --keycap-shift-text: #C49035;
          --keycap-secondary-background: #1e1b14;
          --keycap-secondary-background-hover: #252119;
          --keycap-secondary-text: #A39278;
          --keycap-secondary-border: #302c22;
          --keycap-secondary-border-bottom: #3e382a;
          --keycap-primary-background: #C49035;
          --keycap-primary-background-hover: #DBA840;
          --keycap-primary-text: #161310;
          --variant-panel-background: #1e1b14;
          --variant-keycap-text: #EDE5CF;
          --variant-keycap-text-active: #161310;
          --variant-keycap-background-active: #C49035;
          --box-placeholder-color: #C49035;
          border-top: 1px solid #302c22 !important;
          box-shadow: 0 -6px 28px rgba(0,0,0,0.55) !important;
        }
        /* Toolbar tab strip */
        .ML__keyboard .MLK__toolbar .tab {
          color: #A39278 !important;
          font-family: 'DM Sans', sans-serif !important;
          font-size: 0.76rem !important;
          letter-spacing: 0.05em !important;
        }
        .ML__keyboard .MLK__toolbar .tab.is-selected {
          color: #C49035 !important;
          border-bottom: 2px solid #C49035 !important;
        }
        /* Horizontal rule between toolbar and keys */
        .ML__keyboard .MLK__toolbar {
          background: #1e1b14 !important;
          border-bottom: 1px solid #302c22 !important;
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
    const mathText = latex ? toBackendText(latex) : ''
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
