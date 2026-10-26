import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { api } from '../api'
import type { User } from '../types'

type RegisterPageProps = {
  onBack: () => void
  onLogin: () => void
  onGoogleSuccess: (user: User, csrf: string, needsUsername?: boolean) => void
  onRegistered: (email: string) => void
  notify: (message: string) => void
}

export default function RegisterPage({
  onBack,
  onLogin,
  onGoogleSuccess,
  onRegistered,
  notify
}: RegisterPageProps) {
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
      await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      })
      onRegistered(email.trim().toLowerCase())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create your account'
      setError(msg)
      notify(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="YOUR NEXT LITTLE BIG THING"
      title="Let’s make something."
      description="Create an account to save and publish your studio games."
      onBack={onBack}
    >
      <div className="auth-form-wrap">
        {/* Google One-Click Registration */}
        <GoogleSignInButton
          onLogin={(u, csrf, needsUsername) => onGoogleSuccess(u, csrf, needsUsername)}
          notify={notify}
          onError={(msg) => setError(msg)}
          text="signup"
        />

        <div className="auth-separator">
          <span />
          <b>or create with email</b>
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
                  This email is already registered via Google. Click <b>Sign up with Google</b> above.
                </span>
              )}
              {error.toLowerCase().includes('already exists') && (
                <button type="button" className="auth-alert-action" onClick={onLogin}>
                  Go to Sign In →
                </button>
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
                autoComplete="new-password"
                minLength={10}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (error) setError(null)
                }}
                placeholder="At least 10 characters"
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
            {busy ? 'Creating account…' : 'Create account'} <ArrowRight size={15} />
          </button>

          <p className="auth-switch">
            Already have a studio?{' '}
            <button type="button" onClick={onLogin}>
              Log in
            </button>
          </p>

          <div className="auth-legal">We’ll email you a 6-digit verification code.</div>
        </form>
      </div>
    </AuthLayout>
  )
}
