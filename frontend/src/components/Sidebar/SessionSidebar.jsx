import React, { useEffect, useState } from 'react'
import { Plus, Trash2, MessageSquare, Loader2, LogOut, Sigma, BookOpen, ChevronDown, X } from 'lucide-react'
import { BlockMath } from 'react-katex'
import { useAuth } from '../../context/AuthContext'
import { useSessions } from '../../hooks/useSessions'
import { FORMULA_CATEGORIES } from '../../data/formulas'

/* ── Formula accordion item ─────────────────────────────────────── */
function FormulaCategory({ category, onInsert }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fc-category">
      <button className="fc-cat-btn" onClick={() => setOpen(v => !v)}>
        <span className="fc-cat-icon">{category.icon}</span>
        <span className="fc-cat-label">{category.label}</span>
        <ChevronDown size={13} className={`fc-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="fc-items">
          {category.items.map((item) => (
            <button
              key={item.name}
              className="fc-item"
              title={item.insert ? `Insert: ${item.insert}` : item.name}
              onClick={() => item.insert && onInsert(item.insert)}
            >
              <span className="fc-item-name">{item.name}</span>
              <div className="fc-item-latex">
                <BlockMath
                  math={item.latex}
                  renderError={() => <code>{item.latex}</code>}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Main sidebar ───────────────────────────────────────────────── */
export function SessionSidebar({ onSelectSession, onNewSession, currentSessionId, onFormulaInsert, isOpen, onClose }) {
  const { token, user, logout } = useAuth()
  const { sessions, loadingSessions, loadSessions, startNewSession, removeSession, setActive } = useSessions(token)
  const [tab, setTab] = useState('sessions') // 'sessions' | 'formulas'

  useEffect(() => { loadSessions() }, [loadSessions])

  const handleNew = async () => {
    const session = await startNewSession()
    if (session) { setActive(session); onNewSession?.(session) }
  }

  const handleSelect = (session) => {
    setActive(session)
    onSelectSession?.(session)
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    await removeSession(id)
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && <div className="ss-backdrop" onClick={onClose} />}

      <div className={`session-sidebar${isOpen ? ' is-open' : ''}`}>
      {/* ── Header ── */}
      <div className="ss-header">
        <div className="ss-logo">
          <div className="logo-icon"><Sigma size={17} /></div>
          <span className="logo-text">Lumina <em>Math</em></span>
          <button className="ss-close-btn" onClick={onClose} title="Close"><X size={15} /></button>
        </div>
        <div className="ss-user">
          <span className="ss-email" title={user?.email}>{user?.email}</span>
          <button className="icon-btn" onClick={logout} title="Log out"><LogOut size={14} /></button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="ss-tabs">
        <button className={`ss-tab ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>
          <MessageSquare size={13} /> Previous
        </button>
        <button className={`ss-tab ${tab === 'formulas' ? 'active' : ''}`} onClick={() => setTab('formulas')}>
          <BookOpen size={13} /> Formulas
        </button>
      </div>

      {/* ── Sessions tab ── */}
      {tab === 'sessions' && (
        <>
          <div className="ss-actions">
            <button className="new-session-btn" onClick={handleNew}>
              <Plus size={14} /> New Session
            </button>
          </div>
          <div className="ss-list">
            {loadingSessions && (
              <div className="ss-loading"><Loader2 size={15} className="spin" /> Loading…</div>
            )}
            {!loadingSessions && sessions.length === 0 && (
              <p className="ss-empty">No sessions yet.<br />Start a new one above.</p>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`ss-item ${currentSessionId === s.id ? 'active' : ''}`}
                onClick={() => handleSelect(s)}
              >
                <MessageSquare size={13} className="ss-icon" />
                <span className="ss-title">{s.title || 'Untitled Session'}</span>
                <button className="ss-delete" onClick={(e) => handleDelete(e, s.id)} title="Delete">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Formulas tab ── */}
      {tab === 'formulas' && (
        <div className="fc-panel">
          <p className="fc-hint">Click a formula to insert it into the input.</p>
          {FORMULA_CATEGORIES.map((cat) => (
            <FormulaCategory
              key={cat.id}
              category={cat}
              onInsert={(text) => onFormulaInsert?.(text)}
            />
          ))}
        </div>
      )}
      </div>
    </>
  )
}
