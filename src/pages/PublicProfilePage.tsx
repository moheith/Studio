import { useEffect, useState } from 'react'
import type * as React from 'react'
import { ArrowLeft, ArrowUpRight, Gamepad2, Play } from 'lucide-react'
import type { Game } from '../types'
import { api } from '../api'

type PublicCreator = { username: string; avatar?: string }

export default function PublicProfilePage({ username, onHome }: { username: string; onHome: () => void }) {
  const [creator, setCreator] = useState<PublicCreator | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true); setMissing(false)
    api<{ profile: PublicCreator; projects: Array<Record<string, unknown>> }>(`/api/profiles/${encodeURIComponent(username)}`)
      .then((data) => {
        if (!active) return
        setCreator(data.profile)
        setGames(data.projects.map((project) => {
          const slug = String(project.slug ?? project.id ?? '')
          return { id: slug, projectId: String(project.id ?? ''), title: String(project.title ?? slug), creator: data.profile.username, genre: 'WEB GAME', color: '#c7a6ff', art: '✦', plays: String(project.plays ?? 0), description: String(project.description ?? 'A game made in Yulya Studio.'), visibility: 'public' }
        }))
      })
      .catch(() => { if (active) setMissing(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [username])

  if (loading) return <main className="public-profile-shell"><div className="public-profile-loading">Loading creator profile…</div></main>
  if (missing || !creator) return <main className="public-profile-shell"><div className="public-profile-empty"><span>404</span><h1>Creator not found</h1><p>This profile may have moved or doesn’t exist.</p><button className="button button-primary" onClick={onHome}><ArrowLeft size={15}/> Back to Yulya Studio</button></div></main>

  return <main className="public-profile-shell">
    <header className="public-profile-nav"><button className="public-profile-brand" onClick={onHome}><span>✳</span> yulya<span>studio</span></button><button className="quiet-button" onClick={onHome}>Explore games <ArrowUpRight size={14}/></button></header>
    <section className="public-profile-hero"><div className="public-profile-avatar">{creator.avatar ? <img src={creator.avatar} alt=""/> : creator.username.slice(0, 1).toUpperCase()}</div><div><div className="eyebrow">CREATOR PROFILE</div><h1>{creator.username}</h1><p>@{creator.username} · {games.length} public {games.length === 1 ? 'game' : 'games'}</p></div></section>
    <section className="public-profile-games"><div className="public-profile-heading"><div><div className="eyebrow">THE ARCADE</div><h2>Games by {creator.username}</h2></div><span><Gamepad2 size={15}/>{games.length} PUBLIC</span></div>
      {games.length ? <div className="game-grid">{games.map((game) => <a className="game-card public-game-link" key={game.projectId} href={`/${encodeURIComponent(creator.username)}/${encodeURIComponent(game.id)}`}><div className="game-art" style={{ '--game-color': game.color } as React.CSSProperties}><div className="game-art-stars">✦　·　✧</div><div className="game-art-object">{game.art}</div><span className="art-play"><Play size={14} fill="currentColor"/></span></div><div className="game-card-info"><div className="game-genre">{game.genre}</div><h3>{game.title}</h3><p>{game.description}</p><div className="card-meta">Play game <ArrowUpRight size={12}/></div></div></a>)}</div> : <div className="gallery-empty">No public games yet.</div>}
    </section>
  </main>
}
