import { useEffect, useState } from 'react'
import { ArrowLeft, KeyRound, Laptop, Lock, LogOut, ShieldAlert, Trash2, Check } from 'lucide-react'
import { changePassword, deleteAccount, fetchActiveSessions, logoutAllOtherSessions } from '../api'
import type { ActiveSession, Page, User } from '../types'

type SettingsPageProps = {
  user: User | null
  hasKey: boolean
  setPage: (page: Page) => void
  onOpenKeyModal: () => void
  onAccountDeleted: () => void
  notify: (msg: string) => void
}

export default function SettingsPage({ user, hasKey, setPage, onOpenKeyModal, onAccountDeleted, notify }: SettingsPageProps) {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [revokeOthers, setRevokeOthers] = useState(true)
  const [savingPw, setSavingPw] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user) return
    fetchActiveSessions()
      .then((res) => setSessions(res.sessions || []))
      .catch(() => {})
  }, [user])

  if (!user) {
    return (
      <main style={{ minHeight: '100vh', background: '#070910', color: '#f8fafc', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#94a3b8' }}>Sign in to manage account security settings.</p>
          <button type="button" className="button button-primary" onClick={() => setPage('login')}>Sign In</button>
        </div>
      </main>
    )
  }

  const isGoogle = user.auth_provider === 'google'

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw.length < 10) {
      notify('New password must be at least 10 characters')
      return
    }
    setSavingPw(true)
    try {
      const res = await changePassword(curPw, newPw, revokeOthers)
      notify(res.message || 'Password updated!')
      setCurPw('')
      setNewPw('')
      const refreshed = await fetchActiveSessions().catch(() => ({ sessions }))
      setSessions(refreshed.sessions || [])
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setSavingPw(false)
    }
  }

  const handleLogoutOthers = async () => {
    setRevoking(true)
    try {
      const res = await logoutAllOtherSessions()
      notify(`Signed out ${res.revoked} other session(s)`)
      const refreshed = await fetchActiveSessions().catch(() => ({ sessions: [] }))
      setSessions(refreshed.sessions || [])
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not revoke sessions')
    } finally {
      setRevoking(false)
    }
  }

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeleting(true)
    try {
      await deleteAccount(isGoogle ? { confirm_username: deleteConfirm } : { password: deleteConfirm })
      notify('Your account and all associated projects have been permanently deleted.')
      onAccountDeleted()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete account')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#070910', color: '#f8fafc' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="button button-outline button-small" onClick={() => setPage('profile')}>
            <ArrowLeft size={14} /> Profile
          </button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Account &amp; Security</span>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px 80px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* BYOK Gemini Key */}
        <section style={{ background: '#0f121b', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 16, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={17} color="#a78bfa" /> Gemini API Key (AES-256-GCM Encrypted)
              </h2>
              <p style={{ margin: 0, fontSize: 13.5, color: '#94a3b8' }}>
                {hasKey
                  ? 'Connected and encrypted at rest using AES-256-GCM bound to your user ID.'
                  : 'No Gemini API key connected yet.'}
              </p>
            </div>
            <button type="button" className="button button-primary button-small" onClick={onOpenKeyModal}>
              {hasKey ? 'Manage Key' : 'Connect Key'}
            </button>
          </div>
        </section>

        {/* Password Security */}
        <section style={{ background: '#0f121b', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 16, padding: 22 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={17} color="#38bdf8" /> Password
          </h2>
          {isGoogle ? (
            <p style={{ margin: 0, fontSize: 13.5, color: '#94a3b8' }}>
              Your account signs in with Google OAuth. Manage your password and 2FA directly inside your Google Account security settings.
            </p>
          ) : (
            <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420, marginTop: 12 }}>
              <input
                id="settings-current-password"
                name="current-password"
                type="password"
                autoComplete="current-password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                placeholder="Current password"
                required
                style={{ background: '#070910', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: '10px 12px', color: '#f8fafc' }}
              />
              <input
                id="settings-new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="New password (min 10 characters)"
                minLength={10}
                required
                style={{ background: '#070910', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: '10px 12px', color: '#f8fafc' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1' }}>
                <input id="settings-revoke-others" name="revoke-others" type="checkbox" checked={revokeOthers} onChange={(e) => setRevokeOthers(e.target.checked)} />
                Sign out all other active devices after updating password
              </label>
              <button type="submit" className="button button-primary button-small" disabled={savingPw} style={{ alignSelf: 'flex-start' }}>
                <Check size={14} /> {savingPw ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}
        </section>

        {/* Active Sessions */}
        <section style={{ background: '#0f121b', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 16, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Laptop size={17} color="#34d399" /> Active Sessions ({sessions.length})
            </h2>
            <button type="button" className="button button-outline button-small" disabled={revoking || sessions.length <= 1} onClick={handleLogoutOthers}>
              <LogOut size={14} /> {revoking ? 'Signing out…' : 'Sign Out Other Devices'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: s.current ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(148,163,184,0.1)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.user_agent || 'Browser session'}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                    {s.ip_hint ? `IP ${s.ip_hint} · ` : ''}Started {s.created_at ? new Date(s.created_at * 1000).toLocaleString() : 'recently'}
                  </div>
                </div>
                {s.current && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.14)', padding: '3px 9px', borderRadius: 999 }}>
                    Current
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* GDPR Permanent Account Deletion */}
        <section style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 16, padding: 22 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={17} /> Danger Zone — Delete Account (GDPR Art. 17)
          </h2>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#fecaca', lineHeight: 1.5 }}>
            Permanently deletes your account, encrypted Gemini API key, all projects, files, AI conversations, comments, and sessions. This cannot be undone.
          </p>
          <form onSubmit={handleDeleteAccount} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              id="settings-delete-confirm"
              name="delete-confirm"
              type={isGoogle ? 'text' : 'password'}
              autoComplete={isGoogle ? 'username' : 'current-password'}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={isGoogle ? `Type "${user.username || user.email}" to confirm` : 'Enter current password to confirm'}
              required
              style={{ flex: 1, minWidth: 240, background: '#090b12', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, padding: '10px 12px', color: '#f8fafc' }}
            />
            <button type="submit" className="button button-small" disabled={deleting || !deleteConfirm.trim()} style={{ background: '#dc2626', color: '#fff', border: 'none' }}>
              <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete Account Permanently'}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
