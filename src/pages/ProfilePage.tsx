import { useState, useMemo, useEffect } from 'react'
import type * as React from 'react'
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, Check, Code2,
  Copy, Edit3, Flame, Gamepad2, Globe, KeyRound, Lock, LogOut,
  MoreVertical, Play, Plus, Search, Share2, Sparkles, Trash2, X, Zap
} from 'lucide-react'
import type { Game, User } from '../types'
import { api } from '../api'

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
  onUpdateUser?: (updated: User) => void
  onToggleVisibility?: (game: Game) => Promise<void>
  onDeleteProject?: (projectId: string) => Promise<void>
  notify: (msg: string) => void
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

function formatJoinDate(timestamp?: number): string {
  if (!timestamp) return 'Member since 2026'
  try {
    const date = new Date(timestamp * 1000)
    return `Joined ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
  } catch {
    return 'Member since 2026'
  }
}

export default function ProfilePage({
  user,
  hasKey,
  projects,
  onHome,
  onArcade,
  onCreate,
  onOpen,
  onKey,
  onLogout,
  onUsername,
  onUpdateUser,
  onToggleVisibility,
  onDeleteProject,
  notify
}: ProfilePageProps) {
  // Username claim state (fallback for accounts without username)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)

  // Edit Profile Modal
  const [isEditing, setIsEditing] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState(user?.display_name || user?.username || '')
  const [editBio, setEditBio] = useState(user?.bio || '')
  const [savingProfile, setSavingProfile] = useState(false)

  // Projects filter & search
  const [projectFilter, setProjectFilter] = useState<'all' | 'public' | 'private'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // 3-dots Menu & Deletion state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Game | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Toggling project visibility inline
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Close 3-dots dropdown when clicking outside
  useEffect(() => {
    if (!openMenuId) return
    const handleClose = () => setOpenMenuId(null)
    window.addEventListener('click', handleClose)
    return () => window.removeEventListener('click', handleClose)
  }, [openMenuId])

  const displayName = user?.display_name || user?.username || (user?.email ? user.email.split('@')[0] : 'Creator')
  const bio = user?.bio || 'Creator and game designer in Yulya Studio.'

  // Computed metrics
  const publicCount = useMemo(() => projects.filter((p) => p.visibility === 'public').length, [projects])
  const privateCount = projects.length - publicCount
  const totalPlays = useMemo(() => {
    return projects.reduce((acc, p) => acc + (Number(p.plays) || 0), 0)
  }, [projects])

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesFilter =
        projectFilter === 'all'
          ? true
          : projectFilter === 'public'
          ? p.visibility === 'public'
          : p.visibility !== 'public'
      const matchesSearch =
        !searchQuery.trim() ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesFilter && matchesSearch
    })
  }, [projects, projectFilter, searchQuery])

  // Telemetry metrics
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

  // Copy Profile link
  const copyProfileLink = () => {
    if (!user?.username) {
      notify('Claim your username first to get a shareable profile URL')
      return
    }
    const url = `${window.location.origin}/@${user.username}`
    navigator.clipboard.writeText(url)
    notify('Profile link copied to clipboard!')
  }

  // Copy Game link
  const copyGameLink = (game: Game) => {
    const username = user?.username || game.creator
    const url = `${window.location.origin}/${encodeURIComponent(username)}/${encodeURIComponent(game.id)}`
    navigator.clipboard.writeText(url)
    notify(`Game link for "${game.title}" copied!`)
  }

  // Handle Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const res = await api<{ user: User }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          display_name: editDisplayName.trim(),
          bio: editBio.trim()
        })
      })
      if (onUpdateUser) onUpdateUser(res.user)
      setIsEditing(false)
      notify('Profile updated successfully!')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setSavingProfile(false)
    }
  }

  // Handle Toggle Visibility
  const handleToggle = async (game: Game) => {
    const id = game.projectId || game.id
    if (!id || togglingId) return
    setTogglingId(id)
    try {
      if (onToggleVisibility) {
        await onToggleVisibility(game)
      } else {
        const next = game.visibility === 'public' ? 'private' : 'public'
        await api(`/api/projects/${id}/visibility`, {
          method: 'PATCH',
          body: JSON.stringify({ visibility: next })
        })
        notify(next === 'public' ? `"${game.title}" is now public` : `"${game.title}" is now private`)
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update visibility')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="profile-shell creator-profile-shell">
      {/* Top Navbar */}
      <header className="topbar profile-topbar creator-profile-topbar">
        <button className="brand" onClick={onHome} aria-label="Yulya Studio home">
          <span className="brand-mark">✳</span>
          <span>
            yulya<span className="brand-light">studio</span>
          </span>
        </button>

        <nav className="creator-profile-nav" aria-label="Account navigation">
          <button className="quiet-button" onClick={onArcade}>
            <Gamepad2 size={15} /> Arcade
          </button>
          <button className="creator-signout" onClick={onLogout}>
            <LogOut size={14} /> Sign out
          </button>
        </nav>
      </header>

      <main className="creator-profile-main">
        {/* 1. HERO IDENTITY CARD */}
        <section className="pro-identity-card" aria-label="Creator Profile">
          {/* Cosmic Banner */}
          <div className="pro-cover-banner">
            <div className="pro-banner-mesh" />
            <div className="pro-banner-stars">✦　·　✧　✳　✦</div>
            <div className="pro-banner-badge">
              <span className="pro-badge-dot" />
              <span>STUDIO CREATOR</span>
            </div>
          </div>

          {/* Identity Header */}
          <div className="pro-identity-body">
            <div className="pro-identity-top">
              {/* Avatar with Glow Ring */}
              <div className="pro-avatar-wrap">
                <div className="pro-avatar-inner">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={displayName} referrerPolicy="no-referrer" />
                  ) : (
                    <span>{(displayName[0] || 'C').toUpperCase()}</span>
                  )}
                </div>
                <span className="pro-avatar-status" title="Online in Studio" />
              </div>

              {/* Action Buttons */}
              <div className="pro-actions-group">
                <button
                  className="button button-outline pro-action-btn"
                  onClick={copyProfileLink}
                  title="Share creator profile"
                >
                  <Share2 size={14} />
                  <span>Share</span>
                </button>

                <button
                  className="button button-outline pro-action-btn"
                  onClick={() => {
                    setEditDisplayName(user?.display_name || user?.username || '')
                    setEditBio(user?.bio || '')
                    setIsEditing(true)
                  }}
                  title="Edit profile information"
                >
                  <Edit3 size={14} />
                  <span>Edit Profile</span>
                </button>

                <button
                  className={`button button-outline pro-action-btn ${hasKey ? 'key-connected' : ''}`}
                  onClick={onKey}
                  title={hasKey ? 'Manage Gemini AI settings' : 'Connect Gemini AI Key'}
                >
                  <KeyRound size={14} />
                  <span>{hasKey ? 'AI Engine' : 'Connect AI'}</span>
                  {hasKey && <span className="key-active-dot" />}
                </button>
              </div>
            </div>

            {/* Names & Handle */}
            <div className="pro-info-wrap">
              <div className="pro-title-line">
                <h1>{displayName}</h1>
                <span className="pro-tier-pill">
                  <Sparkles size={11} /> PRO
                </span>
              </div>

              <div className="pro-meta-line">
                <span className="pro-username">@{user?.username || 'handle_not_set'}</span>
                <span className="pro-meta-bullet">•</span>
                <span className="pro-email">{user?.email}</span>
                <span className="pro-meta-bullet">•</span>
                <span className="pro-joined">{formatJoinDate(user?.created_at)}</span>
              </div>

              <p className="pro-bio">{bio}</p>
            </div>

            {/* Fallback Username Setup if missing */}
            {!user?.username && (
              <form
                className="creator-username-setup pro-username-alert"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const value = usernameInput.trim().toLowerCase()
                  if (!/^[a-z0-9_]{3,24}$/.test(value)) {
                    setUsernameError('Use 3–24 lowercase letters, numbers, or underscores.')
                    return
                  }
                  setSavingUsername(true)
                  setUsernameError('')
                  try {
                    await onUsername(value)
                  } catch (err) {
                    setUsernameError(err instanceof Error ? err.message : 'Could not save username.')
                  } finally {
                    setSavingUsername(false)
                  }
                }}
              >
                <div>
                  <b>Choose your permanent creator handle</b>
                  <small>Your username creates your unique profile & arcade game links.</small>
                </div>
                <div className="creator-username-control">
                  <span>@</span>
                  <input
                    value={usernameInput}
                    maxLength={24}
                    placeholder="username"
                    autoComplete="username"
                    onChange={(e) => {
                      setUsernameInput(e.target.value.toLowerCase().replace(/\s/g, ''))
                      setUsernameError('')
                    }}
                  />
                  <button
                    className="button button-primary"
                    disabled={savingUsername || !/^[a-z0-9_]{3,24}$/.test(usernameInput)}
                  >
                    {savingUsername ? 'Saving…' : 'Save handle'}
                  </button>
                </div>
                {usernameError && <p role="alert">{usernameError}</p>}
              </form>
            )}

            {/* 2. STATS OVERVIEW CARDS */}
            <div className="pro-stats-grid">
              <div className="pro-stat-card">
                <div className="pro-stat-icon-wrap lilac">
                  <Gamepad2 size={16} />
                </div>
                <div className="pro-stat-content">
                  <span className="pro-stat-number">{projects.length}</span>
                  <span className="pro-stat-label">Studio Projects</span>
                </div>
                <span className="pro-stat-sub">
                  <b>{publicCount}</b> public · <b>{privateCount}</b> drafts
                </span>
              </div>

              <div className="pro-stat-card">
                <div className="pro-stat-icon-wrap emerald">
                  <Play size={15} />
                </div>
                <div className="pro-stat-content">
                  <span className="pro-stat-number">{totalPlays.toLocaleString()}</span>
                  <span className="pro-stat-label">Total Game Plays</span>
                </div>
                <span className="pro-stat-sub">Across all public arcade games</span>
              </div>

              <div className="pro-stat-card">
                <div className="pro-stat-icon-wrap amber">
                  <Flame size={16} />
                </div>
                <div className="pro-stat-content">
                  <span className="pro-stat-number">{totalFormatted.compact}</span>
                  <span className="pro-stat-label">AI Tokens Burnt</span>
                </div>
                <span className="pro-stat-sub">Intelligence compute used</span>
              </div>

              <div className="pro-stat-card">
                <div className="pro-stat-icon-wrap cyan">
                  <Zap size={16} />
                </div>
                <div className="pro-stat-content">
                  <span className="pro-stat-number">{turnsCount.toLocaleString()}</span>
                  <span className="pro-stat-label">Generation Turns</span>
                </div>
                <span className="pro-stat-sub">AI co-pilot iterations</span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. WORKSPACE PROJECTS SECTION */}
        <section className="pro-workspace-section" aria-labelledby="workspace-title">
          <div className="pro-workspace-topbar">
            <div className="pro-workspace-title-group">
              <span className="creator-profile-eyebrow">YOUR CREATIVE PORTFOLIO</span>
              <h2 id="workspace-title">Studio Projects</h2>
            </div>

            <button
              className="button button-primary pro-new-project-btn"
              onClick={onCreate}
              disabled={!user?.username}
              title={!user?.username ? 'Choose a username before creating a project' : 'Create new project'}
            >
              <Plus size={16} />
              <span>New Project</span>
            </button>
          </div>

          {/* Filter Bar & Search */}
          <div className="pro-filter-bar">
            <div className="pro-filter-tabs">
              <button
                className={`pro-tab-pill ${projectFilter === 'all' ? 'active' : ''}`}
                onClick={() => setProjectFilter('all')}
              >
                All <span>{projects.length}</span>
              </button>
              <button
                className={`pro-tab-pill ${projectFilter === 'public' ? 'active' : ''}`}
                onClick={() => setProjectFilter('public')}
              >
                <Globe size={12} /> Public Arcade <span>{publicCount}</span>
              </button>
              <button
                className={`pro-tab-pill ${projectFilter === 'private' ? 'active' : ''}`}
                onClick={() => setProjectFilter('private')}
              >
                <Lock size={12} /> Private Drafts <span>{privateCount}</span>
              </button>
            </div>

            <div className="pro-search-box">
              <Search size={14} className="pro-search-icon" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="pro-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Projects Grid */}
          {filteredProjects.length > 0 ? (
            <div className="pro-project-grid">
              {filteredProjects.map((project) => {
                const projectId = project.projectId || project.id || ''
                const isPublic = project.visibility === 'public'
                const plays = Number(project.plays) || 0
                const isToggling = togglingId === projectId
                const isMenuOpen = openMenuId === projectId

                return (
                  <div className="pro-card" key={projectId}>
                    {/* Visual Thumbnail */}
                    <div
                      className="pro-card-thumbnail"
                      style={{ '--game-color': project.color || '#cbb3ff' } as React.CSSProperties}
                      onClick={() => onOpen(project)}
                    >
                      <div className="pro-thumb-overlay" />
                      <div className="pro-thumb-glyph">{project.art || '✦'}</div>

                      {/* Left: Visibility Badge */}
                      <span className={`pro-vis-badge ${isPublic ? 'badge-public' : 'badge-private'}`}>
                        {isPublic ? <Globe size={11} /> : <Lock size={11} />}
                        <span>{isPublic ? 'PUBLIC' : 'PRIVATE'}</span>
                      </span>

                      {/* Right: Plays Badge & 3-Dots Menu Button */}
                      <div className="pro-thumb-top-right" onClick={(e) => e.stopPropagation()}>
                        {isPublic && (
                          <span className="pro-plays-pill">
                            <Play size={10} fill="currentColor" /> {plays} plays
                          </span>
                        )}

                        {/* 3-DOTS ACTION TRIGGER */}
                        <div className="pro-card-menu-anchor">
                          <button
                            type="button"
                            className={`pro-card-more-btn ${isMenuOpen ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenuId(isMenuOpen ? null : projectId)
                            }}
                            aria-label="Project actions"
                            title="Project options"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {/* Floating 3-Dots Dropdown */}
                          {isMenuOpen && (
                            <div className="pro-card-dropdown animate-menu-scale" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="pro-dropdown-item"
                                onClick={() => {
                                  setOpenMenuId(null)
                                  onOpen(project)
                                }}
                              >
                                <Code2 size={13} className="text-lilac" />
                                <span>Open in Studio</span>
                              </button>

                              {isPublic && (
                                <>
                                  <a
                                    className="pro-dropdown-item"
                                    href={`/${encodeURIComponent(user?.username || project.creator)}/${encodeURIComponent(project.id)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => setOpenMenuId(null)}
                                  >
                                    <Play size={13} className="text-emerald" />
                                    <span>Play in Arcade</span>
                                  </a>

                                  <button
                                    type="button"
                                    className="pro-dropdown-item"
                                    onClick={() => {
                                      setOpenMenuId(null)
                                      copyGameLink(project)
                                    }}
                                  >
                                    <Copy size={13} className="text-cyan" />
                                    <span>Copy Game Link</span>
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                className="pro-dropdown-item"
                                onClick={() => {
                                  setOpenMenuId(null)
                                  handleToggle(project)
                                }}
                              >
                                {isPublic ? (
                                  <Lock size={13} className="text-muted" />
                                ) : (
                                  <Globe size={13} className="text-emerald" />
                                )}
                                <span>{isPublic ? 'Make Private' : 'Publish to Arcade'}</span>
                              </button>

                              <div className="pro-dropdown-divider" />

                              {/* DELETE OPTION */}
                              <button
                                type="button"
                                className="pro-dropdown-item pro-dropdown-danger"
                                onClick={() => {
                                  setOpenMenuId(null)
                                  setProjectToDelete(project)
                                }}
                              >
                                <Trash2 size={13} />
                                <span>Delete Project</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Hover Overlay with Open Studio */}
                      <div className="pro-thumb-hover">
                        <span className="pro-hover-btn">Open Editor →</span>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="pro-card-details">
                      <div className="pro-card-header" onClick={() => onOpen(project)}>
                        <h3>{project.title}</h3>
                        <p>{project.description || 'Browser game created in Yulya Studio.'}</p>
                      </div>

                      {/* Footer Actions */}
                      <div className="pro-card-footer">
                        <button
                          type="button"
                          className="pro-card-action-btn primary"
                          onClick={() => onOpen(project)}
                          title="Open game editor"
                        >
                          Editor <ArrowRight size={13} />
                        </button>

                        {isPublic && (
                          <>
                            <a
                              className="pro-card-action-btn secondary"
                              href={`/${encodeURIComponent(user?.username || project.creator)}/${encodeURIComponent(project.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Play live in browser"
                            >
                              Play <ArrowUpRight size={12} />
                            </a>

                            <button
                              type="button"
                              className="pro-card-icon-btn"
                              onClick={() => copyGameLink(project)}
                              title="Copy game link"
                            >
                              <Copy size={13} />
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          className={`pro-card-vis-btn ${isPublic ? 'make-private' : 'make-public'}`}
                          onClick={() => handleToggle(project)}
                          disabled={isToggling}
                          title={isPublic ? 'Make this project private' : 'Publish this game to the Arcade'}
                        >
                          {isToggling ? '…' : isPublic ? 'Make Private' : 'Publish'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="creator-empty-projects pro-empty-box">
              <div className="creator-empty-icon">
                <Gamepad2 size={24} />
              </div>
              <h3>
                {searchQuery || projectFilter !== 'all'
                  ? 'No matching projects found'
                  : 'Start your first masterpiece'}
              </h3>
              <p>
                {searchQuery || projectFilter !== 'all'
                  ? 'Try adjusting your filters or search keywords.'
                  : 'Write code with AI in real-time, preview your live game, and publish for creators worldwide.'}
              </p>
              {!(searchQuery || projectFilter !== 'all') && (
                <button className="button button-primary" onClick={onCreate} disabled={!user?.username}>
                  <Plus size={15} /> Create your first game
                </button>
              )}
            </div>
          )}
        </section>

        {/* 4. AI TOKEN TELEMETRY */}
        <section className="creator-token-analytics-card pro-telemetry-shell">
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
              <span>
                {turnsCount.toLocaleString()} {turnsCount === 1 ? 'Turn' : 'Turns'} Executed
              </span>
            </div>
          </div>

          <div className="creator-token-grid">
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

            <div className="token-stat-box highlight-cyan" title={`Input Tokens: ${inputFormatted.full}`}>
              <div className="token-stat-top">
                <span className="token-stat-label">Input Context (Read)</span>
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

            <div className="token-stat-box highlight-emerald" title={`Output Tokens: ${outputFormatted.full}`}>
              <div className="token-stat-top">
                <span className="token-stat-label">Output Code (Write)</span>
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

          {totalTokens > 0 && (
            <div className="token-ratio-card">
              <div className="token-ratio-meta">
                <div className="ratio-meta-left">
                  <span className="ratio-legend-dot cyan" />
                  <span>
                    Context Read: <strong>{inputPct}%</strong> ({inputFormatted.compact})
                  </span>
                </div>
                <div className="ratio-meta-right">
                  <span className="ratio-legend-dot emerald" />
                  <span>
                    Code Generated: <strong>{outputPct}%</strong> ({outputFormatted.compact})
                  </span>
                </div>
              </div>
              <div className="token-ratio-track" role="progressbar" aria-label="Input vs Output token ratio">
                <div className="token-ratio-fill cyan" style={{ width: `${inputPct}%` }} title={`Input: ${inputPct}%`} />
                <div className="token-ratio-fill emerald" style={{ width: `${outputPct}%` }} title={`Output: ${outputPct}%`} />
              </div>
            </div>
          )}
        </section>
      </main>

      {/* 5. EDIT PROFILE MODAL */}
      {isEditing && (
        <div className="modal-backdrop" onClick={() => setIsEditing(false)}>
          <div className="modal-card pro-edit-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setIsEditing(false)} aria-label="Close modal">
              <X size={16} />
            </button>

            <div className="modal-icon">
              <Edit3 size={18} />
            </div>

            <h2>Edit Creator Profile</h2>
            <p>Update how other creators and arcade players see your studio identity.</p>

            <form onSubmit={handleSaveProfile} className="auth-form">
              <label>
                Display Name
                <input
                  required
                  type="text"
                  maxLength={50}
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="e.g. Mayur Patel"
                />
              </label>

              <label>
                Bio / Tagline
                <textarea
                  className="pro-bio-textarea"
                  maxLength={200}
                  rows={3}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Tell creators about the games and playable experiences you build..."
                />
                <small className="setup-field-hint">{editBio.length}/200 characters</small>
              </label>

              <button className="button button-primary modal-submit" disabled={savingProfile || !editDisplayName.trim()}>
                {savingProfile ? 'Saving…' : 'Save Changes'} <Check size={15} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. PERMANENT DELETE PROJECT CONFIRMATION MODAL */}
      {projectToDelete && (
        <div className="modal-backdrop" onClick={() => !deleting && setProjectToDelete(null)}>
          <div className="modal-card pro-delete-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => !deleting && setProjectToDelete(null)}
              aria-label="Close modal"
              disabled={deleting}
            >
              <X size={16} />
            </button>

            <div className="modal-icon danger-icon">
              <Trash2 size={20} />
            </div>

            <h2>Delete Project?</h2>
            <p>
              Are you sure you want to permanently delete <b>&ldquo;{projectToDelete.title}&rdquo;</b>?
            </p>

            <div className="pro-delete-warning-box">
              <AlertTriangle size={18} className="pro-delete-warning-icon" />
              <div className="pro-delete-warning-text">
                <b>Permanent Database Purge</b>
                <span>
                  This will completely remove this project from the database, purging all source code, assets, and AI chat conversation history. This action cannot be undone.
                </span>
              </div>
            </div>

            <div className="pro-delete-modal-actions">
              <button
                type="button"
                className="button button-outline"
                disabled={deleting}
                onClick={() => setProjectToDelete(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="button button-danger"
                disabled={deleting}
                onClick={async () => {
                  const id = projectToDelete.projectId || projectToDelete.id
                  if (!id) return
                  setDeleting(true)
                  try {
                    if (onDeleteProject) {
                      await onDeleteProject(id)
                    } else {
                      await api(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
                      notify(`Project "${projectToDelete.title}" was deleted.`)
                    }
                    setProjectToDelete(null)
                  } catch (err) {
                    notify(err instanceof Error ? err.message : 'Could not delete project')
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                <Trash2 size={15} />
                <span>{deleting ? 'Purging from database…' : 'Delete Project Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
