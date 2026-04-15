import React, { useState } from 'react'
import { InlineMath } from 'react-katex'

/* ── Keyboard data ───────────────────────────────────────────────────
   Key shapes:
     latex key  : { label, latex (display), insert }
     matrix key : { label, insert (LaTeX template), isMatrix: true }
   ───────────────────────────────────────────────────────────────── */

/** Build a matrix LaTeX template with □ placeholders */
function matrixTemplate(rows, cols) {
  const rowStrs = Array.from({ length: rows }, () =>
    Array(cols).fill('\\square').join(' & ')
  )
  return `\\begin{pmatrix} ${rowStrs.join(' \\\\ ')} \\end{pmatrix}`
}

const TABS = [
  {
    id: 'basic',
    label: 'Basic',
    keys: [
      // Arithmetic operators
      { label: '+',   latex: '+',            insert: '+' },
      { label: '−',   latex: '-',            insert: '-' },
      { label: '×',   latex: '\\times',      insert: '\\times ' },
      { label: '÷',   latex: '\\div',        insert: '\\div ' },
      { label: '=',   latex: '=',            insert: '= ' },
      { label: '(',   latex: '(',            insert: '(' },
      { label: ')',   latex: ')',            insert: ')' },
      { label: '^',   latex: 'x^n',          insert: '^{}' },
      { label: '√',   latex: '\\sqrt{x}',   insert: '\\sqrt{}' },
      // Fractions / roots
      { label: 'a/b',  latex: '\\frac{a}{b}', insert: '\\frac{}{}' },
      { label: 'ⁿ√',   latex: '\\sqrt[n]{x}', insert: '\\sqrt[]{}' },
      { label: 'xₙ',   latex: 'x_n',           insert: '_{}'  },
      { label: '|x|',  latex: '|x|',            insert: '\\left|{}\\right|' },
      // Comparison
      { label: '±',  latex: '\\pm',     insert: '\\pm ' },
      { label: '≤',  latex: '\\leq',   insert: '\\leq ' },
      { label: '≥',  latex: '\\geq',   insert: '\\geq ' },
      { label: '≠',  latex: '\\neq',   insert: '\\neq ' },
      { label: '≈',  latex: '\\approx', insert: '\\approx ' },
    ],
  },
  {
    id: 'calculus',
    label: 'Calculus',
    keys: [
      { label: '∫',      latex: '\\int',                            insert: '\\int ' },
      { label: '∫ᵃᵇ',   latex: '\\int_a^b',                        insert: '\\int_{}^{} ' },
      { label: 'd/dx',   latex: '\\frac{d}{dx}f',                   insert: '\\frac{d}{dx}\\left({}\\right)' },
      { label: '∂/∂x',  latex: '\\frac{\\partial f}{\\partial x}', insert: '\\frac{\\partial}{\\partial x}\\left({}\\right)' },
      { label: 'lim',    latex: '\\lim_{x\\to a}',                  insert: '\\lim_{x \\to {}}' },
      { label: 'Σ',      latex: '\\sum_{i=1}^n',                    insert: '\\sum_{i=1}^{n}' },
      { label: 'Π',      latex: '\\prod_{i=1}^n',                   insert: '\\prod_{i=1}^{n}' },
      { label: 'sin',    latex: '\\sin x',                          insert: '\\sin\\left({}\\right)' },
      { label: 'cos',    latex: '\\cos x',                          insert: '\\cos\\left({}\\right)' },
      { label: 'tan',    latex: '\\tan x',                          insert: '\\tan\\left({}\\right)' },
      { label: 'ln',     latex: '\\ln x',                           insert: '\\ln\\left({}\\right)' },
      { label: 'log',    latex: '\\log x',                          insert: '\\log\\left({}\\right)' },
      { label: 'θ',      latex: '\\theta',                          insert: '\\theta' },
      { label: 'π',      latex: '\\pi',                             insert: '\\pi' },
    ],
  },
  {
    id: 'greek',
    label: 'Greek',
    keys: [
      { label: 'α', latex: '\\alpha',   insert: '\\alpha' },
      { label: 'β', latex: '\\beta',    insert: '\\beta' },
      { label: 'γ', latex: '\\gamma',   insert: '\\gamma' },
      { label: 'δ', latex: '\\delta',   insert: '\\delta' },
      { label: 'ε', latex: '\\epsilon', insert: '\\epsilon' },
      { label: 'ζ', latex: '\\zeta',    insert: '\\zeta' },
      { label: 'η', latex: '\\eta',     insert: '\\eta' },
      { label: 'θ', latex: '\\theta',   insert: '\\theta' },
      { label: 'κ', latex: '\\kappa',   insert: '\\kappa' },
      { label: 'λ', latex: '\\lambda',  insert: '\\lambda' },
      { label: 'μ', latex: '\\mu',      insert: '\\mu' },
      { label: 'ν', latex: '\\nu',      insert: '\\nu' },
      { label: 'ξ', latex: '\\xi',      insert: '\\xi' },
      { label: 'π', latex: '\\pi',      insert: '\\pi' },
      { label: 'ρ', latex: '\\rho',     insert: '\\rho' },
      { label: 'σ', latex: '\\sigma',   insert: '\\sigma' },
      { label: 'τ', latex: '\\tau',     insert: '\\tau' },
      { label: 'φ', latex: '\\phi',     insert: '\\phi' },
      { label: 'χ', latex: '\\chi',     insert: '\\chi' },
      { label: 'ψ', latex: '\\psi',     insert: '\\psi' },
      { label: 'ω', latex: '\\omega',   insert: '\\omega' },
      { label: 'Γ', latex: '\\Gamma',   insert: '\\Gamma' },
      { label: 'Δ', latex: '\\Delta',   insert: '\\Delta' },
      { label: 'Λ', latex: '\\Lambda',  insert: '\\Lambda' },
      { label: 'Σ', latex: '\\Sigma',   insert: '\\Sigma' },
      { label: 'Φ', latex: '\\Phi',     insert: '\\Phi' },
      { label: 'Ψ', latex: '\\Psi',     insert: '\\Psi' },
      { label: 'Ω', latex: '\\Omega',   insert: '\\Omega' },
    ],
  },
  {
    id: 'logic',
    label: 'Logic',
    keys: [
      { label: '∞',  latex: '\\infty',     insert: '\\infty' },
      { label: '∴',  latex: '\\therefore', insert: '\\therefore ' },
      { label: '∈',  latex: '\\in',        insert: '\\in ' },
      { label: '∉',  latex: '\\notin',     insert: '\\notin ' },
      { label: '⊂',  latex: '\\subset',    insert: '\\subset ' },
      { label: '⊆',  latex: '\\subseteq',  insert: '\\subseteq ' },
      { label: '∪',  latex: '\\cup',       insert: '\\cup ' },
      { label: '∩',  latex: '\\cap',       insert: '\\cap ' },
      { label: '∀',  latex: '\\forall',    insert: '\\forall ' },
      { label: '∃',  latex: '\\exists',    insert: '\\exists ' },
      { label: '¬',  latex: '\\neg',       insert: '\\neg ' },
      { label: '⟹', latex: '\\implies',   insert: '\\implies ' },
      { label: '⟺', latex: '\\iff',       insert: '\\iff ' },
      { label: '∅',  latex: '\\emptyset',  insert: '\\emptyset' },
    ],
  },
  {
    id: 'matrix',
    label: 'Matrix',
    keys: [
      { label: '2×2',      insert: matrixTemplate(2, 2), isMatrix: true },
      { label: '3×3',      insert: matrixTemplate(3, 3), isMatrix: true },
      { label: '2×3',      insert: matrixTemplate(2, 3), isMatrix: true },
      { label: '3×2',      insert: matrixTemplate(3, 2), isMatrix: true },
      { label: '1×3 row',  insert: matrixTemplate(1, 3), isMatrix: true },
      { label: '3×1 col',  insert: matrixTemplate(3, 1), isMatrix: true },
      { label: '⃗v',     latex: '\\vec{v}',        insert: '\\vec{}' },
      { label: '‖v‖',    latex: '\\|v\\|',          insert: '\\left\\|{}\\right\\|' },
      { label: 'det',    latex: '\\det(A)',          insert: '\\det\\left({}\\right)' },
      { label: 'Aᵀ',     latex: 'A^T',              insert: '{}^T' },
      { label: '·',      latex: '\\cdot',            insert: '\\cdot ' },
    ],
  },
]

