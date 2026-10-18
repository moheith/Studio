import { useState } from 'react'
import { ArrowRight, Check, CircleUserRound, FolderPlus, LockKeyhole, MoreHorizontal, Plus, Sparkles } from 'lucide-react'
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
  const [savingUsername, setSavingUsername] = useState(false)
  const [usernameError, setUsernameError] = useState('')
  const hasUsername = Boolean(user?.username)
  const validUsername = USERNAME_PATTERN.test(username.trim().toLowerCase())
  const avatar = user?.avatar
    ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
    : user?.username?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'Y'

  async function saveUsername() {
    const normalized = username.trim().toLowerCase()
    if (!USERNAME_PATTERN.test(normalized)) {
      setUsernameError('Use 3–24 characters: lowercase letters, numbers, and underscores.')
      return
    }
    setSavingUsername(true)
    setUsernameError('')
    try {
      await onUsername(normalized)
    } catch (error) {
      setUsernameError(error instanceof Error ? error.message : 'That username could not be saved. Try another one.')
    } finally {
      setSavingUsername(false)
    }
  }

  return <div className="profile-shell">
    <header className="topbar profile-topbar">
      <button className="brand" onClick={onHome} aria-label="Yulya Studio home"><span className="brand-mark">✳</span><span>yulya<span className="brand-light">studio</span></span></button>
      <div className="profile-top-actions">
        <button className="quiet-button" onClick={onHome}>Arcade</button>
        <span className="profile-top-divider" aria-hidden="true" />
        <button className="quiet-button" onClick={onLogout}>Sign out</button>
        <div className="profile-avatar profile-avatar-small" aria-label="Your avatar">{avatar}</div>
      </div>
    </header>

    <main className="profile-main">
      <div className="profile-page-heading">
        <div>
          <div className="eyebrow profile-eyebrow"><span className="profile-heading-mark">✳</span> YOUR STUDIO</div>
          <h1>Creator dashboard</h1>
          <p>Manage your profile and pick up where your ideas left off.</p>
        </div>
        <div className="profile-plan"><span className="profile-plan-dot" /> Personal studio</div>
      </div>

      <section className="profile-account-card" aria-labelledby="profile-account-title">
        <div className="profile-account-identity">
          <div className="profile-avatar profile-avatar-large">{avatar}</div>
          <div className="profile-identity-copy">
            <span className="profile-section-label">CREATOR PROFILE</span>
            <h2 id="profile-account-title">{hasUsername ? `@${user?.username}` : 'Set up your creator profile'}</h2>
            <p>{user?.email}</p>
          </div>
        </div>
        {hasUsername && <div className="profile-account-status"><Check size={15} /> Username claimed</div>}
      </section>

      {!hasUsername && <section className="username-setup-card" id="username-setup" aria-labelledby="username-setup-title">
        <div className="username-step-icon"><CircleUserRound size={21} /></div>
        <div className="username-setup-content">
          <div className="profile-section-label">ONE LAST STEP</div>
          <h2 id="username-setup-title">Choose your unique username</h2>
          <p>Your username identifies your profile and appears in your game links. It can only be claimed once, so choose one you want to keep.</p>
          <label className="username-field-label" htmlFor="creator-username">Username</label>
          <div className={`username-field ${usernameError ? 'username-field-error' : ''}`}>
            <span aria-hidden="true">@</span>
            <input
              id="creator-username"
              autoComplete="username"
              maxLength={24}
              value={username}
              onChange={event => { setUsername(event.target.value.toLowerCase().replace(/\s/g, '')); setUsernameError('') }}
              onKeyDown={event => { if (event.key === 'Enter' && validUsername && !savingUsername) void saveUsername() }}
              placeholder="yourname"
              aria-describedby="username-hint username-error"
              aria-invalid={Boolean(usernameError)}
              disabled={savingUsername}
            />
            <span className="username-domain">.yulya.me</span>
          </div>
          <div className="username-input-footer">
            <span id="username-hint">3–24 characters · lowercase letters, numbers, underscores</span>
            <span>{username.length}/24</span>
          </div>
          {usernameError && <p className="username-error-message" id="username-error" role="alert">{usernameError}</p>}
          <button className="button button-primary username-save-button" onClick={() => void saveUsername()} disabled={!validUsername || savingUsername}>
            {savingUsername ? 'Saving…' : 'Claim username'} {!savingUsername && <ArrowRight size={15} />}
          </button>
          <div className="username-privacy-note"><LockKeyhole size={13} /> Each username belongs to one creator and cannot be changed.</div>
        </div>
      </section>}

      <section className="profile-projects-section" aria-labelledby="profile-projects-title">
        <div className="profile-section-heading">
          <div>
            <div className="profile-section-label">YOUR WORKSPACE</div>
            <h2 id="profile-projects-title">Projects <span>{projects.length}</span></h2>
          </div>
          <button className="button button-primary profile-create-button" onClick={onCreate} disabled={!hasUsername} title={!hasUsername ? 'Claim a username first' : 'Create a new project'}>
            <Plus size={16} /> New project
          </button>
        </div>

        {projects.length === 0 ? <div className={`profile-empty-state ${!hasUsername ? 'profile-empty-locked' : ''}`}>
          <div className="profile-empty-art"><FolderPlus size={27} strokeWidth={1.5} /><Sparkles size={14} /></div>
          <h3>{hasUsername ? 'A fresh canvas is waiting' : 'Your projects start with a username'}</h3>
          <p>{hasUsername ? 'Create a project and bring your first game idea to life.' : 'Claim your unique username above to unlock project creation and get your own shareable creator URL.'}</p>
          {hasUsername
            ? <button className="button button-primary" onClick={onCreate}><Plus size={16} /> Create your first project</button>
            : <div className="profile-projects-locked"><LockKeyhole size={14} /> Project creation unlocks after username setup</div>}
        </div> : <div className="project-grid">
          {hasUsername && <button className="project-new-card" onClick={onCreate}><span className="new-card-plus"><Plus size={20} /></span><b>Start with a blank canvas</b><small>HTML, CSS, JavaScript. Your idea goes here.</small></button>}
          {projects.map(game => <button className="project-card" key={game.projectId} onClick={() => onOpen(game)}><div className="project-thumb"><span>✦</span><span className="project-thumb-small">{game.title}</span></div><div className="project-card-bottom"><div><b>{game.title}</b><small>Edited recently · {game.visibility}</small></div><MoreHorizontal size={17} /></div></button>)}
        </div>}
      </section>

      <section className="profile-ai-card">
        <div className="profile-ai-icon"><Sparkles size={18} /></div>
        <div className="profile-ai-copy"><span className="profile-section-label">YOUR CODING COMPANION</span><h2>{hasKey ? 'AI key connected' : 'Bring your own AI key'}</h2><p>{hasKey ? 'Your AI assistant is ready to help build and refine your games.' : 'Connect your Gemini key to build and edit games with your AI assistant.'}</p></div>
        <button className="button button-outline profile-ai-button" onClick={onKey}>{hasKey ? 'Manage key' : 'Connect AI key'} <ArrowRight size={14} /></button>
      </section>
    </main>
  </div>
}
