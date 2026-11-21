import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft, ArrowUpRight, Check, Gamepad2, Heart, Mail, Play, Share2 } from 'lucide-react'
import type { Game } from '../types'
import { api } from '../api'

type PublicCreator = {
  username: string
  display_name?: string
  bio?: string
  avatar?: string
  created_at?: number
}

export default function PublicProfilePage({
  username,
  onHome
}: {
  username: string
  onHome: () => void
}) {
  const [creator, setCreator] = useState<PublicCreator | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setMissing(false)
    api<{ profile: PublicCreator; projects: Array<Record<string, unknown>> }>(
      `/api/profiles/${encodeURIComponent(username)}`
    )
      .then((data) => {
        if (!active) return
        setCreator(data.profile)
        setGames(
          data.projects.map((project) => {
            const slug = String(project.slug ?? project.id ?? '')
            return {
              id: slug,
              projectId: String(project.id ?? ''),
              title: String(project.title ?? slug),
              creator: data.profile.username,
              genre: String(project.genre ?? 'ARCADE').toUpperCase(),
              color: (project.color as string) || '#6e56cf',
              art: (project.art as string) || '✦',
              plays: String(project.plays ?? 0),
              likes_count: Number(project.likes_count ?? 0),
              description: String(project.description ?? 'Playable experience built in Yulya Studio.'),
              visibility: 'public',
              thumbnail: project.thumbnail ? String(project.thumbnail) : undefined
            }
          })
        )
      })
      .catch(() => {
        if (active) setMissing(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [username])

  const totalPlays = useMemo(() => games.reduce((acc, g) => acc + (Number(g.plays) || 0), 0), [games])

  if (loading) {
    return (
      <main className="dash-shell">
        <div className="public-profile-loading">
          <span className="key-spinner" />
          <span>Loading creator portfolio…</span>
        </div>
      </main>
    )
  }

  if (missing || !creator) {
    return (
      <main className="dash-shell">
        <div className="public-profile-empty">
          <span>404</span>
          <h1>Creator not found</h1>
          <p>This creator handle does not exist or has no public profile on Yulya Studio.</p>
          <button className="button button-alabaster" onClick={onHome}>
            <ArrowLeft size={15} /> Back to Yulya Studio
          </button>
        </div>
      </main>
    )
  }

  const displayName = creator.display_name || creator.username

  return (
    <div className="dash-shell">
      <header className="dash-topbar">
        <button className="brand" onClick={onHome}>
          <span className="brand-mark">✳</span>
          <span>yulya<span className="brand-light">studio</span></span>
        </button>
        <div className="dash-nav">
          <button
            type="button"
            className="button button-outline button-small"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href).catch(() => {})
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? <Check size={13} /> : <Share2 size={13} />}
            <span>{copied ? 'Copied' : 'Share Portfolio'}</span>
          </button>
          <button className="button button-alabaster button-small" onClick={onHome}>
            Explore Studio <ArrowUpRight size={13} />
          </button>
        </div>
      </header>

      <main className="dash-main">
        <section className="dash-profile-card" aria-label="Public Creator Portfolio">
          <div className="dash-profile-top">
            <div className="dash-identity-left">
              <div className="dash-avatar">
                {creator.avatar ? (
                  <img src={creator.avatar} alt={displayName} referrerPolicy="no-referrer" />
                ) : (
                  <span>{(displayName[0] || 'C').toUpperCase()}</span>
                )}
              </div>
              <div className="dash-identity-text">
                <div className="dash-name-row">
                  <h1>{displayName}</h1>
                  <span className="dash-handle">@{creator.username}</span>
                </div>
                {creator.bio && <p className="dash-bio">{creator.bio}</p>}
              </div>
            </div>

            <div className="pub-stat-strip tabular-count">
              <div className="pub-stat-box">
                <strong>{games.length}</strong>
                <span>Published</span>
              </div>
              <div className="pub-stat-box">
                <strong>{totalPlays.toLocaleString()}</strong>
                <span>Total Plays</span>
              </div>
            </div>
          </div>
        </section>

        <section className="dash-workspace" aria-label="Published Experiences">
          <div className="dash-workspace-header">
            <div className="dash-workspace-title-block">
              <h2>Published Experiences</h2>
              <span className="dash-count-pill tabular-count">{games.length}</span>
            </div>
          </div>

          {games.length > 0 ? (
            <div className="arc-grid">
              {games.map((game) => (
                <a
                  className="arc-card arc-card-link"
                  key={game.projectId || game.id}
                  href={`/${encodeURIComponent(creator.username)}/${encodeURIComponent(game.id)}`}
                >
                  <div className="arc-card-media">
                    {game.thumbnail ? (
                      <img src={game.thumbnail} alt={game.title} className="arc-card-img" loading="lazy" />
                    ) : (
                      <div className="arc-card-fallback">
                        <span className="arc-fallback-abbr">{game.title.slice(0, 2).toUpperCase()}</span>
                        <span className="arc-fallback-slug">/{game.id}</span>
                      </div>
                    )}
                    <span className="arc-card-genre">{game.genre}</span>
                    <div className="arc-card-hover">
                      <span className="arc-hover-launch"><Play size={14} fill="currentColor" /> Play</span>
                    </div>
                  </div>
                  <div className="arc-card-body">
                    <h3 className="arc-card-title">{game.title}</h3>
                    <p className="arc-card-desc">{game.description}</p>
                    <div className="arc-card-footer">
                      <span className="arc-card-creator">Launch in Sandbox</span>
                      <div className="arc-card-stats tabular-count">
                        <span><Play size={10} fill="currentColor" /> {game.plays}</span>
                        {typeof game.likes_count === 'number' && game.likes_count > 0 && (
                          <span><Heart size={10} /> {game.likes_count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="dash-empty">
              <Gamepad2 size={28} />
              <h3>No published experiences yet</h3>
              <p>@{creator.username} has not made any projects public on Yulya Arcade yet.</p>
            </div>
          )}
        </section>
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
    </div>
  )
}