/* ── Safe InlineMath wrapper ─────────────────────────────────────── */
function SafeInline({ math }) {
  try {
    return <InlineMath math={math} renderError={() => <code>{math}</code>} />
  } catch {
    return <code style={{ fontSize: '0.68rem' }}>{math}</code>
  }
}

/* ── Single key ─────────────────────────────────────────────────── */
function KeyBtn({ k, onInsert }) {
  return (
    <button
      className="mk-key"
      onClick={() => onInsert(k.insert)}
      title={k.insert}
    >
      <span className="mk-key-preview">
        {k.isMatrix
          ? <span className="mk-key-matrix-label">{k.label}</span>
          : k.latex
            ? <SafeInline math={k.latex} />
            : <span className="mk-key-latex-text">{k.label}</span>
        }
      </span>
      {!k.isMatrix && <span className="mk-key-label">{k.label}</span>}
    </button>
  )
}

/* ── MathKeyboard ───────────────────────────────────────────────── */
export function MathKeyboard({ onInsert }) {
  const [activeTab, setActiveTab] = useState('basic')
  const tab = TABS.find((t) => t.id === activeTab) || TABS[0]

  return (
    <div className="math-keyboard">
      <div className="mk-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`mk-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mk-keys">
        {tab.keys.map((k, i) => (
          <KeyBtn key={i} k={k} onInsert={onInsert} />
        ))}
      </div>
    </div>
  )
}
