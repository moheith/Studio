import { useState, useMemo, useEffect } from 'react'
import type * as React from 'react'
import {
  AlertTriangle, ArrowUpRight, Check, Code2, Copy, Download, Edit3,
  Gamepad2, Globe, Grid, KeyRound, Layers, List, Lock, LogOut, Mail,
  MoreVertical, Pencil, Play, Plus, Search, Settings, Share2, Trash2, X
} from 'lucide-react'
import type { Game, User } from '../types'
import { api } from '../api'

type ProfilePageProps = {
  user: User | null
  hasKey: boolean
  projects: Game[]
  onHome: () => void
  onArcade: () => void
  onTemplates?: () => void
  onSettings?: () => void
  onCreate: () => void
  onOpen: (game: Game) => void
  onKey: () => void
  onLogout: () => void
  onUsername: (name: string) => Promise<void>
  onUpdateUser?: (updated: User) => void
  onToggleVisibility?: (game: Game) => Promise<void>
  onDeleteProject?: (projectId: string) => Promise<void>
  onUpdateProjectDetails?: (projectId: string, details: { title: string; description: string; genre: string; allow_remix?: boolean }) => Promise<void>
  onDownloadZip?: (project: Game) => Promise<void> | void
  onTrackPlay?: (username: string, slug: string) => void
  notify: (msg: string) => void
}

function formatCompactTokens(num: number | null | undefined): { compact: string; full: string } {
  const n = Math.max(0, Number(num) || 0)
  const full = `${n.toLocaleString()} tokens`
  if (n >= 1e9) return { compact: `${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`, full }
  if (n >= 1e6) return { compact: `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`, full }
  if (n >= 1e3) return { compact: `${(n / 1e3).toFixed(1).replace(/\.?0+$/, '')}K`, full }
  return { compact: `${n}`, full }
}

