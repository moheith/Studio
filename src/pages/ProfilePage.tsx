import { useState } from 'react'
import { ArrowRight, KeyRound, MoreHorizontal, Plus, UserRound } from 'lucide-react'
import type { Game, User } from '../types'

type ProfilePageProps = {
  user: User | null
  hasKey: boolean
  projects: Game[]
  onHome: () => void
  onCreate: () => void
  onOpen: (game: Game) => void
  onKey: () => void
  onUsername: (name: string) => Promise<void>
  onLogout: () => void
}

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/

export default function ProfilePage({ user, hasKey, projects, onHome, onCreate, onOpen, onKey, onUsername, onLogout }: ProfilePageProps) {
  const [username, setUsername] = useState(user?.username ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const hasUsername = Boolean(user?.username)
  const validUsername = USERNAME_PATTERN.test(username.trim().toLowerCase())
  const avatar = user?.avatar
    ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
    : user?.username?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'Y'

  async function saveUsername() {
    const value = username.trim().toLowerCase()
    if (!USERNAME_PATTERN.test(value)) {
      setError('Use 3–24 lowercase letters, numbers, or underscores.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onUsername(value)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save username.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="profile-shell clean-profile-shell">
    <header className="topbar profile-topbar clean-profile-topbar">
      <button className="brand" onClick={onHome} aria-label="Yulya Studio home"><span className="brand-mark">✳</span><span>yulya<span className="brand-light">studio</span></span></button>
      <nav className="clean-profile-nav" aria-label="Account navigation">
        <button className="quiet-button" onClick={onHome}>Arcade</button>
        <button className="quiet-button" onClick={onLogout}>Sign out</button>
        <div className="profile-avatar clean-profile-avatar" aria-label="Your avatar">{avatar}</div>
      </nav>
    </header>

    <main className="clean-profile-main">
      <div className="clean-profile-heading">
        <div><div className="clean-profile-kicker">ACCOUNT</div><h1>Profile</h1><p>Manage your account and projects.</p></div>
        <button className="button button-outline clean-key-button" onClick={onKey}><KeyRound size={15} /> {hasKey ? 'Manage AI key' : 'Add AI key'}</button>
      </div>

      <section className="clean-profile-panel" aria-labelledby="account-details-title">
        <div className="clean-panel-heading"><div><h2 id="account-details-title">Account details</h2><p>Your profile information and sign-in email.</p></div></div>
        <div className="clean-account-row">
          <div className="profile-avatar clean-account-avatar">{avatar}</div>
          <div className="clean-account-email"><span>Email</span><strong>{user?.email}</strong></div>
        </div>
        <div className="clean-username-row">
          <div className="clean-username-copy"><label htmlFor="creator-username">Username</label>
            {hasUsername ? <><strong className="clean-current-username">@{user?.username}</strong><small>This username is claimed and cannot be changed.</small></> : <small>Choose an available username to create projects.</small>}
          </div>
          {!hasUsername && <div className="clean-username-entry">
            <div className={`clean-username-input ${error ? 'has-error' : ''}`}>
              <span aria-hidden="true">@</span>
              <input id="creator-username" value={username} maxLength={24} autoComplete="username" placeholder="username" aria-invalid={Boolean(error)} aria-describedby="username-hint username-error"
                onChange={event => { setUsername(event.target.value.toLowerCase().replace(/\s/g, '')); setError('') }}
                onKeyDown={event => { if (event.key === 'Enter' && validUsername && !saving) void saveUsername() }} disabled={saving} />
            </div>
            <div className="clean-username-meta"><span id="username-hint">3–24 characters · letters, numbers, underscores</span><span>{username.length}/24</span></div>
            {error && <p className="clean-username-error" id="username-error" role="alert">{error}</p>}
            <button className="button button-primary clean-save-username" onClick={() => void saveUsername()} disabled={!validUsername || saving}>{saving ? 'Saving…' : 'Save username'} {!saving && <ArrowRight size={14} />}</button>
          </div>}
        </div>
      </section>

      <section className="clean-projects-section" aria-labelledby="projects-title">
        <div className="clean-projects-heading"><div><h2 id="projects-title">Projects <span>{projects.length}</span></h2><p>Your games and drafts.</p></div>
          <button className="button button-primary clean-new-project" onClick={onCreate} disabled={!hasUsername} title={!hasUsername ? 'Add a username before creating a project' : 'Create a new project'}><Plus size={16} /> New project</button>
        </div>
        {!hasUsername && <div className="clean-projects-notice"><UserRound size={15} /><span>Add a username in Account details to enable project creation.</span></div>}
        {projects.length === 0 ? <div className="clean-empty-projects">
          <div className="clean-empty-icon"><Plus size={19} /></div>
          <h3>No projects yet</h3>
          <p>{hasUsername ? 'Create a project to start building your first game.' : 'Your projects will appear here after you create one.'}</p>
          {hasUsername && <button className="button button-outline" onClick={onCreate}>Create your first project <ArrowRight size={14} /></button>}
        </div> : <div className="project-grid clean-project-grid">
          {projects.map(game => <button className="project-card" key={game.projectId} onClick={() => onOpen(game)}><div className="project-thumb"><span>✦</span><span className="project-thumb-small">{game.title}</span></div><div className="project-card-bottom"><div><b>{game.title}</b><small>Edited recently · {game.visibility}</small></div><MoreHorizontal size={17} /></div></button>)}
        </div>}
      </section>

      <div className="clean-ai-status"><span className={`clean-ai-status-dot ${hasKey ? 'connected' : ''}`} /> AI key {hasKey ? 'connected' : 'not connected'} <button onClick={onKey}>{hasKey ? 'Manage' : 'Set up'} <ArrowRight size={13} /></button></div>
    </main>
  </div>
}
