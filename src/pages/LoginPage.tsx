import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { api } from '../api'
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

          <p className="auth-switch">
            New to Yulya?{' '}
            <button type="button" onClick={onRegister}>
              Create an account
            </button>
          </p>

          <div className="auth-legal">Email accounts require verification.</div>
        </form>
      </div>
    </AuthLayout>
  )
}
