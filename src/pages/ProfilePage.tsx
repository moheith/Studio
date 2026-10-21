import { useState } from 'react'
import { Activity, ArrowRight, Check, Flame, Gamepad2, KeyRound, LogOut, Plus, Sparkles, Zap } from 'lucide-react'
import type * as React from 'react'
import type { Game, User } from '../types'

type ProfilePageProps = {
  user: User | null
  hasKey: boolean
  projects: Game[]
  onHome: () => void
  onArcade: () => void
  onCreate: () => void
  onOpen: (game: Game) => void
  onKey: () => void
  onLogout: () => void
  onUsername: (name: string) => Promise<void>
}

export default function ProfilePage({ user, hasKey, projects, onHome, onArcade, onCreate, onOpen, onKey, onLogout, onUsername }: ProfilePageProps) {
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const displayName = user?.username || user?.email?.split('@')[0] || 'Creator'
  const avatar = user?.avatar
    ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
    : displayName.slice(0, 1).toUpperCase()

  return <div className="profile-shell creator-profile-shell">
    <header className="topbar profile-topbar creator-profile-topbar">
      <button className="brand" onClick={onHome} aria-label="Yulya Studio home"><span className="brand-mark">✳</span><span>yulya<span className="brand-light">studio</span></span></button>
      <nav className="creator-profile-nav" aria-label="Account navigation">
        <button className="quiet-button" onClick={onArcade}>Arcade</button>
        <button className="creator-signout" onClick={onLogout}><LogOut size={14}/> Sign out</button>
      </nav>
    </header>

    <main className="creator-profile-main">
      <div className="creator-profile-heading">
        <div><span className="creator-profile-eyebrow">CREATOR ACCOUNT</span><h1>Your profile</h1><p>Manage your projects and studio settings.</p></div>
        <button className="button button-outline creator-settings-button" onClick={onKey}><KeyRound size={15}/>{hasKey ? 'AI settings' : 'Connect AI'}</button>
      </div>

      <section className="creator-identity-card" aria-label="Your profile">
        <div className="creator-cover" aria-hidden="true"><span>✳</span></div>
        <div className="creator-identity-content">
          <div className="creator-avatar">{avatar}</div>
          <div className="creator-identity-text"><h2>{displayName}</h2><p>@{user?.username || 'username not set'}</p><span>{user?.email}</span></div>
          {user?.username && <span className="creator-username-status"><Check size={13}/> Username claimed</span>}
        </div>
        {!user?.username && <form className="creator-username-setup" onSubmit={async event => {
          event.preventDefault()
          const value = username.trim().toLowerCase()
          if (!/^[a-z0-9_]{3,24}$/.test(value)) { setUsernameError('Use 3–24 lowercase letters, numbers, or underscores.'); return }
          setSavingUsername(true); setUsernameError('')
          try { await onUsername(value) } catch (error) { setUsernameError(error instanceof Error ? error.message : 'Could not save username.') }
          finally { setSavingUsername(false) }
        }}>
          <div><b>Choose your creator username</b><small>It will identify your profile and is unique to your account.</small></div>
          <div className="creator-username-control"><span>@</span><input value={username} maxLength={24} placeholder="username" autoComplete="username" onChange={event => { setUsername(event.target.value.toLowerCase().replace(/\s/g, '')); setUsernameError('') }}/><button className="button button-primary" disabled={savingUsername || !/^[a-z0-9_]{3,24}$/.test(username)}>{savingUsername ? 'Saving…' : 'Save username'}</button></div>
          {usernameError && <p role="alert">{usernameError}</p>}
        </form>}
        <div className="creator-profile-stats">
          <div><strong>{projects.length}</strong><span>Projects</span></div>
          <div><strong>{projects.filter(project => project.visibility === 'public').length}</strong><span>Public games</span></div>
          <div className="creator-ai-stat"><span className={`creator-ai-dot ${hasKey ? 'is-connected' : ''}`}/><span>AI key {hasKey ? 'connected' : 'not connected'}</span><button onClick={onKey}>{hasKey ? 'Manage' : 'Set up'} <ArrowRight size={12}/></button></div>
        </div>

        {/* Token Usage & Telemetry Stats */}
        <div className="creator-token-analytics-card">
          <div className="token-card-header">
            <div className="token-header-title">
              <Zap size={15} className="token-bolt-icon" />
              <span>AI Token Usage & Performance</span>
            </div>
            <span className="token-header-badge">{user?.tokens?.turns_count ?? 0} AI turns executed</span>
          </div>

          <div className="creator-token-grid">
            <div className="token-stat-box highlight-purple">
              <div className="token-stat-top">
                <span className="token-stat-label">Peak Tokens (Single Turn)</span>
                <Sparkles size={12} className="stat-box-icon text-accent" />
              </div>
              <div className="token-stat-value text-accent">
                {(user?.tokens?.max_single_turn_tokens ?? 0).toLocaleString()}
                <span className="token-stat-unit">tokens</span>
              </div>
              <small className="token-stat-desc">Highest tokens burnt in 1 response</small>
            </div>

            <div className="token-stat-box highlight-amber">
              <div className="token-stat-top">
                <span className="token-stat-label">Lifetime Tokens Burnt</span>
                <Flame size={12} className="stat-box-icon text-gold" />
              </div>
              <div className="token-stat-value text-gold">
                {(user?.tokens?.total_tokens ?? 0).toLocaleString()}
                <span className="token-stat-unit">tokens</span>
              </div>
              <small className="token-stat-desc">Cumulative total across all projects</small>
            </div>

            <div className="token-stat-box">
              <div className="token-stat-top">
                <span className="token-stat-label">Total Input (Reading)</span>
                <Activity size={12} className="stat-box-icon" />
              </div>
              <div className="token-stat-value">
                {(user?.tokens?.input_tokens ?? 0).toLocaleString()}
                <span className="token-stat-unit">tokens</span>
              </div>
              <small className="token-stat-desc">Context & project files read</small>
            </div>

            <div className="token-stat-box">
              <div className="token-stat-top">
                <span className="token-stat-label">Total Output (Writing)</span>
                <Check size={12} className="stat-box-icon" />
              </div>
              <div className="token-stat-value">
                {(user?.tokens?.output_tokens ?? 0).toLocaleString()}
                <span className="token-stat-unit">tokens</span>
              </div>
              <small className="token-stat-desc">Code & reasoning generated</small>
            </div>
          </div>
        </div>
      </section>

      <section className="creator-projects-section" aria-labelledby="creator-projects-title">
        <div className="creator-projects-heading"><div><span className="creator-profile-eyebrow">YOUR WORKSPACE</span><h2 id="creator-projects-title">Projects <span>{projects.length}</span></h2></div>
          <button className="button button-primary creator-new-project" onClick={onCreate} disabled={!user?.username} title={!user?.username ? 'Choose a username before creating a project' : 'Create a new project'}><Plus size={16}/> New project</button>
        </div>
        {projects.length ? <div className="creator-project-grid">
          {projects.map(project => <button className="creator-project-card" key={project.projectId || project.id} onClick={() => onOpen(project)}>
            <div className="creator-project-art" style={{ '--game-color': project.color } as React.CSSProperties}><span>{project.art || '✦'}</span><small>{project.visibility === 'public' ? 'PUBLIC' : 'PRIVATE'}</small></div>
            <div className="creator-project-info"><div><h3>{project.title}</h3><p>{project.description}</p></div><ArrowRight size={15}/></div>
          </button>)}
        </div> : <div className="creator-empty-projects"><div className="creator-empty-icon"><Gamepad2 size={21}/></div><h3>Your next game starts here</h3><p>Create a project to open the editor, write your game, and preview it as you build.</p><button className="button button-outline" onClick={onCreate} disabled={!user?.username}><Plus size={15}/> Create your first project</button></div>}
      </section>
    </main>
  </div>
}
