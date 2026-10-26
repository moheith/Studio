import { useEffect, useState, useMemo } from 'react'
import type * as React from 'react'
import { ArrowLeft, ArrowUpRight, Gamepad2, Play, Sparkles } from 'lucide-react'
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
              genre: 'WEB GAME',
              color: (project.color as string) || '#c7a6ff',
              art: (project.art as string) || '✦',
              plays: String(project.plays ?? 0),
              description: String(project.description ?? 'A game made in Yulya Studio.'),
              visibility: 'public'
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

  const totalPlays = useMemo(() => {
    return games.reduce((acc, g) => acc + (Number(g.plays) || 0), 0)
  }, [games])

  if (loading) {
    return (
      <main className="public-profile-shell">
        <div className="public-profile-loading">
          <span className="key-spinner" />
          <span>Loading creator profile…</span>
        </div>
      </main>
    )
  }

  if (missing || !creator) {
    return (
      <main className="public-profile-shell">
        <div className="public-profile-empty">
          <span>404</span>
          <h1>Creator not found</h1>
          <p>This profile may have moved or doesn’t exist on Yulya Studio.</p>
          <button className="button button-primary" onClick={onHome}>
            <ArrowLeft size={15} /> Back to Yulya Studio
          </button>
        </div>
      </main>
    )
  }

  const displayName = creator.display_name || creator.username

  return (
    <main className="public-profile-shell">
      {/* Top Navigation */}
      <header className="public-profile-nav">
        <button className="public-profile-brand" onClick={onHome}>
          <span>✳</span> yulya<span>studio</span>
        </button>
        <button className="button button-outline button-small" onClick={onHome}>
          Explore Arcade <ArrowUpRight size={13} />
        </button>
      </header>

      {/* Hero Header */}
      <section className="pro-identity-card public-identity-card" aria-label="Creator Profile">
        <div className="pro-cover-banner">
          <div className="pro-banner-mesh" />
          <div className="pro-banner-stars">✦　·　✧　✳　✦</div>
          <div className="pro-banner-badge">
            <Sparkles size={11} className="text-lilac" />
            <span>VERIFIED CREATOR</span>
          </div>
        </div>

        <div className="pro-identity-body">
          <div className="pro-identity-top">
            <div className="pro-avatar-wrap">
              <div className="pro-avatar-inner">
                {creator.avatar ? (
                  <img src={creator.avatar} alt={displayName} referrerPolicy="no-referrer" />
                ) : (
                  <span>{(displayName[0] || 'C').toUpperCase()}</span>
                )}
              </div>
              <span className="pro-avatar-status" />
            </div>

            <div className="public-stats-pill-group">
              <span className="public-stat-pill">
                <Gamepad2 size={13} /> <b>{games.length}</b> {games.length === 1 ? 'Game' : 'Games'}
              </span>
              <span className="public-stat-pill">
                <Play size={12} fill="currentColor" /> <b>{totalPlays.toLocaleString()}</b> Total Plays
              </span>
            </div>
          </div>

          <div className="pro-info-wrap">
            <div className="pro-title-line">
              <h1>{displayName}</h1>
              <span className="pro-tier-pill">CREATOR</span>
            </div>
            <div className="pro-meta-line">
              <span className="pro-username">@{creator.username}</span>
            </div>
            {creator.bio && <p className="pro-bio">{creator.bio}</p>}
          </div>
        </div>
      </section>

      {/* Games Gallery */}
      <section className="public-profile-games">
        <div className="public-profile-heading">
          <div>
            <div className="eyebrow">CREATOR ARCADE</div>
            <h2>Games by {displayName}</h2>
          </div>
          <span>
            <Gamepad2 size={15} />
            {games.length} PLAYABLE
          </span>
        </div>

        {games.length > 0 ? (
          <div className="game-grid">
            {games.map((game) => (
              <a
                className="game-card public-game-link"
                key={game.projectId || game.id}
                href={`/${encodeURIComponent(creator.username)}/${encodeURIComponent(game.id)}`}
              >
                <div className="game-art" style={{ '--game-color': game.color } as React.CSSProperties}>
                  <div className="game-art-stars">✦　·　✧</div>
                  <div className="game-art-object">{game.art}</div>
                  <span className="art-play">
                    <Play size={14} fill="currentColor" />
                  </span>
                </div>
                <div className="game-card-info">
                  <div className="game-genre">{game.genre}</div>
                  <h3>{game.title}</h3>
                  <p>{game.description}</p>
                  <div className="card-meta">
                    Play game <ArrowUpRight size={12} />
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="gallery-empty">
            <Gamepad2 size={24} />
            <p>This creator has not published any public arcade games yet.</p>
          </div>
        )}
      </section>
    </main>
  )
}
