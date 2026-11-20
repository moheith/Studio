import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { api, forgotPassword, resetPassword } from '../api'
import type { User } from '../types'

type LoginPageProps = {
  onBack: () => void
  onRegister: () => void
  onLogin: (user: User, csrf: string, needsUsername?: boolean) => void
  notify: (message: string) => void
}

export default function LoginPage({ onBack, onRegister, onLogin, notify }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetMode, setResetMode] = useState<'none' | 'request' | 'confirm'>('none')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetBusy, setResetBusy] = useState(false)

  const handleRequestReset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email.trim()) return
    setResetBusy(true)
    setError(null)
    try {
      const res = await forgotPassword(email.trim())
      notify(res.development_code ? `${res.message} (Dev code: ${res.development_code})` : res.message)
      setResetMode('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset code')
    } finally {
      setResetBusy(false)
    }
  }

  const handleConfirmReset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setResetBusy(true)
    setError(null)
    try {
      const res = await resetPassword(email.trim(), resetCode.trim(), newPassword)
      notify(res.message)
      setResetMode('none')
      setResetCode('')
      setNewPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password')
    } finally {
      setResetBusy(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await api<{ user: User; csrf_token: string; needs_username?: boolean }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      onLogin(result.user, result.csrf_token, result.needs_username)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not sign in'
      setError(msg)
      notify(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="YOUR NEXT LITTLE BIG THING"
      title="Welcome back."
      description="Sign in to your studio and make an idea playable."
      onBack={onBack}
    >
      <div className="auth-form-wrap">
        {/* Google One-Click Auth */}
        <GoogleSignInButton
          onLogin={(u, csrf, needsUsername) => onLogin(u, csrf, needsUsername)}
          notify={notify}
          onError={(msg) => setError(msg)}
          text="signin"
        />

        <div className="auth-separator">
          <span />
          <b>or sign in with email</b>
          <span />
        </div>

        {/* Inline Error Alert */}
        {error && (
          <div className="auth-alert" role="alert">
            <AlertCircle size={16} className="auth-alert-icon" />
            <div className="auth-alert-text">
              <span>{error}</span>
              {error.toLowerCase().includes('google') && (
                <span className="auth-alert-hint">
                  Use the <b>Sign in with Google</b> button above.
                </span>
              )}
              {error.toLowerCase().includes('password') && (
                <span className="auth-alert-hint">
                  Please enter your password below to sign in.
                </span>
              )}
            </div>
          </div>
        )}

        <form className="auth-form" onSubmit={submit}>
          <label>
            Email address
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (error) setError(null)
              }}
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password
            <div className="auth-password-wrap">
              <input
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (error) setError(null)
                }}
                placeholder="Your password"
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>

          <button className="button button-primary auth-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={15} />
          </button>

          <p className="auth-switch" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span>
              New to Yulya?{' '}
              <button type="button" onClick={onRegister}>
                Create an account
              </button>
            </span>
            <button type="button" onClick={() => setResetMode(resetMode === 'none' ? 'request' : 'none')}>
              Forgot password?
            </button>
          </p>

          <div className="auth-legal">Email accounts require verification.</div>
        </form>

        {resetMode !== 'none' && (
          <div style={{ marginTop: 18, padding: 16, borderRadius: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.28)' }}>
            {resetMode === 'request' ? (
              <form onSubmit={handleRequestReset} className="auth-form" style={{ gap: 10 }}>
                <strong style={{ fontSize: 13.5 }}>Reset your password</strong>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Account email address"
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="button button-primary button-small" disabled={resetBusy}>
                    {resetBusy ? 'Sending…' : 'Send 6-Digit Code'}
                  </button>
                  <button type="button" className="button button-outline button-small" onClick={() => setResetMode('none')}>Cancel</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmReset} className="auth-form" style={{ gap: 10 }}>
                <strong style={{ fontSize: 13.5 }}>Enter 6-digit reset code</strong>
                <input required maxLength={6} value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="6-digit code from email" />
                <input required type="password" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 10 chars)" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="button button-primary button-small" disabled={resetBusy}>
                    {resetBusy ? 'Resetting…' : 'Set New Password'}
                  </button>
                  <button type="button" className="button button-outline button-small" onClick={() => setResetMode('none')}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </AuthLayout>
  )
}
