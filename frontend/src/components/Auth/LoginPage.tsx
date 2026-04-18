import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Sigma, Mail, Lock, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

type Mode = 'login' | 'signup'

interface InfoMessage {
  type: 'success' | 'error'
  text: string
}

export function LoginPage() {
  const { login, signup, googleLogin, loading, error, clearError } = useAuth()
  const [mode, setMode]           = useState<Mode>('login')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [info, setInfo]           = useState<InfoMessage | null>(null)

  const switchMode = (m: Mode) => { setMode(m); clearError(); setInfo(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setInfo(null)

    if (mode === 'signup') {
      if (password !== confirm) { setInfo({ type: 'error', text: 'Passwords do not match.' }); return }
      const result = await signup(email, password)
      if (result?.needsConfirmation) {
        setInfo({ type: 'success', text: 'Account created! Check your email to confirm before logging in.' })
        switchMode('login')
      }
    } else {
      await login(email, password)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon"><Sigma size={26} /></div>
          <span className="login-logo-text">Lumina <span>Math</span></span>
        </div>

        <p className="login-sub">AI-powered mathematics tutor</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>
            Log In
          </button>
          <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => switchMode('signup')}>
            Sign Up
          </button>
        </div>

        {info && (
          <div className={`auth-banner ${info.type}`}>
            {info.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            <span>{info.text}</span>
          </div>
        )}
        {error && (
          <div className="auth-banner error">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="auth-email"><Mail size={14} /> Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password"><Lock size={14} /> Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {mode === 'signup' && (
            <div className="auth-field">
              <label htmlFor="auth-confirm"><Lock size={14} /> Confirm Password</label>
              <input
                id="auth-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <Loader2 size={18} className="spin" /> : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <button className="google-btn" onClick={googleLogin} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
            <path d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.332 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
            <path d="M6.306 14.691l6.571 4.819C14.655 15.108 19.000 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
            <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
            <path d="M43.611 20.083H42V20H24v8h11.303a11.96 11.96 0 0 1-4.087 5.571l6.19 5.238C42.012 35.245 44 30 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  )
}
