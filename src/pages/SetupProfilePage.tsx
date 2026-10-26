import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Check, Sparkles, AlertCircle } from 'lucide-react'
import { api } from '../api'
import type { User } from '../types'

type SetupProfilePageProps = {
  user: User
  onComplete: (updatedUser: User) => void
  notify: (msg: string) => void
}

export default function SetupProfilePage({ user, onComplete, notify }: SetupProfilePageProps) {
  const initialDisplayName =
    user.display_name ||
    (user.email ? user.email.split('@')[0] : '') ||
    'Creator'

  const initialUsername =
    (user.username ||
      user.display_name ||
      (user.email ? user.email.split('@')[0] : '') ||
      'creator'
    )
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 24)

  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [username, setUsername] = useState(initialUsername)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isValidUsername = /^[a-z0-9_]{3,24}$/.test(username)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const cleanUsername = username.trim().toLowerCase()
    const cleanDisplayName = displayName.trim()

    if (!cleanDisplayName) {
      setError('Please enter a display name.')
      return
    }

    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      setError('Username must be 3–24 characters and only use letters, numbers, or underscores.')
      return
    }

    setBusy(true)
    try {
      const result = await api<{ username: string; display_name?: string }>('/api/profile/username', {
        method: 'PUT',
        body: JSON.stringify({
          username: cleanUsername,
          display_name: cleanDisplayName
        })
      })

      const updatedUser: User = {
        ...user,
        username: result.username,
        display_name: result.display_name || cleanDisplayName
      }

      notify(`Welcome to Yulya, @${result.username}!`)
      onComplete(updatedUser)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not complete profile setup'
      setError(msg)
      notify(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card setup-card" aria-labelledby="setup-title">
        <div className="brand auth-brand">
          <span className="brand-mark">✳</span>
          <span>
            yulya<span className="brand-light">studio</span>
          </span>
        </div>

        <div className="auth-kicker">
          <Sparkles size={11} className="text-lilac" /> CREATOR ONBOARDING
        </div>
        <h1 id="setup-title">Claim your handle.</h1>
        <p>Set up how you appear across the studio and claim your unique profile URL.</p>

        {/* User Identity Preview */}
        <div className="setup-user-preview">
          <div className="setup-avatar-preview">
            {user.avatar ? (
              <img src={user.avatar} alt="Avatar" referrerPolicy="no-referrer" />
            ) : (
              <span>{(displayName[0] || 'C').toUpperCase()}</span>
            )}
          </div>
          <div className="setup-preview-meta">
            <span className="setup-preview-email">{user.email}</span>
            <span className="setup-preview-url">
              studio.yulya.me/<b>@{username || 'handle'}</b>
            </span>
          </div>
        </div>

        {error && (
          <div className="auth-alert" role="alert">
            <AlertCircle size={16} className="auth-alert-icon" />
            <div className="auth-alert-text">
              <span>{error}</span>
            </div>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Display name
            <input
              required
              type="text"
              maxLength={50}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                setError(null)
              }}
              placeholder="e.g. Mayur Patel"
            />
            <small className="setup-field-hint">Your public name displayed on games and profile</small>
          </label>

          <label>
            Creator username
            <div className="setup-username-input-wrap">
              <span className="setup-username-at">@</span>
              <input
                required
                type="text"
                maxLength={24}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                  setError(null)
                }}
                placeholder="handle"
                className={!isValidUsername && username ? 'input-invalid' : ''}
              />
              {isValidUsername && <Check size={16} className="setup-username-check" />}
            </div>
            <small className="setup-field-hint">
              3–24 lowercase characters (letters, numbers, underscores). Permanent handle.
            </small>
          </label>

          <button
            className="button button-primary auth-submit setup-submit"
            disabled={busy || !isValidUsername || !displayName.trim()}
          >
            {busy ? 'Setting up profile…' : 'Enter My Studio'} <ArrowRight size={15} />
          </button>
        </form>
      </section>

      <div className="auth-decoration" aria-hidden="true">
        <span>✦</span>
        <span>✧</span>
        <span>·</span>
        <span>✳</span>
      </div>
    </main>
  )
}
