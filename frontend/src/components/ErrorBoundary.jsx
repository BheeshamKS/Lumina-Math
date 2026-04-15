import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[Lumina] Uncaught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', gap: '16px',
          fontFamily: 'var(--font-sans, sans-serif)',
          color: 'var(--cream, #E2D6BE)',
          background: 'var(--bg-solid, #090807)',
          padding: '24px', textAlign: 'center',
        }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', margin: 0 }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--cream-2)', maxWidth: 480, margin: 0, lineHeight: 1.6 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: '8px 20px', borderRadius: 'var(--radius, 6px)',
              background: 'var(--amber, #C49035)', color: '#090807',
              border: 'none', cursor: 'pointer', fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