function formatJoinDate(timestamp?: number): string {
  if (!timestamp) return 'Joined 2026'
  try {
    const date = new Date(timestamp * 1000)
    return `Joined ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
  } catch {
    return 'Joined 2026'
  }
}

export default function ProfilePage({
  user,
  hasKey,
  projects,
  onHome,
  onArcade,
  onTemplates,
  onSettings,
  onCreate,
  onOpen,
  onKey,
  onLogout,
  onUsername,
  onUpdateUser,
  onToggleVisibility,
  onDeleteProject,
  onUpdateProjectDetails,
  onDownloadZip,
  onTrackPlay,
  notify
}: ProfilePageProps) {
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState(user?.display_name || user?.username || '')
  const [editBio, setEditBio] = useState(user?.bio || '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [editingProject, setEditingProject] = useState<Game | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editGenre, setEditGenre] = useState('ARCADE')
  const [editAllowRemix, setEditAllowRemix] = useState(false)
  const [savingDetails, setSavingDetails] = useState(false)

  const [projectFilter, setProjectFilter] = useState<'all' | 'public' | 'private'>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'plays' | 'title'>('recent')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Game | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    if (!openMenuId) return
    const handleClose = () => setOpenMenuId(null)
    window.addEventListener('click', handleClose)
    return () => window.removeEventListener('click', handleClose)
  }, [openMenuId])

  const displayName = user?.display_name || user?.username || (user?.email ? user.email.split('@')[0] : 'Creator')
  const bio = user?.bio || 'Building interactive browser games and tools in Yulya Studio.'

  const publicCount = useMemo(() => projects.filter((p) => p.visibility === 'public').length, [projects])
  const privateCount = projects.length - publicCount
  const totalPlays = useMemo(() => projects.reduce((acc, p) => acc + (Number(p.plays) || 0), 0), [projects])
  const totalLikes = useMemo(() => projects.reduce((acc, p) => acc + (Number(p.likes_count) || 0), 0), [projects])

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const list = projects.filter((p) => {
      const matchesFilter =
        projectFilter === 'all' ? true : projectFilter === 'public' ? p.visibility === 'public' : p.visibility !== 'public'
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.genre.toLowerCase().includes(q)
      return matchesFilter && matchesSearch
    })
    if (sortBy === 'plays') return [...list].sort((a, b) => (Number(b.plays) || 0) - (Number(a.plays) || 0))
    if (sortBy === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title))
    return list
  }, [projects, projectFilter, searchQuery, sortBy])

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

  const copyProfileLink = () => {
    if (!user?.username) {
      notify('Claim your username first to get a shareable portfolio URL')
      return
    }
    const url = `${window.location.origin}/@${user.username}`
    navigator.clipboard?.writeText(url).catch(() => {})
    notify(`Copied ${url}`)
  }

  const copyGameLink = (game: Game) => {
    const username = user?.username || game.creator
    const url = `${window.location.origin}/${encodeURIComponent(username)}/${encodeURIComponent(game.id)}`
    navigator.clipboard?.writeText(url).catch(() => {})
    notify(`Link copied for "${game.title}"`)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const res = await api<{ user: User }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ display_name: editDisplayName.trim(), bio: editBio.trim() })
      })
      if (onUpdateUser) onUpdateUser(res.user)
      setIsEditing(false)
      notify('Profile updated')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleToggle = async (game: Game) => {
    const id = game.projectId || game.id
    if (!id || togglingId) return
    setTogglingId(id)
    try {
      if (onToggleVisibility) {
        await onToggleVisibility(game)
      } else {
        const next = game.visibility === 'public' ? 'private' : 'public'
        await api(`/api/projects/${id}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibility: next }) })
        notify(next === 'public' ? `"${game.title}" published to Arcade` : `"${game.title}" set to private`)
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update visibility')
    } finally {
      setTogglingId(null)
    }
  }

  const openDetailsEditor = (project: Game) => {
    setEditingProject(project)
    setEditTitle(project.title)
    setEditDesc(project.description || '')
    setEditGenre(project.genre || 'ARCADE')
    setEditAllowRemix(Boolean(project.allow_remix))
  }

  return (
    <div className="dash-shell">
      {/* Unified Studio Dashboard Header */}
      <header className="dash-topbar">
        <button className="brand" onClick={onHome} aria-label="Yulya Studio home">
          <span className="brand-mark">✳</span>
          <span>yulya<span className="brand-light">studio</span></span>
        </button>

        <nav className="dash-nav" aria-label="Account navigation">
          <button className="dash-nav-btn" onClick={onArcade}>
            <Gamepad2 size={14} /> <span>Arcade</span>
          </button>
          {onTemplates && (
            <button className="dash-nav-btn" onClick={onTemplates}>
              <Layers size={14} /> <span>Templates</span>
            </button>
          )}
          {onSettings && (
            <button className="dash-nav-btn" onClick={onSettings}>
              <Settings size={14} /> <span>Security</span>
            </button>
          )}
          <button className="dash-nav-btn danger" onClick={onLogout}>
            <LogOut size={14} /> <span>Sign out</span>
          </button>
        </nav>
      </header>

      <main className="dash-main">
        {/* Creator Identity Header Block */}
        <section className="dash-profile-card" aria-label="Creator Identity">
          <div className="dash-profile-top">
            <div className="dash-identity-left">
              <div className="dash-avatar">
                {user?.avatar ? (
                  <img src={user.avatar} alt={displayName} referrerPolicy="no-referrer" />
                ) : (
                  <span>{(displayName[0] || 'C').toUpperCase()}</span>
                )}
              </div>
              <div className="dash-identity-text">
                <div className="dash-name-row">
                  <h1>{displayName}</h1>
                  <span className="dash-handle">@{user?.username || 'unset'}</span>
                </div>
                <p className="dash-bio">{bio}</p>
                <div className="dash-meta-sub">
                  <span>{user?.email}</span>
                  <span>·</span>
                  <span>{formatJoinDate(user?.created_at)}</span>
                </div>
              </div>
            </div>

            <div className="dash-profile-actions">
              <button className="button button-outline button-small" onClick={copyProfileLink} title="Copy public portfolio URL">
                <Share2 size={13} /> <span>Portfolio Link</span>
              </button>
              <button
                className="button button-outline button-small"
                onClick={() => {
                  setEditDisplayName(user?.display_name || user?.username || '')
                  setEditBio(user?.bio || '')
                  setIsEditing(true)
                }}
              >
                <Edit3 size={13} /> <span>Edit Profile</span>
              </button>
              <button
                className={`button button-outline button-small dash-key-btn ${hasKey ? 'is-connected' : ''}`}
                onClick={onKey}
              >
                <KeyRound size={13} />
                <span>{hasKey ? 'Gemini Key Active' : 'Connect Gemini Key'}</span>
              </button>
              <button
                className="button button-alabaster button-small"
                onClick={onCreate}
                disabled={!user?.username}
                title={!user?.username ? 'Claim a handle first' : 'Create a new project'}
              >
                <Plus size={14} /> <span>New Project</span>
              </button>
            </div>
          </div>

          {/* Handle Setup Banner if missing */}
          {!user?.username && (
            <form
              className="dash-handle-alert"
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
                  setUsernameError(err instanceof Error ? err.message : 'Could not save handle.')
                } finally {
                  setSavingUsername(false)
                }
              }}
            >
              <div>
                <strong>Claim your creator handle</strong>
                <span>Required to create projects and activate your public `/@handle` portfolio.</span>
              </div>
              <div className="dash-handle-input-row">
                <span className="dash-at">@</span>
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
                <button className="button button-alabaster button-small" disabled={savingUsername || !/^[a-z0-9_]{3,24}$/.test(usernameInput)}>
                  {savingUsername ? 'Saving…' : 'Claim'}
                </button>
              </div>
              {usernameError && <p className="dash-handle-error" role="alert">{usernameError}</p>}
            </form>
          )}

          {/* Crisp 4-Column Tabular Metrics Strip */}
          <div className="dash-metrics-strip">
            <div className="dash-metric-cell">
              <span className="dash-metric-label">Projects</span>
              <strong className="dash-metric-value tabular-count">{projects.length}</strong>
              <span className="dash-metric-sub">{publicCount} published · {privateCount} private</span>
            </div>
            <div className="dash-metric-cell">
              <span className="dash-metric-label">Total Plays</span>
              <strong className="dash-metric-value tabular-count">{totalPlays.toLocaleString()}</strong>
              <span className="dash-metric-sub">Across public Arcade releases</span>
            </div>
            <div className="dash-metric-cell">
              <span className="dash-metric-label">Community Likes</span>
              <strong className="dash-metric-value tabular-count">{totalLikes.toLocaleString()}</strong>
              <span className="dash-metric-sub">Hearts on your games</span>
            </div>
            <div className="dash-metric-cell" title={totalFormatted.full}>
              <span className="dash-metric-label">Gemini Compute</span>
              <strong className="dash-metric-value tabular-count">{totalFormatted.compact}</strong>
              <span className="dash-metric-sub">{turnsCount.toLocaleString()} chat turns · Peak {peakFormatted.compact}</span>
            </div>
          </div>
        </section>

        {/* Workspace Projects Manager */}
        <section className="dash-workspace" aria-labelledby="workspace-title">
          <div className="dash-workspace-header">
            <div className="dash-workspace-title-block">
              <h2 id="workspace-title">Workspace Projects</h2>
              <span className="dash-count-pill tabular-count">{filteredProjects.length}</span>
            </div>

            <div className="dash-toolbar">
              <div className="dash-filter-group" role="tablist">
                <button className={`dash-tab ${projectFilter === 'all' ? 'active' : ''}`} onClick={() => setProjectFilter('all')}>
                  All <span className="tabular-count">{projects.length}</span>
                </button>
                <button className={`dash-tab ${projectFilter === 'public' ? 'active' : ''}`} onClick={() => setProjectFilter('public')}>
                  Public <span className="tabular-count">{publicCount}</span>
                </button>
                <button className={`dash-tab ${projectFilter === 'private' ? 'active' : ''}`} onClick={() => setProjectFilter('private')}>
                  Private <span className="tabular-count">{privateCount}</span>
                </button>
              </div>

              <div className="dash-search-controls">
                <div className="dash-search-box">
                  <Search size={13} />
                  <input
                    type="text"
                    placeholder="Filter projects…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear filter"><X size={12} /></button>
                  )}
                </div>

                <select
                  className="dash-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort projects"
                >
                  <option value="recent">Recent</option>
                  <option value="plays">Most Plays</option>
                  <option value="title">Title (A–Z)</option>
                </select>

                <div className="dash-view-toggle" role="group" aria-label="Layout view">
                  <button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} aria-label="Grid view" title="Grid view">
                    <Grid size={14} />
                  </button>
                  <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} aria-label="List view" title="List view">
                    <List size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {filteredProjects.length > 0 ? (
            <div className={viewMode === 'grid' ? 'dash-project-grid' : 'dash-project-list'}>
              {filteredProjects.map((project) => {
                const projectId = project.projectId || project.id || ''
                const isPublic = project.visibility === 'public'
                const plays = Number(project.plays) || 0
                const isToggling = togglingId === projectId
                const isMenuOpen = openMenuId === projectId

                return (
                  <article className={`dash-card ${viewMode === 'list' ? 'is-list' : ''} ${isMenuOpen ? 'menu-active' : ''}`} key={projectId}>
                    <div className="dash-card-thumb" onClick={() => onOpen(project)}>
                      {project.thumbnail ? (
                        <img src={project.thumbnail} alt={project.title} className="dash-card-img" loading="lazy" />
                      ) : (
                        <div className="dash-card-placeholder">
                          <span>{project.title.slice(0, 2).toUpperCase()}</span>
                          <small>{project.genre || 'STUDIO'}</small>
                        </div>
                      )}
                      <span className={`dash-vis-pill ${isPublic ? 'is-public' : 'is-private'}`}>
                        {isPublic ? <Globe size={10} /> : <Lock size={10} />}
                        {isPublic ? 'Public' : 'Private'}
                      </span>
                      {isPublic && (
                        <span className="dash-plays-chip tabular-count">
                          <Play size={9} fill="currentColor" /> {plays}
                        </span>
                      )}
                    </div>

                    <div className="dash-card-body">
                      <div className="dash-card-top-row">
                        <div className="dash-card-titles">
                          <h3 onClick={() => onOpen(project)}>{project.title}</h3>
                          <span className="dash-card-slug">/{user?.username || project.creator}/{project.id}</span>
                        </div>

                        <div className="pro-card-menu-anchor" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={`dash-more-btn ${isMenuOpen ? 'active' : ''}`}
                            onClick={() => setOpenMenuId(isMenuOpen ? null : projectId)}
                            aria-label="Project options"
                          >
                            <MoreVertical size={15} />
                          </button>

                          {isMenuOpen && (
                            <div className="pro-card-dropdown animate-menu-scale">
                              <button type="button" className="pro-dropdown-item" onClick={() => { setOpenMenuId(null); openDetailsEditor(project) }}>
                                <Pencil size={13} /> <span>Edit Details</span>
                              </button>
                              <button type="button" className="pro-dropdown-item" onClick={() => { setOpenMenuId(null); onOpen(project) }}>
                                <Code2 size={13} /> <span>Open in Studio</span>
                              </button>
                              {isPublic && (
                                <>
                                  <a
                                    className="pro-dropdown-item"
                                    href={`/${encodeURIComponent(user?.username || project.creator)}/${encodeURIComponent(project.id)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => { onTrackPlay?.(user?.username || project.creator, project.id); setOpenMenuId(null) }}
                                  >
                                    <Play size={13} /> <span>Play Live</span>
                                  </a>
                                  <button type="button" className="pro-dropdown-item" onClick={() => { setOpenMenuId(null); copyGameLink(project) }}>
                                    <Copy size={13} /> <span>Copy Link</span>
                                  </button>
                                </>
                              )}
                              <button type="button" className="pro-dropdown-item" onClick={() => { setOpenMenuId(null); void handleToggle(project) }}>
                                {isPublic ? <Lock size={13} /> : <Globe size={13} />}
                                <span>{isPublic ? 'Set Private' : 'Publish to Arcade'}</span>
                              </button>
                              {onDownloadZip && (
                                <button type="button" className="pro-dropdown-item" onClick={() => { setOpenMenuId(null); void onDownloadZip(project) }}>
                                  <Download size={13} /> <span>Export ZIP</span>
                                </button>
                              )}
                              <div className="pro-dropdown-divider" />
                              <button type="button" className="pro-dropdown-item pro-dropdown-danger" onClick={() => { setOpenMenuId(null); setProjectToDelete(project) }}>
                                <Trash2 size={13} /> <span>Delete Project</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="dash-card-desc" onClick={() => onOpen(project)}>
                        {project.description || 'Interactive web project in Yulya Studio.'}
                      </p>

                      <div className="dash-card-actions">
                        <button type="button" className="button button-alabaster button-small" onClick={() => onOpen(project)}>
                          <Code2 size={13} /> Open Studio
                        </button>
                        {isPublic && (
                          <>
                            <a
                              className="button button-outline button-small"
                              href={`/${encodeURIComponent(user?.username || project.creator)}/${encodeURIComponent(project.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => onTrackPlay?.(user?.username || project.creator, project.id)}
                            >
                              Play <ArrowUpRight size={12} />
                            </a>
                            <button type="button" className="dash-icon-action" onClick={() => copyGameLink(project)} title="Copy public link">
                              <Copy size={13} />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="dash-vis-toggle-btn"
                          onClick={() => void handleToggle(project)}
                          disabled={isToggling}
                        >
                          {isToggling ? '…' : isPublic ? 'Make Private' : 'Publish'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="dash-empty">
              <Gamepad2 size={28} />
              <h3>{searchQuery || projectFilter !== 'all' ? 'No matching projects' : 'Your workspace is empty'}</h3>
              <p>
                {searchQuery || projectFilter !== 'all'
                  ? 'Clear your filter or search query to view all projects.'
                  : 'Create a project from HTML5, Canvas 2D, Three.js, Phaser, or React + TypeScript.'}
              </p>
              {!(searchQuery || projectFilter !== 'all') && (
                <button className="button button-alabaster" onClick={onCreate} disabled={!user?.username}>
                  <Plus size={14} /> Create First Project
                </button>
              )}
            </div>
          )}
        </section>

        {/* Compact AI Compute Telemetry Bar */}
        {totalTokens > 0 && (
          <section className="dash-telemetry" aria-label="AI Token Telemetry">
            <div className="dash-telemetry-head">
              <div>
                <h3>Gemini API Compute Summary</h3>
                <p>Cumulative usage tracked across your BYOK studio sessions.</p>
              </div>
              <span className="dash-telemetry-badge tabular-count">{turnsCount.toLocaleString()} turns</span>
            </div>
            <div className="dash-telemetry-bar-wrap">
              <div className="dash-telemetry-labels tabular-count">
                <span>Input Context · <strong>{inputPct}%</strong> ({inputFormatted.compact})</span>
                <span>Output Generated · <strong>{outputPct}%</strong> ({outputFormatted.compact})</span>
              </div>
              <div className="dash-telemetry-track" role="progressbar" aria-label="Input vs output token split">
                <div className="dash-telemetry-in" style={{ width: `${inputPct}%` }} />
                <div className="dash-telemetry-out" style={{ width: `${outputPct}%` }} />
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <span>&copy; {new Date().getFullYear()} Yulya Studio</span>
          <div className="dash-footer-links">
            <a href="mailto:support@yulya.me"><Mail size={12} /> support@yulya.me</a>
            <a href="https://moheith.tech" target="_blank" rel="noreferrer">moheith.tech <ArrowUpRight size={11} /></a>
          </div>
        </div>
      </footer>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="modal-backdrop" onClick={() => setIsEditing(false)}>
          <div className="modal-card pro-edit-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setIsEditing(false)} aria-label="Close modal">
              <X size={16} />
            </button>
            <div className="modal-icon"><Edit3 size={18} /></div>
            <h2>Edit Creator Profile</h2>
            <p>Update the display name and bio shown on your public portfolio and Arcade cards.</p>
            <form onSubmit={handleSaveProfile} className="auth-form">
              <label>
                Display Name
                <input required type="text" maxLength={50} value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} placeholder="Your display name" />
              </label>
              <label>
                Bio
                <textarea className="pro-bio-textarea" maxLength={200} rows={3} value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="What do you build in Yulya Studio?" />
                <small className="setup-field-hint">{editBio.length}/200</small>
              </label>
              <button className="button button-alabaster modal-submit" disabled={savingProfile || !editDisplayName.trim()}>
                {savingProfile ? 'Saving…' : 'Save Profile'} <Check size={15} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      {projectToDelete && (
        <div className="modal-backdrop" onClick={() => !deleting && setProjectToDelete(null)}>
          <div className="modal-card pro-delete-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => !deleting && setProjectToDelete(null)} aria-label="Close modal" disabled={deleting}>
              <X size={16} />
            </button>
            <div className="modal-icon danger-icon"><Trash2 size={20} /></div>
            <h2>Delete &ldquo;{projectToDelete.title}&rdquo;?</h2>
            <p>This permanently deletes all project files, assets, and AI chat history. This cannot be undone.</p>
            <div className="pro-delete-warning-box">
              <AlertTriangle size={16} className="pro-delete-warning-icon" />
              <div className="pro-delete-warning-text">
                <b>Permanent deletion</b>
                <span>Export a ZIP backup first if you want to keep a copy of your code.</span>
              </div>
            </div>
            <div className="pro-delete-modal-actions">
              <button type="button" className="button button-outline" disabled={deleting} onClick={() => setProjectToDelete(null)}>Cancel</button>
              <button
                type="button"
                className="button button-danger"
                disabled={deleting}
                onClick={async () => {
                  const id = projectToDelete.projectId || projectToDelete.id
                  if (!id) return
                  setDeleting(true)
                  try {
                    if (onDeleteProject) await onDeleteProject(id)
                    else {
                      await api(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
                      notify(`Deleted "${projectToDelete.title}"`)
                    }
                    setProjectToDelete(null)
                  } catch (err) {
                    notify(err instanceof Error ? err.message : 'Could not delete project')
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                <Trash2 size={14} /> <span>{deleting ? 'Deleting…' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Details Modal */}
      {editingProject && (
        <div className="modal-backdrop pro-modal-backdrop" onClick={() => !savingDetails && setEditingProject(null)}>
          <div className="pro-details-modal-card animate-menu-scale" onClick={(e) => e.stopPropagation()}>
            <div className="pro-details-modal-header">
              <div className="pro-details-modal-badge">
                <Pencil size={14} />
                <span>EDIT PROJECT DETAILS</span>
              </div>
              <button type="button" className="pro-details-modal-close" disabled={savingDetails} onClick={() => setEditingProject(null)} aria-label="Close">
                <X size={15} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!editTitle.trim()) return
                const id = editingProject.projectId || editingProject.id
                if (!id) return
                setSavingDetails(true)
                try {
                  if (onUpdateProjectDetails) {
                    await onUpdateProjectDetails(id, { title: editTitle.trim(), description: editDesc.trim(), genre: editGenre, allow_remix: editAllowRemix })
                  }
                  setEditingProject(null)
                } finally {
                  setSavingDetails(false)
                }
              }}
              className="pro-details-modal-form"
            >
              <label className="pro-field-label">
                <span>Project Title</span>
                <input type="text" className="pro-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={100} required />
              </label>
              <label className="pro-field-label">
                <div className="pro-field-header">
                  <span>Description</span>
                  <small className="pro-field-counter">{editDesc.length}/500</small>
                </div>
                <textarea className="pro-textarea" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} maxLength={500} rows={3} />
              </label>
              <div className="pro-field-label">
                <span>Category</span>
                <div className="pro-genre-pills">
                  {['ARCADE', 'ACTION', 'PUZZLE', 'PLATFORMER', 'SHOOTER', 'RACING', 'RPG', 'CASUAL', 'STRATEGY', 'RETRO', 'WEB APP', 'TOOL', '3D'].map((g) => (
                    <button type="button" key={g} className={`pro-genre-pill ${editGenre.toUpperCase() === g ? 'active' : ''}`} onClick={() => setEditGenre(g)}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#cbd5e1', cursor: 'pointer', padding: '6px 2px' }}>
                <input type="checkbox" checked={editAllowRemix} onChange={(e) => setEditAllowRemix(e.target.checked)} />
                <span>Allow others to Remix / Fork this public project into their Studio</span>
              </label>
              <div className="pro-delete-modal-actions">
                <button type="button" className="button button-outline" disabled={savingDetails} onClick={() => setEditingProject(null)}>Cancel</button>
                <button type="submit" className="button button-alabaster" disabled={savingDetails || !editTitle.trim()}>
                  <Check size={14} /> <span>{savingDetails ? 'Saving…' : 'Save Details'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
