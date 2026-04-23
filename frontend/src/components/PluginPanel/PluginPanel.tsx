import React, { useEffect, useState, useCallback } from 'react'
import { X, Lock, Trash2, BookOpen } from 'lucide-react'
import { fetchPlugins, togglePlugin } from '../../services/api'
import { listBooks, deleteBook } from '../../plugins/BookPlugin'
import type { PluginInfo, IndexedBook } from '../../types'
import './PluginPanel.css'

interface PluginPanelProps {
  token: string
  onClose: () => void
}

export function PluginPanel({ token, onClose }: PluginPanelProps) {
  const [plugins, setPlugins]         = useState<PluginInfo[]>([])
  const [books, setBooks]             = useState<IndexedBook[]>([])
  const [loading, setLoading]         = useState(true)
  const [toggling, setToggling]       = useState<string | null>(null)
  const [deletingBook, setDeletingBook] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [pluginList, bookList] = await Promise.all([
        fetchPlugins(token),
        listBooks(),
      ])
      setPlugins(pluginList)
      setBooks(bookList)
    } catch {
      // Silently fail — user will see empty state
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleToggle = async (name: string, current: boolean, alwaysEnabled: boolean) => {
    if (alwaysEnabled) return
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
    } finally {
      setDeletingBook(null)
    }
  }

  const bookPlugin = plugins.find((p) => p.name === 'book')
  const mathPlugins = plugins.filter((p) => p.name !== 'book')

  return (
    <div className="plugin-panel-overlay" onClick={onClose}>
      <div className="plugin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="plugin-panel-header">
          <h2 className="plugin-panel-title">Plugin Settings</h2>
          <button className="plugin-panel-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="plugin-panel-loading">Loading plugins…</div>
        ) : (
          <div className="plugin-panel-body">
            {/* Math plugin cards */}
            <p className="plugin-section-label">Math Capabilities</p>
            <div className="plugin-grid">
              {mathPlugins.map((p) => (
                <div
                  key={p.name}
                  className={`plugin-card ${p.enabled ? 'enabled' : 'disabled'} ${p.always_enabled ? 'locked' : ''}`}
                >
                  <div className="plugin-card-top">
                    <span className="plugin-card-name">{p.display_name}</span>
                    {p.always_enabled ? (
                      <Lock size={13} className="plugin-lock-icon" />
                    ) : (
                      <button
                        className={`plugin-toggle ${p.enabled ? 'on' : 'off'}`}
                        onClick={() => handleToggle(p.name, p.enabled, p.always_enabled)}
                        disabled={toggling === p.name}
                        title={p.enabled ? 'Disable' : 'Enable'}
                      >
                        <span className="plugin-toggle-knob" />
                      </button>
                    )}
                  </div>
                  <p className="plugin-card-desc">{p.description}</p>
                </div>
              ))}
            </div>

            {/* Books section */}
            <p className="plugin-section-label" style={{ marginTop: 24 }}>Books</p>
            {books.length === 0 ? (
              <div className="plugin-no-books">
                <BookOpen size={24} className="plugin-no-books-icon" />
                <span>No books indexed yet. Use the + menu in the chat input to upload a textbook PDF.</span>
              </div>
            ) : (
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
        )}
      </div>
    </div>
  )
}
