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

function formatCompactTokens(num: number | null | undefined): { compact: string; full: string } {
  const n = Math.max(0, Number(num) || 0)
  const full = `${n.toLocaleString()} tokens`

  if (n >= 1e12) {
    const val = (n / 1e12).toFixed(2).replace(/\.?0+$/, '')
    return { compact: `${val}T`, full }
  }
  if (n >= 1e9) {
    const val = (n / 1e9).toFixed(2).replace(/\.?0+$/, '')
    return { compact: `${val}B`, full }
  }
  if (n >= 1e6) {
    const val = (n / 1e6).toFixed(2).replace(/\.?0+$/, '')
    return { compact: `${val}M`, full }
  }
  if (n >= 1e3) {
    const val = (n / 1e3).toFixed(1).replace(/\.?0+$/, '')
    return { compact: `${val}K`, full }
  }
  return { compact: `${n}`, full }
}

export default function ProfilePage({ user, hasKey, projects, onHome, onArcade, onCreate, onOpen, onKey, onLogout, onUsername }: ProfilePageProps) {
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const displayName = user?.display_name || user?.username || user?.email?.split('@')[0] || 'Creator'
  const avatar = user?.avatar
    ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
    : displayName.slice(0, 1).toUpperCase()

  const totalTokens = user?.tokens?.total_tokens ?? 0
  const inputTokens = user?.tokens?.input_tokens ?? 0
  const outputTokens = user?.tokens?.output_tokens ?? 0
  const peakTokens = user?.tokens?.max_single_turn_tokens ?? 0
  const turnsCount = user?.tokens?.turns_count ?? 0

  const totalFormatted = formatCompactTokens(totalTokens)
  const peakFormatted = formatCompactTokens(peakTokens)
  const inputFormatted = formatCompactTokens(inputTokens)
  const outputFormatted = formatCompactTokens(outputTokens)

  const inputPct = totalTokens > 0 ? Math.round((inputTokens / totalTokens) * 100) : 0
  const outputPct = totalTokens > 0 ? 100 - inputPct : 0

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
              <div className="token-bolt-wrap">
                <Zap size={14} className="token-bolt-icon" />
              </div>
              <div className="token-title-group">
                <span className="token-title-main">AI Token Telemetry</span>
                <span className="token-title-sub">Compute usage & resource intelligence</span>
              </div>
            </div>
            <div className="token-header-badge" title="Total AI interaction turns recorded">
              <span className="token-pulse-dot" />
              <span>{turnsCount.toLocaleString()} {turnsCount === 1 ? 'Turn' : 'Turns'} Executed</span>
            </div>
          </div>

          <div className="creator-token-grid">
            {/* 1. Lifetime Burnt */}
            <div className="token-stat-box highlight-amber" title={`Lifetime: ${totalFormatted.full}`}>
              <div className="token-stat-top">
                <span className="token-stat-label">Lifetime Tokens</span>
                <div className="stat-icon-wrap amber">
                  <Flame size={13} className="stat-box-icon text-gold" />
                </div>
              </div>
              <div className="token-stat-value text-gold">
                {totalFormatted.compact}
                <span className="token-stat-unit">tok</span>
              </div>
              <div className="token-stat-footer">
                <span className="token-stat-desc">Cumulative burnt across all projects</span>
              </div>
            </div>

            {/* 2. Peak Turn */}
            <div className="token-stat-box highlight-purple" title={`Single Turn Peak: ${peakFormatted.full}`}>
              <div className="token-stat-top">
                <span className="token-stat-label">Peak Turn Burst</span>
                <div className="stat-icon-wrap purple">
                  <Sparkles size={13} className="stat-box-icon text-accent" />
                </div>
              </div>
              <div className="token-stat-value text-accent">
                {peakFormatted.compact}
                <span className="token-stat-unit">tok</span>
              </div>
              <div className="token-stat-footer">
                <span className="token-stat-desc">Highest tokens burnt in 1 response</span>
              </div>
            </div>

            {/* 3. Input / Reading */}
            <div className="token-stat-box highlight-cyan" title={`Input Tokens: ${inputFormatted.full}`}>
              <div className="token-stat-top">
                <span className="token-stat-label">Input (Reading)</span>
                <div className="stat-icon-wrap cyan">
                  <Activity size={13} className="stat-box-icon text-cyan" />
                </div>
              </div>
              <div className="token-stat-value text-cyan">
                {inputFormatted.compact}
                <span className="token-stat-unit">tok</span>
              </div>
              <div className="token-stat-footer">
                <span className="token-stat-desc">Workspace context & codebase prompts</span>
              </div>
            </div>

            {/* 4. Output / Writing */}
            <div className="token-stat-box highlight-emerald" title={`Output Tokens: ${outputFormatted.full}`}>
              <div className="token-stat-top">
                <span className="token-stat-label">Output (Writing)</span>
                <div className="stat-icon-wrap emerald">
                  <Check size={13} className="stat-box-icon text-emerald" />
                </div>
              </div>
              <div className="token-stat-value text-emerald">
                {outputFormatted.compact}
                <span className="token-stat-unit">tok</span>
              </div>
              <div className="token-stat-footer">
                <span className="token-stat-desc">Code, reasoning & tool output generated</span>
              </div>
            </div>
          </div>

          {/* Ratio Progress Bar */}
          {totalTokens > 0 && (
            <div className="token-ratio-card">
              <div className="token-ratio-meta">
                <div className="ratio-meta-left">
                  <span className="ratio-legend-dot cyan" />
                  <span>Context Read: <strong>{inputPct}%</strong> ({inputFormatted.compact})</span>
                </div>
                <div className="ratio-meta-right">
                  <span className="ratio-legend-dot emerald" />
                  <span>Code Generated: <strong>{outputPct}%</strong> ({outputFormatted.compact})</span>
                </div>
              </div>
              <div className="token-ratio-track" role="progressbar" aria-label="Input vs Output token ratio">
                <div className="token-ratio-fill cyan" style={{ width: `${inputPct}%` }} title={`Input: ${inputPct}%`} />
                <div className="token-ratio-fill emerald" style={{ width: `${outputPct}%` }} title={`Output: ${outputPct}%`} />
              </div>
            </div>
          )}
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
