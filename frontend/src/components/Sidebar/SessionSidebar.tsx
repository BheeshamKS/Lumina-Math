import React, { useState } from 'react'
import { Plus, Trash2, MessageSquare, Loader2, LogOut, Sigma, BookOpen, ChevronDown, X, Settings } from 'lucide-react'
import { BlockMath } from 'react-katex'
import { useAuth } from '../../context/AuthContext'
import { FORMULA_CATEGORIES } from '../../data/formulas'
import type { Session, FormulaCategory } from '../../types'

type SidebarTab = 'sessions' | 'formulas'

function FormulaCategorySection({
  category, onInsert,
}: {
  category: FormulaCategory
  onInsert: (text: string) => void
}) {
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
                  renderError={(_err: Error) => <code>{item.latex}</code>}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface SessionSidebarProps {
  sessions: Session[]
  loadingSessions: boolean
  onSelectSession: (session: Session) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
  currentSessionId: string | null
  onFormulaInsert: (text: string) => void
  isOpen: boolean
  onClose: () => void
  onPluginsOpen?: () => void
}

export function SessionSidebar({
  sessions, loadingSessions, onSelectSession, onNewSession, onDeleteSession,
  currentSessionId, onFormulaInsert, isOpen, onClose, onPluginsOpen,
}: SessionSidebarProps) {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState<SidebarTab>('sessions')

  const handleNew = () => onNewSession?.()
  const handleSelect = (session: Session) => onSelectSession?.(session)
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await onDeleteSession?.(id)
  }

  return (
    <>
      {isOpen && <div className="ss-backdrop" onClick={onClose} />}

      <div className={`session-sidebar${isOpen ? ' is-open' : ''}`}>
        <div className="ss-header">
          <div className="ss-logo">
            <div className="logo-icon"><Sigma size={17} /></div>
            <span className="logo-text">Lumina <em>Math</em></span>
            <button className="ss-close-btn" onClick={onClose} title="Close"><X size={15} /></button>
          </div>
          <div className="ss-user">
            <span className="ss-email" title={user?.email}>{user?.email}</span>
            <button className="icon-btn" onClick={onPluginsOpen} title="Plugin settings"><Settings size={14} /></button>
            <button className="icon-btn" onClick={logout} title="Log out"><LogOut size={14} /></button>
          </div>
        </div>

        <div className="ss-tabs">
          <button className={`ss-tab ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>
            <MessageSquare size={13} /> Previous
          </button>
          <button className={`ss-tab ${tab === 'formulas' ? 'active' : ''}`} onClick={() => setTab('formulas')}>
            <BookOpen size={13} /> Formulas
          </button>
        </div>

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

        {tab === 'formulas' && (
          <div className="fc-panel">
            <p className="fc-hint">Click a formula to insert it into the input.</p>
            {FORMULA_CATEGORIES.map((cat) => (
              <FormulaCategorySection
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
