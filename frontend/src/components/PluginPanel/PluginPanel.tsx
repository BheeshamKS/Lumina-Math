import React, { useEffect, useState } from 'react'
import { X, Lock, Trash2, BookOpen } from 'lucide-react'
import { fetchPlugins, togglePlugin } from '../../services/api'
import { listBooks, deleteBook } from '../../plugins/BookPlugin'
import type { PluginInfo, IndexedBook } from '../../types'
import './PluginPanel.css'

interface PluginPanelProps {
  token: string
  onClose: () => void
}

function PluginSkeleton() {
  return (
    <div className="plugin-skeleton-list">
      {[1, 2, 3].map((n) => (
        <div key={n} className="plugin-skeleton-row">
          <div className="plugin-skeleton-toggle" />
          <div className="plugin-skeleton-text">
            <div className="plugin-skeleton-name" />
            <div className="plugin-skeleton-desc" />
          </div>
        </div>
      ))}
    </div>
  )
}

const PLUGIN_DESCRIPTIONS: Record<string, string> = {
  core:           'Basic arithmetic and algebra (always on)',
  calculus:       'Enables derivatives, integrals, and limits',
  linear_algebra: 'Enables matrices, eigenvalues, and systems',
  statistics:     'Enables mean, std dev, and distributions',
  trigonometry:   'Enables trig identities and inverse functions',
  number_theory:  'Enables primes, GCD, and modular arithmetic',
}

export function PluginPanel({ token, onClose }: PluginPanelProps) {
  const [plugins, setPlugins]           = useState<PluginInfo[]>([])
  const [books, setBooks]               = useState<IndexedBook[]>([])
  const [pluginsLoading, setPluginsLoading] = useState(true)
  const [booksLoading, setBooksLoading]     = useState(true)
  const [pluginError, setPluginError]   = useState<string | null>(null)
  const [toggling, setToggling]         = useState<string | null>(null)
  const [deletingBook, setDeletingBook] = useState<string | null>(null)

  // Fetch plugins independently so a book-load failure doesn't block it
  useEffect(() => {
    setPluginsLoading(true)
    setPluginError(null)
    fetchPlugins(token)
      .then(setPlugins)
      .catch(() => setPluginError('Could not load plugins. Check your connection.'))
      .finally(() => setPluginsLoading(false))
  }, [token])

  // Fetch books independently and re-fetch whenever a book is indexed
  const loadBooks = () => {
    setBooksLoading(true)
    listBooks()
      .then(setBooks)
      .catch(() => setBooks([]))
      .finally(() => setBooksLoading(false))
  }

  useEffect(() => {
    loadBooks()
    window.addEventListener('lumina:books-updated', loadBooks)
    return () => window.removeEventListener('lumina:books-updated', loadBooks)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (name: string, current: boolean, alwaysEnabled: boolean) => {
    if (alwaysEnabled || toggling) return
    setToggling(name)
    try {
      const updated = await togglePlugin(token, name, !current)
      setPlugins((prev) => prev.map((p) => (p.name === updated.name ? updated : p)))
    } catch {
      // No-op — state stays unchanged
    } finally {
      setToggling(null)
    }
  }

  const handleDeleteBook = async (id: string) => {
    setDeletingBook(id)
    try {
      await deleteBook(id)
      setBooks((prev) => prev.filter((b) => b.id !== id))
      // Tell ChatInput to clear the chip if this book was active
      window.dispatchEvent(new CustomEvent('lumina:book-deleted', { detail: { id } }))
    } finally {
      setDeletingBook(null)
    }
  }

  return (
    <div className="plugin-panel-overlay" onClick={onClose}>
      <div className="plugin-panel" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="plugin-panel-header">
          <h2 className="plugin-panel-title">Plugin Settings</h2>
          <button className="plugin-panel-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="plugin-panel-body">

          {/* Math Capabilities */}
          <p className="plugin-section-label">Math Capabilities</p>

          {pluginsLoading && <PluginSkeleton />}

          {!pluginsLoading && pluginError && (
            <p className="plugin-error">{pluginError}</p>
          )}

          {!pluginsLoading && !pluginError && (
            <div className="plugin-list">
              {plugins.map((p) => (
                <div key={p.name} className={`plugin-row ${p.enabled ? 'enabled' : ''}`}>
                  {p.always_enabled ? (
                    <Lock size={13} className="plugin-lock-icon" aria-label="Always enabled" />
                  ) : (
                    <button
                      className={`plugin-toggle ${p.enabled ? 'on' : 'off'}`}
                      onClick={() => handleToggle(p.name, p.enabled, p.always_enabled)}
                      disabled={toggling === p.name}
                      aria-label={p.enabled ? `Disable ${p.display_name}` : `Enable ${p.display_name}`}
                    >
                      <span className="plugin-toggle-knob" />
                    </button>
                  )}
                  <div className="plugin-row-text">
                    <span className="plugin-row-name">{p.display_name}</span>
                    <span className="plugin-row-desc">
                      {PLUGIN_DESCRIPTIONS[p.name] ?? p.description}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Books */}
          <p className="plugin-section-label" style={{ marginTop: 28 }}>Books</p>

          {booksLoading && (
            <div className="plugin-books-loading">Loading…</div>
          )}

          {!booksLoading && books.length === 0 && (
            <div className="plugin-no-books">
              <BookOpen size={22} className="plugin-no-books-icon" />
              <span>No books indexed yet. Use the + menu in the chat input to upload a textbook PDF.</span>
            </div>
          )}

          {!booksLoading && books.length > 0 && (
            <div className="plugin-book-list">
              {books.map((book) => (
                <div key={book.id} className="plugin-book-row">
                  <div className="plugin-book-info">
                    <span className="plugin-book-title">{book.title}</span>
                    {book.author && (
                      <span className="plugin-book-author">{book.author}</span>
                    )}
                    <span className="plugin-book-meta">
                      {book.index.length} chunks · {new Date(book.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    className="plugin-book-delete"
                    onClick={() => handleDeleteBook(book.id)}
                    disabled={deletingBook === book.id}
                    title="Remove book"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
